import json
import time
import os
import openai
import threading
import queue
import traceback

from firebase_admin import db

from utils.chat.chat_utils import MAX_DEPTH, parse_markdown, parse_deepseek_json, normalize_deepseek_response, process_event_request, process_link_request, process_node_request, process_worldbuilding_request, fetch_profile_data, fetch_profile_data_batch, fetch_profile_data_sequential, DEEPSEEK_API_KEY, DEEPSEEK_URL

from prompts.bs_system_prompt import BS_SYSTEM_PROMPT
import logging
from logging.handlers import RotatingFileHandler

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/bs_actions_debug.log"
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

def bs_background_handle_action(actions, user_id, deepseek_messages, cfm_session):
    """Background handler for BS - delegates to bs_handle_action"""
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
        logger.info(f"[BS-THREAD] Processing {len(actions)} actions")

        for i, act in enumerate(actions):
            action_name = act.get("action", "unknown") if isinstance(act, dict) else "unknown"
            try:
                bs_handle_action(act, user_id, deepseek_messages, cfm_session, 
                               depth=0, update_status=update_status)
                logger.info(f"[BS-THREAD] Completed {action_name}")
            except Exception as e:
                logger.error(f"[BS-THREAD] {action_name} failed: {e}")
                continue

        update_status("done", "All actions completed")
        task_ref.child(task_id).update({
            "status": "done",
            "finishedAt": time.time()
        })
        
        thread_time = time.time() - thread_start
        logger.info(f"[BS-THREAD] Completed in {thread_time:.3f}s")

    except Exception as e:
        logger.error(f"[BS-THREAD] Crashed: {e}")
        update_status("error", str(e))

