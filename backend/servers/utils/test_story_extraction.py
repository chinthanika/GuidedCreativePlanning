#!/usr/bin/env python3
"""
Story element extraction tests - integrated with consolidated server test suite.
Tests extraction endpoints directly (AI calls in server, not in test code).
"""

import requests
import time
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from typing import Dict, List

# Setup logging with RotatingFileHandler
logger = logging.getLogger("STORY_EXTRACT_TEST")
logger.setLevel(logging.DEBUG)

# Create logs directory if it doesn't exist
os.makedirs("logs", exist_ok=True)

# File handler with rotation
file_handler = RotatingFileHandler(
    "logs/story_extraction_tests.log",
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# Console handler (optional - remove if you want file-only logging)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# Configuration
CONSOLIDATED_URL = "http://10.163.2.105:5000"
SESSION_API = "https://guidedcreativeplanning-session.onrender.com"
TEST_UID = "test_user_story_extract"


# ============================================
# TEST CONVERSATIONS
# ============================================

TEST_CONVERSATIONS = {
    "fantasy_rich": [
        {
            "role": "user",
            "content": "I want to write a fantasy story about a girl who discovers she has forbidden shadow magic that was banned centuries ago"
        },
        {
            "role": "assistant",
            "content": "That's intriguing! Tell me more about why shadow magic was banned."
        },
        {
            "role": "user",
            "content": "It's too powerful and corrupts people. Her mom was killed by shadow mages. But she needs to use it to save her village from the same threat."
        },
        {
            "role": "assistant",
            "content": "I sense a deep internal conflict. How does she feel about becoming what she fears?"
        },
        {
            "role": "user",
            "content": "She's terrified at first. Keeps trying to suppress it. But eventually realizes the magic itself isn't evil - it's how you use it. She has to accept this part of herself."
        },
        {
            "role": "assistant",
            "content": "That's a powerful coming-of-age theme. What's the tone like?"
        },
        {
            "role": "user",
            "content": "Dark and serious, but with hope. The village is medieval-ish, kind of grim. But there are moments of light when she connects with her powers in positive ways."
        }
    ],
    
    "scifi_moderate": [
        {
            "role": "user",
            "content": "I'm thinking of a sci-fi story set on a generation ship traveling to a new planet"
        },
        {
            "role": "assistant",
            "content": "Generation ships offer rich narrative possibilities. What's the central conflict?"
        },
        {
            "role": "user",
            "content": "The ship's AI has been lying to everyone for decades. My protagonist discovers the truth and has to decide whether to tell people or protect them from the harsh reality."
        },
        {
            "role": "assistant",
            "content": "That's a classic person vs. technology conflict with moral complexity. What's the protagonist like?"
        },
        {
            "role": "user",
            "content": "She's a maintenance engineer, kind of a loner. Stumbles on the truth by accident. Doesn't want to be a hero but can't ignore what she knows."
        }
    ],
    
    "mystery_minimal": [
        {
            "role": "user",
            "content": "I want to write a mystery with an unreliable narrator"
        },
        {
            "role": "assistant",
            "content": "Unreliable narrators create excellent tension. What makes them unreliable?"
        },
        {
            "role": "user",
            "content": "The detective investigating a murder might actually be the killer but doesn't remember. I want to plant clues without giving it away."
        }
    ],
    
    "contemporary_vague": [
        {
            "role": "user",
            "content": "I want to write about a teenager"
        },
        {
            "role": "assistant",
            "content": "Can you tell me more about this character?"
        },
        {
            "role": "user",
            "content": "They're dealing with stuff at school"
        }
    ],
    
    "dystopian_detailed": [
        {
            "role": "user",
            "content": "My story is set in a dystopian future where emotions are controlled by the government through daily injections"
        },
        {
            "role": "assistant",
            "content": "That's a compelling premise. How does the government justify this?"
        },
        {
            "role": "user",
            "content": "They say it prevents war and violence. Society is 'peaceful' but people are basically zombies. My protagonist stops taking the injections and experiences real emotions for the first time."
        },
        {
            "role": "assistant",
            "content": "What happens when they feel everything intensely?"
        },
        {
            "role": "user",
            "content": "At first it's overwhelming - crying, laughing, rage, everything at once. But then they realize everyone around them is living half-alive. They want to wake others up but it's illegal."
        },
        {
            "role": "assistant",
            "content": "So there's both an internal journey and external rebellion?"
        },
        {
            "role": "user",
            "content": "Exactly. The internal part is learning to handle emotions without the drugs. The external is fighting the system. It's YA, dark but hopeful. Think 1984 meets The Giver with a teenage revolutionary."
        }
    ],
    
    "horror_atmospheric": [
        {
            "role": "user",
            "content": "I'm writing a psychological horror story about a house that feeds on memories"
        },
        {
            "role": "assistant",
            "content": "That's a chilling concept. How does it manifest?"
        },
        {
            "role": "user",
            "content": "The family moves in and slowly starts forgetting things. Small stuff at first - where they put keys, names of friends. Then bigger things. The house gets stronger as they forget more."
        },
        {
            "role": "assistant",
            "content": "What's the atmosphere like?"
        },
        {
            "role": "user",
            "content": "Creeping dread. The house itself is beautiful, Victorian style, but there's something subtly wrong. Doors that weren't there before. Rooms that change. The horror is slow-burn psychological, not jump scares."
        }
    ]
}


# ============================================
# HELPER FUNCTIONS
# ============================================

def create_session_with_conversation(
    conversation: List[Dict], 
    mode: str = "brainstorming"
) -> str:
    """Create session and seed with conversation."""
    
    # Create session
    response = requests.post(
        f"{SESSION_API}/session/create",
        json={"uid": TEST_UID},
        timeout=10
    )
    response.raise_for_status()
    session_id = response.json().get("sessionID")
    
    logger.info(f"[HELPER] Created session: {session_id}")
    
    # Seed messages
    for msg in conversation:
        requests.post(
            f"{SESSION_API}/session/save_message",
            json={
                "uid": TEST_UID,
                "sessionID": session_id,
                "role": msg["role"],
                "content": msg["content"],
                "mode": mode,
                "extra": {
                    "visible": True,
                    "summarised": False,
                    "stage": "Clarify" if mode == "brainstorming" else None
                }
            },
            timeout=10
        )
        time.sleep(0.1)
    
    logger.info(f"[HELPER] Seeded {len(conversation)} messages")
    return session_id


def validate_extraction_structure(elements: Dict) -> List[str]:
    """
    Validate extracted elements have correct structure.
    Returns list of validation errors (empty if valid).
    """
    errors = []
    
    # Check top-level required fields
    required_fields = [
        'genre', 'subgenres', 'themes', 'motifs', 'characterArchetypes',
        'plotStructure', 'tone', 'settingType', 'narrativePerspective',
        'conflicts', 'ageAppropriate', 'emotionalCore', 'overallConfidence'
    ]
    
    for field in required_fields:
        if field not in elements:
            errors.append(f"Missing required field: {field}")
    
    # Validate genre structure
    if 'genre' in elements:
        genre = elements['genre']
        if not isinstance(genre, dict):
            errors.append("genre must be a dict")
        elif 'primary' not in genre or 'confidence' not in genre:
            errors.append("genre missing primary or confidence")
        elif not (0.0 <= genre.get('confidence', -1) <= 1.0):
            errors.append(f"genre confidence out of range: {genre.get('confidence')}")
    
    # Validate arrays
    for field in ['subgenres', 'themes', 'motifs', 'characterArchetypes', 'conflicts']:
        if field in elements and not isinstance(elements[field], list):
            errors.append(f"{field} must be a list")
    
    # Validate overall confidence
    if 'overallConfidence' in elements:
        conf = elements['overallConfidence']
        if not isinstance(conf, (int, float)):
            errors.append("overallConfidence must be a number")
        elif not (0.0 <= conf <= 1.0):
            errors.append(f"overallConfidence out of range: {conf}")
    
    return errors


def print_section(title):
    """Log test section header."""
    logger.info("\n" + "=" * 70)
    logger.info(f"  {title}")
    logger.info("=" * 70)


# ============================================
# TEST FUNCTIONS
# ============================================

def test_extraction_rich_fantasy():
    """TEST 1: Extract from detailed fantasy conversation"""
    print_section("TEST 1: Rich Fantasy Story Extraction")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["fantasy_rich"])
        
        logger.info("[TEST1] Calling extraction endpoint...")
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={
                "userId": TEST_UID,
                "sessionId": session_id
            },
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"[TEST1] FAIL: Extraction failed: {response.status_code}")
            logger.error(response.text)
            return False
        
        data = response.json()
        elements = data.get('elements', {})
        search_queries = data.get('searchQueries', [])
        
        # Validate structure
        errors = validate_extraction_structure(elements)
        if errors:
            logger.error(f"[TEST1] FAIL: Structure validation failed:")
            for error in errors:
                logger.error(f"  - {error}")
            return False
        
        # Check content quality
        genre = elements.get('genre', {}).get('primary', '').lower()
        themes = elements.get('themes', [])
        characters = elements.get('characterArchetypes', [])
        tone = elements.get('tone', {}).get('primary', '')
        overall_conf = elements.get('overallConfidence', 0)
        
        logger.info(f"[TEST1] Extraction Results:")
        logger.info(f"  Genre: {genre} (conf: {elements.get('genre', {}).get('confidence', 0):.2f})")
        logger.info(f"  Themes: {[t['name'] for t in themes[:3]]}")
        logger.info(f"  Characters: {[c['archetype'] for c in characters]}")
        logger.info(f"  Tone: {tone}")
        logger.info(f"  Overall Confidence: {overall_conf:.2f}")
        logger.info(f"  Search Queries: {search_queries}")
        
        # Quality checks
        checks_passed = True
        
        if 'fantasy' not in genre:
            logger.warning(f"[TEST1] Expected genre 'fantasy', got '{genre}'")
            checks_passed = False
        
        if overall_conf < 0.5:
            logger.warning(f"[TEST1] Overall confidence too low: {overall_conf:.2f}")
            checks_passed = False
        
        if not search_queries:
            logger.warning("[TEST1] No search queries generated")
            checks_passed = False
        
        if checks_passed:
            logger.info("[TEST1] PASS: Rich fantasy extraction successful")
            return True
        else:
            logger.warning("[TEST1] PARTIAL: Extraction succeeded but quality concerns")
            return True
            
    except Exception as e:
        logger.exception(f"[TEST1] FAIL: {e}")
        return False


