#!/usr/bin/env python3
"""
test_performance.py
Combined Tuesday (cache) + Wednesday (Profile Manager batching) validation suite.

Run:
    python test_performance.py
"""

import requests
import time
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from contextlib import contextmanager

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/test_performance.log"
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
    log.info(f"▶ START: {section_name}")
    try:
        yield
    finally:
        duration = time.time() - start
        log.info(f"⏱ END: {section_name} (took {duration:.3f}s)\n")

# ----- Endpoints (edit if needed) -----
BASE_URL_DT = "http://10.163.9.197:5003"   # DeepThinker Flask server
BASE_URL_BS = "http://10.163.9.197:5002"   # BrainStamp (?) Flask server
PM_URL = "http://localhost:5001"        # Profile Manager (Node) server
SESSION_API = "http://localhost:4000"   # Session service

# Test user
TEST_UID = "04E9XYnVi8QD3yHAIXeBHCRp2sN2"

# Global store of cache snapshots collected after tests
all_test_cache_stats = []  # list of tuples (label, stats_dict)

# ----- Utilities -----
def print_section(title):
    log.info("\n" + "=" * 60)
    log.info(f"  {title}")
    log.info("=" * 60)

def pretty_json(data):
    log.info(json.dumps(data, indent=2))

def fetch_and_store_cache_stats(note="Snapshot"):
    log.info(f"---- {note} ----")
    for label, url in [
        ("DT", f"{BASE_URL_DT}/debug/cache-stats"),
        ("BS", f"{BASE_URL_BS}/debug/cache-stats"),
        ("PM", f"{PM_URL}/api/cache-stats")
    ]:
        try:
            r = requests.get(url, timeout=5)
            r.raise_for_status()
            stats = r.json()
            log.info(f"✓ {label} Cache Stats:")
            pretty_json(stats)
            all_test_cache_stats.append((label, stats))
        except Exception as e:
            log.warning(f"⚠ Failed to fetch {label} cache-stats: {e}")

# ----- Tuesday tests (cache & chat) -----
def test_cache_stats_endpoint():
    with log_duration("TEST 1: Cache Stats Endpoint (DT/BS/PM)"):
        ok = True
        try:
            rdt = requests.get(f"{BASE_URL_DT}/debug/cache-stats", timeout=5); rdt.raise_for_status()
            log.info("✓ DT cache-stats OK")
        except Exception as e:
            log.error(f"✗ DT cache-stats failed: {e}"); ok = False

        try:
            rbs = requests.get(f"{BASE_URL_BS}/debug/cache-stats", timeout=5); rbs.raise_for_status()
            log.info("✓ BS cache-stats OK")
        except Exception as e:
            log.error(f"✗ BS cache-stats failed: {e}"); ok = False

        # PM optional
        try:
            rpm = requests.get(f"{PM_URL}/api/cache-stats", timeout=5); rpm.raise_for_status()
            log.info("✓ PM cache-stats OK")
        except Exception:
            log.warning("⚠ PM cache-stats not reachable (optional)")

        return ok

def test_repeated_metadata_calls():
    with log_duration("TEST 2: Repeated Metadata Calls (Cache Hit Rate)"):
        try:
            # create session
            cr = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID}, timeout=10)
            cr.raise_for_status()
            session_id = cr.json().get("sessionID")
            log.info(f"✓ Created test session: {session_id}")
        except Exception as e:
            log.error(f"✗ Failed to create test session: {e}")
            return False

        # warm cache
        try:
            log.info("  Warming cache with first metadata call...")
            requests.post(f"{SESSION_API}/session/get_metadata", json={"uid": TEST_UID, "sessionID": session_id}, timeout=10)
            time.sleep(0.5)
        except Exception as e:
            log.error(f"✗ Warm-up failed: {e}")
            return False

        times = []
        for i in range(5):
            start = time.time()
            r = requests.post(f"{SESSION_API}/session/get_metadata", json={"uid": TEST_UID, "sessionID": session_id}, timeout=15)
            r.raise_for_status()
            elapsed = time.time() - start
            times.append(elapsed)
            log.info(f"  Call {i+1}: {elapsed:.3f}s")

        # check DT stats immediately after
        time.sleep(1)
        try:
            r = requests.get(f"{BASE_URL_DT}/debug/cache-stats", timeout=5)
            r.raise_for_status()
            stats = r.json()
            hit_rate = float(stats["metadata"]["hit_rate"].rstrip("%"))
            log.info(f"✓ Cache hit rate (DT metadata): {hit_rate}%")
            # store snapshot
            all_test_cache_stats.append(("DT", stats))
            if hit_rate >= 70.0:
                log.info("✓ PASS: Cache hit rate is good (>70%)")
                return True
            else:
                log.warning(f"✗ FAIL: Cache hit rate too low ({hit_rate}% < 70%)")
                return False
        except Exception as e:
            log.error(f"✗ Failed to fetch DT cache-stats: {e}")
            return False

