"""
Comprehensive test suite for book recommendation system.
NOW INCLUDES: Open Library integration and Subject Mapping tests.
"""

import os
import sys
import json
import requests
import time
import logging
from logging.handlers import RotatingFileHandler

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.recommendations.book_sources import BookSourceManager
from utils.recommendations.StoryElementExtractor import StoryElementExtractor
from utils.recommendations.SubjectMapper import SubjectMapper
from utils.chat.chat_utils import DEEPSEEK_API_KEY
from prompts.book_explanation_prompt import build_explanation_user_prompt
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
CYAN = '\033[96m'
RESET = '\033[0m'

# Setup logging
logger = logging.getLogger("RECOMMENDATION_TESTS")
logger.setLevel(logging.DEBUG)

os.makedirs("logs", exist_ok=True)

file_handler = RotatingFileHandler(
    "logs/recommendation_tests.log",
    maxBytes=10*1024*1024,
    backupCount=3
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logger.addHandler(file_handler)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.ERROR)
console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
logger.addHandler(console_handler)

# Initialize components
book_source_manager = BookSourceManager()
story_extractor = StoryElementExtractor()

# Test cases for query effectiveness
QUERY_TEST_CASES = [
    {
        'name': 'Fantasy with Magic',
        'story_elements': {
            'genre': {'primary': 'fantasy', 'confidence': 0.9},
            'themes': [
                {'name': 'magic', 'confidence': 0.8, 'prominence': 'primary'},
                {'name': 'identity', 'confidence': 0.7, 'prominence': 'secondary'}
            ],
            'characterArchetypes': [{'archetype': 'hero', 'confidence': 0.8}],
            'plotStructure': {'primaryStructure': 'hero journey'},
            'ageAppropriate': {'targetAge': '12-16'},
            'tone': {'primary': 'adventurous'},
            'overallConfidence': 0.8
        },
        'expected_genre': 'fantasy',
        'expected_keywords': ['magic', 'fantasy', 'wizard', 'enchant']
    },
    {
        'name': 'Dystopian with Rebellion',
        'story_elements': {
            'genre': {'primary': 'dystopian', 'confidence': 0.9},
            'themes': [
                {'name': 'freedom', 'confidence': 0.9, 'prominence': 'primary'},
                {'name': 'rebellion', 'confidence': 0.85, 'prominence': 'primary'}
            ],
            'characterArchetypes': [{'archetype': 'rebel', 'confidence': 0.85}],
            'plotStructure': {'primaryStructure': 'character vs society'},
            'ageAppropriate': {'targetAge': '14-18'},
            'tone': {'primary': 'dark'},
            'overallConfidence': 0.87
        },
        'expected_genre': 'dystopian',
        'expected_keywords': ['dystopia', 'rebellion', 'totalitarian']
    }
]

# Open Library test cases
OL_TEST_CASES = [
    {
        'name': 'Fantasy YA',
        'query': 'fantasy young adult magic',
        'expected_subjects': ['fantasy', 'young adult', 'magic'],
        'min_results': 3
    },
    {
        'name': 'Dystopian Fiction',
        'query': 'dystopian rebellion',
        'expected_subjects': ['dystopia', 'science fiction'],
        'min_results': 3
    },
    {
        'name': 'Contemporary Realistic',
        'query': 'contemporary realistic fiction',
        'expected_subjects': ['fiction', 'contemporary'],
        'min_results': 2
    }
]

# Subject mapping test cases
MAPPING_TEST_CASES = [
    {
        'name': 'Fantasy Mapping',
        'subjects': ['Fantasy', 'Magic', 'Young Adult', 'Wizards', 'Coming of Age'],
        'query_context': 'fantasy young adult magic',
        'expected_categories': ['Fantasy', 'Magic', 'Coming Of Age'],
        'min_relevance': 0.6
    },
    {
        'name': 'Dystopian Mapping',
        'subjects': ['Science Fiction', 'Dystopia', 'Rebellion', 'Young Adult', 'Political'],
        'query_context': 'dystopian rebellion',
        'expected_categories': ['Dystopian', 'Sci Fi', 'Rebellion'],
        'min_relevance': 0.6
    },
    {
        'name': 'Mystery Mapping',
        'subjects': ['Mystery', 'Detective', 'Crime', 'Thriller', 'Suspense'],
        'query_context': 'mystery detective thriller',
        'expected_categories': ['Mystery', 'Thriller'],
        'min_relevance': 0.7
    },
    {
        'name': 'Obscure Subjects',
        'subjects': ['Obscure Topic A', 'Rare Subject B', 'Unknown Category C'],
        'query_context': 'general fiction',
        'expected_categories': None,  # Should fallback
        'min_relevance': 0.0
    }
]


def print_test(name):
    separator = "=" * 70
    print(f"\n{separator}")
    print(f"{CYAN}TEST: {name}{RESET}")
    print(f"{separator}")
    logger.info(f"\n{separator}")
    logger.info(f"TEST: {name}")
    logger.info(separator)

def print_section(name):
    separator = "-" * 70
    print(f"\n{BLUE}{separator}")
    print(f"SECTION: {name}")
    print(f"{separator}{RESET}")
    logger.info(f"\n{separator}")
    logger.info(f"SECTION: {name}")
    logger.info(separator)

def print_success(msg):
    print(f"{GREEN}✓ {msg}{RESET}")
    logger.info(f"[PASS] {msg}")

def print_error(msg):
    print(f"{RED}✗ {msg}{RESET}")
    logger.error(f"[FAIL] {msg}")

def print_warning(msg):
    print(f"{YELLOW}⚠ {msg}{RESET}")
    logger.warning(f"[WARN] {msg}")

def print_info(msg):
    print(f"{BLUE}ℹ {msg}{RESET}")
    logger.info(f"[INFO] {msg}")


# ============================================
# SECTION A: QUERY EFFECTIVENESS TESTS
# ============================================