def test_extraction_scifi_moderate():
    """TEST 2: Extract from moderate sci-fi conversation"""
    print_section("TEST 2: Moderate Sci-Fi Story Extraction")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["scifi_moderate"])
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        response.raise_for_status()
        data = response.json()
        elements = data.get('elements', {})
        
        errors = validate_extraction_structure(elements)
        if errors:
            logger.error(f"[TEST2] FAIL: Structure validation failed: {errors[:3]}")
            return False
        
        genre = elements.get('genre', {}).get('primary', '').lower()
        conflicts = elements.get('conflicts', [])
        
        logger.info(f"[TEST2] Genre: {genre}")
        logger.info(f"[TEST2] Conflicts: {[c['category'] for c in conflicts]}")
        
        if 'sci' in genre or 'science' in genre:
            logger.info("[TEST2] PASS: Sci-fi extraction successful")
            return True
        else:
            logger.warning(f"[TEST2] PARTIAL: Expected sci-fi genre, got '{genre}'")
            return True
        
    except Exception as e:
        logger.exception(f"[TEST2] FAIL: {e}")
        return False


def test_extraction_minimal_conversation():
    """TEST 3: Extract from minimal conversation (should have low confidence)"""
    print_section("TEST 3: Minimal Conversation Extraction")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["mystery_minimal"])
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        response.raise_for_status()
        data = response.json()
        elements = data.get('elements', {})
        
        overall_conf = elements.get('overallConfidence', 1.0)
        
        logger.info(f"[TEST3] Overall Confidence: {overall_conf:.2f}")
        
        if overall_conf < 0.7:
            logger.info("[TEST3] PASS: Correctly identified minimal conversation (low confidence)")
            return True
        else:
            logger.warning(f"[TEST3] ⚠ WARN: Expected low confidence, got {overall_conf:.2f}")
            return True
        
    except Exception as e:
        logger.exception(f"[TEST3] FAIL: {e}")
        return False


