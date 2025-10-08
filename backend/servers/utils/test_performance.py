#!/usr/bin/env python3
"""
Cache Performance Testing Script
Run this to validate Tuesday's caching improvements before moving to Wednesday.
"""

import requests
import time
import json

BASE_URL_DT = "http://10.163.10.109:5003"  # DT chat
BASE_URL_BS = "http://10.163.10.109:5002"  # BS chat
SESSION_API = "http://localhost:4000"

# Test user ID (use a real one from your Firebase)
TEST_UID = "04E9XYnVi8QD3yHAIXeBHCRp2sN2"

def print_section(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def pretty_json(data):
    print(json.dumps(data, indent=2))

def print_cache_report(label="Post-Test Cache Snapshot"):
    """Print cache stats for both DT and BS servers."""
    print("\n" + "-"*60)
    print(f"  {label}")
    print("-"*60)
    for cache_label, base_url in [("DT", BASE_URL_DT), ("BS", BASE_URL_BS)]:
        try:
            resp = requests.get(f"{base_url}/debug/cache-stats")
            resp.raise_for_status()
            print(f"✓ {cache_label} Cache Stats:")
            pretty_json(resp.json())
        except Exception as e:
            print(f"✗ Failed to fetch {cache_label} cache stats: {e}")
    print("-"*60)

def test_cache_stats():
    print_section("TEST 1: Cache Stats Endpoint")
    try:
        for label, base_url in [("DT", BASE_URL_DT), ("BS", BASE_URL_BS)]:
            resp = requests.get(f"{base_url}/debug/cache-stats")
            resp.raise_for_status()
            print(f"✓ {label} Cache Stats:")
            pretty_json(resp.json())
            print()
        return True
    except Exception as e:
        print(f"✗ Cache stats endpoint failed: {e}")
        return False

# ──────────────────────────────
# TEST 2: Repeated Metadata Calls (Cache Hit Rate)
# ──────────────────────────────

def test_repeated_metadata_calls():
    print_section("TEST 2: Repeated Metadata Calls (Cache Hit Rate)")

    try:
        # Create session
        resp = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID})
        resp.raise_for_status()
        session_id = resp.json().get("sessionID")
        print(f"✓ Created test session: {session_id}")
    except Exception as e:
        print(f"✗ Failed to create session: {e}")
        return False

    # Warm up cache
    try:
        print("  Warming cache with first metadata call...")
        requests.post(f"{SESSION_API}/session/get_metadata", json={
            "uid": TEST_UID,
            "sessionID": session_id
        })
        time.sleep(0.5)
    except Exception as e:
        print(f"✗ Warm-up call failed: {e}")
        return False

    # Repeated metadata requests
    times = []
    for i in range(5):
        start = time.time()
        resp = requests.post(f"{SESSION_API}/session/get_metadata", json={
            "uid": TEST_UID,
            "sessionID": session_id
        })
        resp.raise_for_status()
        elapsed = time.time() - start
        times.append(elapsed)
        print(f"  Call {i+1}: {elapsed:.3f}s")

    # Check DT cache hit rate
    try:
        time.sleep(1)
        resp = requests.get(f"{BASE_URL_DT}/debug/cache-stats")
        resp.raise_for_status()
        stats = resp.json()
        hit_rate = float(stats["metadata"]["hit_rate"].rstrip("%"))
        print(f"\n✓ Cache hit rate: {hit_rate}%")
        if hit_rate >= 70:
            print("✓ PASS: Cache hit rate is good (>70%)")
            return True
        else:
            print(f"✗ FAIL: Cache hit rate too low ({hit_rate}% < 70%)")
            return False
    except Exception as e:
        print(f"✗ Failed to check cache stats: {e}")
        return False

# ──────────────────────────────
# TEST 3: Response Time with Caching (per chatbot)
# ──────────────────────────────