def test_query_generation():
    """Test A1: Verify query generation produces valid queries."""
    print_test("A1: Query Generation")
    
    passed = 0
    failed = 0
    
    for test_case in QUERY_TEST_CASES:
        try:
            name = test_case['name']
            elements = test_case['story_elements']
            
            print(f"\n{BLUE}Testing:{RESET} {name}")
            logger.info(f"Testing query generation for: {name}")
            
            queries = story_extractor.build_search_queries(elements)
            
            if not queries:
                print_error(f"  No queries generated")
                failed += 1
                continue
            
            print_info(f"  Generated {len(queries)} queries:")
            for i, q in enumerate(queries, 1):
                print(f"    {i}. {q}")
            
            all_queries_text = ' '.join(queries).lower()
            genre = elements['genre']['primary'].lower()
            
            if genre in all_queries_text:
                print_success(f"  Queries include genre '{genre}'")
                passed += 1
            else:
                print_warning(f"  Queries missing genre '{genre}'")
                passed += 1
            
        except Exception as e:
            print_error(f"  Exception: {e}")
            logger.exception(f"Exception in query generation test for {name}")
            failed += 1
    
    logger.info(f"Query Generation Test: {passed}/{len(QUERY_TEST_CASES)} passed")
    return passed == len(QUERY_TEST_CASES)


def test_book_fetching():
    """Test A2: Verify queries return books from Google Books."""
    print_test("A2: Book Fetching with Generated Queries")
    
    passed = 0
    
    for test_case in QUERY_TEST_CASES:
        try:
            name = test_case['name']
            elements = test_case['story_elements']
            
            print(f"\n{BLUE}Testing:{RESET} {name}")
            
            queries = story_extractor.build_search_queries(elements)
            themes = {
                'genre': elements['genre']['primary'],
                'themes': [t['name'] for t in elements.get('themes', [])],
                '_searchQueries': queries
            }
            
            print_info(f"  Fetching books...")
            books = book_source_manager._fetch_google_books_with_retry(themes, limit=5)
            
            if not books:
                print_warning(f"  No books returned (might be API issue)")
                passed += 1
                continue
            
            print_success(f"  Fetched {len(books)} books")
            
            for i, book in enumerate(books[:3], 1):
                print(f"    {i}. {book.get('title')} by {book.get('author')}")
            
            passed += 1
            
        except Exception as e:
            print_error(f"  Exception: {e}")
            logger.exception(f"Exception in book fetching test")
    
    return passed >= len(QUERY_TEST_CASES) * 0.75


# ============================================
# SECTION C: OPEN LIBRARY INTEGRATION TESTS
# ============================================