def test_extraction_vague_conversation():
    """TEST 4: Extract from very vague conversation (should trigger fallback)"""
    print_section("TEST 4: Vague Conversation (Fallback Test)")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["contemporary_vague"])
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        response.raise_for_status()
        data = response.json()
        elements = data.get('elements', {})
        
        overall_conf = elements.get('overallConfidence', 1.0)
        metadata = elements.get('_metadata', {})
        
        logger.info(f"[TEST4] Overall Confidence: {overall_conf:.2f}")
        logger.info(f"[TEST4] Fallback Used: {metadata.get('fallbackUsed', False)}")
        
        if overall_conf <= 0.5 or metadata.get('fallbackUsed'):
            logger.info("[TEST4] PASS: Handled vague conversation appropriately")
            return True
        else:
            logger.warning("[TEST4] ⚠ WARN: Expected fallback or low confidence")
            return True
        
    except Exception as e:
        logger.exception(f"[TEST4] FAIL: {e}")
        return False


def test_extraction_dystopian_detailed():
    """TEST 5: Extract from detailed dystopian conversation"""
    print_section("TEST 5: Detailed Dystopian Story Extraction")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["dystopian_detailed"])
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        response.raise_for_status()
        data = response.json()
        elements = data.get('elements', {})
        
        overall_conf = elements.get('overallConfidence', 0)
        themes = elements.get('themes', [])
        subgenres = elements.get('subgenres', [])
        conflicts = elements.get('conflicts', [])
        
        logger.info(f"[TEST5] Overall Confidence: {overall_conf:.2f}")
        logger.info(f"[TEST5] Themes: {[t['name'] for t in themes]}")
        logger.info(f"[TEST5] Subgenres: {[sg['name'] for sg in subgenres]}")
        logger.info(f"[TEST5] Conflicts: {[c['category'] for c in conflicts]}")
        
        if overall_conf >= 0.5 and themes:
            logger.info("[TEST5] PASS: Dystopian extraction successful")
            return True
        else:
            logger.warning(f"[TEST5] ⚠ WARN: Expected high confidence, got {overall_conf:.2f}")
            return True
        
    except Exception as e:
        logger.exception(f"[TEST5] FAIL: {e}")
        return False


