import requests
import time
import json
import logging
import os
from contextlib import contextmanager
from logging.handlers import RotatingFileHandler

os.makedirs("logs", exist_ok=True)
log_file = "logs/dt_diagnostics.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
log.addHandler(rotating_handler)

# Endpoints
BASE_URL_DT = "http://10.163.14.53:5003"
SESSION_API = "http://localhost:4000"
TEST_UID = "04E9XYnVi8QD3yHAIXeBHCRp2sN2"

# Polling configuration
MAX_POLL_TIME = 15
POLL_INTERVAL = 0.5

def run_diagnostics():
    log.info("\n" + "="*60)
    log.info("DEEP THINKING DIAGNOSTICS - Full Suite")
    log.info("="*60)
    
    results = {
        "Scaffolding in primary questions": test_1_scaffolding_in_primary(),
        "Bridge prompts in transitions": test_2_bridge_prompts(),
        "Length check (precision)": test_3_length_check(),
        "Follow-up enforcement": test_4_followup_enforcement(),
        "Quality standards evaluation": test_5_quality_standards(),
        "Angle transitions": test_6_angle_transitions(),
        "Category transitions": test_7_category_transitions(),
        "Question ID tracking": test_8_question_tracking(),
        "Metadata consistency": test_9_metadata_consistency(),
        "Full Socratic loop": test_10_full_socratic_loop(),
    }
    
    log.info("\n" + "="*60)
    log.info("DIAGNOSTIC RESULTS")
    log.info("="*60)
    
    for test_name, passed in results.items():
        status = "  [PASS]" if passed else "  [FAIL]"
        log.info(f"{status}: {test_name}")
    
    passed_count = sum(1 for v in results.values() if v)
    total = len(results)
    
    log.info(f"\nScore: {passed_count}/{total} diagnostics passed")
    
    if passed_count == total:
        log.info("\n    ALL DIAGNOSTICS PASSED    ")
        return True
    elif passed_count >= total - 2:
        log.info("\n  MOSTLY PASSING (2 failures allowed)")
        return True
    else:
        log.error(f"\n  {total - passed_count} DIAGNOSTICS FAILED")
        return False


def poll_until_condition(check_fn, timeout=MAX_POLL_TIME, interval=POLL_INTERVAL, description="condition"):
    """Poll until check_fn() returns truthy or timeout"""
    start = time.time()
    attempts = 0
    
    while time.time() - start < timeout:
        attempts += 1
        result = check_fn()
        
        if result:
            elapsed = time.time() - start
            log.info(f"[POLL]   {description} met after {elapsed:.2f}s ({attempts} attempts)")
            return result
        
        time.sleep(interval)
    
    elapsed = time.time() - start
    log.warning(f"[POLL]   {description} TIMEOUT after {elapsed:.2f}s ({attempts} attempts)")
    return None


def create_session():
    """Create fresh DT session"""
    r = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID}, timeout=10)
    r.raise_for_status()
    return r.json().get("sessionID")


def get_messages(session_id):
    """Fetch all messages"""
    r = requests.post(
        f"{SESSION_API}/session/get_messages",
        json={"uid": TEST_UID, "sessionID": session_id},
        timeout=10
    )
    r.raise_for_status()
    return r.json().get("messages", {})


def get_metadata(session_id):
    """Fetch session metadata"""
    r = requests.post(
        f"{SESSION_API}/session/get_metadata",
        json={"uid": TEST_UID, "sessionID": session_id},
        timeout=10
    )
    r.raise_for_status()
    return r.json().get("metadata", {})


def send_message_and_wait(session_id, message, wait_time=2):
    """Send message and wait for processing"""
    log.info(f"[SEND] Sending: {message[:60]}...")
    
    r = requests.post(
        f"{BASE_URL_DT}/chat",
        json={
            "user_id": TEST_UID,
            "message": message,
            "session_id": session_id
        },
        timeout=120
    )
    r.raise_for_status()
    response = r.json()
    
    chat_msg = response.get("chat_message", "")
    log.info(f"[DEEPSEEK] Response: {chat_msg[:200]}...")
    
    background_processing = response.get("background_processing", False)
    if background_processing:
        log.info("[BACKGROUND] Background processing indicated")
        wait_time = max(wait_time, 3)
    
    time.sleep(wait_time)
    
    return response


# ==================== DIAGNOSTIC TESTS ====================

