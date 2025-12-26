import json
import time
import os
import openai
import threading
import traceback

from firebase_admin import db

from utils.chat.chat_utils import (
    MAX_DEPTH, parse_markdown, parse_deepseek_json, 
    normalize_deepseek_response, process_event_request, 
    process_link_request, process_node_request, 
    process_worldbuilding_request, fetch_profile_data, 
    fetch_profile_data_batch, DEEPSEEK_API_KEY, DEEPSEEK_URL
)

from prompts.dt_system_prompt import DT_SYSTEM_PROMPT
import logging
from logging.handlers import RotatingFileHandler

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/dt_actions_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)

logger.debug("Initializing DeepSeek OpenAI client...")
client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_URL
)

def dt_background_handle_action(actions, user_id, deepseek_messages, cfm_session):
    """
    Background handler for DT - now ONLY for stage_change actions.
    get_info is processed in main thread.
    """
    thread_start = time.time()
    task_ref = db.reference(f"backgroundTasks/{user_id}")
    task_id = str(int(time.time() * 1000))

    def update_status(status, message):
        try:
            db.reference(f"backgroundTasks/{user_id}/{task_id}").update({
                "status": status,
                "message": message,
                "updatedAt": time.time()
            })
        except Exception as e:
            logger.error(f"[THREAD] Status update failed: {e}")

    try:
        update_status("processing", f"Starting {len(actions)} background actions...")
        logger.info(f"[DT-THREAD] Processing {len(actions)} actions")

        for i, act in enumerate(actions):
            action_name = act.get("action", "unknown") if isinstance(act, dict) else "unknown"
            try:
                dt_handle_action(act, user_id, deepseek_messages, cfm_session,
                               depth=0, update_status=update_status)
                logger.info(f"[DT-THREAD] Completed {action_name}")
            except Exception as e:
                logger.error(f"[DT-THREAD] {action_name} failed: {e}")
                continue

        update_status("done", "All actions completed")
        task_ref.child(task_id).update({
            "status": "done",
            "finishedAt": time.time()
        })
        
        thread_time = time.time() - thread_start
        logger.info(f"[DT-THREAD] Completed in {thread_time:.3f}s")

    except Exception as e:
        logger.error(f"[DT-THREAD] Crashed: {e}")
        update_status("error", str(e))