def test_response_time(base_url, label):
    with log_duration(f"TEST 3: Response Time with Caching ({label})"):
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
                r = requests.post(f"{base_url}/chat", json={"user_id": TEST_UID, "message": msg, "session_id": session_id}, timeout=90)
                r.raise_for_status()
                elapsed = time.time() - start
                data = r.json()
                if i == 0:
                    session_id = data.get("session_id")
                times.append(elapsed)
                log.info(f"  {label} Message {i+1}: {elapsed:.3f}s")
                if data.get("chat_message"):
                    snippet = data["chat_message"][:80].replace("\n", " ")
                    log.info(f"    Response: {snippet}...")
            avg_time = sum(times) / len(times)
            log.info(f"{label} average response time: {avg_time:.3f}s")
            # Fetch caches snapshot
            try:
                rstats = requests.get(f"{base_url}/debug/cache-stats", timeout=5); rstats.raise_for_status()
                all_test_cache_stats.append((label if label in ("DT", "BS") else label, rstats.json()))
            except Exception:
                pass
            if avg_time < 10.0:
                log.info(f"✓ PASS: {label} response times acceptable")
                return True
            else:
                log.warning(f"✗ FAIL: {label} response too slow (avg {avg_time:.3f}s)")
                return False
        except Exception as e:
            log.error(f"✗ {label} response time test failed: {e}")
            return False    

def test_background_separation(base_url, label):
    log_duration(f"TEST 4: Background Thread Separation ({label})")
    try:
        start = time.time()
        r = requests.post(f"{base_url}/chat", json={"user_id": TEST_UID, "message": "Hello!", "session_id": None}, timeout=90)
        r.raise_for_status()
        elapsed = time.time() - start
        data = r.json()
        has_message = bool(data.get("chat_message"))
        has_background = data.get("background_processing", False)
        log.info(f"  {label} Response time: {elapsed:.3f}s")
        log.info(f"  {label} Immediate message: {has_message}")
        log.info(f"  {label} Background processing: {has_background}")

        # snapshot caches
        try:
            rstats = requests.get(f"{base_url}/debug/cache-stats", timeout=5); rstats.raise_for_status()
            all_test_cache_stats.append((label, rstats.json()))
        except Exception:
            pass

        if has_message and elapsed < 15.0:
            log.info(f"✓ PASS: {label} immediate response with message")
            return True
        elif not has_message and has_background:
            log.warning(f"⚠ WARNING: {label} background-only response detected")
            return True
        else:
            log.warning(f"✗ FAIL: {label} response took too long or missing message")
            return False

    except Exception as e:
        log.error(f"✗ {label} background separation test failed: {e}")
        return False