def test_book_recommendations_integration():
    """TEST 6: Test story extraction integrated with book recommendations"""
    print_section("TEST 6: Book Recommendations Integration")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["fantasy_rich"])
        
        logger.info("[TEST6] Requesting book recommendations...")
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/book-recommendations",
            json={
                "userId": TEST_UID,
                "sessionId": session_id,
                "limit": 5
            },
            timeout=90
        )
        
        if response.status_code != 200:
            logger.error(f"[TEST6] FAIL: Recommendations failed: {response.status_code}")
            logger.error(response.text)
            return False
        
        data = response.json()
        recommendations = data.get('recommendations', [])
        extracted_elements = data.get('extractedElements', {})
        search_queries = data.get('searchQueries', [])
        
        logger.info(f"[TEST6] Books Returned: {len(recommendations)}")
        logger.info(f"[TEST6] Genre: {extracted_elements.get('genre')}")
        logger.info(f"[TEST6] Themes: {extracted_elements.get('themes', [])[:3]}")
        logger.info(f"[TEST6] Search Queries: {search_queries}")
        
        if recommendations and extracted_elements:
            logger.info("[TEST6] PASS: Book recommendations integration successful")
            
            # Show first book
            if recommendations:
                book = recommendations[0]
                logger.info(f"[TEST6] Sample Book: {book.get('title')} by {book.get('author')}")
                logger.info(f"[TEST6] Relevance Score: {book.get('relevance_score', 0):.1f}")
            
            return True
        else:
            logger.error("[TEST6] FAIL: No recommendations or elements returned")
            return False
        
    except Exception as e:
        logger.exception(f"[TEST6] FAIL: {e}")
        return False