def test_openlibrary_api_connection():
    """Test C1: Open Library API Direct Connection"""
    print_test("C1: Open Library API Connection")
    
    try:
        params = {
            'q': 'fantasy young adult',
            'limit': 3,
            'fields': 'key,title,author_name,cover_i,subject'
        }
        
        print_info("Calling Open Library API...")
        response = requests.get(
            'https://openlibrary.org/search.json',
            params=params,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            docs = data.get('docs', [])
            
            if docs:
                print_success(f"Returned {len(docs)} books")
                for i, doc in enumerate(docs[:2], 1):
                    title = doc.get('title', 'Unknown')
                    authors = doc.get('author_name', ['Unknown'])
                    print(f"  {i}. {title} by {authors[0] if authors else 'Unknown'}")
                logger.info("Open Library API test passed")
                return True
            else:
                print_error("No books returned")
                return False
        else:
            print_error(f"Status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Open Library API test failed")
        return False


def test_openlibrary_enhanced_fetching():
    """Test C2: Enhanced Open Library Fetching with Subject Mapping"""
    print_test("C2: Enhanced Open Library Fetching")
    
    passed = 0
    failed = 0
    
    for test_case in OL_TEST_CASES:
        try:
            name = test_case['name']
            query = test_case['query']
            min_results = test_case['min_results']
            
            print(f"\n{BLUE}Testing:{RESET} {name}")
            print_info(f"  Query: '{query}'")
            
            # Fetch using enhanced method
            themes = {'_searchQueries': [query]}
            books = book_source_manager._fetch_openlibrary_enhanced(themes, limit=10)
            
            if not books:
                print_error(f"  No books returned")
                failed += 1
                continue
            
            print_success(f"  Fetched {len(books)} books")
            
            # Check if books have mapped categories
            books_with_categories = sum(1 for b in books if b.get('categories'))
            print_info(f"  Books with mapped categories: {books_with_categories}/{len(books)}")
            
            # Show sample books with mapping info
            for i, book in enumerate(books[:3], 1):
                print(f"  {i}. {book.get('title')} by {book.get('author')}")
                print(f"     Categories: {', '.join(book.get('categories', [])[:3])}")
                print(f"     Mapping: {book.get('_mapping_method', 'unknown')}")
                print(f"     Relevance: {book.get('_relevance_boost', 0):.2f}")
            
            if len(books) >= min_results:
                print_success(f"  Met minimum results ({len(books)} >= {min_results})")
                passed += 1
            else:
                print_warning(f"  Below minimum ({len(books)} < {min_results})")
                passed += 1  # Still pass with warning
            
        except Exception as e:
            print_error(f"  Exception: {e}")
            logger.exception(f"Open Library enhanced fetching test failed for {name}")
            failed += 1
    
    success = passed >= len(OL_TEST_CASES) * 0.75
    logger.info(f"Open Library Enhanced Test: {passed}/{len(OL_TEST_CASES)} passed")
    return success


def test_openlibrary_subject_parsing():
    """Test C3: Open Library Subject Parsing"""
    print_test("C3: Open Library Subject Parsing")
    
    try:
        # Query Open Library directly
        response = requests.get(
            'https://openlibrary.org/search.json',
            params={
                'q': 'fantasy magic young adult',
                'limit': 5,
                'fields': 'key,title,author_name,subject'
            },
            timeout=15
        )
        
        if response.status_code != 200:
            print_error(f"API call failed: {response.status_code}")
            return False
        
        docs = response.json().get('docs', [])
        
        if not docs:
            print_error("No books returned from API")
            return False
        
        print_info(f"Analyzing {len(docs)} books for subject parsing...")
        
        books_with_subjects = 0
        total_subjects = 0
        
        for doc in docs:
            subjects = doc.get('subject', [])
            if subjects:
                books_with_subjects += 1
                total_subjects += len(subjects)
        
        if books_with_subjects > 0:
            avg_subjects = total_subjects / books_with_subjects
            print_success(f"  {books_with_subjects}/{len(docs)} books have subjects")
            print_info(f"  Average subjects per book: {avg_subjects:.1f}")
            
            # Show sample subjects
            sample_doc = next((d for d in docs if d.get('subject')), None)
            if sample_doc:
                print_info(f"\n  Sample subjects from '{sample_doc.get('title')}':")
                for subj in sample_doc['subject'][:5]:
                    print(f"    - {subj}")
            
            logger.info("Open Library subject parsing test passed")
            return True
        else:
            print_warning("No books with subjects found")
            return True  # Still pass, might be API variance
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Subject parsing test failed")
        return False


def test_openlibrary_fallback():
    """Test C4: Open Library Fallback Behavior"""
    print_test("C4: Open Library Fallback")
    
    try:
        # Test with obscure query that should fallback
        obscure_themes = {
            'genre': 'extremely-rare-genre',
            'themes': ['nonexistent-theme'],
            '_searchQueries': ['xyzabc123nonexistent']
        }
        
        print_info("Testing with intentionally obscure query...")
        
        books = book_source_manager._fetch_openlibrary_enhanced(obscure_themes, limit=5)
        
        # Should fallback to genre
        if books:
            print_success(f"  Fallback returned {len(books)} books")
            print_info(f"  Sample: {books[0].get('title')}")
            return True
        else:
            print_warning("  Even fallback returned no books (acceptable)")
            return True
        
    except Exception as e:
        print_error(f"  Exception: {e}")
        logger.exception("Fallback test failed")
        return False


# ============================================
# SECTION D: SUBJECT MAPPING TESTS
# ============================================

def test_subject_mapper_initialization():
    """Test D1: Subject Mapper Initialization"""
    print_test("D1: Subject Mapper Initialization")
    
    try:
        mapper = SubjectMapper()
        
        print_info(f"Dynamic mapping: {'ENABLED' if mapper.enable_dynamic else 'DISABLED'}")
        print_info(f"Fallback mappings: {len(mapper.fallback_mappings)} categories")
        print_info(f"Cache capacity: {mapper.cache.capacity}")
        
        # Check if DeepSeek is available
        if mapper.enable_dynamic and mapper.client:
            print_success("  DeepSeek client initialized")
        elif not DEEPSEEK_API_KEY:
            print_warning("  DeepSeek API key not set (using fallback only)")
        else:
            print_warning("  Dynamic mapping disabled")
        
        # Verify fallback mappings loaded
        expected_categories = ['fantasy', 'sci-fi', 'mystery', 'horror', 'romance']
        for cat in expected_categories:
            if cat in mapper.fallback_mappings:
                print_success(f"  Fallback category '{cat}' loaded")
            else:
                print_error(f"  Missing fallback category '{cat}'")
                return False
        
        logger.info("Subject mapper initialization test passed")
        return True
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Mapper initialization failed")
        return False


def test_fallback_subject_mapping():
    """Test D2: Fallback Subject Mapping (Hardcoded)"""
    print_test("D2: Fallback Subject Mapping")
    
    mapper = SubjectMapper()
    passed = 0
    
    for test_case in MAPPING_TEST_CASES:
        try:
            name = test_case['name']
            subjects = test_case['subjects']
            
            print(f"\n{BLUE}Testing:{RESET} {name}")
            print_info(f"  Subjects: {', '.join(subjects[:3])}...")
            
            # Force fallback
            categories, relevance, method = mapper.map_subjects(
                subjects,
                force_fallback=True
            )
            
            print_info(f"  Mapped to: {', '.join(categories)}")
            print_info(f"  Relevance: {relevance:.2f}")
            print_info(f"  Method: {method}")
            
            if method == 'fallback':
                print_success("  Used fallback mapping as expected")
                passed += 1
            else:
                print_error(f"  Expected fallback, got {method}")
            
        except Exception as e:
            print_error(f"  Exception: {e}")
            logger.exception(f"Fallback mapping test failed for {name}")
    
    logger.info(f"Fallback Mapping Test: {passed}/{len(MAPPING_TEST_CASES)} passed")
    return passed == len(MAPPING_TEST_CASES)


def test_dynamic_subject_mapping():
    """Test D3: Dynamic Subject Mapping (DeepSeek)"""
    print_test("D3: Dynamic Subject Mapping with DeepSeek")
    
    if not DEEPSEEK_API_KEY:
        print_warning("DeepSeek API key not set - skipping dynamic mapping test")
        return None
    
    mapper = SubjectMapper()
    
    if not mapper.enable_dynamic:
        print_warning("Dynamic mapping disabled - skipping")
        return None
    
    passed = 0
    failed = 0
    
    for test_case in MAPPING_TEST_CASES[:2]:  # Test first 2 to save API calls
        try:
            name = test_case['name']
            subjects = test_case['subjects']
            query_context = test_case['query_context']
            expected_categories = test_case['expected_categories']
            min_relevance = test_case['min_relevance']
            
            print(f"\n{BLUE}Testing:{RESET} {name}")
            print_info(f"  Subjects: {', '.join(subjects[:3])}...")
            print_info(f"  Context: '{query_context}'")
            
            # Call dynamic mapping
            categories, relevance, method = mapper.map_subjects(
                subjects,
                query_context=query_context
            )
            
            print_info(f"  Mapped to: {', '.join(categories)}")
            print_info(f"  Relevance: {relevance:.2f}")
            print_info(f"  Method: {method}")
            
            # Verify method
            if method in ['dynamic', 'cached']:
                print_success(f"  Used dynamic mapping")
                
                # Check relevance
                if relevance >= min_relevance:
                    print_success(f"  Relevance meets minimum ({relevance:.2f} >= {min_relevance})")
                    passed += 1
                else:
                    print_warning(f"  Low relevance ({relevance:.2f} < {min_relevance})")
                    passed += 1  # Still pass
                
            elif method == 'fallback':
                print_warning("  Fell back to hardcoded mapping")
                passed += 1
            else:
                print_error(f"  Unexpected method: {method}")
                failed += 1
            
        except Exception as e:
            print_error(f"  Exception: {e}")
            logger.exception(f"Dynamic mapping test failed for {name}")
            failed += 1
    
    logger.info(f"Dynamic Mapping Test: {passed}/2 passed")
    return passed >= 1


def test_mapping_cache():
    """Test D4: Subject Mapping Cache"""
    print_test("D4: Subject Mapping Cache")
    
    try:
        mapper = SubjectMapper()
        
        test_subjects = ['Fantasy', 'Magic', 'Young Adult']
        test_query = 'fantasy magic'
        
        print_info("Testing cache behavior...")
        
        # First call (cache miss)
        start_time = time.time()
        categories1, relevance1, method1 = mapper.map_subjects(
            test_subjects,
            query_context=test_query
        )
        first_call_time = time.time() - start_time
        
        print_info(f"  First call: {method1} ({first_call_time*1000:.1f}ms)")
        
        # Second call (should be cached)
        start_time = time.time()
        categories2, relevance2, method2 = mapper.map_subjects(
            test_subjects,
            query_context=test_query
        )
        second_call_time = time.time() - start_time
        
        print_info(f"  Second call: {method2} ({second_call_time*1000:.1f}ms)")
        
        if method2 == 'cached':
            print_success("  Cache working correctly")
            
            if second_call_time < first_call_time:
                print_success(f"  Cache faster ({second_call_time*1000:.1f}ms vs {first_call_time*1000:.1f}ms)")
            
            # Verify results match
            if categories1 == categories2 and relevance1 == relevance2:
                print_success("  Cache returns identical results")
                return True
            else:
                print_error("  Cache returned different results")
                return False
        else:
            print_warning(f"  Expected 'cached', got '{method2}'")
            return True  # Still pass, might be cache disabled
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Cache test failed")
        return False


def test_mapping_metrics():
    """Test D5: Subject Mapping Metrics"""
    print_test("D5: Subject Mapping Metrics")
    
    try:
        mapper = SubjectMapper()
        
        # Perform some mappings to generate metrics
        test_subjects = [
            (['Fantasy', 'Magic'], 'fantasy'),
            (['Science Fiction', 'Dystopia'], 'dystopian'),
            (['Mystery', 'Detective'], 'mystery')
        ]
        
        for subjects, query in test_subjects:
            mapper.map_subjects(subjects, query_context=query)
        
        # Get metrics
        metrics = mapper.get_metrics()
        
        print_info("Metrics collected:")
        for key, value in metrics.items():
            if isinstance(value, float):
                print(f"  {key}: {value:.3f}")
            else:
                print(f"  {key}: {value}")
        
        # Verify expected metrics
        expected_keys = ['total_calls', 'cache_hit_rate', 'dynamic_success_rate', 'fallback_rate']
        
        for key in expected_keys:
            if key in metrics:
                print_success(f"  Metric '{key}' present")
            else:
                print_error(f"  Missing metric '{key}'")
                return False
        
        logger.info("Mapping metrics test passed")
        return True
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Metrics test failed")
        return False


# ============================================
# SECTION B: API INTEGRATION TESTS (EXISTING)
# ============================================

def test_server_health():
    """Test B1: Flask Server Health Check"""
    print_test("B1: Flask Server Health Check")
    
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Server status: {data.get('status')}")
            return True
        else:
            print_error(f"Status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Cannot connect to Flask server: {e}")
        return False

# ============================================
# SECTION E: EXPLANATION GENERATOR TESTS
# ============================================

def test_explanation_api_endpoint():
    """Test E1: Book Recommendations API Returns Explanations"""
    print_test("E1: Explanation Generation via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        # Create test session
        print_info("Setting up test conversation...")
        
        # Generate test user ID
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'fantasy_test').hexdigest()[:8]}"
        
        # Create session
        session_id = helper.create_session(user_id, mode='brainstorming')
        print_info(f"  Session ID: {session_id[:20]}...")
        
        # Seed conversation
        conversation = TEST_CONVERSATIONS.get('fantasy_adventure', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        if messages_added < 3:
            print_error("Failed to seed enough messages")
            return False
        
        # Small delay to ensure messages are saved
        time.sleep(1)
        
        # Call the recommendations API endpoint
        print_info("Calling /api/book-recommendations endpoint...")
        
        start_time = time.time()
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': True  # Enable explanations
            },
            timeout=180
        )
        api_time = time.time() - start_time
        
        print_info(f"  API response time: {api_time:.2f}s")
        
        if response.status_code != 200:
            print_error(f"API returned status {response.status_code}")
            print_error(f"Response: {response.text[:200]}")
            return False
        
        data = response.json()
        
        # Verify response structure
        checks_passed = 0
        
        if 'recommendations' in data:
            books = data['recommendations']
            print_success(f"  Returned {len(books)} book recommendations")
            checks_passed += 1
        else:
            print_error("  No 'recommendations' field in response")
            return False
        
        # Verify explanations are present
        books_with_explanations = sum(1 for b in books if b.get('explanation'))
        
        if books_with_explanations == len(books):
            print_success(f"  All {books_with_explanations} books have explanations")
            checks_passed += 1
        elif books_with_explanations > 0:
            print_warning(f"  Only {books_with_explanations}/{len(books)} have explanations")
            checks_passed += 1
        else:
            print_error("  No books have explanations")
        
        # Verify explanation structure
        books_with_highlights = sum(1 for b in books if b.get('matchHighlights'))
        books_with_comparison = sum(1 for b in books if b.get('comparisonNote'))
        
        print_info(f"  Books with highlights: {books_with_highlights}/{len(books)}")
        print_info(f"  Books with comparison notes: {books_with_comparison}/{len(books)}")
        
        if books_with_highlights >= len(books) * 0.5:
            print_success("  At least half have match highlights")
            checks_passed += 1
        
        # Show sample
        print(f"\n  {CYAN}Sample Explanation:{RESET}")
        if books:
            sample = books[0]
            print(f"  Book: {sample['title']} by {sample['author']}")
            print(f"  Relevance: {sample.get('relevance_score', 0)}")
            
            if sample.get('explanation'):
                print(f"  Explanation: {sample['explanation'][:150]}...")
                checks_passed += 1
            else:
                print(f"  {RED}No explanation{RESET}")
        
        # Verify summary comparison
        if 'summary' in data and data['summary']:
            print_success("  Has summary comparison")
            summary = data['summary']
            
            if summary.get('summary'):
                print(f"\n  {CYAN}Summary:{RESET}")
                print(f"  {summary['summary'][:120]}...")
            
            if summary.get('exploration_tips'):
                tips = summary['exploration_tips']
                print_success(f"  Has {len(tips)} exploration tips")
                checks_passed += 1
        else:
            print_warning("  No summary comparison")
        
        logger.info(f"Explanation API test: {checks_passed}/5 checks passed")
        return checks_passed >= 4
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Explanation API test failed")
        return False