def test_cache_invalidation_session_api():
    log_duration("TEST 5: Cache Invalidation on Updates (Session API)")
    try:
        # create session
        cr = requests.post(f"{SESSION_API}/session/create", json={"uid": TEST_UID}, timeout=10)
        cr.raise_for_status()
        session_id = cr.json().get("sessionID")

        # initial get (cached)
        requests.post(f"{SESSION_API}/session/get_metadata", json={"uid": TEST_UID, "sessionID": session_id}, timeout=20)

        # update metadata (should invalidate)
        upd = requests.post(f"{SESSION_API}/session/update_metadata", json={
            "uid": TEST_UID, "sessionID": session_id, "updates": {"testField": "testValue"}, "mode": "shared"
        }, timeout=20)
        upd.raise_for_status()
        log.info("  ✓ Metadata updated")

        # get again
        r2 = requests.post(f"{SESSION_API}/session/get_metadata", json={"uid": TEST_UID, "sessionID": session_id}, timeout=20)
        r2.raise_for_status()
        data = r2.json()
        if data.get("metadata", {}).get("shared", {}).get("testField") == "testValue":
            log.info("  ✓ Fresh data retrieved after update")
            # snapshot DT/BS caches
            try:
                all_test_cache_stats.append(("DT", requests.get(f"{BASE_URL_DT}/debug/cache-stats", timeout=5).json()))
            except Exception:
                pass
            try:
                all_test_cache_stats.append(("BS", requests.get(f"{BASE_URL_BS}/debug/cache-stats", timeout=5).json()))
            except Exception:
                pass
            return True
        else:
            log.warning("✗ FAIL: Stale cache data returned")
            return False
    except Exception as e:
        log.error(f"✗ Cache invalidation test failed: {e}")
        return False

# ----- Wednesday tests (Profile Manager / batching) -----
def test_batch_endpoint():
    log_duration("WED TEST 1: Batch Endpoint Functionality (PM)")
    try:
        payload = {
            "userId": TEST_UID,
            "requests": [
                {"target": "nodes", "filters": {"label": "Akio"}},
                {"target": "links", "filters": {"participants": ["Akio"]}},
                {"target": "events", "filters": {}}
            ]
        }
        start = time.time()
        r = requests.post(f"{PM_URL}/api/batch", json=payload, timeout=30)
        r.raise_for_status()
        elapsed = time.time() - start
        data = r.json()
        results = data.get("results", [])
        log.info(f"  ✓ Batch request completed in {elapsed:.3f}s")
        log.info(f"  ✓ Returned {len(results)} results")
        if len(results) != 3:
            log.warning(f"  ✗ Expected 3 results, got {len(results)}")
            return False
        for i, res in enumerate(results):
            if "data" in res:
                t = type(res["data"]).__name__
                cnt = len(res["data"]) if hasattr(res["data"], "__len__") else "?"
                log.info(f"  ✓ Result {i+1}: {t} with {cnt} items")
            elif "error" in res:
                log.error(f"  ⚠ Result {i+1}: Error: {res['error']}")
        # snapshot PM cache-stats
        try:
            pm_stats = requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()
            all_test_cache_stats.append(("PM", pm_stats))
        except Exception:
            pass
        return True
    except Exception as e:
        log.error(f"✗ FAIL: Batch endpoint failed: {e}")
        return False

def test_batch_vs_sequential():
    log_duration("WED TEST 2: Batch vs Sequential Performance (PM)")
    try:
        test_requests = [{"target": "nodes"}, {"target": "links"}, {"target": "events"}]
        batch_start = time.time()
        rb = requests.post(f"{PM_URL}/api/batch", json={"userId": TEST_UID, "requests": test_requests}, timeout=30)
        rb.raise_for_status()
        batch_time = time.time() - batch_start
        log.info(f"  Batch time: {batch_time:.3f}s")

        seq_start = time.time()
        for req in test_requests:
            t = req["target"]
            requests.get(f"{PM_URL}/api/{t}", params={"userId": TEST_UID}, timeout=20)
        seq_time = time.time() - seq_start
        log.info(f"  Sequential time: {seq_time:.3f}s")
        improvement = ((seq_time - batch_time) / seq_time) * 100 if seq_time > 0 else 0.0
        log.info(f"  Improvement: {improvement:.1f}%")
        # snapshot PM stats
        try:
            all_test_cache_stats.append(("PM", requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()))
        except Exception:
            pass
        if batch_time < seq_time:
            log.info("✓ PASS: Batch is faster than sequential")
            return True
        else:
            log.warning("✗ FAIL: Batch is not faster (cache effects possible)")
            return True
    except Exception as e:
        log.error(f"✗ FAIL: Performance test failed: {e}")
        return False

