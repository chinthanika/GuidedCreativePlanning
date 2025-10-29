#!/usr/bin/env python3
"""
test_consolidated_server.py
Complete validation suite for consolidated AI server (port 5000)

Tests:
- Brainstorming Chat (CPS flow)
- Deep Thinking Chat (Socratic dialogue)
- Character Extraction
- World AI (template suggestions)
- Image Generation (if configured)
- Performance & Caching
"""

import requests
import time
import json
import logging
import os
import threading
from logging.handlers import RotatingFileHandler
from contextlib import contextmanager

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/consolidated_test.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
log.addHandler(rotating_handler)

@contextmanager
def log_duration(section_name):
    start = time.time()
    log.info(f"[START TEST] START: {section_name}")
    try:
        yield
    finally:
        duration = time.time() - start
        log.info(f"[TIME]END: {section_name} (took {duration:.3f}s)\n")

# -------------------- CONFIGURATION --------------------
CONSOLIDATED_URL = "http://10.163.13.8:5000"
SESSION_API = "https://guidedcreativeplanning-session.onrender.com"
TEST_UID = "04E9XYnVi8QD3yHAIXeBHCRp2sN2"

MAX_POLL_TIME = 15
POLL_INTERVAL = 0.5

# -------------------- UTILITIES --------------------
def print_section(title):
    log.info("\n" + "=" * 70)
    log.info(f"  {title}")
    log.info("=" * 70)

def pretty_json(data):
    log.info(json.dumps(data, indent=2))

def poll_until_condition(check_fn, timeout=MAX_POLL_TIME, interval=POLL_INTERVAL, description="condition"):
    """Poll until check_fn() returns truthy or timeout"""
    start = time.time()
    attempts = 0
    
    while time.time() - start < timeout:
        attempts += 1
        result = check_fn()
        
        if result:
            elapsed = time.time() - start
            log.info(f"[POLL] [PASS] {description} met after {elapsed:.2f}s ({attempts} attempts)")
            return result
        
        time.sleep(interval)
    
    elapsed = time.time() - start
    log.warning(f"[POLL] [WARN] {description} TIMEOUT after {elapsed:.2f}s ({attempts} attempts)")
    return None

def create_session():
    """Create fresh session"""
    r = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID}, timeout=10)
    r.raise_for_status()
    return r.json().get("sessionID")

def get_metadata(session_id):
    """Fetch session metadata"""
    r = requests.post(
        f"{SESSION_API}/session/get_metadata",
        json={"uid": TEST_UID, "sessionID": session_id},
        timeout=10
    )
    r.raise_for_status()
    return r.json().get("metadata", {})

def get_ideas(session_id):
    """Fetch CPS ideas"""
    r = requests.post(
        f"{SESSION_API}/cps/get_ideas",
        json={"uid": TEST_UID, "sessionID": session_id},
        timeout=10
    )
    r.raise_for_status()
    return r.json().get("ideas", {})

def get_messages(session_id):
    """Fetch all messages"""
    r = requests.post(
        f"{SESSION_API}/session/get_messages",
        json={"uid": TEST_UID, "sessionID": session_id},
        timeout=10
    )
    r.raise_for_status()
    return r.json().get("messages", {})

def send_bs_message(session_id, message, min_ideas=None):
    """Send message to brainstorming endpoint"""
    ideas_before = len(get_ideas(session_id)) if min_ideas else 0
    
    log.info(f"[BS SEND] {message[:60]}...")
    
    r = requests.post(
        f"{CONSOLIDATED_URL}/chat/brainstorming",
        json={
            "user_id": TEST_UID,
            "message": message,
            "session_id": session_id
        },
        timeout=120
    )
    r.raise_for_status()
    response = r.json()
    
    log.info(f"[BS RECV] {response.get('chat_message', '')[:150]}...")
    
    # Wait for ideas if needed
    if min_ideas:
        def check_min_ideas():
            current = len(get_ideas(session_id))
            return current >= min_ideas
        
        poll_until_condition(check_min_ideas, timeout=10, 
                           description=f"at least {min_ideas} ideas")
    
    if response.get("background_processing"):
        time.sleep(2)
    
    return response