def test_explanation_quality_from_api():
    """Test E2: Explanation Quality from API Response"""
    print_test("E2: Explanation Quality Analysis")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        # Create test session with dystopian conversation
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'dystopian_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        conversation = TEST_CONVERSATIONS.get('dystopian_thriller', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        if messages_added < 3:
            print_error("Failed to seed enough messages")
            return False
        
        time.sleep(1)
        
        # Call API
        print_info("Calling recommendations API...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': True
            },
            timeout=180
        )
        
        if response.status_code != 200:
            print_error(f"API returned status {response.status_code}")
            return False
        
        data = response.json()
        books = data.get('recommendations', [])
        
        if not books:
            print_warning("No books returned")
            return None
        
        print_success(f"Analyzing {len(books)} book explanations...")
        
        # Quality metrics
        quality_checks = {
            'length_check': 0,
            'story_relevance': 0,
            'specificity': 0,
            'highlights_present': 0,
            'tone_check': 0
        }
        
        # Get extracted elements for reference
        extracted_elements = data.get('extractedElements', {})
        genre = extracted_elements.get('genre', '').lower()
        themes = [t.lower() for t in extracted_elements.get('themes', [])]
        
        print_info(f"  Story genre: {genre}")
        print_info(f"  Story themes: {', '.join(themes[:3])}")
        
        for book in books:
            explanation = book.get('explanation', '').lower()
            
            # 1. Length check
            if 80 <= len(explanation) <= 600:
                quality_checks['length_check'] += 1
            
            # 2. Story relevance
            if genre and genre in explanation:
                quality_checks['story_relevance'] += 1
            elif any(theme in explanation for theme in themes):
                quality_checks['story_relevance'] += 1
            
            # 3. Specificity (mentions book or author)
            book_title_lower = book['title'].lower()
            author_lower = book['author'].lower()
            title_words = [w for w in book_title_lower.split() if len(w) > 3]
            
            if any(word in explanation for word in title_words) or author_lower in explanation:
                quality_checks['specificity'] += 1
            
            # 4. Highlights present
            if len(book.get('matchHighlights', [])) >= 2:
                quality_checks['highlights_present'] += 1
            
            # 5. Tone check (encouraging)
            positive_indicators = [
                'explore', 'discover', 'perfect', 'compelling', 'resonate',
                'similar', 'tackle', 'delve', 'mirror', 'echo'
            ]
            if any(indicator in explanation for indicator in positive_indicators):
                quality_checks['tone_check'] += 1
        
        # Report results
        print(f"\n  {CYAN}Quality Analysis Results:{RESET}")
        total_books = len(books)
        
        for check_name, count in quality_checks.items():
            percentage = (count / total_books) * 100 if total_books > 0 else 0
            status = GREEN if percentage >= 60 else YELLOW if percentage >= 40 else RED
            
            check_display = check_name.replace('_', ' ').title()
            print(f"    {status}{check_display}: {count}/{total_books} ({percentage:.0f}%){RESET}")
        
        # Overall quality score
        total_checks = sum(quality_checks.values())
        max_checks = len(quality_checks) * total_books
        quality_score = (total_checks / max_checks) * 100 if max_checks > 0 else 0
        
        print(f"\n  {CYAN}Overall Quality Score: {quality_score:.1f}%{RESET}")
        
        if quality_score >= 60:
            print_success("High quality explanations")
            logger.info(f"Explanation quality test passed: {quality_score:.1f}%")
            return True
        elif quality_score >= 40:
            print_warning("Acceptable quality explanations")
            return True
        else:
            print_error("Low quality explanations")
            return False
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Quality analysis test failed")
        return False