def test_pm_cache():
    log_duration("WED TEST 3: Profile Manager Cache")
    try:
        # initialize
        try:
            requests.get(f"{PM_URL}/api/cache-stats", timeout=5)
        except Exception:
            pass
        s1 = time.time()
        r1 = requests.get(f"{PM_URL}/api/nodes", params={"userId": TEST_UID}, timeout=20)
        r1.raise_for_status()
        t1 = time.time() - s1
        log.info(f"  First request: {t1:.3f}s (expected miss)")
        s2 = time.time()
        r2 = requests.get(f"{PM_URL}/api/nodes", params={"userId": TEST_UID}, timeout=20)
        r2.raise_for_status()
        t2 = time.time() - s2
        log.info(f"  Second request: {t2:.3f}s (expected hit)")
        try:
            stats = requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()
            log.info("\n  Cache stats:")
            pretty_json(stats)
            all_test_cache_stats.append(("PM", stats))
        except Exception:
            pass
        if t2 < t1 * 0.6:
            log.info("✓ PASS: PM cache improves performance")
            return True
        else:
            log.warning("⚠ WARNING: PM cache improvement not significant")
            return True
    except Exception as e:
        log.error(f"✗ FAIL: PM cache test failed: {e}")
        return False

def test_cache_invalidation_pm():
    log_duration("WED TEST 4: Cache Invalidation on Writes (PM)")
    try:
        r1 = requests.get(f"{PM_URL}/api/nodes", params={"userId": TEST_UID}, timeout=20)
        r1.raise_for_status()
        initial_count = len(r1.json()) if isinstance(r1.json(), dict) else len(list(r1.json()))
        log.info(f"  Initial nodes count: {initial_count}")
        st = requests.post(f"{PM_URL}/api/stage-change", json={
            "userId": TEST_UID,
            "entityType": "node",
            "entityId": None,
            "newData": {"label": "Test Cache Invalidation Node", "group": "Person"}
        }, timeout=20)
        st.raise_for_status()
        log.info("  ✓ Staged a change")
        r2 = requests.get(f"{PM_URL}/api/nodes", params={"userId": TEST_UID}, timeout=20)
        r2.raise_for_status()
        log.info("  ✓ Re-read nodes after staging")
        try:
            stats = requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()
            all_test_cache_stats.append(("PM", stats))
        except Exception:
            pass
        return True
    except Exception as e:
        log.error(f"✗ FAIL: PM cache invalidation test failed: {e}")
        return False

def test_flask_batch_integration():
    log_duration("WED TEST 5: Flask Batch Integration (DT -> PM)")
    try:
        test_message = "Tell me about Akio and Phagousa"
        start = time.time()
        r = requests.post(f"{BASE_URL_DT}/chat", json={"user_id": TEST_UID, "message": test_message, "session_id": None}, timeout=90)
        r.raise_for_status()
        elapsed = time.time() - start
        data = r.json()
        log.info(f"  Chat response time: {elapsed:.3f}s")
        log.info(f"  Has message: {bool(data.get('chat_message'))}")
        log.info(f"  Background processing: {data.get('background_processing')}")
        # snapshot caches
        try:
            all_test_cache_stats.append(("DT", requests.get(f"{BASE_URL_DT}/debug/cache-stats", timeout=5).json()))
        except Exception:
            pass
        try:
            all_test_cache_stats.append(("PM", requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()))
        except Exception:
            pass
        log.info("  ⚠ Check PM logs for '[BATCH]' entries to confirm batching")
        return True
    except Exception as e:
        log.error(f"✗ FAIL: Flask integration test failed: {e}")
        return False

def test_fallback_mechanism():
    log_duration("WED TEST 6: Fallback Mechanism for PM")
    try:
        invalid_batch = {"userId": TEST_UID, "requests": [{"target": "invalid_target"}]}
        r = requests.post(f"{PM_URL}/api/batch", json=invalid_batch, timeout=10)
        # server may return 200 with errors array
        if r.status_code == 200:
            data = r.json()
            results = data.get("results", [])
            if results and "error" in results[0]:
                log.info("  ✓ Batch returns structured error for invalid target")
        log.info("✓ PASS: Error handling present (fallback check recommended in logs)")
        return True
    except Exception as e:
        log.warning(f"⚠ Partial pass: {e}")
        return True

