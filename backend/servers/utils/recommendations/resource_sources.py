"""
Wikipedia retrieval for the Resource Recommender (Building Knowledge of the Field).
Retrieval only: returns real articles with intro extracts and URLs. No LLM calls here.
"""

import os
import json
import logging
import threading
import requests
from typing import List, Dict, Any, Optional, Set

logger = logging.getLogger("RECOMMENDATIONS")

WIKI_API = "https://en.wikipedia.org/w/api.php"
# Wikimedia asks for a descriptive User-Agent with contact details. Replace the email.
USER_AGENT = "HummingbirdResearch/1.0 (University of Nottingham Malaysia; contact: YOUR_EMAIL_HERE)"
CACHE_PATH = os.path.join(os.path.dirname(__file__), "wiki_cache.json")


class WikipediaResourceSource:
    def __init__(self, cache_path: str = CACHE_PATH):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.cache_path = cache_path
        self._lock = threading.Lock()
        self._cache: Dict[str, List[Dict[str, Any]]] = self._load_cache()
        self._full_cache: Dict[int, Any] = {}

    def fetch_full_text(self, page_id: int):
        """Full plain-text article + revision id. In-memory cache so follow-ups don't refetch."""
        with self._lock:
            hit = self._full_cache.get(page_id)
        if hit:
            return hit
        resp = self.session.get(WIKI_API, params={
            "action": "query", "format": "json", "formatversion": 2,
            "pageids": page_id, "prop": "extracts|revisions",
            "explaintext": 1, "rvprop": "ids",
        }, timeout=15)
        resp.raise_for_status()
        page = resp.json()["query"]["pages"][0]
        rev = (page.get("revisions") or [{}])[0].get("revid")
        result = (page.get("extract") or "", rev)
        with self._lock:
            if len(self._full_cache) >= 64:
                self._full_cache.pop(next(iter(self._full_cache)))
            self._full_cache[page_id] = result
        return result

    # ---------- cache (keeps results identical across participants and restarts) ----------
    def _load_cache(self) -> Dict[str, Any]:
        try:
            if os.path.exists(self.cache_path):
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"[WIKI] Cache load failed: {e}")
        return {}

    def _save_cache(self):
        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"[WIKI] Cache save failed: {e}")

    @staticmethod
    def _norm(q: str) -> str:
        return " ".join(q.lower().split())

    # ---------- search ----------
    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        key = f"{self._norm(query)}|{limit}"
        with self._lock:
            hit = self._cache.get(key)
        if hit is not None:
            logger.debug(f"[WIKI] Cache hit: {query}")
            return hit

        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": limit,
            "gsrnamespace": 0,
            "prop": "extracts|info|pageprops",
            "exintro": 1,
            "explaintext": 1,
            "exchars": 1200,
            "exlimit": "max",
            "inprop": "url",
            "ppprop": "disambiguation",
            "redirects": 1,
        }
        resp = self.session.get(WIKI_API, params=params, timeout=10)
        resp.raise_for_status()
        pages = (resp.json().get("query") or {}).get("pages") or []

        results = []
        for p in sorted(pages, key=lambda p: p.get("index", 999)):
            if "disambiguation" in (p.get("pageprops") or {}):
                continue
            extract = (p.get("extract") or "").strip()
            if len(extract) < 150:  # skip stubs
                continue
            results.append({
                "pageId": p.get("pageid"),
                "title": p.get("title"),
                "url": p.get("fullurl"),
                "extract": extract,
                "lastRevId": p.get("lastrevid"),
            })

        with self._lock:
            self._cache[key] = results
            self._save_cache()
        logger.info(f"[WIKI] '{query}' -> {len(results)} usable articles")
        return results

    def gather(
        self,
        queries: List[str],
        per_query: int = 5,
        max_total: int = 12,
        exclude_titles: Optional[Set[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Run several queries, dedupe by page, return a capped candidate list."""
        exclude = {t.lower() for t in (exclude_titles or set())}
        seen_ids, candidates = set(), []

        for q in queries:
            try:
                for page in self.search(q, per_query):
                    if page["pageId"] in seen_ids or page["title"].lower() in exclude:
                        continue
                    seen_ids.add(page["pageId"])
                    candidates.append({**page, "query": q})
                    if len(candidates) >= max_total:
                        return candidates
            except requests.RequestException as e:
                logger.warning(f"[WIKI] Query failed '{q}': {e}")
                continue
        return candidates