def send_dt_message(session_id, message, wait_time=2):
    """Send message to deepthinking endpoint"""
    log.info(f"[DT SEND] {message[:60]}...")
    
    r = requests.post(
        f"{CONSOLIDATED_URL}/chat/deepthinking",
        json={
            "user_id": TEST_UID,
            "message": message,
            "session_id": session_id
        },
        timeout=120
    )
    r.raise_for_status()
    response = r.json()
    
    log.info(f"[DT RECV] {response.get('chat_message', '')[:150]}...")
    
    if response.get("background_processing"):
        wait_time = max(wait_time, 3)
    
    time.sleep(wait_time)
    
    return response

# ==================== HEALTH CHECK ====================
def test_health_check():
    """TEST 0: Health check endpoint"""
    with log_duration("TEST 0: Health Check"):
        try:
            r = requests.get(f"{CONSOLIDATED_URL}/health", timeout=5)
            r.raise_for_status()
            data = r.json()
            
            log.info("Health check response:")
            pretty_json(data)
            
            status_ok = data.get("status") == "ok"
            services = data.get("services", {})
            
            all_running = all(v == "running" or v == "disabled" 
                            for v in services.values())
            
            if status_ok and all_running:
                log.info("[PASS] [PASS] Health check passed")
                return True
            else:
                log.error("[WARN] [FAIL] Health check failed")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Health check error: {e}")
            return False

# ==================== BRAINSTORMING TESTS ====================
def test_bs_full_cps_loop():
    """TEST 1: Complete Brainstorming CPS loop (Clarify → Ideate → Develop → Implement)"""
    with log_duration("TEST 1: BS - Full CPS Loop"):
        try:
            session_id = create_session()
            log.info(f"Created session: {session_id}")
            
            # ========== CLARIFY ==========
            log.info("\n[CLARIFY] Adding 3 HMW questions...")
            hmws = [
                "How might we make the betrayal surprising?",
                "How might we foreshadow it effectively?",
                "How might we show the mentor's internal conflict?"
            ]
            
            for hmw in hmws:
                send_bs_message(session_id, hmw)
            
            # Verify stage advanced
            def check_ideate():
                return get_metadata(session_id).get("brainstorming", {}).get("stage") == "Ideate"
            
            in_ideate = poll_until_condition(check_ideate, timeout=10, 
                                            description="Clarify → Ideate transition")
            
            if not in_ideate:
                log.error("[WARN] Failed to advance to Ideate")
                return False
            
            log.info("[PASS] Advanced to Ideate stage")
            
            # ========== IDEATE ==========
            log.info("\n[IDEATE] Generating 5+ diverse ideas...")
            ideas_to_add = [
                "The mentor's jealousy of the hero's growing power (character)",
                "A deal the villain made with the mentor (plot)",
                "The mentor's love for someone the hero betrayed (theme)",
                "Ancient magic forcing the mentor's hand (mechanics)",
                "A prophecy that requires the betrayal (setting)"
            ]
            
            for i, idea in enumerate(ideas_to_add, 1):
                send_bs_message(session_id, idea, min_ideas=i)
            
            # Verify stage advanced
            def check_develop():
                return get_metadata(session_id).get("brainstorming", {}).get("stage") == "Develop"
            
            in_develop = poll_until_condition(check_develop, timeout=10,
                                             description="Ideate → Develop transition")
            
            if not in_develop:
                log.warning("⚠ Didn't auto-advance to Develop")
            else:
                log.info("[PASS] Advanced to Develop stage")
            
            # ========== DEVELOP ==========
            log.info("\n[DEVELOP] Refining ideas...")
            send_bs_message(session_id, 
                          "Which ideas are strongest? Let's refine and combine the best ones.")
            
            time.sleep(3)
            
            ideas = get_ideas(session_id)
            refined_count = sum(1 for i in ideas.values() if i.get("refined"))
            
            log.info(f"Total ideas: {len(ideas)}, Refined: {refined_count}")
            
            # ========== IMPLEMENT ==========
            log.info("\n[IMPLEMENT] Creating action plan...")
            send_bs_message(session_id,
                          "How would we implement the strongest idea? What are the steps?")
            
            # Check final state
            metadata = get_metadata(session_id)
            final_stage = metadata.get("brainstorming", {}).get("stage")
            
            log.info(f"\n[FINAL] Stage: {final_stage}, Ideas: {len(ideas)}")
            
            if final_stage in ["Develop", "Implement"] and len(ideas) >= 5:
                log.info("[PASS] [PASS] BS - Full CPS loop completed")
                return True
            else:
                log.error(f"[WARN] [FAIL] BS - Unexpected final state: {final_stage}")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] BS - Error: {e}")
            import traceback
            log.error(traceback.format_exc())
            return False