# -------------------- ACTION HANDLER DEEPTHINKING --------------------
def dt_handle_action(deepseek_response, user_id, recent_msgs, cfm_session, depth=0, update_status=None):
    """
    Handle DeepSeek actions for Deep Thinking mode.
    UPDATED: get_info now processes data and calls DeepSeek again in same execution.
    """
    action_start = time.time()
    logger.debug(f"[ACTION] dt_handle_action called at depth={depth}")
    
    if depth > MAX_DEPTH:
        logger.warning("[ACTION] Max recursion depth reached, aborting further handling")
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}
    
    if isinstance(deepseek_response, dict):
        responses = [deepseek_response]
    elif isinstance(deepseek_response, list):
        responses = deepseek_response
    else:
        logger.error(f"[ACTION] Unexpected deepseek_response type: {type(deepseek_response)}")
        return {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}

    result = {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}
    last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

    # First pass: handle respond actions
    for resp in responses:
        action = resp.get("action")
        data = resp.get("data", {}) or {}

        if action == "respond":
            logger.debug(f"[ACTION] Processing respond action")
            msg = parse_markdown(data.get("message", ""), "html")
            if msg.strip():
                cfm_session.save_message("assistant", msg, visible=True)
                logger.info(f"[ACTION] Saved respond message to Firebase (depth={depth})")
                
                result["chat_message"] += msg + "\n"
                logger.debug(f"[ACTION] Responding with: {msg[:100]}...")

    # Second pass: handle all other actions
    for resp in responses:
        action = resp.get("action")
        
        if action == "respond":
            continue  # Already handled
        
        # Reject CFM actions here (they should be in main thread)
        if action in ["get_primary_question", "get_follow_up", "meta_transition"]:
            logger.warning(f"[ACTION] Unexpected CFM action '{action}' in handler - should be in main thread")
            continue
        
        reasoning = resp.get("reasoning", "")
        data = resp.get("data", {}) or {}
        requests_list = data.get("requests", [])

        logger.debug(f"[ACTION] Processing action: {action}")

        # -------------------------
        # Profile Manager actions - TWO-TURN PATTERN
        # -------------------------
        if action in ["get_info", "query"]:
            if update_status:
                update_status("processing", "Retrieving information from story database...")
            
            logger.info(f"[GET_INFO] TURN 2: Fetching data for {len(requests_list)} requests")
            info_start = time.time()

            # Fetch data
            try:
                if len(requests_list) > 1:
                    profile_data_list = fetch_profile_data_batch(requests_list, user_id)
                    result["profile_data"] = profile_data_list
                    logger.debug(f"[GET_INFO] Batch fetched {len(profile_data_list)} results")
                else:
                    for req in requests_list:
                        data_result = fetch_profile_data(req, user_id)
                        result["profile_data"].append({"request": req, "data": data_result})
                        logger.debug(f"[GET_INFO] Single fetch completed")
                
                info_time = time.time() - info_start
                logger.info(f"[TIMING] Profile data fetch: {info_time:.3f}s")
                
            except Exception as e:
                logger.error(f"[GET_INFO] Data fetch failed: {e}")
                result["chat_message"] = parse_markdown(
                    "I encountered an issue retrieving that information. Could you try rephrasing your question?",
                    "html"
                )
                continue
            
            # Check if we got actual data
            has_actual_data = False
            total_items = 0
            
            for item in result["profile_data"]:
                item_data = item.get("data", {})
                
                if isinstance(item_data, dict):
                    for key, value in item_data.items():
                        if value and isinstance(value, dict) and key != "error":
                            total_items += 1
                            has_actual_data = True
                
                if has_actual_data:
                    logger.info(f"[GET_INFO] Found {total_items} items")
                    break
            
            if not has_actual_data:
                logger.info("[GET_INFO] No data found, providing fallback")
                result["chat_message"] = parse_markdown(
                    "I don't have any previous information about that yet. Let's start building it together! "
                    "What would you like to tell me?", 
                    "html"
                )

                cfm_session.save_message("assistant", result["chat_message"], visible=True)
                logger.info(f"[GET_INFO] Saved fallback response to Firebase (depth={depth})")
            else:
                # TURN 2: Call DeepSeek with the data
                logger.info(f"[GET_INFO] Calling DeepSeek with {total_items} items")
                
                info_summary = json.dumps(result["profile_data"], indent=2)
                
                followup_messages = [
                    {"role": "system", "content": DT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"User asked: {last_user_msg}"},
                    {"role": "assistant", "content": f"Reasoning: {reasoning}"},
                    {"role": "system", "content": f"""Retrieved data:
{info_summary}

CRITICAL: The data above is the complete information available. Do NOT request get_info again.
Respond conversationally with ONLY a 'respond' action presenting this information naturally.
Format: {{"action": "respond", "data": {{"message": "your formatted response"}}}}"""}
                ]

                followup_start = time.time()
                try:
                    followup_resp = client.chat.completions.create(
                        model="deepseek-chat",
                        messages=followup_messages,
                        stream=False,
                        temperature=0.7
                    )
                    followup_time = time.time() - followup_start
                    logger.info(f"[TIMING] DeepSeek Turn 2: {followup_time:.3f}s")

                    bot_reply_raw = followup_resp.choices[0].message.content.strip()
                    logger.debug(f"[GET_INFO] Turn 2 response: {bot_reply_raw[:200]}...")
                    
                    try:
                        bot_reply_json = parse_deepseek_json(bot_reply_raw)
                        bot_reply_json = normalize_deepseek_response(bot_reply_json)
                    except Exception as parse_err:
                        logger.warning(f"[GET_INFO] JSON parse failed: {parse_err}")
                        bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}

                    # Recursively handle Turn 2 response
                    followup_result = dt_handle_action(
                        bot_reply_json, 
                        user_id, 
                        recent_msgs, 
                        cfm_session, 
                        depth=depth+1, 
                        update_status=update_status
                    )
                    
                    # Merge results
                    if followup_result.get("chat_message"):
                        result["chat_message"] += followup_result["chat_message"]
                        logger.info(f"[GET_INFO] Turn 2 complete (length: {len(result['chat_message'])})")
                    else:
                        logger.warning("[GET_INFO] No chat_message in Turn 2")
                        result["chat_message"] = parse_markdown(bot_reply_raw, "html")

                        cfm_session.save_message("assistant", result["chat_message"], visible=True)
                    
                    result["requests"].extend(followup_result.get("requests", []))
                    result["staging_results"].extend(followup_result.get("staging_results", []))
                    
                except Exception as e:
                    logger.error(f"[GET_INFO] Turn 2 failed: {e}")
                    logger.error(traceback.format_exc())
                    result["chat_message"] = parse_markdown(
                        f"Here's what I found:\n\n{info_summary[:500]}...",
                        "html"
                    )

        elif action == "stage_change":
            logger.debug(f"[STAGE_CHANGE] Requests: {requests_list}")
            
            if update_status:
                update_status("processing", "Staging changes to story database...")

            staging_start = time.time()
            staged_summaries = []
            duplicate_detected = False

            for req in requests_list:
                etype = req.get("entityType")
                if etype == "node":
                    resp = process_node_request(req, user_id)
                elif etype == "link":
                    resp = process_link_request(req, user_id)
                elif etype == "event":
                    resp = process_event_request(req, user_id)
                elif etype and etype.startswith("worldBuilding-"):
                    resp = process_worldbuilding_request(req, user_id, etype)
                else:
                    resp = {"error": f"Unknown entityType {etype}"}

                if isinstance(resp, dict) and "error" in resp:
                    if "pending" in resp["error"].lower() or "already exists" in resp["error"].lower():
                        logger.debug(f"[STAGE_CHANGE] Duplicate detected: {resp['error']}")
                        duplicate_detected = True

                staged_summaries.append(resp)

            staging_time = time.time() - staging_start
            logger.info(f"[TIMING] Staging operations took {staging_time:.3f}s")

            for s in staged_summaries:
                cfm_session.save_message(
                    "system",
                    f"STAGING RESULT: {json.dumps(s)}",
                    action="stage_result",
                    visible=False
                )

            result["staging_results"] = staged_summaries

            # Follow-up with DeepSeek about staging results
            summary = json.dumps(staged_summaries, indent=2)
            followup_messages = [
                {"role": "system", "content": DT_SYSTEM_PROMPT},
                {"role": "assistant", "content": f"Your reasoning when requesting this stage change was: {reasoning}"},
                {"role": "system", "content": f"Changes staged successfully:\n{summary}\n\nProceed conversationally based on this."}
            ]

            followup_start = time.time()
            try:
                followup_resp = client.chat.completions.create(
                    model="deepseek-chat",
                    messages=followup_messages,
                    stream=False
                )
                followup_time = time.time() - followup_start
                logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")

                bot_reply_raw = followup_resp.choices[0].message.content.strip()
                logger.debug(f"[LLM] Raw staging follow-up: {bot_reply_raw[:200]}...")

                try:
                    bot_reply_json = parse_deepseek_json(bot_reply_raw)
                    bot_reply_json = normalize_deepseek_response(bot_reply_json)
                except Exception:
                    bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                    logger.warning("[STAGE_CHANGE] JSON parse failed, fallback to respond.")

                followup_result = dt_handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1, update_status=update_status)
                
                # Merge results
                if followup_result.get("chat_message"):
                    result["chat_message"] += followup_result["chat_message"]
                result["requests"].extend(followup_result.get("requests", []))

            except Exception as e:
                logger.warning(f"[STAGE_CHANGE] Error triggering follow-up: {e}")
                if duplicate_detected:
                    result["chat_message"] = "That entity is already staged and pending confirmation. I'll note it and we can continue the conversation."
                else:
                    result["chat_message"] = "I staged the requested changes. Let's continue."

        else:
            logger.debug(f"[ACTION] Unknown action: {action}")

    action_time = time.time() - action_start
    logger.info(f"[TIMING] dt_handle_action completed in {action_time:.3f}s at depth={depth}")
    
    return result