def test_response_time(base_url, label):
    print_section(f"TEST 3: Response Time with Caching ({label})")
    test_messages = [
        "What have I said about my character Akio?",
        "I want to talk about Akio's motivations.",
        "I'm not too sure about him... I feel like he is a very confused individual, perhaps due to his youth."
    ]
    times = []
    session_id = None
    try:
        for i, msg in enumerate(test_messages):
            start = time.time()
            resp = requests.post(f"{base_url}/chat", json={
                "user_id": TEST_UID,
                "message": msg,
                "session_id": session_id
            })
            resp.raise_for_status()
            elapsed = time.time() - start
            data = resp.json()
            if i == 0:
                session_id = data.get("session_id")
            times.append(elapsed)
            print(f"  {label} Message {i+1}: {elapsed:.3f}s")
            if data.get("chat_message"):
                snippet = data["chat_message"][:80].replace("\n", " ")
                print(f"    Response: {snippet}...")
        avg_time = sum(times) / len(times)
        print(f"\n✓ {label} average response time: {avg_time:.3f}s")
        if avg_time < 10.0:
            print(f"✓ PASS: {label} response times acceptable")
            return True
        else:
            print(f"✗ FAIL: {label} response too slow (avg {avg_time:.3f}s)")
            return False
    except Exception as e:
        print(f"✗ {label} response time test failed: {e}")
        return False


# ──────────────────────────────
# TEST 4: Background Thread Separation (per chatbot)
# ──────────────────────────────

def test_background_separation(base_url, label):
    print_section(f"TEST 4: Background Thread Separation ({label})")
    try:
        start = time.time()
        resp = requests.post(f"{base_url}/chat", json={
            "user_id": TEST_UID,
            "message": "Hello!",
            "session_id": None
        })
        resp.raise_for_status()
        elapsed = time.time() - start
        data = resp.json()
        has_message = bool(data.get("chat_message"))
        has_background = data.get("background_processing", False)
        print(f"  {label} Response time: {elapsed:.3f}s")
        print(f"  {label} Immediate message: {has_message}")
        print(f"  {label} Background processing: {has_background}")
        if has_message and elapsed < 15.0:
            print(f"✓ PASS: {label} immediate response with message")
            return True
        elif not has_message and has_background:
            print(f"⚠ WARNING: {label} background-only response detected")
            return True
        else:
            print(f"✗ FAIL: {label} response took too long or missing message")
            return False
    except Exception as e:
        print(f"✗ {label} background separation test failed: {e}")
        return False

# ──────────────────────────────
# TEST 5: Cache Invalidation on Updates
# ──────────────────────────────

def test_cache_invalidation():
    print_section("TEST 5: Cache Invalidation on Updates")
    try:
        # Create session
        resp = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID})
        resp.raise_for_status()
        session_id = resp.json().get("sessionID")

        # Get metadata (cache)
        requests.post(f"{SESSION_API}/session/get_metadata", json={
            "uid": TEST_UID, "sessionID": session_id
        })

        # Update metadata (invalidate cache)
        update = requests.post(f"{SESSION_API}/session/update_metadata", json={
            "uid": TEST_UID,
            "sessionID": session_id,
            "updates": {"testField": "testValue"},
            "mode": "shared"
        })
        update.raise_for_status()
        print("  ✓ Metadata updated")

        # Retrieve again — should show fresh data
        resp2 = requests.post(f"{SESSION_API}/session/get_metadata", json={
            "uid": TEST_UID, "sessionID": session_id
        })
        resp2.raise_for_status()
        data = resp2.json()

        if data.get("metadata", {}).get("shared", {}).get("testField") == "testValue":
            print("  ✓ Fresh data retrieved after update")
            print("✓ PASS: Cache invalidation working")
            return True
        else:
            print("✗ FAIL: Stale cache data returned")
            return False
    except Exception as e:
        print(f"✗ Cache invalidation test failed: {e}")
        return False