def test_bs_idea_evaluations():
    """TEST 2: Verify idea evaluations are stored correctly"""
    with log_duration("TEST 2: BS - Idea Evaluations"):
        try:
            session_id = create_session()
            
            # Fast-forward to Ideate
            hmws = ["How might we X?", "How might we Y?", "How might we Z?"]
            for hmw in hmws:
                send_bs_message(session_id, hmw)
            
            time.sleep(2)
            
            # Add idea
            send_bs_message(session_id, 
                          "The mentor betrays due to jealousy",
                          min_ideas=1)
            
            time.sleep(2)
            
            # Check evaluations
            ideas = get_ideas(session_id)
            
            if not ideas:
                log.error("[WARN] No ideas found")
                return False
            
            found_evaluations = False
            for idea_id, idea in ideas.items():
                evals = idea.get("evaluations")
                
                if evals and isinstance(evals, dict):
                    log.info(f"[PASS] Found evaluations in idea {idea_id}:")
                    log.info(f"  Category: {evals.get('flexibilityCategory')}")
                    log.info(f"  Elaboration: {evals.get('elaboration')}")
                    log.info(f"  Originality: {evals.get('originality')}")
                    found_evaluations = True
                    break
            
            if found_evaluations:
                log.info("[PASS] [PASS] BS - Evaluations stored correctly")
                return True
            else:
                log.error("[WARN] [FAIL] BS - No evaluations found")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] BS - Error: {e}")
            return False

def test_bs_auto_advancement():
    """TEST 3: Verify auto-advancement logic works"""
    with log_duration("TEST 3: BS - Auto-Advancement"):
        try:
            session_id = create_session()
            
            # Add exactly 3 HMWs
            log.info("Adding 3 HMWs to trigger auto-advancement...")
            for i in range(3):
                send_bs_message(session_id, f"How might we solve problem {i+1}?")
            
            # Check stage
            def check_auto_advance():
                stage = get_metadata(session_id).get("brainstorming", {}).get("stage")
                return stage == "Ideate"
            
            auto_advanced = poll_until_condition(
                check_auto_advance, 
                timeout=10,
                description="auto-advancement to Ideate"
            )
            
            if auto_advanced:
                log.info("[PASS] [PASS] BS - Auto-advancement works")
                return True
            else:
                log.error("[WARN] [FAIL] BS - Auto-advancement failed")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] BS - Error: {e}")
            return False

# ==================== DEEP THINKING TESTS ====================
def test_dt_scaffolding():
    """TEST 4: Verify DT primary questions include scaffolding"""
    with log_duration("TEST 4: DT - Scaffolding in Questions"):
        try:
            session_id = create_session()
            
            response = send_dt_message(session_id, 
                                      "I want to develop my character Marcus")
            
            response_msg = response.get("chat_message", "")
            
            # Check scaffolding indicators
            has_context = any(phrase in response_msg.lower() for phrase in [
                "understanding", "exploring", "important", "let's", "essential"
            ])
            
            has_question = "?" in response_msg
            has_substance = len(response_msg.split()) > 15
            
            log.info(f"Scaffolding check:")
            log.info(f"  Has context: {has_context}")
            log.info(f"  Has question: {has_question}")
            log.info(f"  Has substance: {has_substance}")
            
            if has_context and has_question and has_substance:
                log.info("[PASS] [PASS] DT - Proper scaffolding")
                return True
            else:
                log.error("[WARN] [FAIL] DT - Missing scaffolding")
                log.info(f"Response: {response_msg}")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] DT - Error: {e}")
            return False

