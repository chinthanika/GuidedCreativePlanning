#!/usr/bin/env python3
"""
Server Diagnostics Tool
Tests individual components and provides detailed error reports
"""

import requests
import json
import time
import sys

CONSOLIDATED_URL = "http://10.163.13.8:5000"
SESSION_API = "https://guidedcreativeplanning-session.onrender.com"
TEST_UID = "04E9XYnVi8QD3yHAIXeBHCRp2sN2"

def print_header(title):
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)

def test_with_details(test_name, test_func):
    """Run test and provide detailed error info"""
    print(f"\n[TEST] {test_name}")
    print("-" * 70)
    
    try:
        start = time.time()
        result = test_func()
        duration = time.time() - start
        
        if result.get("success"):
            print(f"✓ PASSED ({duration:.2f}s)")
            if result.get("details"):
                print(f"  Details: {result['details']}")
            return True
        else:
            print(f"✗ FAILED ({duration:.2f}s)")
            print(f"  Error: {result.get('error', 'Unknown error')}")
            if result.get("details"):
                print(f"  Details: {result['details']}")
            return False
            
    except Exception as e:
        print(f"✗ CRASHED")
        print(f"  Exception: {e}")
        import traceback
        print(traceback.format_exc())
        return False

def create_test_session():
    """Helper to create session"""
    r = requests.post(f"{SESSION_API}/session/create", 
                     json={"uid": TEST_UID}, timeout=10)
    r.raise_for_status()
    return r.json().get("sessionID")

def get_session_metadata(session_id):
    """Helper to get metadata"""
    r = requests.post(f"{SESSION_API}/session/get_metadata",
                     json={"uid": TEST_UID, "sessionID": session_id},
                     timeout=10)
    r.raise_for_status()
    return r.json().get("metadata", {})

def get_session_ideas(session_id):
    """Helper to get ideas"""
    r = requests.post(f"{SESSION_API}/cps/get_ideas",
                     json={"uid": TEST_UID, "sessionID": session_id},
                     timeout=10)
    r.raise_for_status()
    return r.json().get("ideas", {})

# ============================================
# DIAGNOSTIC TESTS
# ============================================