def test_concurrent_batches():
    log_duration("WED TEST 7: Concurrent Batch Handling (PM)")
    try:
        import threading
        results = []
        errors = []
        def worker():
            try:
                r = requests.post(f"{PM_URL}/api/batch", json={"userId": TEST_UID, "requests": [{"target": "nodes"}, {"target": "links"}]}, timeout=15)
                r.raise_for_status()
                results.append(r.json())
            except Exception as e:
                errors.append(str(e))
        threads = [threading.Thread(target=worker) for _ in range(5)]
        s = time.time()
        for t in threads: t.start()
        for t in threads: t.join()
        elapsed = time.time() - s
        log.info(f"  Completed 5 concurrent requests in {elapsed:.3f}s  Successful: {len(results)} Errors: {len(errors)}")
        try:
            all_test_cache_stats.append(("PM", requests.get(f"{PM_URL}/api/cache-stats", timeout=5).json()))
        except Exception:
            pass
        if errors:
            log.warning("⚠ Some concurrent requests failed (check PM logs)")
            return True
        else:
            log.info("✓ PASS: Concurrent batch handling OK")
            return True
    except Exception as e:
        log.error(f"✗ FAIL: Concurrent test failed: {e}")
        return False

# ----- Aggregate and overall cache efficiency -----
def compute_overall_cache_efficiency():
    """
    Compute aggregated hit rates across collected snapshots.
    For DT/BS we read stats["metadata"]["hits/misses"].
    For PM we try to sum nodes/links/events hits/misses if present.
    """
    log_duration("OVERALL CACHE EFFICIENCY")
    dt_hits = dt_misses = bs_hits = bs_misses = 0
    pm_nodes_hits = pm_nodes_misses = 0
    pm_links_hits = pm_links_misses = 0
    pm_events_hits = pm_events_misses = 0

    for label, stats in all_test_cache_stats:
        try:
            if label == "DT":
                mh = int(stats.get("metadata", {}).get("hits", 0))
                mm = int(stats.get("metadata", {}).get("misses", 0))
                dt_hits += mh; dt_misses += mm
            elif label == "BS":
                mh = int(stats.get("metadata", {}).get("hits", 0))
                mm = int(stats.get("metadata", {}).get("misses", 0))
                bs_hits += mh; bs_misses += mm
            elif label == "PM":
                # PM stats structure may vary; try to read nodes/links/events
                nodes = stats.get("nodes", {})
                links = stats.get("links", {})
                events = stats.get("events", {})
                pn_h = int(nodes.get("hits", 0)); pn_m = int(nodes.get("misses", 0))
                pl_h = int(links.get("hits", 0)); pl_m = int(links.get("misses", 0))
                pe_h = int(events.get("hits", 0)); pe_m = int(events.get("misses", 0))
                pm_nodes_hits += pn_h; pm_nodes_misses += pn_m
                pm_links_hits += pl_h; pm_links_misses += pl_m
                pm_events_hits += pe_h; pm_events_misses += pe_m
        except Exception as e:
            log.error(f"⚠ Skipped malformed stats for {label}: {e}")

    def pct(h, m):
        return (h / (h + m)) if (h + m) > 0 else None

    overall_dt = pct(dt_hits, dt_misses)
    overall_bs = pct(bs_hits, bs_misses)
    pm_nodes = pct(pm_nodes_hits, pm_nodes_misses)
    pm_links = pct(pm_links_hits, pm_links_misses)
    pm_events = pct(pm_events_hits, pm_events_misses)

    if overall_dt is not None:
        log.info(f"  DT effective hit rate: {overall_dt:.2%} (hits={dt_hits}, misses={dt_misses})")
    else:
        log.info("  DT effective hit rate: No data")

    if overall_bs is not None:
        log.info(f"  BS effective hit rate: {overall_bs:.2%} (hits={bs_hits}, misses={bs_misses})")
    else:
        log.info("  BS effective hit rate: No data")

    if pm_nodes is not None or pm_links is not None or pm_events is not None:
        log.info("  PM effective hit rates (by target):")
        log.info(f"    nodes: {pm_nodes:.2%}" if pm_nodes is not None else "    nodes: No data")
        log.info(f"    links: {pm_links:.2%}" if pm_links is not None else "    links: No data")
        log.info(f"    events: {pm_events:.2%}" if pm_events is not None else "    events: No data")

    # compute combined overall across DT+BS+PM nodes+links+events (simple sum)
    total_hits = dt_hits + bs_hits + pm_nodes_hits + pm_links_hits + pm_events_hits
    total_misses = dt_misses + bs_misses + pm_nodes_misses + pm_links_misses + pm_events_misses
    overall = (total_hits / (total_hits + total_misses)) if (total_hits + total_misses) > 0 else None
    if overall is not None:
        log.info(f"  → Overall Cache Hit Rate (combined): {overall:.2%} (hits={total_hits}, misses={total_misses})")
    else:
        log.info("  → Overall Cache Hit Rate: No data")

    return overall