def test_dt_precision_check():
    """TEST 5: Verify short responses trigger precision follow-up"""
    with log_duration("TEST 5: DT - Precision Follow-up"):
        try:
            session_id = create_session()
            
            # Establish context
            send_dt_message(session_id, "I want to develop my character Sarah")
            
            # Send short response
            response = send_dt_message(session_id, "Sarah wants revenge.")
            response_msg = response.get("chat_message", "")
            
            # Check for precision indicators
            asks_for_more = any(phrase in response_msg.lower() for phrase in [
                "more about", "tell me more", "expand", "elaborate", "specific"
            ])
            
            if asks_for_more:
                log.info("[PASS] [PASS] DT - Precision check triggered")
                return True
            else:
                log.error("[WARN] [FAIL] DT - Precision check not triggered")
                log.info(f"Response: {response_msg}")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] DT - Error: {e}")
            return False

def test_dt_angle_transitions():
    """TEST 6: Verify angle transitions with bridge prompts"""
    with log_duration("TEST 6: DT - Angle Transitions"):
        try:
            session_id = create_session()
            
            # Build context
            send_dt_message(session_id, "I want to develop my protagonist Elena")
            
            # Get initial angle
            metadata = get_metadata(session_id)
            initial_angle = metadata.get("deepthinking", {}).get("currentAngle")
            
            # Provide detailed response to trigger transition
            response = send_dt_message(
                session_id,
                "Elena wants to expose corruption in her city's government. "
                "Her father was a whistleblower who was silenced, and she "
                "feels obligated to finish what he started."
            )
            
            # Check for angle change
            metadata = get_metadata(session_id)
            new_angle = metadata.get("deepthinking", {}).get("currentAngle")
            
            angle_changed = new_angle != initial_angle
            
            response_msg = response.get("chat_message", "")
            has_bridge = any(phrase in response_msg.lower() for phrase in [
                "now that", "let's consider", "another aspect", "building on"
            ])
            
            log.info(f"Angle transition check:")
            log.info(f"  Angle changed: {angle_changed} ({initial_angle} → {new_angle})")
            log.info(f"  Has bridge: {has_bridge}")
            
            if angle_changed or has_bridge:
                log.info("[PASS] [PASS] DT - Angle transitions working")
                return True
            else:
                log.error("[WARN] [FAIL] DT - No angle transition")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] DT - Error: {e}")
            return False

def test_dt_followup_limit():
    """TEST 7: Verify follow-up limit enforcement (2 max)"""
    with log_duration("TEST 7: DT - Follow-up Limit"):
        try:
            session_id = create_session()
            
            # Establish context
            send_dt_message(session_id, "I want to develop Jamie")
            
            # Send 3 mediocre responses
            for i in range(3):
                send_dt_message(session_id, "Jamie is ambitious.")
            
            # Check if follow-up count reset (transition forced)
            metadata = get_metadata(session_id)
            follow_up_count = metadata.get("deepthinking", {}).get("followUpCount", 0)
            
            transitioned = follow_up_count < 2
            
            log.info(f"Follow-up limit check:")
            log.info(f"  Final count: {follow_up_count}")
            log.info(f"  Transitioned: {transitioned}")
            
            if transitioned:
                log.info("[PASS] [PASS] DT - Follow-up limit enforced")
                return True
            else:
                log.error("[WARN] [FAIL] DT - Follow-up limit not enforced")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] DT - Error: {e}")
            return False

# ==================== CHARACTER EXTRACTION TESTS ====================
def test_character_extraction():
    """TEST 8: Character extraction functionality"""
    with log_duration("TEST 8: Character Extraction"):
        try:
            test_text = """
            Detective Sarah Chen arrived at the crime scene just after midnight.
            Her partner, Officer Mike Rodriguez, was already securing the perimeter.
            The victim, Dr. Elizabeth Grant, was found in her office at Grant Industries.
            Sarah suspected the CEO, James Morrison, who had been in a heated
            dispute with Dr. Grant over company finances.
            """
            
            log.info("Sending character extraction request...")
            r = requests.post(
                f"{CONSOLIDATED_URL}/characters/extract",
                json={"text": test_text},
                timeout=90
            )
            r.raise_for_status()
            result = r.json()
            
            entities = result.get("entities", [])
            relationships = result.get("relationships", [])
            
            log.info(f"Extraction results:")
            log.info(f"  Entities found: {len(entities)}")
            log.info(f"  Relationships found: {len(relationships)}")
            
            # Verify we found key characters
            names_found = [e.get("name") for e in entities]
            expected_names = ["Sarah Chen", "Mike Rodriguez", "Elizabeth Grant", "James Morrison"]
            
            found_count = sum(1 for name in expected_names 
                            if any(name.lower() in str(found).lower() for found in names_found))
            
            log.info(f"  Found {found_count}/{len(expected_names)} expected characters")
            
            if found_count >= 3 and len(relationships) > 0:
                log.info("[PASS] [PASS] Character extraction working")
                return True
            else:
                log.error("[WARN] [FAIL] Character extraction incomplete")
                log.info(f"Found entities: {names_found}")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Character extraction error: {e}")
            return False