# -------------------- ACTION HANDLER --------------------
def bs_handle_action(deepseek_response, user_id, recent_msgs, cfm_session, depth=0, update_status=None):
    """Recursively handle DeepSeek actions for Brainstorming mode."""
    action_start = time.time()
    logger.debug(f"[ACTION] bs_handle_action called at depth={depth}")

    if depth > MAX_DEPTH:
        logger.debug("[ACTION] Maximum recursion depth exceeded")
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}

    # Normalize to list
    if isinstance(deepseek_response, dict):
        responses = [deepseek_response]
    elif isinstance(deepseek_response, list):
        responses = deepseek_response
    else:
        logger.warning(f"[ACTION] Unexpected response type: {type(deepseek_response)}")
        return {"chat_message": "(Error: invalid DeepSeek response)", "requests": []}

    combined_result = {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}

    # First pass: handle respond actions
    for resp in responses:
        action = resp.get("action")
        data = resp.get("data", {}) or {}

        if action == "respond":
            logger.debug(f"[ACTION] Processing respond action")
            msg = parse_markdown(data.get("message", ""), "html")
            if msg.strip():
                current_stage = cfm_session.get_stage()
                if depth == 0:
                    cfm_session.save_message("assistant", msg, stage=current_stage, visible=True)
              
                combined_result["chat_message"] += msg + "\n"
                logger.debug(f"[ACTION] Responding with: {msg[:100]}...")
    
    # Second pass: handle all other actions
    for resp in responses:
        action = resp.get("action")
        if action == "respond":
            continue  # Already handled

        reasoning = resp.get("reasoning", "")
        data = resp.get("data", {}) or {}
        requests_list = data.get("requests", [])
        last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

        logger.debug(f"[ACTION] Processing action: {action}")

        # -------------------------
        # Core conversational actions
        # -------------------------
        if action == "log_stage":
            if update_status:
                update_status("processing", f"Logging stage: {data.get('stage')}")
            to_stage = data.get("stage")
            if to_stage:
                cfm_session.update_metadata({"stage": to_stage})
                logger.debug(f"[ACTION] Stage updated to {to_stage}")

        # -------------------------
        # CPS-specific actions
        # -------------------------
        elif action == "add_hmw":
            if update_status:
                update_status("processing", "Adding HMW question")
            q = data.get("hmwQuestion")
            if q:
                hmw_count = cfm_session.add_hmw_question(q)
                logger.debug(f"[ACTION] Added HMW: {q}, count: {hmw_count}")
                
        elif action == "log_idea":
            if update_status:
                update_status("processing", "Logging idea")
            idea_text = data.get("idea")
            evals = data.get("evaluations", {})
            if idea_text:
                idea_id = cfm_session.log_idea(idea_text, evals)
                logger.debug(f"[ACTION] Logged idea {idea_id}")
                
        elif action == "evaluate_idea":
            if update_status:
                update_status("processing", "Evaluating idea")
            idea_id = data.get("ideaId")
            evals = data.get("evaluations", {})
            if idea_id and evals:
                eval_result = cfm_session.evaluate_idea(idea_id, evals)
                combined_result["profile_data"].append(eval_result)
                logger.debug(f"[ACTION] Evaluated idea {idea_id}")

        elif action == "refine_idea":
            if update_status:
                update_status("processing", "Refining idea")
            source_ids = data.get("sourceIdeaIds", [])
            new_idea = data.get("newIdea", {})
            if source_ids and new_idea:
                refine_result = cfm_session.refine_idea(source_ids, new_idea)
                combined_result["profile_data"].append(refine_result)
                logger.debug(f"[ACTION] Refined idea")

        elif action == "switch_stage":
            if update_status:
                update_status("processing", "Switching stage")
            to_stage = data.get("toStage")
            if to_stage:
                cfm_session.update_metadata({"stage": to_stage})
                logger.debug(f"[ACTION] Stage switched to {to_stage}")
        
        elif action == "check_progress":
            if update_status:
                update_status("processing", "Checking progress")
            result = cfm_session.check_stage_progress()
            logger.debug(f"[ACTION] Progress check: {result}")

            if result.get("ready"):
                suggested = result.get("suggestedNext")
                if suggested:
                    cfm_session.update_metadata({"stage": suggested})
                    logger.debug(f"[ACTION] Auto-advanced to {suggested}")

            # Follow-up with DeepSeek
            followup_messages = [
                {"role": "system", "content": BS_SYSTEM_PROMPT},
                {"role": "user", "content": f"User asked: {last_user_msg}"},
                {"role": "assistant", "content": f"Reasoning: {reasoning}"},
                {"role": "system", "content": f"""Retrieved info:
            {info_summary}

            CRITICAL: Do NOT request get_info again. The data is already provided above.If it is not there the user has never referenced it before and it does not exist in the system.
            Respond with ONLY a 'respond' action that presents this information conversationally.
            Format: {{"action": "respond", "data": {{"message": "formatted response"}}}}"""}
            ]
            followup_resp = client.chat.completions.create(
                model="deepseek-chat", messages=followup_messages, stream=False
            )
            
            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
            except Exception as e:
                logger.warning(f"[ACTION] Parse failed: {e}")
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}

            combined_result = bs_handle_action(bot_reply_json, user_id, recent_msgs, 
                                              cfm_session, depth=depth+1)

        # -------------------------
        # Profile Manager actions
        # -------------------------
        if action in ["get_info", "query"]:
            if update_status:
                update_status("processing", "Retrieving information from story database...")
            
            logger.debug(f"[GET_INFO] Requests: {requests_list}")

            info_start = time.time()

            if len(requests_list) > 1:
                profile_data_list = fetch_profile_data_batch(requests_list, user_id)
                result["profile_data"] = profile_data_list
                logger.debug(f"[GET_INFO] Batch fetched {len(profile_data_list)} results")
            else:
                for req in requests_list:
                    data = fetch_profile_data(req, user_id)
                    result["profile_data"].append({"request": req, "data": data})
                    logger.debug(f"[GET_INFO] Single fetch: {req}")
            
            info_time = time.time() - info_start
            logger.info(f"[TIMING] Profile data fetch took {info_time:.3f}s for {len(requests_list)} requests")
            
            logger.info(f"[GET_INFO] Raw profile_data: {json.dumps(result['profile_data'], indent=2)[:1000]}")
            
            if result["profile_data"]:
                info_summary = json.dumps(result["profile_data"], indent=2)
                
                # Check if data is actually empty
                has_actual_data = False
                total_items = 0
                
                for item in result["profile_data"]:
                    item_data = item.get("data", {})
                    
                    if isinstance(item_data, dict):
                        # Profile Manager returns data as {firebaseId: object, ...}
                        # Count non-empty objects
                        for key, value in item_data.items():
                            if value and isinstance(value, dict):
                                total_items += 1
                                has_actual_data = True
                        
                        if has_actual_data:
                            logger.info(f"[GET_INFO] Found actual data - {total_items} items")
                            break
                
                if not has_actual_data:
                    logger.info("[GET_INFO] No data found in profile")
                    result["chat_message"] = parse_markdown(
                        "I don't have any previous information about Akio yet. Let's start building his character together! "
                        "What would you like to tell me about him?", 
                        "html"
                    )
                else:
                    # Data found - format with DeepSeek
                    logger.info(f"[GET_INFO] Has data ({total_items} items), sending to DeepSeek")
                    
                    followup_messages = [
                        {"role": "system", "content": BS_SYSTEM_PROMPT},
                        {"role": "user", "content": f"User asked: {last_user_msg}"},
                        {"role": "assistant", "content": f"Your reasoning: {reasoning}"},
                        {"role": "system", "content": f"Retrieved info:\n{info_summary}\n\nRespond conversationally to present this information."}
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
                        logger.info(f"[TIMING] Follow-up DeepSeek: {followup_time:.3f}s")

                        bot_reply_raw = followup_resp.choices[0].message.content.strip()
                        logger.debug(f"[GET_INFO] DeepSeek response: {bot_reply_raw[:200]}...")
                        
                        try:
                            bot_reply_json = parse_deepseek_json(bot_reply_raw)
                            bot_reply_json = normalize_deepseek_response(bot_reply_json)
                            logger.debug(f"[GET_INFO] Parsed JSON actions: {[obj.get('action') for obj in (bot_reply_json if isinstance(bot_reply_json, list) else [bot_reply_json])]}")
                        except Exception as parse_err:
                            logger.warning(f"[GET_INFO] JSON parse failed: {parse_err}")
                            bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}

                        # Recursively handle (will hit respond handler above)
                        followup_result = bs_handle_action(bot_reply_json, user_id, recent_msgs, 
                                                          cfm_session, depth=depth+1, update_status=update_status)
                        
                        # Merge results
                        if followup_result.get("chat_message"):
                            result["chat_message"] += followup_result["chat_message"]
                            logger.info(f"[GET_INFO] Merged response (length: {len(result['chat_message'])})")
                        else:
                            logger.warning("[GET_INFO] No chat_message in followup")
                            result["chat_message"] = parse_markdown(bot_reply_raw, "html")
                        
                        result["requests"].extend(followup_result.get("requests", []))
                        result["staging_results"].extend(followup_result.get("staging_results", []))
                        
                    except Exception as e:
                        logger.error(f"[GET_INFO] Follow-up failed: {e}")
                        logger.error(traceback.format_exc())
                        result["chat_message"] = parse_markdown(
                            f"Here's what I found about Akio:\n\n{info_summary[:500]}",
                            "html"
                        )
            else:
                logger.warning("[GET_INFO] No profile data retrieved")
                result["chat_message"] = parse_markdown(
                    "I couldn't retrieve information about that character. Could you tell me more?",
                    "html"
                )

        elif action == "stage_change":
            if update_status:
                update_status("processing", "Staging changes...")
            
            staging_start = time.time()
            staged_summaries = []
            
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
                    resp = {"error": f"Unknown entityType: {etype}"}
                
                staged_summaries.append(resp)
                logger.debug(f"[STAGING] Staged {etype}")

            staging_time = time.time() - staging_start
            logger.info(f"[TIMING] Staging: {staging_time:.3f}s")

            for s in staged_summaries:
                cfm_session.save_message("system", f"STAGING RESULT: {json.dumps(s)}", 
                                        action="stage_result", visible=False)

            combined_result["staging_results"] = staged_summaries

        else:
            logger.debug(f"[ACTION] Unknown action: {action}")

    action_time = time.time() - action_start
    logger.info(f"[TIMING] bs_handle_action: {action_time:.3f}s at depth={depth}")
    
    return combined_result