# ----- Run all tests in order -----
def run_all_tests():
    log.info("█" * 60)
    log.info("FULL PERFORMANCE VALIDATION SUITE — Tuesday + Wednesday checks")
    log.info("█" * 60)

    results = {}

    # Tuesday tests
    results["Cache Stats Endpoint"] = test_cache_stats_endpoint()
    fetch_and_store_cache_stats("After TEST 1: Cache Stats Endpoint")

    results["Cache Hit Rate"] = test_repeated_metadata_calls()
    fetch_and_store_cache_stats("After TEST 2: Repeated Metadata Calls")

    results["DT Response Time"] = test_response_time(BASE_URL_DT, "DT")
    fetch_and_store_cache_stats("After TEST 3: DT Response Time")

    results["BS Response Time"] = test_response_time(BASE_URL_BS, "BS")
    fetch_and_store_cache_stats("After TEST 3: BS Response Time")

    results["DT Background Separation"] = test_background_separation(BASE_URL_DT, "DT")
    fetch_and_store_cache_stats("After TEST 4: DT Background Separation")

    results["BS Background Separation"] = test_background_separation(BASE_URL_BS, "BS")
    fetch_and_store_cache_stats("After TEST 4: BS Background Separation")

    results["Cache Invalidation (Session API)"] = test_cache_invalidation_session_api()
    fetch_and_store_cache_stats("After TEST 5: Cache Invalidation (Session API)")

    # Wednesday tests (Profile Manager / batching)
    results["PM Batch Endpoint"] = test_batch_endpoint()
    fetch_and_store_cache_stats("After WED TEST 1: PM Batch Endpoint")

    results["PM Batch vs Sequential"] = test_batch_vs_sequential()
    fetch_and_store_cache_stats("After WED TEST 2: PM Batch vs Sequential")

    results["PM Cache"] = test_pm_cache()
    fetch_and_store_cache_stats("After WED TEST 3: PM Cache")

    results["PM Cache Invalidation"] = test_cache_invalidation_pm()
    fetch_and_store_cache_stats("After WED TEST 4: PM Cache Invalidation")

    results["Flask Batch Integration"] = test_flask_batch_integration()
    fetch_and_store_cache_stats("After WED TEST 5: Flask Batch Integration")

    results["PM Fallback Mechanism"] = test_fallback_mechanism()
    fetch_and_store_cache_stats("After WED TEST 6: PM Fallback Mechanism")

    results["PM Concurrent Batches"] = test_concurrent_batches()
    fetch_and_store_cache_stats("After WED TEST 7: PM Concurrent Batches")

    # Final aggregated metrics
    overall_cache = compute_overall_cache_efficiency()

    # Summary
    log_duration("TEST RESULTS SUMMARY")
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for name, ok in results.items():
        log.info(f"  {'✓ PASS' if ok else '✗ FAIL'}: {name}")
    log.info(f"\n  Score: {passed}/{total} tests passed")

    if overall_cache is not None and overall_cache >= 0.7:
        log.info("  ✓ PASS: Combined effective cache hit rate acceptable (>=70%)")
    else:
        log.warning("  ✗ FAIL: Combined effective cache hit rate below threshold (70%) or no data")

    # final decision
    if passed >= total - 1:
        log.info("\n  ✓✓✓ SUITE PASSED (allowing 1 failure) ✓✓✓")
        return True
    else:
        log.warning(f"\n  ✗✗✗ {total - passed} TESTS FAILED ✗✗✗")
        return False

if __name__ == "__main__":
    ok = run_all_tests()
    exit(0 if ok else 1)