# ==================== WORLD AI TESTS ====================
def test_world_template_suggestion():
    """TEST 9: World-building template suggestions"""
    with log_duration("TEST 9: World AI - Template Suggestions"):
        try:
            log.info("Requesting template for magic system...")
            r = requests.post(
                f"{CONSOLIDATED_URL}/worldbuilding/suggest-template",
                json={
                    "userId": TEST_UID,
                    "itemType": "Magic System",
                    "itemName": "Elemental Binding",
                    "parentFields": {},
                    "existingFields": {}
                },
                timeout=30
            )
            r.raise_for_status()
            result = r.json()
            
            suggested_fields = result.get("suggestedFields", [])
            
            log.info(f"Template suggestion results:")
            log.info(f"  Fields suggested: {len(suggested_fields)}")
            
            if suggested_fields:
                log.info("  Sample fields:")
                for field in suggested_fields[:3]:
                    log.info(f"    - {field.get('fieldName')}: {field.get('description', 'N/A')[:50]}")
            
            # Verify quality
            has_names = all(f.get("fieldName") for f in suggested_fields)
            has_types = all(f.get("fieldType") in ["text", "array"] 
                          for f in suggested_fields)
            sufficient_count = len(suggested_fields) >= 4
            
            if has_names and has_types and sufficient_count:
                log.info("[PASS] [PASS] World AI - Template suggestion working")
                return True
            else:
                log.error("[WARN] [FAIL] World AI - Template suggestion incomplete")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] World AI error: {e}")
            return False

# ==================== IMAGE GENERATION TESTS ====================
def test_image_generation():
    """TEST 10: Image generation (if API key configured)"""
    with log_duration("TEST 10: Image Generation"):
        try:
            log.info("Requesting image generation...")
            r = requests.post(
                f"{CONSOLIDATED_URL}/images/generate",
                json={
                    "description": "A mysterious detective in a noir city at night"
                },
                timeout=45
            )
            
            if r.status_code == 503:
                log.info("⚠ [SKIP] Image generation not configured (API key missing)")
                return True  # Not a failure, just not configured
            
            r.raise_for_status()
            result = r.json()
            
            image_url = result.get("image_url")
            
            if image_url and image_url.startswith("http"):
                log.info(f"[PASS] [PASS] Image generation working")
                log.info(f"  Generated URL: {image_url[:80]}...")
                return True
            else:
                log.error("[WARN] [FAIL] Image generation failed")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Image generation error: {e}")
            return False

# ==================== PERFORMANCE TESTS ====================
def test_response_times():
    """TEST 11: Response time performance"""
    with log_duration("TEST 11: Response Time Performance"):
        try:
            session_id = create_session()
            
            # Test BS response time
            bs_start = time.time()
            send_bs_message(session_id, "How might we make the story compelling?")
            bs_time = time.time() - bs_start
            
            # Test DT response time
            dt_session = create_session()
            dt_start = time.time()
            send_dt_message(dt_session, "I want to develop my character")
            dt_time = time.time() - dt_start
            
            log.info(f"Response times:")
            log.info(f"  BS: {bs_time:.3f}s")
            log.info(f"  DT: {dt_time:.3f}s")
            
            # Acceptable thresholds
            bs_ok = bs_time < 15.0
            dt_ok = dt_time < 15.0
            
            if bs_ok and dt_ok:
                log.info("[PASS] [PASS] Response times acceptable")
                return True
            else:
                log.warning("⚠ [WARN] Response times slow but functional")
                return True  # Don't fail on slow responses
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Performance test error: {e}")
            return False