# ──────────────────────────────
# Run All Tests
# ──────────────────────────────
def run_all_tests():
    print("\n" + "█" * 60)
    print("  CACHE PERFORMANCE VALIDATION SUITE")
    print("  Tuesday's Requirements Check")
    print("█" * 60)

    results = {}
    all_test_cache_stats = []

    # TEST 1 (no extra cache snapshot)
    results["Cache Stats Endpoint"] = test_cache_stats()

    # Remaining tests each followed by cache report
    results["Cache Hit Rate"] = test_repeated_metadata_calls()
    stats_resp_dt = requests.get(f"{BASE_URL_DT}/debug/cache-stats").json()
    stats_resp_bs = requests.get(f"{BASE_URL_BS}/debug/cache-stats").json()
    all_test_cache_stats.append(("DT", stats_resp_dt))
    all_test_cache_stats.append(("BS", stats_resp_bs))
    print_cache_report("After TEST 2: Repeated Metadata Calls")

    results["DT Response Time"] = test_response_time(BASE_URL_DT, "DT")
    stats_resp_dt = requests.get(f"{BASE_URL_DT}/debug/cache-stats").json()
    all_test_cache_stats.append(("DT", stats_resp_dt))
    print_cache_report("After TEST 3: DT Response Time")

    results["BS Response Time"] = test_response_time(BASE_URL_BS, "BS")
    stats_resp_bs = requests.get(f"{BASE_URL_BS}/debug/cache-stats").json()
    all_test_cache_stats.append(("BS", stats_resp_bs))
    print_cache_report("After TEST 3: BS Response Time")

    results["DT Background Separation"] = test_background_separation(BASE_URL_DT, "DT")
    stats_resp_dt = requests.get(f"{BASE_URL_DT}/debug/cache-stats").json()
    all_test_cache_stats.append(("DT", stats_resp_dt))
    print_cache_report("After TEST 4: DT Background Separation")

    results["BS Background Separation"] = test_background_separation(BASE_URL_BS, "BS")
    stats_resp_bs = requests.get(f"{BASE_URL_BS}/debug/cache-stats").json()
    all_test_cache_stats.append(("BS", stats_resp_bs))
    print_cache_report("After TEST 4: BS Background Separation")

    results["Cache Invalidation"] = test_cache_invalidation()
    stats_resp_dt = requests.get(f"{BASE_URL_DT}/debug/cache-stats").json()
    stats_resp_bs = requests.get(f"{BASE_URL_BS}/debug/cache-stats").json()
    all_test_cache_stats.append(("DT", stats_resp_dt))
    all_test_cache_stats.append(("BS", stats_resp_bs))
    print_cache_report("After TEST 5: Cache Invalidation")

    # ──────────────────────────────
    # NEW SECTION: Overall Cache Efficiency
    # ──────────────────────────────
    print_section("OVERALL CACHE EFFICIENCY")

    total_hits = total_misses = 0
    dt_hits = dt_misses = 0
    bs_hits = bs_misses = 0

    for label, stats in all_test_cache_stats:
        try:
            hits = int(stats["metadata"]["hits"])
            misses = int(stats["metadata"]["misses"])
            if label == "DT":
                dt_hits += hits
                dt_misses += misses
            else:
                bs_hits += hits
                bs_misses += misses
            total_hits += hits
            total_misses += misses
        except Exception as e:
            print(f"⚠ Error reading stats from {label}: {e}")

    overall_hit_rate = (total_hits / (total_hits + total_misses)) if (total_hits + total_misses) > 0 else 0
    overall_dt_rate = (dt_hits / (dt_hits + dt_misses)) if (dt_hits + dt_misses) > 0 else 0
    overall_bs_rate = (bs_hits / (bs_hits + bs_misses)) if (bs_hits + bs_misses) > 0 else 0

    print(f"  DT Cache Efficiency: {overall_dt_rate:.2%}")
    print(f"  BS Cache Efficiency: {overall_bs_rate:.2%}")
    print(f"  → Overall Cache Hit Rate: {overall_hit_rate:.2%}")

    if overall_hit_rate < 0.7:
        print("  ✗ FAIL: Effective cache hit rate too low (<70%)")
        results["Overall Cache Efficiency"] = False
    else:
        print("  ✓ PASS: Effective cache hit rate acceptable")
        results["Overall Cache Efficiency"] = True

    # ──────────────────────────────
    # TEST RESULTS SUMMARY
    # ──────────────────────────────
    print_section("TEST RESULTS SUMMARY")
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for name, ok in results.items():
        print(f"  {'✓ PASS' if ok else '✗ FAIL'}: {name}")

    print(f"\n  Score: {passed}/{total} tests passed")
    if passed == total:
        print("\n  ✓✓✓ ALL TESTS PASSED ✓✓✓")
        print("  Ready to move to Wednesday's work (Profile Manager Batching)")
    else:
        print(f"\n  ✗✗✗ {total - passed} TESTS FAILED ✗✗✗")
        print("  Fix failing tests before proceeding to Wednesday")


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)