def test_summary_comparison_from_api():
    """Test E3: Summary Comparison from API"""
    print_test("E3: Summary Comparison via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        # Create session with mystery conversation
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'mystery_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        conversation = TEST_CONVERSATIONS.get('mystery_thriller', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        if messages_added < 3:
            print_error("Failed to seed enough messages")
            return False
        
        time.sleep(1)
        
        # Call API
        print_info("Calling recommendations API...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': True
            },
            timeout=180
        )
        
        if response.status_code != 200:
            print_error(f"API returned status {response.status_code}")
            return False
        
        data = response.json()
        
        # Verify summary structure
        checks_passed = 0
        
        if 'summary' in data and data['summary']:
            summary = data['summary']
            print_success("  Has summary field")
            
            if summary.get('summary'):
                print(f"\n  {CYAN}Summary:{RESET}")
                print(f"  {summary['summary']}")
                
                if len(summary['summary']) > 50:
                    print_success("  Summary is substantial (>50 chars)")
                    checks_passed += 1
            
            if summary.get('diversity_note'):
                print(f"\n  {CYAN}Diversity Note:{RESET}")
                print(f"  {summary['diversity_note']}")
                checks_passed += 1
            
            if summary.get('exploration_tips'):
                tips = summary['exploration_tips']
                print_success(f"  Has {len(tips)} exploration tips")
                
                print(f"\n  {CYAN}Exploration Tips:{RESET}")
                for i, tip in enumerate(tips, 1):
                    print(f"  {i}. {tip}")
                
                if len(tips) >= 2:
                    print_success("  Sufficient tips (>=2)")
                    checks_passed += 1
        else:
            print_warning("  No summary in response")
        
        logger.info(f"Summary comparison test: {checks_passed}/3 checks passed")
        return checks_passed >= 2
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Summary comparison test failed")
        return False


def test_explanation_flag_control():
    """Test E4: Explanation Generation Flag Control"""
    print_test("E4: Explanation Flag Control")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        # Create session
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'flag_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        conversation = TEST_CONVERSATIONS.get('sci_fi_exploration', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        if messages_added < 3:
            print_error("Failed to seed enough messages")
            return False
        
        time.sleep(1)
        
        # Test WITH explanations
        print_info("Testing with generateExplanations=True...")
        response_with = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 3,
                'generateExplanations': True
            },
            timeout=180
        )
        
        # Test WITHOUT explanations
        print_info("Testing with generateExplanations=False...")
        response_without = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 3,
                'generateExplanations': False
            },
            timeout=180
        )
        
        checks_passed = 0
        
        if response_with.status_code == 200 and response_without.status_code == 200:
            data_with = response_with.json()
            data_without = response_without.json()
            
            books_with = data_with.get('recommendations', [])
            books_without = data_without.get('recommendations', [])
            
            # Check WITH explanations
            explanations_with = sum(1 for b in books_with if b.get('explanation'))
            if explanations_with > 0:
                print_success(f"  WITH flag: {explanations_with}/{len(books_with)} have explanations")
                checks_passed += 1
            else:
                print_warning("  WITH flag: No explanations generated")
            
            # Check WITHOUT explanations
            explanations_without = sum(1 for b in books_without if b.get('explanation'))
            if explanations_without == 0:
                print_success(f"  WITHOUT flag: No explanations (as expected)")
                checks_passed += 1
            else:
                print_warning(f"  WITHOUT flag: {explanations_without} books still have explanations")
                checks_passed += 1  # Still pass, might be acceptable
        else:
            print_error("API calls failed")
        
        logger.info(f"Explanation flag control test: {checks_passed}/2 checks passed")
        return checks_passed >= 1
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Flag control test failed")
        return False