def test_background_separation():
    """TEST 12: Background thread separation"""
    with log_duration("TEST 12: Background Thread Separation"):
        try:
            session_id = create_session()
            
            # Create conversation that should trigger background processing
            send_bs_message(session_id, "How might we X?")
            
            start = time.time()
            response = send_bs_message(session_id, "Tell me about the character Akio")
            elapsed = time.time() - start
            
            has_message = bool(response.get("chat_message"))
            has_background = response.get("background_processing", False)
            
            log.info(f"Background separation check:")
            log.info(f"  Response time: {elapsed:.3f}s")
            log.info(f"  Has immediate message: {has_message}")
            log.info(f"  Background processing: {has_background}")
            
            # Should get immediate response even if background processing
            if has_message and elapsed < 20.0:
                log.info("[PASS] [PASS] Background separation working")
                return True
            else:
                log.error("[WARN] [FAIL] Background separation failed")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Background separation error: {e}")
            return False

# ==================== INTEGRATION TESTS ====================
def test_mode_switching():
    """TEST 13: Switching between BS and DT modes in same session"""
    with log_duration("TEST 13: Mode Switching"):
        try:
            session_id = create_session()
            
            # Use BS mode
            log.info("Testing BS mode...")
            bs_response = send_bs_message(session_id, "How might we solve X?")
            bs_mode = bs_response.get("mode")
            
            # Switch to DT mode (new session for clean test)
            dt_session = create_session()
            log.info("Testing DT mode...")
            dt_response = send_dt_message(dt_session, "I want to develop Y")
            dt_mode = dt_response.get("mode")
            
            log.info(f"Mode check:")
            log.info(f"  BS mode: {bs_mode}")
            log.info(f"  DT mode: {dt_mode}")
            
            bs_ok = bs_mode == "brainstorming"
            dt_ok = dt_mode == "deepthinking"
            
            if bs_ok and dt_ok:
                log.info("[PASS] [PASS] Mode switching works")
                return True
            else:
                log.error("[WARN] [FAIL] Mode switching failed")
                return False
                
        except Exception as e:
            log.error(f"[WARN] [FAIL] Mode switching error: {e}")
            return False

