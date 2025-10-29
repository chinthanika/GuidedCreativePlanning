from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os, json, time, hashlib, requests
import openai
import threading
import random
import re

import firebase_admin
from firebase_admin import credentials, db

import logging
from logging.handlers import RotatingFileHandler

from utils.BSConversationFlowManager import BSConversationFlowManager
from utils.DTConversationFlowManager import DTConversationFlowManager

from utils.bs_action_handler import bs_background_handle_action, bs_handle_action
from utils.dt_action_handler import dt_background_handle_action, dt_handle_action

from utils.chat_utils import (
    MAX_DEPTH, KEEP_LAST_N, PROFILE_MANAGER_URL, DEEPSEEK_URL, 
    DEEPSEEK_API_KEY, LEONARDO_API_KEY, parse_markdown, 
    parse_deepseek_json, normalize_deepseek_response
)

from prompts.bs_system_prompt import BS_SYSTEM_PROMPT
from prompts.dt_system_prompt import DT_SYSTEM_PROMPT
from prompts.mapping_system_prompt import MAPPING_SYSTEM_PROMPT
from prompts.world_system_prompt import WORLD_SYSTEM_PROMPT

app = Flask(__name__)

CORS(app)

# ============================================
# LOGGING SETUP
# ============================================
os.makedirs("logs", exist_ok=True)

bs_logger = logging.getLogger("BS_CHAT")
dt_logger = logging.getLogger("DT_CHAT")
world_logger = logging.getLogger("WORLD_AI")
char_logger = logging.getLogger("CHAR_EXTRACT")

for logger_instance in [bs_logger, dt_logger, world_logger, char_logger]:
    handler = RotatingFileHandler(
        f"logs/{logger_instance.name.lower()}.log", 
        maxBytes=5*1024*1024, 
        backupCount=3
    )
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger_instance.addHandler(handler)
    logger_instance.setLevel(logging.DEBUG)

# ============================================
# FIREBASE INIT
# ============================================
try:
    cred = credentials.Certificate("../Firebase/structuredcreativeplanning-fdea4acca240.json")
    firebase_admin.initialize_app(cred, {
        'databaseURL': "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
    })
    bs_logger.info("Firebase initialized successfully")
except Exception as e:
    bs_logger.error(f"Firebase initialization failed: {e}")
    raise

# ============================================
# API KEYS VALIDATION
# ============================================
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not set")
if not LEONARDO_API_KEY:
    raise ValueError("LEONARDO_API_KEY not set")
if not PROFILE_MANAGER_URL:
    raise ValueError("PROFILE_MANAGER_URL not set")

client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_URL)

# ============================================
# ROUTE: HEALTH CHECK
# ============================================
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'services': {
            'brainstorming': 'running',
            'deepthinking': 'running',
            'world_ai': 'running',
            'character_extraction': 'running',
            'image_generation': 'running' if LEONARDO_API_KEY else 'disabled'
        }
    })

