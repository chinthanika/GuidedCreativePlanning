import re
import logging
import requests
from functools import lru_cache

from prompts.resource_prompts import (
    RESOURCE_SECTION_SELECT_SYSTEM_PROMPT,
    build_section_select_user_prompt,
)

logger = logging.getLogger("RECOMMENDATIONS")

WIKI_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "GuidedCreativePlanning/1.0 (educational research tool)"}
SKIP_HEADINGS = {
    "see also", "references", "external links", "further reading", "notes",
    "bibliography", "sources", "citations", "footnotes",
}
HEADING_RE = re.compile(r'^(={2,6})\s*(.+?)\s*\1\s*$', re.MULTILINE)


@lru_cache(maxsize=64)
def _fetch_full_text(page_id: int):
    """Full plain-text article (cached so follow-up questions don't refetch)."""
    r = requests.get(
        WIKI_API,
        params={
            "action": "query", "format": "json", "formatversion": 2,
            "pageids": page_id, "prop": "extracts|revisions",
            "explaintext": 1, "rvprop": "ids",
        },
        headers=HEADERS, timeout=10,
    )
    r.raise_for_status()
    page = r.json()["query"]["pages"][0]
    rev = (page.get("revisions") or [{}])[0].get("revid")
    return page.get("extract", "") or "", rev


def split_sections(text: str):
    matches = list(HEADING_RE.finditer(text))
    intro = text[:matches[0].start()] if matches else text
    sections = [{"id": 0, "heading": "Introduction", "text": intro.strip()}]
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        heading = m.group(2).strip()
        body = text[m.end():end].strip()
        if heading.lower() in SKIP_HEADINGS or len(body) < 80:
            continue
        sections.append({"id": len(sections), "heading": heading, "text": body})
    return sections


def _lexical_rank(sections, focus: str, k: int):
    """Fallback if the LLM section selection fails."""
    words = set(re.findall(r"[a-z]{4,}", focus.lower()))
    scored = []
    for s in sections:
        toks = re.findall(r"[a-z]{4,}", f"{s['heading']} {s['heading']} {s['text']}".lower())
        if not toks:
            continue
        score = sum(1 for t in toks if t in words) / (len(toks) ** 0.5)
        if score > 0:
            scored.append((score, s["id"]))
    scored.sort(reverse=True)
    return [sid for _, sid in scored[:k]]


def build_article_context(page_id, focus, idea, llm_json, fetch_full_text,
                          max_sections=4, budget=12000):
    text, rev_id = fetch_full_text(int(page_id))
    if not text.strip():
        raise ValueError("Empty article text")

    sections = split_sections(text)
    body = [s for s in sections if s["id"] != 0]

    chosen = []
    if body:
        try:
            out = llm_json(
                RESOURCE_SECTION_SELECT_SYSTEM_PROMPT,
                build_section_select_user_prompt(idea, focus, body),
                timeout=30,
            )
            valid = {s["id"] for s in body}
            for i in out.get("sections", []):
                if isinstance(i, int) and i in valid and i not in chosen:
                    chosen.append(i)
            chosen = chosen[:max_sections]
        except Exception as e:
            logger.warning(f"[RESOURCES] Section selection failed: {e}")
        if not chosen:
            chosen = _lexical_rank(body, f"{focus} {idea}", max_sections)

    by_id = {s["id"]: s for s in sections}
    picked = [by_id[0]] + [by_id[i] for i in chosen]
    per_section = max(1500, budget // len(picked))

    parts, headings = [], []
    for s in picked:
        t = s["text"]
        limit = 2000 if s["id"] == 0 else per_section
        if len(t) > limit:
            t = t[:limit].rsplit(" ", 1)[0] + " …"
        parts.append(f"## {s['heading']}\n{t}")
        headings.append(s["heading"])

    return {"context": "\n\n".join(parts), "headings": headings, "revId": rev_id}