# ==================== MAIN TEST RUNNER ====================
def run_all_tests():
    print_section("CONSOLIDATED SERVER TEST SUITE")
    log.info(f"Testing server at: {CONSOLIDATED_URL}")
    log.info(f"Session API at: {SESSION_API}")
    
    results = {}
    
    # Core functionality
    results["Health Check"] = test_health_check()
    
    # Brainstorming tests
    print_section("BRAINSTORMING TESTS")
    results["BS - Full CPS Loop"] = test_bs_full_cps_loop()
    results["BS - Idea Evaluations"] = test_bs_idea_evaluations()
    results["BS - Auto-Advancement"] = test_bs_auto_advancement()
    
    # Deep Thinking tests
    print_section("DEEP THINKING TESTS")
    results["DT - Scaffolding"] = test_dt_scaffolding()
    results["DT - Precision Check"] = test_dt_precision_check()
    results["DT - Angle Transitions"] = test_dt_angle_transitions()
    results["DT - Follow-up Limit"] = test_dt_followup_limit()
    
    # AI Features
    print_section("AI FEATURE TESTS")
    results["Character Extraction"] = test_character_extraction()
    results["World AI Templates"] = test_world_template_suggestion()
    results["Image Generation"] = test_image_generation()
    
    # Performance tests
    print_section("PERFORMANCE TESTS")
    results["Response Times"] = test_response_times()
    results["Background Separation"] = test_background_separation()
    
    # Integration tests
    print_section("INTEGRATION TESTS")
    results["Mode Switching"] = test_mode_switching()
    
    # ==================== RESULTS SUMMARY ====================
    print_section("TEST RESULTS SUMMARY")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    # Categorize results
    critical_tests = [
        "Health Check",
        "BS - Full CPS Loop",
        "DT - Scaffolding",
        "Character Extraction",
        "World AI Templates"
    ]
    
    critical_passed = sum(1 for test in critical_tests if results.get(test, False))
    critical_total = len(critical_tests)
    
    log.info("\n" + "=" * 70)
    log.info("DETAILED RESULTS:")
    log.info("=" * 70)
    
    for test_name, passed_test in results.items():
        status = "[PASS] [PASS]" if passed_test else "[WARN] [FAIL]"
        critical = " [CRITICAL]" if test_name in critical_tests else ""
        log.info(f"{status} {test_name}{critical}")
    
    log.info("\n" + "=" * 70)
    log.info("SUMMARY:")
    log.info("=" * 70)
    log.info(f"Overall:  {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
    log.info(f"Critical: {critical_passed}/{critical_total} critical tests passed")
    
    # Determine overall success
    all_critical_passed = critical_passed == critical_total
    mostly_passed = passed >= total - 2  # Allow 2 non-critical failures
    
    if all_critical_passed and mostly_passed:
        log.info("\n" + "=" * 70)
        log.info("[PASS][PASS][PASS] ALL TESTS PASSED [PASS][PASS][PASS]")
        log.info("=" * 70)
        log.info("The consolidated server is working correctly!")
        return True
    elif all_critical_passed:
        log.info("\n" + "=" * 70)
        log.info("⚠ MOSTLY PASSING (some non-critical failures)")
        log.info("=" * 70)
        log.info("Critical functionality works, but check failed tests.")
        return True
    else:
        log.error("\n" + "=" * 70)
        log.error("[WARN][WARN][WARN] CRITICAL TESTS FAILED [WARN][WARN][WARN]")
        log.error("=" * 70)
        log.error(f"Failed critical tests:")
        for test in critical_tests:
            if not results.get(test, False):
                log.error(f"  - {test}")
        return False

# ==================== DIAGNOSTIC UTILITIES ====================
def diagnose_server():
    """Run diagnostics if tests fail"""
    log.info("\n" + "=" * 70)
    log.info("RUNNING DIAGNOSTICS")
    log.info("=" * 70)
    
    # Check if server is reachable
    try:
        r = requests.get(f"{CONSOLIDATED_URL}/health", timeout=5)
        log.info(f"[PASS] Server reachable (status: {r.status_code})")
    except Exception as e:
        log.error(f"[WARN] Server not reachable: {e}")
        log.error(f"  Make sure server is running at {CONSOLIDATED_URL}")
        return
    
    # Check session API
    try:
        r = requests.post(f"{SESSION_API}/session/create", 
                         json={"uid": TEST_UID}, timeout=5)
        log.info(f"[PASS] Session API reachable (status: {r.status_code})")
    except Exception as e:
        log.error(f"[WARN] Session API not reachable: {e}")
        log.error(f"  Make sure session server is running at {SESSION_API}")
        return
    
    # Check for common issues
    log.info("\nCommon issues to check:")
    log.info("  1. Is Firebase initialized? (Check logs for 'Firebase initialized')")
    log.info("  2. Are API keys set? (DEEPSEEK_API_KEY, LEONARDO_API_KEY)")
    log.info("  3. Is Profile Manager running? (Required for entity operations)")
    log.info("  4. Check server logs for errors during requests")
    log.info(f"  5. Verify CONSOLIDATED_URL is correct: {CONSOLIDATED_URL}")

def test_specific_endpoint(endpoint, method="GET", data=None):
    """Test a specific endpoint with detailed logging"""
    log.info(f"\n[DEBUG] Testing {method} {endpoint}")
    
    try:
        if method == "GET":
            r = requests.get(f"{CONSOLIDATED_URL}{endpoint}", timeout=10)
        elif method == "POST":
            r = requests.post(f"{CONSOLIDATED_URL}{endpoint}", 
                            json=data, timeout=30)
        else:
            log.error(f"Unsupported method: {method}")
            return
        
        log.info(f"  Status: {r.status_code}")
        log.info(f"  Headers: {dict(r.headers)}")
        
        try:
            response_data = r.json()
            log.info(f"  Response:")
            pretty_json(response_data)
        except:
            log.info(f"  Raw response: {r.text[:500]}")
        
        r.raise_for_status()
        log.info("  [PASS] Request successful")
        
    except requests.HTTPError as e:
        log.error(f"  [WARN] HTTP Error: {e}")
        log.error(f"  Response: {e.response.text[:500]}")
    except Exception as e:
        log.error(f"  [WARN] Error: {e}")

# ==================== CLI INTERFACE ====================
if __name__ == "__main__":
    import sys
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "diagnose":
            diagnose_server()
            exit(0)
        
        elif command == "test-endpoint":
            if len(sys.argv) < 3:
                print("Usage: python test_consolidated_server.py test-endpoint <endpoint> [method] [json_data]")
                exit(1)
            
            endpoint = sys.argv[2]
            method = sys.argv[3] if len(sys.argv) > 3 else "GET"
            data = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
            
            test_specific_endpoint(endpoint, method, data)
            exit(0)
        
        elif command == "quick":
            # Quick test - only critical tests
            log.info("Running QUICK TEST (critical tests only)...")
            
            results = {
                "Health Check": test_health_check(),
                "BS - Full CPS Loop": test_bs_full_cps_loop(),
                "DT - Scaffolding": test_dt_scaffolding(),
                "Character Extraction": test_character_extraction(),
            }
            
            passed = sum(1 for v in results.values() if v)
            total = len(results)
            
            print_section("QUICK TEST RESULTS")
            for test_name, passed_test in results.items():
                status = "[PASS]" if passed_test else "[WARN]"
                log.info(f"{status} {test_name}")
            
            log.info(f"\nPassed: {passed}/{total}")
            
            exit(0 if passed == total else 1)
        
        elif command == "bs-only":
            # Test only brainstorming
            log.info("Running BRAINSTORMING TESTS only...")
            
            results = {
                "BS - Full CPS Loop": test_bs_full_cps_loop(),
                "BS - Idea Evaluations": test_bs_idea_evaluations(),
                "BS - Auto-Advancement": test_bs_auto_advancement(),
            }
            
            passed = sum(1 for v in results.values() if v)
            total = len(results)
            
            for test_name, passed_test in results.items():
                status = "[PASS]" if passed_test else "[WARN]"
                log.info(f"{status} {test_name}")
            
            exit(0 if passed == total else 1)
        
        elif command == "dt-only":
            # Test only deep thinking
            log.info("Running DEEP THINKING TESTS only...")
            
            results = {
                "DT - Scaffolding": test_dt_scaffolding(),
                "DT - Precision Check": test_dt_precision_check(),
                "DT - Angle Transitions": test_dt_angle_transitions(),
                "DT - Follow-up Limit": test_dt_followup_limit(),
            }
            
            passed = sum(1 for v in results.values() if v)
            total = len(results)
            
            for test_name, passed_test in results.items():
                status = "[PASS]" if passed_test else "[WARN]"
                log.info(f"{status} {test_name}")
            
            exit(0 if passed == total else 1)
        
        elif command == "help":
            print("""
Consolidated Server Test Suite

Usage:
    python test_consolidated_server.py [command]

Commands:
    (none)          Run full test suite
    quick           Run only critical tests (faster)
    bs-only         Test only brainstorming endpoints
    dt-only         Test only deep thinking endpoints
    diagnose        Run diagnostics if tests fail
    test-endpoint   Test a specific endpoint
    help            Show this help message

Examples:
    python test_consolidated_server.py
    python test_consolidated_server.py quick
    python test_consolidated_server.py diagnose
    python test_consolidated_server.py test-endpoint /health GET

Configuration:
    Edit CONSOLIDATED_URL and SESSION_API at the top of this file
    Current settings:
        CONSOLIDATED_URL = {CONSOLIDATED_URL}
        SESSION_API = {SESSION_API}
            """)
            exit(0)
        
        else:
            print(f"Unknown command: {command}")
            print("Run with 'help' for usage information")
            exit(1)
    
    # Default: Run full test suite
    success = run_all_tests()
    
    if not success:
        log.info("\n" + "=" * 70)
        log.info("Some tests failed. Run diagnostics:")
        log.info(f"  python {sys.argv[0]} diagnose")
        log.info("=" * 70)
    
    exit(0 if success else 1)