# ============================================
# BRAINSTORMING CHAT (FIXED)
# ============================================
@app.route('/chat/brainstorming', methods=['POST'])
def brainstorming_chat():
    request_start = time.time()
    bs_logger.info("[BS] Incoming request")
    
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")
    session_id = data.get("session_id")

    if not user_message or not user_id:
        return jsonify({"error": "message and user_id required"}), 400

    try:
        # Initialize session with proper error handling
        session_init_start = time.time()
        if session_id:
            try:
                session_ref = db.reference(f"chatSessions/{user_id}/{session_id}")
                if session_ref.child("metadata").get():
                    cfm_session = BSConversationFlowManager(user_id, session_id)
                else:
                    bs_logger.warning(f"[BS] Session {session_id} not found, creating new")
                    cfm_session = BSConversationFlowManager.create_session(user_id)
                    session_id = cfm_session.session_id
            except Exception as e:
                bs_logger.error(f"[BS] Session load failed: {e}, creating new")
                cfm_session = BSConversationFlowManager.create_session(user_id)
                session_id = cfm_session.session_id
        else:
            cfm_session = BSConversationFlowManager.create_session(user_id)
            session_id = cfm_session.session_id
        
        session_init_time = time.time() - session_init_start
        bs_logger.info(f"[BS] Session init: {session_init_time:.3f}s")

        # Save user message FIRST
        cfm_session.save_message("user", user_message, 
                                stage=cfm_session.get_stage(), visible=True)

        # Build prompt
        recent = cfm_session.get_recent_messages(limit=10)
        session_snapshot = cfm_session.get_session_snapshot()
        
        deepseek_messages = [
            {"role": "system", "content": BS_SYSTEM_PROMPT},
            {"role": "system", "content": f"Session Context:\n{json.dumps(session_snapshot, indent=2)}"}
        ]
        
        for m in recent["unsummarised"]:
            deepseek_messages.append({"role": m["role"], "content": m["content"]})
        deepseek_messages.append({"role": "user", "content": user_message})

        # Call DeepSeek
        llm_start = time.time()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )
        llm_time = time.time() - llm_start
        bs_logger.info(f"[BS] DeepSeek: {llm_time:.2f}s")

        bot_reply_raw = response.choices[0].message.content.strip()
        
        # Parse actions
        parse_start = time.time()
        bot_reply_json_list = parse_deepseek_json(bot_reply_raw) or [
            {"action": "respond", "data": {"message": bot_reply_raw}}
        ]
        
        # CRITICAL FIX: All session-modifying actions run in main thread
        # Only pure data fetches go to background
        respond_actions = []
        main_thread_actions = []  # add_hmw, log_idea, evaluate_idea, refine_idea, check_progress
        background_actions = []   # ONLY get_info/query that don't modify session
        
        for obj in bot_reply_json_list:
            if isinstance(obj, dict):
                action_type = obj.get("action")
                
                if action_type == "respond":
                    respond_actions.append(obj)
                elif action_type in ["add_hmw", "log_idea", "check_progress", 
                                    "evaluate_idea", "refine_idea", "switch_stage"]:
                    main_thread_actions.append(obj)
                elif action_type in ["get_info", "query"]:
                    # Only background if it's pure data fetch (no session modification)
                    background_actions.append(obj)
                else:
                    # Unknown actions go to main thread for safety
                    main_thread_actions.append(obj)
        
        parse_time = time.time() - parse_start
        bs_logger.info(f"[BS] Parsed: {len(respond_actions)} respond, "
                      f"{len(main_thread_actions)} main, {len(background_actions)} background")

        # Process ALL main thread actions (CRITICAL FIX!)
        if main_thread_actions:
            immediate_start = time.time()
            try:
                bs_handle_action(main_thread_actions, user_id, deepseek_messages, 
                               cfm_session, depth=0)
                immediate_time = time.time() - immediate_start
                bs_logger.info(f"[BS] Main thread actions: {immediate_time:.3f}s")
            except Exception as e:
                bs_logger.error(f"[BS] Main thread actions failed: {e}")

        # FORCE cache refresh IMMEDIATELY after session modifications
        try:
            cfm_session._refresh_metadata_cache()
            cfm_session._refresh_ideas_cache()
        except Exception as e:
            bs_logger.error(f"[BS] Cache refresh failed: {e}")

        # NOW check auto-advance (CRITICAL FIX: moved AFTER processing)
        try:
            current_stage = cfm_session.get_stage()
            bs_meta = cfm_session.get_metadata().get("brainstorming", {})
            
            hmw_count = len(bs_meta.get("hmwQuestions", {}))
            ideas_meta = cfm_session.get_all_ideas()
            idea_count = len(ideas_meta)
            
            categories = set()
            for idea in ideas_meta.values():
                cat = idea.get("evaluations", {}).get("flexibilityCategory")
                if cat:
                    categories.add(cat)
            category_count = len(categories)
            
            bs_logger.debug(f"[BS] Auto-advance check: stage={current_stage}, "
                          f"hmws={hmw_count}, ideas={idea_count}, cats={category_count}")
            
            # Auto-advance logic
            if current_stage == "Clarify" and hmw_count >= 3:
                cfm_session.switch_stage("Ideate", reasoning=f"Auto: {hmw_count} HMWs")
                bs_logger.info(f"[BS] Auto-advanced Clarify→Ideate")
            elif current_stage == "Ideate" and idea_count >= 5 and category_count >= 2:
                cfm_session.switch_stage("Develop", 
                                        reasoning=f"Auto: {idea_count} ideas, {category_count} cats")
                bs_logger.info(f"[BS] Auto-advanced Ideate→Develop")
        except Exception as e:
            bs_logger.error(f"[BS] Auto-advance check failed: {e}")

        # Extract respond message
        chat_message = None
        for obj in respond_actions:
            msg = obj.get("data", {}).get("message", "")
            if msg:
                chat_message = parse_markdown(msg, "html")
                break
        
        # Fallback if no explicit respond
        if not chat_message:
            stripped = bot_reply_raw.strip()
            if not (stripped.startswith("{") or stripped.startswith("[")):
                chat_message = parse_markdown(bot_reply_raw, "html")

        # Save assistant message
        if chat_message:
            cfm_session.save_message("assistant", chat_message, 
                                    stage=cfm_session.get_stage(), visible=True)

        # Start background thread ONLY for pure data fetches
        if background_actions:
            bs_logger.info(f"[BS] Starting background thread for {len(background_actions)} data fetches")
            threading.Thread(
                target=bs_background_handle_action,
                args=(background_actions, user_id, deepseek_messages, cfm_session),
                daemon=True
            ).start()

        total_time = time.time() - request_start
        bs_logger.info(f"[BS] Total: {total_time:.2f}s")

        return jsonify({
            "chat_message": chat_message,
            "session_id": session_id,
            "mode": "brainstorming",
            "background_processing": len(background_actions) > 0
        }), 200

    except Exception as e:
        bs_logger.exception(f"[BS] Error: {e}")
        return jsonify({"error": str(e)}), 500

