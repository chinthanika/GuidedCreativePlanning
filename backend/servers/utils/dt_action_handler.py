import json
import time
import os
import openai
import threading
import queue
import traceback

import firebase_admin
from firebase_admin import credentials, db

from utils.chat_utils import MAX_DEPTH, parse_markdown, parse_deepseek_json, normalize_deepseek_response, process_event_request, process_link_request, process_node_request, process_worldbuilding_request, fetch_profile_data, fetch_profile_data_batch, fetch_profile_data_sequential, DEEPSEEK_API_KEY, DEEPSEEK_URL

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
    """Background handler for DT - delegates to dt_handle_action"""
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
    action_start = time.time()  # START TIMING
    logger.debug(f"[ACTION] dt_handle_action called at depth={depth}")
    
    if depth > MAX_DEPTH:
        logger.warning("[ACTION] Max recursion depth reached, aborting further handling")
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}
    
    # Normalize response to single dict if needed
    if isinstance(deepseek_response, list):
        results = []
        for obj in deepseek_response:
            results.append(dt_handle_action(obj, user_id, recent_msgs, cfm_session, depth=depth + 1))
        # Merge all results
        merged = {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}
        for r in results:
            if r.get("chat_message"):
                merged["chat_message"] += r["chat_message"] + "\n"
            merged["requests"].extend(r.get("requests", []))
            merged["staging_results"].extend(r.get("staging_results", []))
            merged["profile_data"].extend(r.get("profile_data", []))
        return merged
    
    if not isinstance(deepseek_response, dict):
        logger.error(f"[ACTION] Unexpected deepseek_response type: {type(deepseek_response)}")
        return {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}

    action = deepseek_response.get("action")
    reasoning = deepseek_response.get("reasoning", "")
    requests_list = deepseek_response.get("data", {}).get("requests", [])
    
    result = {
        "chat_message": "",
        "requests": requests_list,
        "staging_results": [],
        "profile_data": []
    }

    last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

    # CRITICAL: CFM question actions should NOT be here - they're handled in main thread
    if action in ["get_primary_question", "get_follow_up", "meta_transition", "respond"]:
        logger.warning(f"[ACTION] Unexpected action '{action}' in background thread - should be handled in main thread")
        return result

    if action in ["get_info", "query"]:
        if update_status:
            update_status("processing", "Retrieving information from story database...")
        
        logger.debug(f"[GET_INFO] Requests: {requests_list}")

        info_start = time.time()

        if len(requests_list) > 1:
            # Batch for multiple requests
            profile_data_list = fetch_profile_data_batch(requests_list, user_id)
            result["profile_data"] = profile_data_list
            logger.debug(f"[GET_INFO] Batch fetched {len(profile_data_list)} results")
        else:
            # Single request fallback
            for req in requests_list:
                data = fetch_profile_data(req, user_id)
                result["profile_data"].append({"request": req, "data": data})
                logger.debug(f"[GET_INFO] Single fetch: {req}")
        
        info_time = time.time() - info_start
        logger.info(f"[TIMING] Profile data fetch took {info_time:.3f}s for {len(requests_list)} requests")
        
        if result["profile_data"]:
            info_summary = json.dumps(result["profile_data"], indent=2)
            followup_messages = [
                {"role": "system", "content": DT_SYSTEM_PROMPT},
                {"role": "user", "content": f"User asked: {last_user_msg}"},
                {"role": "assistant", "content": f"Your reasoning when requesting this info was: {reasoning}"},
                {"role": "system", "content": f"Here is the requested info:\n{info_summary}\n\nIf it is empty, there is no available information. Proceed with this understanding. Respond conversationally based on this."}
            ]

            followup_start = time.time()
            followup_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=followup_messages,
                stream=False
            )
            followup_time = time.time() - followup_start
            logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")

            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            
            parse_start = time.time()
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
                logger.debug(f"[HANDLE ACTION] [PROFILE DATA] Parsed JSON: {bot_reply_json}")
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                logger.warning("[HANDLE ACTION] [PROFILE DATA] JSON parse failed, fallback to respond.")
            
            parse_time = time.time() - parse_start
            logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")

            followup_result = dt_handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1, update_status=update_status)
            result = followup_result

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

        summary = json.dumps(staged_summaries, indent=2)
        followup_messages = [
            {"role": "system", "content": DT_SYSTEM_PROMPT},
            {"role": "assistant", "content": f"Your reasoning when requesting this stage change was: {reasoning}"},
            {"role": "system", "content": f"Changes staged successfully. Proceed conversationally based on this."}
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
            logger.debug(f"[LLM] Raw staging follow-up: {bot_reply_raw}")

            parse_start = time.time()
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
                logger.debug(f"[HANDLE ACTION] [STAGE_CHANGE] Parsed JSON: {bot_reply_json}")
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                logger.warning("[HANDLE ACTION] [STAGE_CHANGE] JSON parse failed, fallback to respond.")
            
            parse_time = time.time() - parse_start
            logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")

            followup_result = dt_handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1, update_status=update_status)
            result.update(followup_result)

        except Exception as e:
            logger.warning(f"[STAGE_CHANGE] Error triggering follow-up: {e}")
            if duplicate_detected:
                result["chat_message"] = "That entity is already staged and pending confirmation. I'll note it and we can continue the conversation."
            else:
                result["chat_message"] = "I staged the requested changes. Let's continue."

    action_time = time.time() - action_start
    logger.info(f"[TIMING] dt_handle_action completed in {action_time:.3f}s at depth={depth}")
    
    return result