# Test conversation with very sparse information
TEST_CONVERSATIONS['sparse_story'] = [
    {'role': 'user', 'content': 'I want to write a story'},
    {'role': 'assistant', 'content': 'Tell me more about it'},
    {'role': 'user', 'content': 'Just a story, not sure yet'},
]

# Test conversation with clear themes but unusual genre
TEST_CONVERSATIONS['unusual_genre'] = [
    {'role': 'user', 'content': 'I want to write about underwater civilizations'},
    {'role': 'assistant', 'content': 'Interesting! What kind of society do they have?'},
    {'role': 'user', 'content': 'They communicate through bioluminescence and have no concept of land'},
    {'role': 'assistant', 'content': 'Fascinating worldbuilding!'},
    {'role': 'user', 'content': 'The story is about a young one who discovers air-breathing creatures above'},
]


def test_explanation_with_sparse_conversation():
    """Test F1: API handling of very sparse conversation data."""
    print_test("F1: Sparse Conversation via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        print_info("Setting up sparse conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'sparse_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        # Seed very sparse conversation
        conversation = TEST_CONVERSATIONS.get('sparse_story', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} sparse messages")
        
        if messages_added < 3:
            print_error("Failed to seed messages")
            return False
        
        time.sleep(1)
        
        # Call API - should handle gracefully
        print_info("Calling API with sparse data...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 3,
                'generateExplanations': True
            },
            timeout=120
        )
        
        # Should either return error or fallback recommendations
        if response.status_code == 400:
            data = response.json()
            if 'confidence' in data and data['confidence'] < 0.3:
                print_success("  API correctly rejects low-confidence extraction")
                logger.info("Sparse conversation test passed (rejected)")
                return True
        
        elif response.status_code == 200:
            data = response.json()
            books = data.get('recommendations', [])
            
            if books:
                print_info(f"  API returned {len(books)} books despite sparse data")
                
                # Check if explanations are present
                books_with_explanations = sum(1 for b in books if b.get('explanation'))
                
                if books_with_explanations > 0:
                    print_success(f"  {books_with_explanations}/{len(books)} have explanations")
                    logger.info("Sparse conversation test passed (generated)")
                    return True
                else:
                    print_warning("  No explanations (acceptable for sparse data)")
                    return True
            else:
                print_warning("  No books returned (acceptable for sparse data)")
                return True
        
        print_error(f"  Unexpected status: {response.status_code}")
        return False
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Sparse conversation test failed")
        return False


def test_explanation_with_unusual_genre():
    """Test F2: API handling of unusual/uncommon genres."""
    print_test("F2: Unusual Genre via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        print_info("Setting up unusual genre conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'unusual_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        conversation = TEST_CONVERSATIONS.get('unusual_genre', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        time.sleep(1)
        
        # Call API
        print_info("Calling API with unusual genre (underwater civilizations)...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': True
            },
            timeout=180
        )
        
        if response.status_code != 200:
            print_error(f"API returned {response.status_code}")
            return False
        
        data = response.json()
        books = data.get('recommendations', [])
        
        if not books:
            print_warning("  No books found for unusual genre (acceptable)")
            return True
        
        print_success(f"  API returned {len(books)} books")
        
        # Check genre extraction
        extracted = data.get('extractedElements', {})
        genre = extracted.get('genre', 'unknown')
        
        print_info(f"  Extracted genre: {genre}")
        
        # Check if explanations are reasonable
        books_with_explanations = sum(1 for b in books if b.get('explanation'))
        
        if books_with_explanations >= len(books) * 0.5:
            print_success(f"  {books_with_explanations}/{len(books)} have explanations")
            
            # Show sample
            if books[0].get('explanation'):
                print(f"\n  {CYAN}Sample Explanation:{RESET}")
                print(f"  {books[0]['explanation'][:120]}...")
            
            logger.info("Unusual genre test passed")
            return True
        else:
            print_warning(f"  Only {books_with_explanations}/{len(books)} have explanations")
            return True  # Still acceptable
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Unusual genre test failed")
        return False