# ============================================
# DEEP THINKING CHAT (UNCHANGED - already correct structure)
# ============================================
@app.route('/chat/deepthinking', methods=['POST'])
def deepthinking_chat():
    request_start = time.time()
    dt_logger.info("[DT] Incoming request")
    
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")
    session_id = data.get("session_id")

    if not user_message or not user_id:
        return jsonify({"error": "message and user_id required"}), 400

    try:
        # Initialize session
        session_init_start = time.time()
        if session_id:
            try:
                session_ref = db.reference(f"chatSessions/{user_id}/{session_id}")
                if session_ref.child("metadata").get():
                    cfm_session = DTConversationFlowManager(user_id, session_id)
                else:
                    dt_logger.warning(f"[DT] Session {session_id} not found, creating new")
                    cfm_session = DTConversationFlowManager.create_session(user_id)
                    session_id = cfm_session.session_id
            except Exception as e:
                dt_logger.error(f"[DT] Session load failed: {e}, creating new")
                cfm_session = DTConversationFlowManager.create_session(user_id)
                session_id = cfm_session.session_id
        else:
            cfm_session = DTConversationFlowManager.create_session(user_id)
            session_id = cfm_session.session_id
        
        session_init_time = time.time() - session_init_start
        dt_logger.info(f"[DT] Session init: {session_init_time:.3f}s")

        # Save user message
        cfm_session.save_message("user", user_message, visible=True)

        # Build prompt
        recent = cfm_session.get_recent_messages(limit=10)
        
        deepseek_messages = [{"role": "system", "content": DT_SYSTEM_PROMPT}]
        for m in recent["unsummarised"]:
            deepseek_messages.append({"role": m.get("role", "assistant"), "content": m.get("content")})
        deepseek_messages.append({"role": "user", "content": user_message})

        # Call DeepSeek
        llm_start = time.time()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )
        llm_time = time.time() - llm_start
        dt_logger.info(f"[DT] DeepSeek: {llm_time:.2f}s")

        bot_reply_raw = response.choices[0].message.content.strip()
        
        # Parse and separate actions
        parse_start = time.time()
        parsed = parse_deepseek_json(bot_reply_raw)
        bot_reply_json_list = parsed or [{"action": "respond", "data": {"message": bot_reply_raw}}]
        
        respond_actions = []
        cfm_question_actions = []
        immediate_actions = []  # NEW: for get_info/query that need immediate processing
        background_actions = []
        
        for obj in bot_reply_json_list:
            if isinstance(obj, dict):
                action_type = obj.get("action")
                
                if action_type == "respond":
                    respond_actions.append(obj)
                elif action_type in ["get_primary_question", "get_follow_up", "meta_transition"]:
                    cfm_question_actions.append(obj)
                elif action_type in ["get_info", "query"]:
                    immediate_actions.append(obj)  # Process in main thread
                else:
                    background_actions.append(obj)
        
        parse_time = time.time() - parse_start
        dt_logger.info(f"[DT] Parsed: {len(respond_actions)} respond, "
                      f"{len(cfm_question_actions)} CFM, {len(immediate_actions)} immediate, "
                      f"{len(background_actions)} background")

        # Generate immediate response
        chat_message = None
        
        # Priority 1: Explicit respond
        for obj in respond_actions:
            msg = obj.get("data", {}).get("message", "")
            if msg:
                chat_message = parse_markdown(msg, "html")
                break
        
        # Priority 2: Process immediate actions (get_info/query)
        if not chat_message and immediate_actions:
            immediate_start = time.time()
            try:
                dt_logger.info(f"[DT] Processing {len(immediate_actions)} immediate actions")
                immediate_result = dt_handle_action(
                    immediate_actions, 
                    user_id, 
                    deepseek_messages, 
                    cfm_session, 
                    depth=0
                )
                
                # Extract response from immediate actions
                if immediate_result.get("chat_message"):
                    chat_message = immediate_result["chat_message"]
                    dt_logger.debug(f"[DT] Got response from immediate actions")
                
                immediate_time = time.time() - immediate_start
                dt_logger.info(f"[DT] Immediate actions: {immediate_time:.3f}s")
            except Exception as e:
                dt_logger.error(f"[DT] Immediate actions failed: {e}")
                chat_message = "I tried to retrieve that information but encountered an issue. Could you rephrase your question?"
        
        # Priority 3: Process CFM questions
        if not chat_message and cfm_question_actions:
            for cfm_action in cfm_question_actions:
                try:
                    action_type = cfm_action.get("action")
                    reasoning = cfm_action.get("reasoning", "")
                    
                    cfm_result = cfm_session.handle_llm_next_question(cfm_action)
                    
                    raw_question = None
                    question_context = {}
                    selected = None
                    
                    if cfm_result.get("type") == "primary":
                        raw_question = cfm_result.get("prompt")
                        question_context = {
                            "type": "primary",
                            "category": cfm_result.get("category"),
                            "angle": cfm_result.get("angle"),
                            "question_id": cfm_result.get("question_id")
                        }
                    elif cfm_result.get("type") == "follow_up":
                        pool = cfm_result.get("pool", [])
                        if pool:
                            selected = random.choice(pool)
                            raw_question = selected.get("prompt")
                            question_context = {
                                "type": "follow_up",
                                "category": cfm_result.get("category"),
                                "question_id": selected.get("id")
                            }
                    elif cfm_result.get("type") == "meta_transition":
                        pool = cfm_result.get("pool", [])
                        if pool:
                            selected = random.choice(pool)
                            raw_question = selected.get("prompt")
                        else:
                            raw_question = "Let's explore this from a different angle."
                        question_context = {
                            "type": "meta_transition",
                            "transition_type": cfm_result.get("transition_type")
                        }
                    
                    if not raw_question:
                        continue
                    
                    # Track question
                    try:
                        metadata = cfm_session.get_metadata()
                        asked = metadata.get("asked", [])
                        
                        if cfm_result.get("type") == "primary":
                            asked.append({
                                "id": cfm_result.get("question_id"),
                                "action": "new_category",
                                "category": cfm_result.get("category"),
                                "angle": cfm_result.get("angle")
                            })
                            cfm_session.update_metadata({
                                "asked": asked,
                                "depth": metadata.get("depth", 0) + 1,
                                "followUpCount": 0,
                                "currentCategory": cfm_result.get("category"),
                                "currentAngle": cfm_result.get("angle")
                            })
                        elif cfm_result.get("type") == "follow_up" and selected:
                            asked.append({"id": selected.get("id"), "action": "follow_up"})
                            cfm_session.update_metadata({
                                "asked": asked,
                                "followUpCount": metadata.get("followUpCount", 0) + 1
                            })
                    except Exception as e:
                        dt_logger.warning(f"[DT] Question tracking failed: {e}")
                    
                    # Reword question
                    recent_context = [{"role": m.get("role"), "content": m.get("content")[:150]} 
                                     for m in deepseek_messages[-5:] if m.get("role") in ["user", "assistant"]]
                    
                    reword_prompt = f"""Reword this question conversationally:
"{raw_question}"

Context: {json.dumps(question_context, indent=2)}
Reasoning: {reasoning}
Recent: {json.dumps(recent_context, indent=2)}

Instructions:
1. Include scaffolding before the question
2. If transition, acknowledge previous discussion
3. Sound warm and natural
4. Respond with ONLY the text (no JSON)"""

                    reword_resp = client.chat.completions.create(
                        model="deepseek-chat",
                        messages=[
                            {"role": "system", "content": DT_SYSTEM_PROMPT},
                            {"role": "user", "content": reword_prompt}
                        ],
                        stream=False,
                        temperature=0.7
                    )
                    
                    reworded = reword_resp.choices[0].message.content.strip()
                    
                    # Clean JSON formatting
                    if reworded.startswith("```"):
                        reworded = re.sub(r'```(?:json)?\s*', '', reworded).strip()
                    if reworded.startswith("{"):
                        try:
                            parsed_reword = json.loads(reworded)
                            if "message" in parsed_reword:
                                reworded = parsed_reword["message"]
                        except:
                            pass
                    
                    chat_message = parse_markdown(reworded, "html")
                    break
                    
                except RuntimeError as e:
                    dt_logger.error(f"[DT] CFM error: {e}")
                    chat_message = "I notice we've explored this thoroughly. What else would you like to discuss?"
                    break
                except Exception as e:
                    dt_logger.error(f"[DT] CFM processing failed: {e}")
                    chat_message = "Let me help you explore a different aspect. What would you like to focus on?"
                    break
        
        # Priority 4: Fallback
        if not chat_message:
            stripped = bot_reply_raw.strip()
            if not (stripped.startswith("{") or stripped.startswith("[")):
                chat_message = parse_markdown(bot_reply_raw, "html")
            else:
                chat_message = "I'm thinking about how to proceed. Could you tell me more?"

        # Save assistant message
        if chat_message:
            cfm_session.save_message("assistant", chat_message, visible=True)

        # Start background thread for remaining actions
        if background_actions:
            dt_logger.info(f"[DT] Starting background thread for {len(background_actions)} actions")
            threading.Thread(
                target=dt_background_handle_action,
                args=(background_actions, user_id, deepseek_messages, cfm_session),
                daemon=True
            ).start()

        total_time = time.time() - request_start
        dt_logger.info(f"[DT] Total: {total_time:.2f}s")

        return jsonify({
            "chat_message": chat_message,
            "session_id": session_id,
            "mode": "deepthinking",
            "background_processing": len(background_actions) > 0
        }), 200

    except Exception as e:
        dt_logger.exception(f"[DT] Error: {e}")
        return jsonify({"error": str(e)}), 500