def diagnose_health():
    """Check if server is responding"""
    try:
        r = requests.get(f"{CONSOLIDATED_URL}/health", timeout=5)
        r.raise_for_status()
        data = r.json()
        
        return {
            "success": data.get("status") == "ok",
            "details": f"Services: {json.dumps(data.get('services', {}))}"
        }
    except requests.Timeout:
        return {
            "success": False,
            "error": "Server timeout - server may be down or overloaded",
            "details": "Check if server is running and not blocked by firewall"
        }
    except requests.ConnectionError:
        return {
            "success": False,
            "error": "Connection refused - server not running",
            "details": f"Cannot connect to {CONSOLIDATED_URL}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_session_api():
    """Check if session API is working"""
    try:
        session_id = create_test_session()
        
        return {
            "success": True,
            "details": f"Created session: {session_id}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "details": "Session API required for storing conversation state"
        }

def diagnose_bs_basic():
    """Test basic BS chat functionality"""
    try:
        session_id = create_test_session()
        
        # Send simple message
        r = requests.post(f"{CONSOLIDATED_URL}/chat/brainstorming",
            json={
                "user_id": TEST_UID,
                "message": "Hello, I want to brainstorm ideas.",
                "session_id": session_id
            },
            timeout=30
        )
        
        if r.status_code != 200:
            return {
                "success": False,
                "error": f"HTTP {r.status_code}",
                "details": r.text[:500]
            }
        
        response = r.json()
        chat_message = response.get("chat_message", "")
        
        if not chat_message:
            return {
                "success": False,
                "error": "No chat message in response",
                "details": json.dumps(response, indent=2)
            }
        
        return {
            "success": True,
            "details": f"Response length: {len(chat_message)} chars"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_bs_hmw_addition():
    """Test HMW question addition and counting"""
    try:
        session_id = create_test_session()
        
        # Add HMW
        r = requests.post(f"{CONSOLIDATED_URL}/chat/brainstorming",
            json={
                "user_id": TEST_UID,
                "message": "How might we make the story more engaging?",
                "session_id": session_id
            },
            timeout=30
        )
        r.raise_for_status()
        
        # Wait for processing
        time.sleep(2)
        
        # Check metadata
        metadata = get_session_metadata(session_id)
        bs_meta = metadata.get("brainstorming", {})
        hmw_questions = bs_meta.get("hmwQuestions", {})
        
        if len(hmw_questions) < 1:
            return {
                "success": False,
                "error": "HMW question not added",
                "details": f"Expected at least 1 HMW, found {len(hmw_questions)}"
            }
        
        return {
            "success": True,
            "details": f"HMW count: {len(hmw_questions)}, Stage: {bs_meta.get('stage')}"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_bs_auto_advance():
    """Test auto-advancement from Clarify to Ideate"""
    try:
        session_id = create_test_session()
        
        # Add exactly 3 HMWs
        hmws = [
            "How might we create surprise?",
            "How might we build tension?",
            "How might we show character growth?"
        ]
        
        for hmw in hmws:
            r = requests.post(f"{CONSOLIDATED_URL}/chat/brainstorming",
                json={
                    "user_id": TEST_UID,
                    "message": hmw,
                    "session_id": session_id
                },
                timeout=30
            )
            r.raise_for_status()
            time.sleep(1)
        
        # Wait for auto-advance
        time.sleep(3)
        
        # Check stage
        metadata = get_session_metadata(session_id)
        current_stage = metadata.get("brainstorming", {}).get("stage")
        
        if current_stage != "Ideate":
            return {
                "success": False,
                "error": f"Did not auto-advance to Ideate",
                "details": f"Current stage: {current_stage} (expected Ideate)"
            }
        
        return {
            "success": True,
            "details": f"Successfully auto-advanced to {current_stage}"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_bs_idea_logging():
    """Test idea logging and evaluation"""
    try:
        session_id = create_test_session()
        
        # Fast-forward to Ideate
        for i in range(3):
            requests.post(f"{CONSOLIDATED_URL}/chat/brainstorming",
                json={
                    "user_id": TEST_UID,
                    "message": f"How might we solve problem {i+1}?",
                    "session_id": session_id
                },
                timeout=30
            )
        
        time.sleep(3)
        
        # Add idea
        r = requests.post(f"{CONSOLIDATED_URL}/chat/brainstorming",
            json={
                "user_id": TEST_UID,
                "message": "What if the mentor betrays the hero due to jealousy?",
                "session_id": session_id
            },
            timeout=30
        )
        r.raise_for_status()
        
        time.sleep(3)
        
        # Check ideas
        ideas = get_session_ideas(session_id)
        
        if len(ideas) < 1:
            return {
                "success": False,
                "error": "Idea not logged",
                "details": f"Expected at least 1 idea, found {len(ideas)}"
            }
        
        # Check for evaluations
        has_evaluations = False
        for idea_id, idea in ideas.items():
            if idea.get("evaluations"):
                has_evaluations = True
                break
        
        return {
            "success": True,
            "details": f"Ideas: {len(ideas)}, Has evaluations: {has_evaluations}"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_dt_basic():
    """Test basic DT chat functionality"""
    try:
        session_id = create_test_session()
        
        r = requests.post(f"{CONSOLIDATED_URL}/chat/deepthinking",
            json={
                "user_id": TEST_UID,
                "message": "I want to develop my character Alex",
                "session_id": session_id
            },
            timeout=30
        )
        
        if r.status_code != 200:
            return {
                "success": False,
                "error": f"HTTP {r.status_code}",
                "details": r.text[:500]
            }
        
        response = r.json()
        chat_message = response.get("chat_message", "")
        
        # Check for scaffolding (should have context before question)
        has_question = "?" in chat_message
        has_substance = len(chat_message.split()) > 15
        
        if not has_question:
            return {
                "success": False,
                "error": "Response doesn't contain a question",
                "details": chat_message[:200]
            }
        
        return {
            "success": True,
            "details": f"Has question: {has_question}, Length: {len(chat_message)} chars"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_character_extraction():
    """Test character extraction with long text"""
    try:
        # Long text with multiple characters
        test_text = """
        Detective Sarah Chen and her partner Mike Rodriguez investigated 
        the crime scene. The victim, Dr. Elizabeth Grant, was found dead.
        The CEO, James Morrison, became their primary suspect.
        Sarah's mentor, Captain Williams, advised caution.
        Mike's informant, known only as "The Shadow", provided a key lead.
        """ * 50  # Repeat to create long text
        
        r = requests.post(f"{CONSOLIDATED_URL}/characters/extract",
            json={"text": test_text},
            timeout=90  # Longer timeout for chunked processing
        )
        
        if r.status_code != 200:
            return {
                "success": False,
                "error": f"HTTP {r.status_code}",
                "details": r.text[:500]
            }
        
        result = r.json()
        entities = result.get("entities", [])
        relationships = result.get("relationships", [])
        
        # Verify all expected characters found
        expected_names = ["Sarah Chen", "Mike Rodriguez", "Elizabeth Grant", 
                         "James Morrison", "Williams"]
        found_count = sum(1 for entity in entities 
                         if any(name in entity.get('name', '') for name in expected_names))
        
        return {
            "success": found_count >= 4,
            "details": f"Found {found_count}/{len(expected_names)} expected characters, "
                      f"{len(entities)} total entities, {len(relationships)} relationships"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def diagnose_world_template():
    """Test world-building template generation"""
    try:
        r = requests.post(f"{CONSOLIDATED_URL}/worldbuilding/suggest-template",
            json={
                "userId": TEST_UID,
                "itemType": "Magic System",
                "itemName": "Elemental Magic"
            },
            timeout=30
        )
        
        if r.status_code != 200:
            return {
                "success": False,
                "error": f"HTTP {r.status_code}",
                "details": r.text[:500]
            }
        
        result = r.json()
        fields = result.get("suggestedFields", [])
        
        if len(fields) < 3:
            return {
                "success": False,
                "error": "Not enough fields suggested",
                "details": f"Expected at least 3 fields, found {len(fields)}"
            }
        
        return {
            "success": True,
            "details": f"Suggested {len(fields)} fields"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================
# MAIN DIAGNOSTIC RUNNER
# ============================================

def run_diagnostics():
    """Run all diagnostic tests"""
    print_header("SERVER DIAGNOSTIC TOOL")
    print(f"Testing server: {CONSOLIDATED_URL}")
    print(f"Session API: {SESSION_API}")
    
    results = {}
    
    print_header("CORE INFRASTRUCTURE")
    results["Health Check"] = test_with_details("Health Check", diagnose_health)
    results["Session API"] = test_with_details("Session API", diagnose_session_api)
    
    print_header("BRAINSTORMING MODE")
    results["BS Basic"] = test_with_details("Basic BS Chat", diagnose_bs_basic)
    results["BS HMW Addition"] = test_with_details("HMW Question Addition", diagnose_bs_hmw_addition)
    results["BS Auto-Advance"] = test_with_details("Auto-Advance Logic", diagnose_bs_auto_advance)
    results["BS Idea Logging"] = test_with_details("Idea Logging", diagnose_bs_idea_logging)
    
    print_header("DEEP THINKING MODE")
    results["DT Basic"] = test_with_details("Basic DT Chat", diagnose_dt_basic)
    
    print_header("AI FEATURES")
    results["Character Extraction"] = test_with_details("Character Extraction", diagnose_character_extraction)
    results["World Templates"] = test_with_details("World-building Templates", diagnose_world_template)
    
    # Summary
    print_header("DIAGNOSTIC SUMMARY")
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nResults: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)\n")
    
    critical_tests = ["Health Check", "Session API", "BS Basic", "DT Basic"]
    critical_passed = sum(1 for test in critical_tests if results.get(test, False))
    
    if critical_passed < len(critical_tests):
        print("❌ CRITICAL TESTS FAILED")
        print("\nFailed critical tests:")
        for test in critical_tests:
            if not results.get(test, False):
                print(f"  - {test}")
        print("\nServer cannot function without these tests passing.")
    elif passed == total:
        print("✅ ALL DIAGNOSTICS PASSED")
        print("\nServer is fully operational!")
    else:
        print("⚠️  SOME TESTS FAILED")
        print("\nFailed tests:")
        for test, passed in results.items():
            if not passed:
                print(f"  - {test}")
        print("\nCritical functionality works, but some features may be impaired.")
    
    print("\n" + "="*70)
    return passed == total

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "quick":
        # Quick mode - only critical tests
        print("Running QUICK DIAGNOSTIC (critical tests only)...\n")
        results = {
            "Health": test_with_details("Health Check", diagnose_health),
            "Session": test_with_details("Session API", diagnose_session_api),
            "BS": test_with_details("BS Basic", diagnose_bs_basic),
            "DT": test_with_details("DT Basic", diagnose_dt_basic)
        }
        passed = sum(1 for v in results.values() if v)
        print(f"\nQuick diagnostic: {passed}/4 passed")
        sys.exit(0 if passed == 4 else 1)
    else:
        success = run_diagnostics()
        sys.exit(0 if success else 1)