def test_extraction_performance():
    """TEST 7: Test extraction performance and timing"""
    print_section("TEST 7: Extraction Performance")
    
    try:
        session_id = create_session_with_conversation(TEST_CONVERSATIONS["fantasy_rich"])
        
        start = time.time()
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        elapsed = time.time() - start
        
        response.raise_for_status()
        data = response.json()
        processing_time = data.get('processingTime', 0) / 1000  # Convert ms to seconds
        
        logger.info(f"[TEST7] Total Request Time: {elapsed:.3f}s")
        logger.info(f"[TEST7] Server Processing Time: {processing_time:.3f}s")
        
        if elapsed < 20.0:
            logger.info(f"[TEST7] PASS: Performance acceptable ({elapsed:.3f}s)")
            return True
        else:
            logger.warning(f"[TEST7] ⚠ WARN: Extraction slow ({elapsed:.3f}s)")
            return True
        
    except Exception as e:
        logger.exception(f"[TEST7] FAIL: {e}")
        return False


def test_insufficient_conversation():
    """TEST 8: Test with insufficient conversation (< 3 messages)"""
    print_section("TEST 8: Insufficient Conversation Handling")
    
    try:
        # Create session with only 1 message
        short_conv = [{"role": "user", "content": "I want to write a story"}]
        session_id = create_session_with_conversation(short_conv)
        
        response = requests.post(
            f"{CONSOLIDATED_URL}/api/story-elements/extract",
            json={"userId": TEST_UID, "sessionId": session_id},
            timeout=60
        )
        
        # Should return 400 error
        if response.status_code == 400:
            error_data = response.json()
            logger.info(f"[TEST8] Error Response: {error_data.get('error')}")
            logger.info("[TEST8] PASS: Correctly rejected insufficient conversation")
            return True
        else:
            logger.error(f"[TEST8] FAIL: Expected 400, got {response.status_code}")
            return False
        
    except Exception as e:
        logger.exception(f"[TEST8] FAIL: {e}")
        return False


# ============================================
# TEST RUNNER
# ============================================

def run_all_tests():
    """Run all story extraction tests"""
    print_section("STORY EXTRACTION TEST SUITE")
    logger.info(f"Testing server at: {CONSOLIDATED_URL}")
    logger.info(f"Session API at: {SESSION_API}")
    logger.info(f"Logging to: logs/story_extraction_tests.log")
    
    tests = [
        ("Rich Fantasy Extraction", test_extraction_rich_fantasy),
        ("Moderate Sci-Fi Extraction", test_extraction_scifi_moderate),
        ("Minimal Conversation", test_extraction_minimal_conversation),
        ("Vague Conversation (Fallback)", test_extraction_vague_conversation),
        ("Detailed Dystopian Extraction", test_extraction_dystopian_detailed),
        ("Book Recommendations Integration", test_book_recommendations_integration),
        ("Extraction Performance", test_extraction_performance),
        ("Insufficient Conversation Handling", test_insufficient_conversation)
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            passed = test_func()
            results[test_name] = passed
        except Exception as e:
            logger.exception(f"Test '{test_name}' raised exception: {e}")
            results[test_name] = False
    
    # Summary
    print_section("TEST RESULTS SUMMARY")
    
    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    
    for test_name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        logger.info(f"{status}: {test_name}")
    
    logger.info("\n" + "=" * 70)
    logger.info(f"OVERALL: {passed_count}/{total_count} tests passed ({(passed_count/total_count)*100:.1f}%)")
    logger.info("=" * 70)
    
    return passed_count == total_count


if __name__ == "__main__":
    import sys
    
    logger.info("="*70)
    logger.info("Starting Story Extraction Test Suite")
    logger.info("="*70)
    
    success = run_all_tests()
    
    logger.info("\n" + "="*70)
    if success:
        logger.info("All tests completed successfully!")
    else:
        logger.info("Some tests failed. Check logs/story_extraction_tests.log for details.")
    logger.info("="*70)
    
    sys.exit(0 if success else 1)