# ============================================
# WORLD AI, CHARACTER EXTRACTION, IMAGE GEN
# (Unchanged - already correct)
# ============================================
@app.route('/worldbuilding/suggest-template', methods=['POST'])
def suggest_world_template():
    world_logger.info("[WORLD] Template suggestion request")
    
    data = request.json
    user_id = data.get('userId')
    item_name = data.get('itemName', '')
    item_type = data.get('itemType', '')
    item_description = data.get('itemDescription', '')
    parent_template_fields = data.get('parentTemplateFields', [])
    existing_custom_fields = data.get('existingCustomFields', {})

    if not user_id or not item_type:
        return jsonify({'error': 'userId and itemType required'}), 400

    # Build context for AI
    context_parts = [f"Item Type: {item_type}"]
    
    if item_name:
        context_parts.append(f"Item Name: {item_name}")
    
    if item_description:
        context_parts.append(f"Description: {item_description}")
    
    if parent_template_fields:
        # Extract field names from template field objects
        inherited_field_names = [f['fieldName'] for f in parent_template_fields]
        context_parts.append(f"\nInherited Fields (already included):\n{json.dumps(inherited_field_names, indent=2)}")
    
    if existing_custom_fields:
        context_parts.append(f"\nExisting Custom Fields:\n{json.dumps(list(existing_custom_fields.keys()), indent=2)}")
    
    context_parts.append("\n\nSuggest ADDITIONAL relevant custom fields that complement the inherited/existing fields.")
    context_parts.append("DO NOT duplicate inherited or existing fields.")
    context_parts.append("Focus on fields that add new dimensions to this specific item.")
    
    user_prompt = "\n".join(context_parts)

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": WORLD_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={'type': 'json_object'},
            stream=False,
            timeout=30
        )

        result = json.loads(response.choices[0].message.content)
        suggested_fields = result.get('suggestedFields', [])

        # Prepend inherited fields with "inherited" flag
        if parent_template_fields:
            inherited_with_flag = []
            for field in parent_template_fields:
                # Check if not already in existing custom fields
                if field['fieldName'] not in existing_custom_fields:
                    inherited_with_flag.append({
                        **field,
                        'inherited': True,
                        'description': field.get('description', '') + ' [Inherited from parent]'
                    })
            suggested_fields = inherited_with_flag + suggested_fields

        world_logger.info(f"[WORLD] Suggested {len(suggested_fields)} fields ({len(parent_template_fields)} inherited)")
        
        return jsonify({'suggestedFields': suggested_fields})

    except Exception as e:
        world_logger.exception(f"[WORLD] Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/characters/extract', methods=['POST'])
def extract_characters():
    char_logger.info("[CHAR] Extraction request")
    
    data = request.json
    text = data.get('text', '')

    if not text:
        return jsonify({'error': 'text required'}), 400

    char_logger.info(f"[CHAR] Processing {len(text)} characters, {len(text.split())} words")

    try:
        # OPTIMIZED: Better chunking strategy
        MAX_CHUNK_SIZE = 6000  # Reduced from 8000 for faster processing
        text_length = len(text)
        
        if text_length > MAX_CHUNK_SIZE:
            char_logger.info(f"[CHAR] Text exceeds {MAX_CHUNK_SIZE} chars, using chunked extraction")
            
            # Smaller overlap, faster processing
            chunk_size = MAX_CHUNK_SIZE
            overlap = 300  # Reduced from 500
            chunks = []
            
            start = 0
            while start < text_length:
                end = min(start + chunk_size, text_length)
                # Try to break at sentence boundary
                if end < text_length:
                    last_period = text[start:end].rfind('. ')
                    if last_period > chunk_size - 800:  # Adjusted threshold
                        end = start + last_period + 2
                
                chunks.append(text[start:end])
                start = end - overlap if end < text_length else end
            
            char_logger.info(f"[CHAR] Split into {len(chunks)} chunks")
            
            # Process each chunk with LONGER timeout
            all_entities = {}
            all_relationships = []
            
            for i, chunk in enumerate(chunks):
                char_logger.info(f"[CHAR] Processing chunk {i+1}/{len(chunks)}")
                
                try:
                    response = client.chat.completions.create(
                        model="deepseek-chat",
                        messages=[
                            {"role": "system", "content": MAPPING_SYSTEM_PROMPT},
                            {"role": "user", "content": chunk}
                        ],
                        response_format={'type': 'json_object'},
                        stream=False,
                        timeout=90  # INCREASED from 45 to 90 seconds
                    )
                    
                    chunk_result = json.loads(response.choices[0].message.content)
                    
                    # Merge entities
                    for entity in chunk_result.get('entities', []):
                        entity_id = entity.get('id')
                        if entity_id in all_entities:
                            existing = all_entities[entity_id]
                            
                            # Merge aliases
                            existing_aliases = set(existing.get('aliases', '').split(','))
                            new_aliases = set(entity.get('aliases', '').split(','))
                            merged_aliases = existing_aliases.union(new_aliases)
                            existing['aliases'] = ','.join(a.strip() for a in merged_aliases if a.strip())
                            
                            # Merge attributes
                            if len(entity.get('attributes', {})) > len(existing.get('attributes', {})):
                                existing['attributes'].update(entity.get('attributes', {}))
                        else:
                            all_entities[entity_id] = entity
                    
                    # Add relationships
                    for rel in chunk_result.get('relationships', []):
                        if not any(
                            r['entity1_id'] == rel['entity1_id'] and 
                            r['entity2_id'] == rel['entity2_id'] and 
                            r['relationship'] == rel['relationship']
                            for r in all_relationships
                        ):
                            all_relationships.append(rel)
                    
                    char_logger.info(f"[CHAR] Chunk {i+1} done: "
                                   f"{len(chunk_result.get('entities', []))} entities, "
                                   f"{len(chunk_result.get('relationships', []))} relationships")
                    
                except openai.APITimeoutError as chunk_timeout:
                    char_logger.warning(f"[CHAR] Chunk {i+1} timed out, skipping")
                    continue  # Skip this chunk and continue with others
                
                except Exception as chunk_error:
                    char_logger.error(f"[CHAR] Chunk {i+1} failed: {chunk_error}")
                    continue  # Skip this chunk and continue with others
            
            result = {
                'entities': list(all_entities.values()),
                'relationships': all_relationships
            }
            
            char_logger.info(f"[CHAR] Merged results: {len(result['entities'])} entities, "
                           f"{len(result['relationships'])} relationships")
                           
            char_logger.info(f"Entities: {result['entities']}")
            char_logger.info(f"Relationships: {result['relationships']}")
        else:
            # Single extraction for normal-sized text
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": MAPPING_SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ],
                response_format={'type': 'json_object'},
                stream=False,
                timeout=90  # INCREASED timeout
            )
            
            result = json.loads(response.choices[0].message.content)
            char_logger.info(f"[CHAR] Single extraction: {len(result.get('entities', []))} entities, "
                           f"{len(result.get('relationships', []))} relationships")
        
        return jsonify(result)

    except openai.APITimeoutError:
        char_logger.error("[CHAR] DeepSeek timeout")
        return jsonify({
            'error': 'Character extraction timed out',
            'suggestion': 'Try extracting from smaller sections',
            'partial_results': False
        }), 504
    except Exception as e:
        char_logger.exception(f"[CHAR] Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/images/generate', methods=['POST'])
def generate_image():
    if not LEONARDO_API_KEY:
        return jsonify({'error': 'Leonardo API not configured'}), 503

    data = request.json
    description = data.get('description', '')

    if not description:
        return jsonify({'error': 'description required'}), 400

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {LEONARDO_API_KEY}"
    }

    try:
        payload = {
            "modelId": "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
            "contrast": 3.5,
            "prompt": description,
            "num_images": 1,
            "width": 1472,
            "height": 832,
            "ultra": False,
            "styleUUID": "111dc692-d470-4eec-b791-3475abac4c46",
            "enhancePrompt": True
        }

        response = requests.post(
            "https://cloud.leonardo.ai/api/rest/v1/generations",
            json=payload,
            headers=headers
        )

        if response.status_code != 200:
            return jsonify({'error': 'Generation failed', 'details': response.text}), 500

        generation_id = response.json()['sdGenerationJob']['generationId']
        time.sleep(20)

        url = f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}"
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            return jsonify({'error': 'Retrieval failed', 'details': response.text}), 500

        generation_result = response.json()
        image_url = generation_result["generations_by_pk"]["generated_images"][0]["url"]

        return jsonify({'image_url': image_url}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# RUN SERVER
# ============================================
if __name__ == "__main__":
# ---------------- RUN ----------------
if __name__ == "__main__":
    print(f"Starting AI Server on port {port}")
    print(f"   - Brainstorming: /chat/brainstorming")
    print(f"   - Deep Thinking: /chat/deepthinking")
    print(f"   - World AI: /worldbuilding/suggest-template")
    print(f"   - Characters: /characters/extract")
    print(f"   - Images: /images/generate")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