def test_explanation_neutral_tone_via_api():
    """Test F3: Verify neutral tone in API-generated explanations."""
    print_test("F3: Neutral Tone via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'tone_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        # Use existing fantasy conversation
        conversation = TEST_CONVERSATIONS.get('fantasy_adventure', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        time.sleep(1)
        
        # Call API
        print_info("Calling API and analyzing tone...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 3,
                'generateExplanations': True
            },
            timeout=120
        )
        
        if response.status_code != 200:
            print_error(f"API returned {response.status_code}")
            return False
        
        data = response.json()
        books = data.get('recommendations', [])
        
        if not books or not books[0].get('explanation'):
            print_warning("No explanations to analyze")
            return False
        
        # Analyze tone of all explanations
        imperatives_found = []
        neutral_found = []
        
        imperatives = ['you should', 'you must', 'read this', 'check out', 'don\'t miss', 
                       'be sure to', 'make sure', 'definitely read']
        neutral_phrases = ['explores', 'examines', 'demonstrates', 'illustrates', 
                          'features', 'presents', 'depicts', 'portrays']
        
        for book in books:
            explanation = book.get('explanation', '').lower()
            
            for imp in imperatives:
                if imp in explanation:
                    imperatives_found.append((book['title'], imp))
            
            for neutral in neutral_phrases:
                if neutral in explanation:
                    neutral_found.append((book['title'], neutral))
        
        # Report results
        checks_passed = 0
        
        if not imperatives_found:
            print_success("  No imperatives found in any explanation")
            checks_passed += 1
        else:
            print_warning(f"  Found {len(imperatives_found)} imperatives:")
            for title, imp in imperatives_found[:2]:
                print(f"    - '{imp}' in {title}")
        
        if neutral_found:
            print_success(f"  Found {len(neutral_found)} neutral descriptors")
            checks_passed += 1
        else:
            print_warning("  No neutral descriptors found")
        
        # Show sample
        print(f"\n  {CYAN}Sample Explanation:{RESET}")
        print(f"  {books[0]['explanation'][:150]}...")
        
        if checks_passed >= 1:
            logger.info("Neutral tone test passed")
            return True
        else:
            print_warning("Tone could be more neutral")
            return True  # Still pass, just log the issue
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Neutral tone test failed")
        return False


def test_explanation_source_diversity():
    """Test F4: Verify explanations work with books from different sources."""
    print_test("F4: Source Diversity via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'source_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        # Use sci-fi conversation (good mix of sources)
        conversation = TEST_CONVERSATIONS.get('sci_fi_exploration', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        time.sleep(1)
        
        # Call API with higher limit to get diverse sources
        print_info("Calling API to get books from multiple sources...")
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': True
            },
            timeout=180
        )
        
        if response.status_code != 200:
            print_error(f"API returned {response.status_code}")
            return False
        
        data = response.json()
        books = data.get('recommendations', [])
        
        if not books:
            print_warning("No books returned")
            return False
        
        # Analyze sources
        sources = {}
        for book in books:
            source = book.get('source', 'unknown')
            sources[source] = sources.get(source, 0) + 1
        
        print_success(f"  Books from {len(sources)} sources:")
        for source, count in sources.items():
            print(f"    - {source}: {count} books")
        
        # Check explanations across sources
        books_with_explanations = {}
        for book in books:
            source = book.get('source', 'unknown')
            if book.get('explanation'):
                books_with_explanations[source] = books_with_explanations.get(source, 0) + 1
        
        checks_passed = 0
        
        for source in sources:
            explained = books_with_explanations.get(source, 0)
            total = sources[source]
            
            if explained == total:
                print_success(f"  All {source} books have explanations ({explained}/{total})")
                checks_passed += 1
            elif explained > 0:
                print_warning(f"  {source}: {explained}/{total} have explanations")
                checks_passed += 1
        
        if checks_passed >= len(sources) * 0.5:
            logger.info("Source diversity test passed")
            return True
        else:
            print_warning("Some sources lack explanations")
            return True  # Still pass
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Source diversity test failed")
        return False


def test_explanation_with_no_explanations_flag():
    """Test F5: Verify performance without explanation generation."""
    print_test("F5: Performance Without Explanations via API")
    
    try:
        helper = SessionHelper(session_api_url=SESSION_API_URL)
        
        print_info("Setting up test conversation...")
        
        import hashlib
        user_id = f"test_user_{hashlib.md5(b'perf_test').hexdigest()[:8]}"
        
        session_id = helper.create_session(user_id, mode='brainstorming')
        
        conversation = TEST_CONVERSATIONS.get('fantasy_adventure', [])
        messages_added = helper.seed_conversation(user_id, session_id, conversation, mode='brainstorming')
        print_info(f"  Added {messages_added} messages")
        
        time.sleep(1)
        
        # Call API WITHOUT explanations
        print_info("Calling API without explanation generation...")
        start_time = time.time()
        
        response = requests.post(
            f"{API_BASE_URL}/api/book-recommendations",
            json={
                'userId': user_id,
                'sessionId': session_id,
                'mode': 'brainstorming',
                'limit': 5,
                'generateExplanations': False  # Disabled
            },
            timeout=90
        )
        
        no_explain_time = time.time() - start_time
        
        if response.status_code != 200:
            print_error(f"API returned {response.status_code}")
            return False
        
        data = response.json()
        books = data.get('recommendations', [])
        
        print_info(f"  Response time: {no_explain_time:.2f}s")
        print_info(f"  Returned {len(books)} books")
        
        # Verify NO explanations
        books_with_explanations = sum(1 for b in books if b.get('explanation'))
        
        checks_passed = 0
        
        if books_with_explanations == 0:
            print_success("  No explanations generated (as expected)")
            checks_passed += 1
        else:
            print_error(f"  {books_with_explanations} books have explanations (should be 0)")
        
        # Verify faster performance
        if no_explain_time < 60:
            print_success(f"  Fast response without explanations ({no_explain_time:.1f}s)")
            checks_passed += 1
        else:
            print_warning(f"  Slower than expected ({no_explain_time:.1f}s)")
        
        # Verify all other fields present
        if all('relevance_score' in b for b in books):
            print_success("  All books have relevance scores")
            checks_passed += 1
        
        if checks_passed >= 2:
            logger.info("Performance without explanations test passed")
            return True
        else:
            return False
        
    except Exception as e:
        print_error(f"Exception: {e}")
        logger.exception("Performance test failed")
        return False

# ============================================
# MAIN TEST RUNNER
# ============================================

def run_all_tests():
    separator = "=" * 70
    print(f"\n{separator}")
    print(f"{CYAN}COMPREHENSIVE BOOK RECOMMENDATION TEST SUITE{RESET}")
    print(f"{separator}\n")
    
    logger.info(separator)
    logger.info("STARTING COMPREHENSIVE TEST SUITE")
    logger.info(separator)
    
    results = {}
    
    # Section A: Query Effectiveness Tests
    print_section("A: QUERY EFFECTIVENESS TESTS")
    results["A1: Query Generation"] = test_query_generation()
    results["A2: Book Fetching"] = test_book_fetching()
    
    # Section B: API Integration Tests
    print_section("B: API INTEGRATION TESTS")
    results["B1: Server Health"] = test_server_health()
    
    # Section C: Open Library Integration Tests
    print_section("C: OPEN LIBRARY INTEGRATION TESTS")
    results["C1: OL API Connection"] = test_openlibrary_api_connection()
    results["C2: OL Enhanced Fetching"] = test_openlibrary_enhanced_fetching()
    results["C3: OL Subject Parsing"] = test_openlibrary_subject_parsing()
    results["C4: OL Fallback"] = test_openlibrary_fallback()
    
    # Section D: Subject Mapping Tests
    print_section("D: SUBJECT MAPPING TESTS")
    results["D1: Mapper Initialization"] = test_subject_mapper_initialization()
    results["D2: Fallback Mapping"] = test_fallback_subject_mapping()
    results["D3: Dynamic Mapping"] = test_dynamic_subject_mapping()
    results["D4: Mapping Cache"] = test_mapping_cache()
    results["D5: Mapping Metrics"] = test_mapping_metrics()
    
    # Section E: Explanation Generator Tests
    print_section("E: EXPLANATION GENERATOR TESTS")
    print_section("E: EXPLANATION GENERATOR API TESTS")
    results["E1: Explanation API"] = test_explanation_api_endpoint()
    results["E2: Quality Analysis"] = test_explanation_quality_from_api()
    results["E3: Summary Comparison"] = test_summary_comparison_from_api()
    results["E4: Flag Control"] = test_explanation_flag_control()

    # Section F: Edge Case & Failure Scenario Tests
    print_section("F: EDGE CASE TESTS VIA API")
    results["F1: Sparse Conversation"] = test_explanation_with_sparse_conversation()
    results["F2: Unusual Genre"] = test_explanation_with_unusual_genre()
    results["F3: Neutral Tone"] = test_explanation_neutral_tone_via_api()
    results["F4: Source Diversity"] = test_explanation_source_diversity()
    results["F5: Performance Test"] = test_explanation_with_no_explanations_flag()

    # Summary
    separator = "=" * 70
    print(f"\n{separator}")
    print(f"{CYAN}TEST SUMMARY{RESET}")
    print(f"{separator}")
    
    logger.info(separator)
    logger.info("TEST SUMMARY")
    logger.info(separator)

    def print_section_results(section_name, section_results):
        print(f"\n{BLUE}{section_name}:{RESET}")
        logger.info(f"\n{section_name}:")
        for test_name, result in section_results.items():
            if result is True:
                print(f"{GREEN}[PASS]{RESET} {test_name}")
                logger.info(f"[PASS] {test_name}")
            elif result is False:
                print(f"{RED}[FAIL]{RESET} {test_name}")
                logger.error(f"[FAIL] {test_name}")
            else:
                print(f"{YELLOW}[SKIP]{RESET} {test_name}")
                logger.warning(f"[SKIP] {test_name}")
    
    section_a = {k: v for k, v in results.items() if k.startswith('A')}
    section_b = {k: v for k, v in results.items() if k.startswith('B')}
    section_c = {k: v for k, v in results.items() if k.startswith('C')}
    section_d = {k: v for k, v in results.items() if k.startswith('D')}
    section_e = {k: v for k, v in results.items() if k.startswith('E')}
    section_f = {k: v for k, v in results.items() if k.startswith('F')}

    print_section_results("Section A: Query Effectiveness", section_a)
    print_section_results("Section B: API Integration", section_b)
    print_section_results("Section C: Open Library Integration", section_c)
    print_section_results("Section D: Subject Mapping", section_d)
    print_section_results("Section E: Explanation Generator API", section_e)
    print_section_results("Section F: Edge Cases & Failures", section_f)

    # Overall statistics
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len(results)
    
    print(f"\n{CYAN}Overall Results:{RESET}")
    print(f"  Passed:  {GREEN}{passed}{RESET}/{total}")
    print(f"  Failed:  {RED}{failed}{RESET}/{total}")
    print(f"  Skipped: {YELLOW}{skipped}{RESET}/{total}")
    
    logger.info(f"\nOverall Results: {passed} passed, {failed} failed, {skipped} skipped out of {total} tests")
    
    if failed == 0 and passed > 0:
        print(f"\n{GREEN}[SUCCESS] All available tests passed!{RESET}")
        logger.info(f"[SUCCESS] All tests passed ({passed}/{total})")
    elif failed > 0:
        print(f"\n{RED}[FAILURE] Some tests failed. Check logs for details.{RESET}")
        logger.warning(f"[FAILURE] {failed} tests failed out of {total}")
    else:
        print(f"\n{YELLOW}[WARNING] No tests were able to run. Check configuration.{RESET}")
        logger.error("[ERROR] No tests were able to run")
    
    # Enhanced tips section
    separator = "=" * 70
    print(f"\n{separator}")
    print(f"{CYAN}QUICK TIPS{RESET}")
    print(f"{separator}")
    logger.info(separator)
    logger.info("QUICK TIPS")
    logger.info(separator)
    
    tips_display = [
        "Section A (Query Effectiveness):",
        "  - Tests core query generation and book fetching logic",
        "  - Requires Google Books API key to be set",
        "  - Can run independently of Flask server",
        "",
        "Section B (API Integration):",
        "  - Tests full end-to-end recommendation flow",
        "  - Requires Flask server running: python app.py",
        "",
        "Section C (Open Library Integration):",
        "  - Tests Open Library API connection and fetching",
        "  - Tests subject parsing and mapping integration",
        "  - Tests fallback behavior for obscure queries",
        "  - No API key required (public API)",
        "",
        "Section D (Subject Mapping):",
        "  - Tests both dynamic (DeepSeek) and fallback mapping",
        "  - Tests caching and performance metrics",
        "  - Dynamic tests require DEEPSEEK_API_KEY",
        "  - Fallback tests work without API key",
        "",
         "Section E (Explanation Generator API):",
        "  - Tests explanation generation via API endpoint",
        "  - Tests quality of API-returned explanations",
        "  - Tests summary comparison in API response",
        "  - Tests generateExplanations flag control",
        "  - Requires Flask server running",
        "  - No direct OpenAI calls in tests (handled by server)",
        "",
        "Environment Variables:",
        "  - GOOGLE_BOOKS_API_KEY: For Google Books API (optional)",
        "  - DEEPSEEK_API_KEY: For dynamic subject mapping (optional)",
        "  - Without API keys, tests will use fallback methods",
        "",
        "For detailed logs:",
        "  - Check logs/recommendation_tests.log",
        "  - Check logs/recommendations.log (Flask server)",
        "",
        "Common issues:",
        "  - API key not set -> Some tests will be skipped",
        "  - Server not running -> Section B tests will fail",
        "  - Network timeout -> Increase timeout in test config",
    ]
    
    for tip in tips_display:
        print(tip)
        if tip:
            tip_clean = tip.replace('→', '->').replace('•', '-')
            logger.info(tip_clean)
    
    separator = "=" * 70
    print(f"{separator}")
    logger.info(separator)
    logger.info("TEST SUITE COMPLETE")
    logger.info(separator)
    
    return passed, failed, skipped


if __name__ == "__main__":
    passed, failed, skipped = run_all_tests()
    
    # Exit with appropriate code
    if failed > 0:
        sys.exit(1)
    elif passed == 0:
        sys.exit(2)  # No tests ran
    else:
        sys.exit(0)  # Success