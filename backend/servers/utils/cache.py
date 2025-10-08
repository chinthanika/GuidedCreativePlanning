from cachetools import TTLCache
import threading

# Separate caches with different TTLs
metadata_cache = TTLCache(maxsize=1000, ttl=30)  # 30 seconds
summaries_cache = TTLCache(maxsize=500, ttl=60)  # 60 seconds

# Thread-safe locks
metadata_lock = threading.RLock()
summaries_lock = threading.RLock()

# Statistics tracking
cache_stats = {
    "metadata_hits": 0,
    "metadata_misses": 0,
    "summaries_hits": 0,
    "summaries_misses": 0,
    "metadata_invalidations": 0,
    "summaries_invalidations": 0
}

def get_cache_stats():
    """Return cache statistics with hit rates."""
    total_metadata = cache_stats["metadata_hits"] + cache_stats["metadata_misses"]
    total_summaries = cache_stats["summaries_hits"] + cache_stats["summaries_misses"]
    
    metadata_hit_rate = (cache_stats["metadata_hits"] / total_metadata * 100) if total_metadata > 0 else 0
    summaries_hit_rate = (cache_stats["summaries_hits"] / total_summaries * 100) if total_summaries > 0 else 0
    
    return {
        "metadata": {
            "hits": cache_stats["metadata_hits"],
            "misses": cache_stats["metadata_misses"],
            "hit_rate": f"{metadata_hit_rate:.2f}%",
            "invalidations": cache_stats["metadata_invalidations"],
            "size": len(metadata_cache)
        },
        "summaries": {
            "hits": cache_stats["summaries_hits"],
            "misses": cache_stats["summaries_misses"],
            "hit_rate": f"{summaries_hit_rate:.2f}%",
            "invalidations": cache_stats["summaries_invalidations"],
            "size": len(summaries_cache)
        }
    }

def invalidate_metadata(cache_key):
    """Thread-safe metadata cache invalidation."""
    with metadata_lock:
        if cache_key in metadata_cache:
            del metadata_cache[cache_key]
            cache_stats["metadata_invalidations"] += 1

def invalidate_summaries(cache_key):
    """Thread-safe summaries cache invalidation."""
    with summaries_lock:
        if cache_key in summaries_cache:
            del summaries_cache[cache_key]
            cache_stats["summaries_invalidations"] += 1