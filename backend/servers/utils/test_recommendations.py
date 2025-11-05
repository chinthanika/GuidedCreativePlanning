"""
Enhanced test script for book recommendation system with session management.
"""

import os
import sys
import json
import requests
import time
from session_helper import SessionHelper, TEST_CONVERSATIONS

# Configuration
GOOGLE_BOOKS_API_KEY = os.environ.get('GOOGLE_BOOKS_API_KEY', '')
API_BASE_URL = 'http://localhost:5000'
SESSION_API_URL = 'https://guidedcreativeplanning-session.onrender.com'

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test(name):
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")

def print_success(msg):
    print(f"{GREEN}✓ {msg}{RESET}")

def print_error(msg):
    print(f"{RED}✗ {msg}{RESET}")

def print_warning(msg):
    print(f"{YELLOW}⚠ {msg}{RESET}")

def print_info(msg):
    print(f"{BLUE}ℹ {msg}{RESET}")


# ============================================
# TEST 4b: Debug Book Sources
# ============================================
def test_debug_book_sources():
    print_test("Debug Book Sources")
    
    try:
        print(f"\nTesting each book source individually...")
        
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations/debug",
            json={
                "themes": {
                    "genre": "fantasy",
                    "themes": ["magic", "coming-of-age"],
                    "_searchQueries": ["fantasy young adult magic"]
                },
                "limit": 3
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            
            print_info("\nConfiguration:")
            config = data.get('config', {})
            if config.get('google_books_api_key_set'):
                print_success(f"  Google Books API key: Set")
            else:
                print_warning(f"  Google Books API key: Not set")
            
            print(f"  Curated collections loaded: {config.get('curated_collections_loaded')}")
            print(f"  Curated collections count: {config.get('curated_collections_count')}")
            
            print_info("\nSource Results:")
            results_data = data.get('results', {})
            
            for source, result in results_data.items():
                status = result.get('status')
                count = result.get('count', 0)
                
                if status == 'success':
                    print_success(f"  {source}: {count} books")
                elif status == 'error':
                    print_error(f"  {source}: {result.get('error')}")
                elif status == 'disabled':
                    print_warning(f"  {source}: {result.get('error')}")
                
                # Show available collections for curated
                if source == 'curated':
                    collections = result.get('available_collections', [])
                    total = result.get('total_curated_books', 0)
                    print(f"    Collections: {', '.join(collections)}")
                    print(f"    Total curated books: {total}")
            
            summary = data.get('summary', {})
            print_info(f"\nSummary:")
            print(f"  Total books: {summary.get('total_books')}")
            print(f"  Sources working: {summary.get('sources_working')}/3")
            print(f"  Sources failed: {summary.get('sources_failed')}/3")
            
            return True
        else:
            print_error(f"Status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# TEST 1: Google Books API Direct
# ============================================
def test_google_books_api():
    print_test("Google Books API Direct Call")
    
    if not GOOGLE_BOOKS_API_KEY:
        print_error("Google Books API Key not set in environment")
        print("Set it with: set GOOGLE_BOOKS_API_KEY=your_key_here")
        return False
    
    try:
        params = {
            'q': 'fantasy young adult magic',
            'maxResults': 3,
        }
        
        print(f"Calling Google Books API...")
        response = requests.get(
            'https://www.googleapis.com/books/v1/volumes',
            params=params,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get('items', [])
            
            if items:
                print_success(f"Returned {len(items)} books")
                for i, item in enumerate(items[:2], 1):
                    title = item.get('volumeInfo', {}).get('title', 'Unknown')
                    author = item.get('volumeInfo', {}).get('authors', ['Unknown'])[0]
                    print(f"  {i}. {title} by {author}")
                return True
            else:
                print_error("No books returned")
                return False
        elif response.status_code == 403:
            print_error("403 Forbidden - Check your API key or enable Books API in Google Cloud Console")
            return False
        else:
            print_error(f"Status {response.status_code}: {response.text[:200]}")
            return False
            
    except requests.ConnectionError:
        print_error("Cannot connect to Google Books API. Check internet connection.")
        return False
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# TEST 2: Session API Health
# ============================================
def test_session_api():
    print_test("Session API Connection")
    
    try:
        # Try to create a test session to verify API is working
        test_payload = {
            "uid": "test_health_check",
            "metadata_shared": {"title": "Health Check"},
            "metadata_dt": {},
            "metadata_bs": {}
        }
        
        response = requests.post(
            f"{SESSION_API_URL}/session/create",
            json=test_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            session_id = response.json().get("sessionID")
            print_success(f"Session API is reachable")
            print_info(f"  Test session created: {session_id}")
            return True
        else:
            print_error(f"Session API returned {response.status_code}")
            return False
            
    except requests.ConnectionError:
        print_error(f"Cannot connect to Session API at {SESSION_API_URL}")
        print("Make sure the session server is running")
        return False
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# TEST 3: Flask Server Health
# ============================================
def test_server_health():
    print_test("Flask Server Health Check")
    
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Server status: {data.get('status')}")
            
            services = data.get('services', {})
            for service, status in services.items():
                if status == 'running':
                    print_success(f"  {service}: {status}")
                else:
                    print_warning(f"  {service}: {status}")
            
            return True
        else:
            print_error(f"Status {response.status_code}")
            return False
            
    except requests.ConnectionError:
        print_error("Cannot connect to Flask server at http://localhost:5000")
        print("Make sure your Flask server is running (python app.py)")
        return False
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# TEST 4: Curated Collections Endpoint
# ============================================
def test_curated_collections():
    print_test("Curated Collections Endpoint")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/curated-collections",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            collections = data.get('collections', [])
            
            if collections:
                print_success(f"Found {len(collections)} collections")
                for collection in collections:
                    print(f"  - {collection.get('name')}: {collection.get('bookCount')} books")
                return True
            else:
                print_warning("No collections found (empty curated_collections.json?)")
                return False
        elif response.status_code == 404:
            print_error("Endpoint not found - Did you add the /api/curated-collections route to app.py?")
            return False
        else:
            print_error(f"Status {response.status_code}: {response.text[:200]}")
            return False
            
    except requests.ConnectionError:
        print_error("Cannot connect to server")
        return False
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# TEST 5: Session Creation & Seeding
# ============================================
def test_session_creation_and_seeding():
    print_test("Session Creation & Message Seeding")
    
    print("\nAvailable test conversations:")
    for i, (name, _) in enumerate(TEST_CONVERSATIONS.items(), 1):
        print(f"  {i}. {name.replace('_', ' ').title()}")
    
    choice = input("\nSelect conversation (1-5) or 'skip': ").strip()
    
    if choice.lower() == 'skip':
        print_warning("Skipped (user choice)")
        return None, None, None
    
    try:
        choice_idx = int(choice) - 1
        conversation_names = list(TEST_CONVERSATIONS.keys())
        
        if choice_idx < 0 or choice_idx >= len(conversation_names):
            print_error("Invalid choice")
            return None, None, None
        
        conversation_name = conversation_names[choice_idx]
        conversation = TEST_CONVERSATIONS[conversation_name]
        
    except ValueError:
        print_error("Invalid input")
        return None, None, None
    
    # Get or create user ID
    test_user_id = input("\nEnter test user ID (or press Enter for 'test_user_rec'): ").strip()
    if not test_user_id:
        test_user_id = "test_user_rec"
    
    mode = input("Mode (brainstorming/deepthinking, default: brainstorming): ").strip() or "brainstorming"
    
    try:
        helper = SessionHelper(SESSION_API_URL)
        
        # Create session
        print_info(f"\nCreating {mode} session for user: {test_user_id}")
        session_id = helper.create_session(test_user_id, mode)
        print_success(f"Session created: {session_id}")
        
        # Seed conversation
        print_info(f"Seeding {len(conversation)} messages...")
        success_count = helper.seed_conversation(test_user_id, session_id, conversation, mode)
        
        if success_count == len(conversation):
            print_success(f"All {success_count} messages seeded successfully")
            
            # Verify
            info = helper.get_session_info(test_user_id, session_id)
            if info:
                print_info(f"Session verification:")
                print(f"  Total messages: {info['total_messages']}")
                print(f"  User messages: {info['user_messages']}")
            
            return test_user_id, session_id, mode
        else:
            print_error(f"Only {success_count}/{len(conversation)} messages seeded")
            return test_user_id, session_id, mode
            
    except Exception as e:
        print_error(f"Session creation failed: {e}")
        return None, None, None


# ============================================
# TEST 6: Full Recommendation Flow
# ============================================
def test_full_recommendation(user_id=None, session_id=None, mode="brainstorming"):
    print_test("Full Recommendation Endpoint")
    
    # If no session provided from previous test, ask user
    if not user_id or not session_id:
        print("\nYou can:")
        print("  1. Use a session created in the previous test")
        print("  2. Enter your own user ID and session ID")
        print("  3. Skip this test")
        
        test_user_id = input("\nEnter user ID (or 'skip'): ").strip()
        
        if test_user_id.lower() == 'skip':
            print_warning("Skipped (user choice)")
            return None
        
        test_session_id = input("Enter session ID: ").strip()
        
        if not test_user_id or not test_session_id:
            print_warning("Skipped (no user ID or session ID provided)")
            return None
            
        user_id = test_user_id
        session_id = test_session_id
    
    print_info(f"\nTesting recommendations for:")
    print(f"  User ID: {user_id}")
    print(f"  Session ID: {session_id}")
    print(f"  Mode: {mode}")
    
    try:
        payload = {
            "userId": user_id,
            "sessionId": session_id,
            "mode": mode,
            "filters": {
                "ageRange": "12-16",
                "pubDate": "any",
                "minRating": 3.5
            },
            "limit": 5
        }
        
        print(f"\nSending request...")
        start_time = time.time()
        
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json=payload,
            timeout=60  # Increased timeout for theme extraction
        )
        
        request_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            
            recommendations = data.get('recommendations', [])
            print_success(f"Returned {len(recommendations)} books in {request_time:.2f}s")
            
            for i, book in enumerate(recommendations, 1):
                print(f"\n  {i}. {book.get('title')} by {book.get('author')}")
                print(f"     Year: {book.get('year')}, Rating: {book.get('rating')}")
                print(f"     Source: {book.get('source')}, Score: {book.get('relevance_score', 0):.1f}")
                desc = book.get('description', '')
                if desc:
                    print(f"     Description: {desc[:100]}...")
            
            # Show extracted themes
            themes = data.get('extractedThemes', {})
            print(f"\n  {BLUE}Extracted Themes:{RESET}")
            print(f"    Genre: {themes.get('genre')}")
            print(f"    Themes: {', '.join(themes.get('themes', []))}")
            print(f"    Character Types: {', '.join(themes.get('characterTypes', []))}")
            print(f"    Confidence: {themes.get('confidence', 0):.2f}")
            
            # Show search queries
            queries = data.get('searchQueries', [])
            if queries:
                print(f"\n  {BLUE}Search Queries Used:{RESET}")
                for q in queries:
                    print(f"    - {q}")
            
            # Show timing
            processing_time = data.get('processingTime', 0)
            print(f"\n  Processing Time: {processing_time}ms ({processing_time/1000:.2f}s)")
            
            return True
            
        elif response.status_code == 400:
            error_data = response.json()
            error_msg = error_data.get('error')
            details = error_data.get('details', '')
            
            print_error(f"Client error: {error_msg}")
            print(f"  Details: {details}")
            
            if "No conversation" in error_msg or "no messages" in details.lower():
                print_info("  TIP: The session needs messages. Use Test 5 to create a seeded session.")
            elif "at least 3 messages" in details.lower():
                current = error_data.get('currentMessageCount', 0)
                print_info(f"  Current: {current} messages, Required: 3+ user messages")
                print_info("  TIP: Add more messages or use Test 5 to create a fully seeded session.")
            
            return False
            
        elif response.status_code == 500:
            error_data = response.json()
            print_error(f"Server error: {error_data.get('error')}")
            print(f"  Details: {error_data.get('details', 'No details')}")
            
            if error_data.get('fallback'):
                print_info("  System is in fallback mode - check logs for details")
            
            return False
        else:
            print_error(f"Status {response.status_code}")
            print(f"Response: {response.text[:300]}")
            return False
            
    except requests.Timeout:
        print_error("Request timed out (>60s)")
        print_info("Theme extraction can be slow - this might indicate:")
        print("  - DeepSeek API is slow")
        print("  - Conversation is very long")
        print("  - Network issues")
        return False
    except Exception as e:
        print_error(f"Exception: {e}")
        return False


# ============================================
# RUN ALL TESTS
# ============================================
def run_all_tests():
    print("\n" + "="*60)
    print("BOOK RECOMMENDATION SYSTEM - ENHANCED TEST SUITE")
    print("="*60)
    
    # Check if Google Books API key is set
    if not GOOGLE_BOOKS_API_KEY:
        print(f"\n{YELLOW}WARNING: GOOGLE_BOOKS_API_KEY not set in environment{RESET}")
        print("Set it with:")
        print("  Windows: set GOOGLE_BOOKS_API_KEY=your_key_here")
        print("  Linux/Mac: export GOOGLE_BOOKS_API_KEY=your_key_here")
        print("\nContinuing with other tests...\n")
    
    results = {}
    test_session_info = None
    
    # Test 1: Google Books API Direct
    results["Google Books API"] = test_google_books_api()

    # Test 2: Session API
    results["Session API"] = test_session_api()
    
    # Test 3: Server Health
    results["Server Health"] = test_server_health()
    
    # Test 4: Curated Collections
    if results.get("Server Health"):
        results["Curated Collections"] = test_curated_collections()
    else:
        print_test("Curated Collections")
        print_warning("Skipped (server not running)")
        results["Curated Collections"] = None
    
    # Test 4b: Debug Book Sources
    if results.get("Server Health"):
        test_debug_book_sources()
    else:
        print_test("Debug Book Sources")
        print_warning("Skipped (server not running)")
    
    # Test 5: Session Creation & Seeding
    if results.get("Session API"):
        user_id, session_id, mode = test_session_creation_and_seeding()
        if user_id and session_id:
            test_session_info = (user_id, session_id, mode)
            results["Session Creation"] = True
        else:
            results["Session Creation"] = None
    else:
        print_test("Session Creation & Seeding")
        print_warning("Skipped (Session API not available)")
        results["Session Creation"] = None
    
    # Test 6: Full Recommendation (use seeded session if available)
    if results.get("Server Health"):
        if test_session_info:
            user_id, session_id, mode = test_session_info
            results["Full Recommendation"] = test_full_recommendation(user_id, session_id, mode)
        else:
            results["Full Recommendation"] = test_full_recommendation()
    else:
        print_test("Full Recommendation")
        print_warning("Skipped (server not running)")
        results["Full Recommendation"] = None
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len(results)
    
    for test_name, result in results.items():
        if result is True:
            print(f"{GREEN}✓{RESET} {test_name}")
        elif result is False:
            print(f"{RED}✗{RESET} {test_name}")
        else:
            print(f"{YELLOW}⊘{RESET} {test_name} (skipped)")
    
    print(f"\nResults: {passed}/{total} passed, {failed} failed, {skipped} skipped")
    
    if failed == 0 and passed > 0:
        print(f"\n{GREEN}✓ All available tests passed!{RESET}")
    elif failed > 0:
        print(f"\n{RED}✗ Some tests failed. Check output above for details.{RESET}")
    
    # Quick tips
    print("\n" + "="*60)
    print("QUICK TIPS")
    print("="*60)
    print("1. Make sure Flask server is running: python app.py")
    print("2. Make sure Session API is running (or use deployed version)")
    print("3. Set Google Books API key in environment variables")
    print("4. Use Test 5 to create pre-seeded sessions for testing")
    print("5. Check logs/recommendations.log for detailed errors")
    print("\nFor quick testing:")
    print("  - Run Test 5 to create a seeded session")
    print("  - Session will automatically be used for Test 6")


if __name__ == "__main__":
    run_all_tests()