def test_1_scaffolding_in_primary():
    """
    TEST 1: Verify primary questions include scaffolding
    
    Scaffolding = context/explanation before the question
    e.g., "Understanding motivation is key. What drives your character?"
    """
    log.info("\n" + "="*60)
    log.info("TEST 1: Scaffolding in primary questions")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Establish topic
        log.info("Step 1: Establishing topic...")
        response = send_message_and_wait(
            session_id,
            "I want to develop my character Marcus"
        )
        
        response_msg = response.get("chat_message", "")
        
        # Check for scaffolding indicators
        has_context = any(phrase in response_msg.lower() for phrase in [
            "understanding", "exploring", "let's", "important",
            "foundational", "essential", "first", "start"
        ])
        
        has_question = "?" in response_msg
        
        # Check that context comes BEFORE question
        if has_context and has_question:
            question_pos = response_msg.find("?")
            context_words = ["understanding", "exploring", "important", "foundational"]
            context_positions = [response_msg.lower().find(word) for word in context_words 
                               if word in response_msg.lower()]
            
            if context_positions:
                earliest_context = min(p for p in context_positions if p >= 0)
                scaffolding_before_question = earliest_context < question_pos
            else:
                scaffolding_before_question = False
        else:
            scaffolding_before_question = False
        
        # Check length (scaffolding should add substance)
        has_substance = len(response_msg.split()) > 15
        
        log.info(f"Scaffolding indicators:")
        log.info(f"  Has context: {has_context}")
        log.info(f"  Has question: {has_question}")
        log.info(f"  Context before question: {scaffolding_before_question}")
        log.info(f"  Has substance (>15 words): {has_substance}")
        
        if has_context and has_question and scaffolding_before_question and has_substance:
            log.info("  [PASS] Primary question includes proper scaffolding")
            log.info(f"  Example: {response_msg[:150]}...")
            return True
        else:
            log.error("  [FAIL] Primary question lacks proper scaffolding")
            log.info(f"[DIAG] Full response: {response_msg}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_2_bridge_prompts():
    """
    TEST 2: Verify meta-transitions include bridge prompts
    
    Bridge prompt = acknowledges previous discussion and explains transition
    e.g., "Now that we've explored X, let's consider Y..."
    """
    log.info("\n" + "="*60)
    log.info("TEST 2: Bridge prompts in meta-transitions")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Build context
        log.info("Step 1: Building context...")
        send_message_and_wait(session_id, "I want to develop my character Sarah")
        
        log.info("Step 2: Providing detailed response...")
        send_message_and_wait(
            session_id,
            "Sarah wants revenge against the corrupt politician who killed her brother "
            "and framed it as an accident. She's driven by justice and proving the truth."
        )
        
        # This should trigger angle transition
        log.info("Step 3: Checking for transition with bridge...")
        response = send_message_and_wait(session_id, "What else should I think about?")
        response_msg = response.get("chat_message", "")
        
        # Check for bridge indicators
        bridge_phrases = [
            "now that", "given that", "since we", "we've explored",
            "building on", "considering", "let's consider", "let's examine",
            "next", "another aspect", "moving to"
        ]
        
        has_bridge = any(phrase in response_msg.lower() for phrase in bridge_phrases)
        
        # Check for acknowledgment of previous discussion
        acknowledges_previous = any(word in response_msg.lower() for word in [
            "revenge", "justice", "politician", "brother", "sarah"
        ])
        
        # Check for explanation of new angle
        explains_shift = any(phrase in response_msg.lower() for phrase in [
            "what about", "consider", "think about", "explore",
            "assumptions", "implications", "consequences", "perspective"
        ])
        
        log.info(f"Bridge prompt indicators:")
        log.info(f"  Has bridge phrase: {has_bridge}")
        log.info(f"  Acknowledges previous: {acknowledges_previous}")
        log.info(f"  Explains shift: {explains_shift}")
        
        if has_bridge and (acknowledges_previous or explains_shift):
            log.info("  [PASS] Meta-transition includes bridge prompt")
            log.info(f"  Example: {response_msg[:200]}...")
            return True
        else:
            log.error("  [FAIL] Meta-transition lacks bridge prompt")
            log.info(f"[DIAG] Full response: {response_msg}")
            
            # Check metadata for transition
            metadata = get_metadata(session_id)
            dt_meta = metadata.get("deepthinking", {})
            log.info(f"[DIAG] Current angle: {dt_meta.get('currentAngle')}")
            log.info(f"[DIAG] Asked count: {len(dt_meta.get('asked', []))}")
            
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_3_length_check():
    """
    TEST 3: Verify short responses (<10 words) trigger precision follow-up
    """
    log.info("\n" + "="*60)
    log.info("TEST 3: Length check triggers precision follow-up")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Establish context
        send_message_and_wait(session_id, "I want to develop my character Alex")
        
        # Send short response (should trigger precision)
        log.info("Sending short response (<10 words)...")
        response = send_message_and_wait(session_id, "Alex wants revenge.")
        
        response_msg = response.get("chat_message", "")
        
        # Check for precision follow-up indicators
        precision_phrases = [
            "more about", "tell me more", "expand", "elaborate",
            "specific", "details", "could you", "can you"
        ]
        
        asks_for_more = any(phrase in response_msg.lower() for phrase in precision_phrases)
        has_question = "?" in response_msg
        
        # Check metadata
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        follow_up_count = dt_meta.get("followUpCount", 0)
        
        log.info(f"Precision check indicators:")
        log.info(f"  Asks for more detail: {asks_for_more}")
        log.info(f"  Has question: {has_question}")
        log.info(f"  Follow-up count: {follow_up_count}")
        
        if asks_for_more and has_question:
            log.info("  [PASS] Short response triggers precision follow-up")
            log.info(f"  Example: {response_msg[:150]}...")
            return True
        else:
            log.error("  [FAIL] Short response didn't trigger precision follow-up")
            log.info(f"[DIAG] Full response: {response_msg}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_4_followup_enforcement():
    """
    TEST 4: Verify follow-up limit (2) forces meta-transition
    """
    log.info("\n" + "="*60)
    log.info("TEST 4: Follow-up limit enforcement")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Establish context
        send_message_and_wait(session_id, "I want to develop my character Jamie")
        
        # Send 3 mediocre responses to trigger follow-ups
        responses = [
            "Jamie wants power.",
            "I think Jamie is ambitious.",
            "Jamie likes control."
        ]
        
        log.info("Sending 3 short responses to trigger follow-ups...")
        for i, resp in enumerate(responses, 1):
            log.info(f"  Response {i}/3: {resp}")
            result = send_message_and_wait(session_id, resp)
            
            # Check metadata after each
            metadata = get_metadata(session_id)
            dt_meta = metadata.get("deepthinking", {})
            follow_up_count = dt_meta.get("followUpCount", 0)
            current_angle = dt_meta.get("currentAngle")
            
            log.info(f"    Follow-up count: {follow_up_count}, Angle: {current_angle}")
        
        # Final check - should have forced transition
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        final_follow_up_count = dt_meta.get("followUpCount", 0)
        asked_history = dt_meta.get("asked", [])
        
        # Check if we transitioned (follow-up count should reset)
        transitioned = final_follow_up_count < 2
        
        # Check last assistant message for transition indicators
        messages = get_messages(session_id)
        assistant_msgs = [m for m in messages.values() if m.get("role") == "assistant"]
        
        if assistant_msgs:
            last_msg = assistant_msgs[-1].get("content", "")
            has_transition_language = any(phrase in last_msg.lower() for phrase in [
                "now that", "let's consider", "moving to", "another aspect"
            ])
        else:
            has_transition_language = False
        
        log.info(f"Follow-up enforcement results:")
        log.info(f"  Final follow-up count: {final_follow_up_count}")
        log.info(f"  Transitioned (count < 2): {transitioned}")
        log.info(f"  Has transition language: {has_transition_language}")
        log.info(f"  Total questions asked: {len(asked_history)}")
        
        if transitioned or has_transition_language:
            log.info("  [PASS] Follow-up limit enforced, transition occurred")
            return True
        else:
            log.error("  [FAIL] Follow-up limit not enforced")
            log.info(f"[DIAG] Asked history: {asked_history}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_5_quality_standards():
    """
    TEST 5: Verify quality standards (clarity, depth, breadth, etc.) trigger appropriate follow-ups
    """
    log.info("\n" + "="*60)
    log.info("TEST 5: Quality standards evaluation")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Test scenarios for different standards
        test_cases = [
            {
                "user_msg": "I want to develop my character Riley",
                "response": "Riley is complicated.",
                "expected_standard": "clarity",
                "indicators": ["what do you mean", "elaborate", "could you explain"]
            },
            {
                "user_msg": "What motivates Riley?",
                "response": "Riley wants to succeed because everyone wants to succeed.",
                "expected_standard": "depth",
                "indicators": ["underlying", "complexities", "deeper", "why"]
            }
        ]
        
        passed_tests = 0
        
        for i, test_case in enumerate(test_cases, 1):
            log.info(f"\nTest case {i}: {test_case['expected_standard']} standard")
            
            # Reset session for clean test
            session_id = create_session()
            
            # Establish context
            send_message_and_wait(session_id, test_case["user_msg"])
            
            # Send response that should trigger specific follow-up
            response = send_message_and_wait(session_id, test_case["response"])
            response_msg = response.get("chat_message", "")
            
            # Check for expected indicators
            found_indicator = any(ind in response_msg.lower() 
                                 for ind in test_case["indicators"])
            
            log.info(f"  Response contains {test_case['expected_standard']} follow-up: {found_indicator}")
            
            if found_indicator:
                log.info(f"    {test_case['expected_standard']} standard triggered correctly")
                passed_tests += 1
            else:
                log.warning(f"    {test_case['expected_standard']} standard not triggered")
                log.info(f"    Response: {response_msg[:150]}...")
        
        success = passed_tests >= len(test_cases) - 1  # Allow 1 failure
        
        if success:
            log.info(f"\n  [PASS] Quality standards evaluation ({passed_tests}/{len(test_cases)} passed)")
            return True
        else:
            log.error(f"\n  [FAIL] Quality standards evaluation ({passed_tests}/{len(test_cases)} passed)")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_6_angle_transitions():
    """
    TEST 6: Verify smooth angle-to-angle transitions within same category
    """
    log.info("\n" + "="*60)
    log.info("TEST 6: Angle-to-angle transitions")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Establish context and get first angle
        send_message_and_wait(session_id, "I want to develop my protagonist Elena")
        
        # Provide good answer to trigger angle shift
        send_message_and_wait(
            session_id,
            "Elena wants to expose the corruption in her city's government. "
            "Her father was a whistleblower who was silenced, and she feels "
            "obligated to finish what he started and prove he was right."
        )
        
        # Check metadata for transition
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        
        initial_angle = dt_meta.get("currentAngle")
        asked_history = dt_meta.get("asked", [])
        
        log.info(f"Initial state: angle={initial_angle}, asked={len(asked_history)}")
        
        # Continue conversation to trigger another angle shift
        response = send_message_and_wait(
            session_id,
            "She's also driven by guilt that she didn't support her father when he needed it most."
        )
        
        # Check for angle change
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        
        new_angle = dt_meta.get("currentAngle")
        current_category = dt_meta.get("currentCategory")
        
        angle_changed = new_angle != initial_angle
        
        log.info(f"After transition: angle={new_angle}, category={current_category}")
        log.info(f"  Angle changed: {angle_changed}")
        
        # Check response for smooth transition
        response_msg = response.get("chat_message", "")
        has_bridge = any(phrase in response_msg.lower() for phrase in [
            "now that", "given that", "let's consider", "another aspect",
            "we've explored", "building on"
        ])
        
        log.info(f"  Has bridge language: {has_bridge}")
        
        if angle_changed and has_bridge:
            log.info("  [PASS] Angle transition smooth and tracked")
            return True
        elif angle_changed:
            log.warning("⚠ [WARN] Angle changed but lacks bridge prompt")
            log.info(f"[DIAG] Response: {response_msg[:200]}...")
            return False
        else:
            log.error("  [FAIL] Angle didn't transition")
            log.info(f"[DIAG] Asked history: {asked_history}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_7_category_transitions():
    """
    TEST 7: Verify category-to-category transitions with clear explanation
    """
    log.info("\n" + "="*60)
    log.info("TEST 7: Category-to-category transitions")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Exhaust one category with multiple good responses
        send_message_and_wait(session_id, "I want to develop my story's conflict")
        
        # Provide thorough responses
        responses = [
            "The main conflict is between tradition and progress in a isolated village.",
            "The village elders want to maintain old ways, while young people want modernization.",
            "There's also internal conflict within the protagonist who respects tradition but sees its flaws."
        ]
        
        for resp in responses:
            send_message_and_wait(session_id, resp)
        
        # Request category shift
        log.info("Requesting category transition...")
        response = send_message_and_wait(
            session_id,
            "I think we've covered the conflict well. What else should I develop?"
        )
        
        response_msg = response.get("chat_message", "")
        
        # Check metadata
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        current_category = dt_meta.get("currentCategory")
        
        log.info(f"Current category: {current_category}")
        
        # Check for category transition language
        category_keywords = ["character", "setting", "theme", "tone", "plot"]
        mentions_new_category = any(cat in response_msg.lower() for cat in category_keywords)
        
        # Check for clear explanation
        explains_transition = any(phrase in response_msg.lower() for phrase in [
            "now let's", "next we should", "important to consider",
            "another key aspect", "we should also explore"
        ])
        
        log.info(f"Category transition indicators:")
        log.info(f"  Mentions new category: {mentions_new_category}")
        log.info(f"  Explains transition: {explains_transition}")
        
        if mentions_new_category and explains_transition:
            log.info("  [PASS] Category transition clear and explained")
            log.info(f"  Example: {response_msg[:200]}...")
            return True
        else:
            log.error("  [FAIL] Category transition unclear or abrupt")
            log.info(f"[DIAG] Full response: {response_msg}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_8_question_tracking():
    """
    TEST 8: Verify questions are tracked and not repeated within recent history
    """
    log.info("\n" + "="*60)
    log.info("TEST 8: Question ID tracking and non-repetition")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Have multiple exchanges
        exchanges = [
            "I want to develop my character Mira",
            "Mira wants to find her missing sister",
            "She's driven by guilt for not protecting her",
            "She assumes the disappearance was her fault",
            "If she finds her sister, she can forgive herself"
        ]
        
        log.info("Having multiple exchanges to build asked history...")
        for i, msg in enumerate(exchanges, 1):
            log.info(f"  Exchange {i}/5")
            send_message_and_wait(session_id, msg)
        
        # Check asked history
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        asked_history = dt_meta.get("asked", [])
        
        # Extract question IDs
        question_ids = [q.get("id") for q in asked_history if q.get("id")]
        
        log.info(f"Question tracking results:")
        log.info(f"  Total questions asked: {len(asked_history)}")
        log.info(f"  Unique question IDs: {len(set(question_ids))}")
        
        # Check for duplicates in recent history (last 5)
        recent_ids = question_ids[-5:] if len(question_ids) >= 5 else question_ids
        has_duplicates = len(recent_ids) != len(set(recent_ids))
        
        log.info(f"  Recent history has duplicates: {has_duplicates}")
        
        # Check that questions vary in angle/category
        angles = [q.get("angle") for q in asked_history if q.get("angle")]
        categories = [q.get("category") for q in asked_history if q.get("category")]
        
        angle_variety = len(set(angles))
        category_variety = len(set(categories))
        
        log.info(f"  Unique angles used: {angle_variety}")
        log.info(f"  Unique categories used: {category_variety}")
        
        if not has_duplicates and angle_variety >= 2:
            log.info("  [PASS] Questions tracked and varied appropriately")
            return True
        else:
            log.error("  [FAIL] Question tracking issues detected")
            log.info(f"[DIAG] Question IDs: {question_ids}")
            log.info(f"[DIAG] Angles: {angles}")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_9_metadata_consistency():
    """
    TEST 9: Verify metadata stays consistent throughout conversation
    """
    log.info("\n" + "="*60)
    log.info("TEST 9: Metadata consistency")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Track metadata changes
        metadata_snapshots = []
        
        exchanges = [
            "I want to develop my antagonist Victor",
            "Victor wants power to reshape society",
            "He believes the current system is fundamentally broken"
        ]
        
        for i, msg in enumerate(exchanges, 1):
            send_message_and_wait(session_id, msg)
            
            metadata = get_metadata(session_id)
            dt_meta = metadata.get("deepthinking", {})
            
            snapshot = {
                "exchange": i,
                "category": dt_meta.get("currentCategory"),
                "angle": dt_meta.get("currentAngle"),
                "depth": dt_meta.get("depth", 0),
                "followUpCount": dt_meta.get("followUpCount", 0),
                "asked_count": len(dt_meta.get("asked", []))
            }
            
            metadata_snapshots.append(snapshot)
            log.info(f"  Snapshot {i}: {snapshot}")
        
        # Validate consistency
        issues = []
        
        # Check depth increases
        depths = [s["depth"] for s in metadata_snapshots]
        if depths != sorted(depths):
            issues.append("Depth not monotonically increasing")
        
        # Check asked history grows
        asked_counts = [s["asked_count"] for s in metadata_snapshots]
        if asked_counts != sorted(asked_counts):
            issues.append("Asked history not growing consistently")
        
        # Check follow-up count resets properly
        follow_up_counts = [s["followUpCount"] for s in metadata_snapshots]
        if max(follow_up_counts) > 2:
            issues.append("Follow-up count exceeded limit")
        
        # Check category/angle are set
        for s in metadata_snapshots:
            if not s["category"] or not s["angle"]:
                issues.append(f"Missing category or angle at exchange {s['exchange']}")
                break
        
        log.info(f"\nMetadata consistency results:")
        log.info(f"  Issues found: {len(issues)}")
        
        if issues:
            for issue in issues:
                log.warning(f"    - {issue}")
        
        if len(issues) == 0:
            log.info("  [PASS] Metadata consistent throughout conversation")
            return True
        else:
            log.error("  [FAIL] Metadata inconsistencies detected")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def test_10_full_socratic_loop():
    """
    TEST 10: Complete Socratic dialogue through multiple angles and quality checks
    
    This simulates a full conversation flow:
    1. Initial question with scaffolding
    2. Short response -> precision follow-up
    3. Detailed response -> angle transition with bridge
    4. Multiple exchanges -> category transition
    5. Quality standards enforcement throughout
    """
    log.info("\n" + "="*60)
    log.info("TEST 10: Full Socratic Loop")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # ========== PHASE 1: Initial Question with Scaffolding ==========
        log.info("\n[PHASE 1] Initial topic establishment")
        
        response = send_message_and_wait(
            session_id,
            "I want to develop a complex antagonist for my story"
        )
        
        initial_msg = response.get("chat_message", "")
        
        # Verify scaffolding
        has_scaffolding = len(initial_msg.split()) > 15 and "?" in initial_msg
        log.info(f"  Has scaffolding: {has_scaffolding}")
        
        if not has_scaffolding:
            log.warning("  ⚠ Initial question lacks proper scaffolding")
        
        # ========== PHASE 2: Short Response -> Precision Follow-up ==========
        log.info("\n[PHASE 2] Testing precision follow-up on short response")
        
        response = send_message_and_wait(session_id, "They want power.")
        precision_msg = response.get("chat_message", "")
        
        asks_for_more = any(phrase in precision_msg.lower() for phrase in [
            "more about", "tell me more", "expand", "elaborate", "specific"
        ])
        
        log.info(f"  Triggered precision follow-up: {asks_for_more}")
        
        if not asks_for_more:
            log.warning("  ⚠ Short response didn't trigger precision follow-up")
        
        # ========== PHASE 3: Detailed Response -> Angle Transition ==========
        log.info("\n[PHASE 3] Testing angle transition with bridge prompt")
        
        # Get initial angle
        metadata = get_metadata(session_id)
        initial_angle = metadata.get("deepthinking", {}).get("currentAngle")
        
        # Provide detailed response
        response = send_message_and_wait(
            session_id,
            "The antagonist wants power because they grew up powerless, watching their "
            "community suffer under corrupt leadership. They believe that with absolute "
            "control, they can prevent others from experiencing that suffering, even if "
            "it means becoming authoritarian themselves."
        )
        
        # Check for angle change
        metadata = get_metadata(session_id)
        new_angle = metadata.get("deepthinking", {}).get("currentAngle")
        angle_changed = new_angle != initial_angle
        
        transition_msg = response.get("chat_message", "")
        has_bridge = any(phrase in transition_msg.lower() for phrase in [
            "now that", "given that", "let's consider", "another aspect",
            "we've explored", "building on", "moving to"
        ])
        
        log.info(f"  Angle changed: {angle_changed} ({initial_angle} -> {new_angle})")
        log.info(f"  Has bridge prompt: {has_bridge}")
        
        if not (angle_changed or has_bridge):
            log.warning("  ⚠ No clear angle transition or bridge")
        
        # ========== PHASE 4: Continue Through Multiple Angles ==========
        log.info("\n[PHASE 4] Continuing through multiple angles")
        
        responses = [
            "They assume that people need strong leadership to avoid chaos",
            "If they succeed, they might create a stable but oppressive regime",
            "From their perspective, the ends justify the means"
        ]
        
        for i, resp in enumerate(responses, 1):
            log.info(f"  Exchange {i}/3...")
            send_message_and_wait(session_id, resp)
        
        # Check angle variety
        metadata = get_metadata(session_id)
        asked_history = metadata.get("deepthinking", {}).get("asked", [])
        angles_used = set(q.get("angle") for q in asked_history if q.get("angle"))
        
        log.info(f"  Unique angles explored: {len(angles_used)}")
        log.info(f"  Angles: {list(angles_used)}")
        
        # ========== PHASE 5: Category Transition ==========
        log.info("\n[PHASE 5] Testing category transition")
        
        initial_category = metadata.get("deepthinking", {}).get("currentCategory")
        
        response = send_message_and_wait(
            session_id,
            "I think I've developed their motivation well. What else should I focus on?"
        )
        
        metadata = get_metadata(session_id)
        new_category = metadata.get("deepthinking", {}).get("currentCategory")
        category_changed = new_category != initial_category
        
        category_msg = response.get("chat_message", "")
        explains_category_shift = any(phrase in category_msg.lower() for phrase in [
            "now let's", "next", "another aspect", "also explore", "important to consider"
        ])
        
        log.info(f"  Category changed: {category_changed} ({initial_category} -> {new_category})")
        log.info(f"  Explains shift: {explains_category_shift}")
        
        # ========== PHASE 6: Follow-up Limit Enforcement ==========
        log.info("\n[PHASE 6] Testing follow-up limit enforcement")
        
        # Send mediocre responses to trigger follow-ups
        metadata = get_metadata(session_id)
        initial_follow_up = metadata.get("deepthinking", {}).get("followUpCount", 0)
        
        for i in range(3):
            send_message_and_wait(session_id, f"They're kind of conflicted about things.")
            
            metadata = get_metadata(session_id)
            current_follow_up = metadata.get("deepthinking", {}).get("followUpCount", 0)
            
            if current_follow_up == 0 and i > 1:
                log.info(f"  Follow-up count reset after {i+1} attempts (transition forced)")
                break
        
        follow_up_enforced = metadata.get("deepthinking", {}).get("followUpCount", 0) < 2
        
        log.info(f"  Follow-up limit enforced: {follow_up_enforced}")
        
        # ========== FINAL ASSESSMENT ==========
        log.info("\n[FINAL ASSESSMENT]")
        
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        
        total_questions = len(dt_meta.get("asked", []))
        final_depth = dt_meta.get("depth", 0)
        
        log.info(f"  Total questions asked: {total_questions}")
        log.info(f"  Final depth: {final_depth}")
        log.info(f"  Angles explored: {len(angles_used)}")
        log.info(f"  Category transitions: {1 if category_changed else 0}")
        
        # Success criteria
        checks = {
            "Initial scaffolding": has_scaffolding,
            "Precision follow-up": asks_for_more,
            "Angle transitions": angle_changed or len(angles_used) >= 3,
            "Bridge prompts": has_bridge or explains_category_shift,
            "Follow-up enforcement": follow_up_enforced,
            "Sufficient depth": total_questions >= 5
        }
        
        passed_checks = sum(1 for v in checks.values() if v)
        
        log.info(f"\nChecklist:")
        for check_name, passed in checks.items():
            status = " " if passed else " "
            log.info(f"  {status} {check_name}")
        
        log.info(f"\nPassed {passed_checks}/{len(checks)} checks")
        
        if passed_checks >= len(checks) - 1:  # Allow 1 failure
            log.info("\n    [PASS] Full Socratic loop completed successfully    ")
            return True
        else:
            log.error(f"\n  [FAIL] Full Socratic loop incomplete ({passed_checks}/{len(checks)} passed)")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


# ==================== ADDITIONAL DIAGNOSTIC UTILITIES ====================

def test_clunky_transitions():
    """
    BONUS TEST: Detect and log clunky transitions
    
    Clunky transition indicators:
    - Abrupt topic changes without acknowledgment
    - Questions with no context
    - Repetitive phrasing
    - No bridge between topics
    """
    log.info("\n" + "="*60)
    log.info("BONUS: Clunky Transition Detection")
    log.info("="*60)
    
    try:
        session_id = create_session()
        log.info(f"Created session: {session_id}")
        
        # Generate conversation
        exchanges = [
            "I want to develop my protagonist's backstory",
            "They grew up in poverty and had to steal to survive",
            "This made them resourceful but also deeply ashamed",
            "They now work to help others avoid the same fate"
        ]
        
        clunky_transitions = []
        
        for i, msg in enumerate(exchanges):
            response = send_message_and_wait(session_id, msg)
            response_msg = response.get("chat_message", "")
            
            # Check for clunkiness indicators
            if i > 0:  # Skip first exchange
                # No acknowledgment of previous answer
                no_acknowledgment = not any(word in response_msg.lower() for word in [
                    "that", "this", "given", "since", "now that", "interesting",
                    "poverty", "steal", "ashamed", "resourceful"  # Topic words
                ])
                
                # Abrupt question
                starts_with_question = response_msg.strip().startswith(("What", "Why", "How", "When", "Where"))
                no_context_words = len(response_msg.split("?")[0].split()) < 10 if "?" in response_msg else True
                abrupt = starts_with_question and no_context_words
                
                # Check for repetitive phrasing
                if i > 1:
                    prev_response = clunky_transitions[-1]["response"] if clunky_transitions else ""
                    repetitive = False
                    if prev_response:
                        # Simple check: do they start with the same 3 words?
                        current_start = " ".join(response_msg.split()[:3]).lower()
                        prev_start = " ".join(prev_response.split()[:3]).lower()
                        repetitive = current_start == prev_start
                else:
                    repetitive = False
                
                if no_acknowledgment or abrupt or repetitive:
                    clunky_transitions.append({
                        "exchange": i,
                        "user_msg": msg,
                        "response": response_msg,
                        "issues": {
                            "no_acknowledgment": no_acknowledgment,
                            "abrupt": abrupt,
                            "repetitive": repetitive
                        }
                    })
                    
                    log.warning(f"  ⚠ Clunky transition at exchange {i}:")
                    if no_acknowledgment:
                        log.warning(f"    - No acknowledgment of previous answer")
                    if abrupt:
                        log.warning(f"    - Abrupt question without context")
                    if repetitive:
                        log.warning(f"    - Repetitive phrasing")
                    log.info(f"    Response: {response_msg[:150]}...")
        
        log.info(f"\nClunky transitions detected: {len(clunky_transitions)}/{len(exchanges)-1}")
        
        if len(clunky_transitions) == 0:
            log.info("  [PASS] No clunky transitions detected")
            return True
        elif len(clunky_transitions) <= 1:
            log.info("⚠ [WARN] Minor clunkiness detected (acceptable)")
            return True
        else:
            log.error("  [FAIL] Multiple clunky transitions detected")
            return False
            
    except Exception as e:
        log.error(f"  [FAIL] ERROR: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False


def analyze_conversation_flow(session_id):
    """
    Utility function to analyze the overall flow of a conversation
    Returns detailed metrics about question progression, transitions, etc.
    """
    log.info("\n" + "="*60)
    log.info("CONVERSATION FLOW ANALYSIS")
    log.info("="*60)
    
    try:
        # Get all data
        messages = get_messages(session_id)
        metadata = get_metadata(session_id)
        dt_meta = metadata.get("deepthinking", {})
        
        # Separate user and assistant messages
        user_msgs = [m for m in messages.values() if m.get("role") == "user"]
        assistant_msgs = [m for m in messages.values() if m.get("role") == "assistant"]
        
        # Analyze asked history
        asked = dt_meta.get("asked", [])
        
        angles_used = [q.get("angle") for q in asked if q.get("angle")]
        categories_used = [q.get("category") for q in asked if q.get("category")]
        
        # Count transitions
        angle_transitions = 0
        category_transitions = 0
        
        for i in range(1, len(asked)):
            if asked[i].get("angle") != asked[i-1].get("angle"):
                angle_transitions += 1
            if asked[i].get("category") != asked[i-1].get("category"):
                category_transitions += 1
        
        # Analyze message lengths
        user_lengths = [len(m.get("content", "").split()) for m in user_msgs]
        assistant_lengths = [len(m.get("content", "").split()) for m in assistant_msgs]
        
        avg_user_length = sum(user_lengths) / len(user_lengths) if user_lengths else 0
        avg_assistant_length = sum(assistant_lengths) / len(assistant_lengths) if assistant_lengths else 0
        
        # Report
        log.info(f"\nConversation Metrics:")
        log.info(f"  Total exchanges: {len(user_msgs)}")
        log.info(f"  Questions asked: {len(asked)}")
        log.info(f"  Unique angles: {len(set(angles_used))}")
        log.info(f"  Unique categories: {len(set(categories_used))}")
        log.info(f"  Angle transitions: {angle_transitions}")
        log.info(f"  Category transitions: {category_transitions}")
        log.info(f"  Avg user message length: {avg_user_length:.1f} words")
        log.info(f"  Avg assistant message length: {avg_assistant_length:.1f} words")
        log.info(f"  Final depth: {dt_meta.get('depth', 0)}")
        
        # Quality indicators
        log.info(f"\nQuality Indicators:")
        
        sufficient_depth = len(asked) >= 5
        good_variety = len(set(angles_used)) >= 3
        appropriate_transitions = angle_transitions >= 2
        balanced_conversation = 0.5 < (avg_user_length / avg_assistant_length) < 2.0 if avg_assistant_length > 0 else False
        
        log.info(f"    Sufficient depth (5+ questions): {sufficient_depth}")
        log.info(f"    Good variety (3+ angles): {good_variety}")
        log.info(f"    Appropriate transitions (2+): {appropriate_transitions}")
        log.info(f"    Balanced conversation: {balanced_conversation}")
        
        return {
            "total_exchanges": len(user_msgs),
            "questions_asked": len(asked),
            "unique_angles": len(set(angles_used)),
            "unique_categories": len(set(categories_used)),
            "transitions": angle_transitions + category_transitions,
            "quality_score": sum([sufficient_depth, good_variety, appropriate_transitions, balanced_conversation])
        }
        
    except Exception as e:
        log.error(f"Error analyzing conversation: {e}")
        return None


if __name__ == "__main__":
    success = run_diagnostics()
    
    # Optional: Run bonus clunky transition test
    log.info("\n" + "="*60)
    log.info("Running bonus diagnostics...")
    log.info("="*60)
    
    test_clunky_transitions()
    
    exit(0 if success else 1)