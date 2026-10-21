#!/usr/bin/env python3
"""
Export chat sessions + matching stories from the structuredcreativeplanning RTDB.

Structure this targets
----------------------
    chatSessions/{uid}/{sessionId}/messages/...
    chatSessions/{uid}/{sessionId}/metadata/{createdAt, updatedAt, title}
    stories/{uid}/{story-text/content, summary, timeline, graph, stories}

Stories carry no timestamp, so they are matched to sessions by uid.

Setup
-----
    pip install firebase-admin
    export FIREBASE_SERVICE_ACCOUNT_KEY="$(cat ../Firebase/structuredcreativeplanning-fdea4acca240.json)"

Usage
-----
    python export_chat_sessions.py --dates            # month histogram, no export
    python export_chat_sessions.py --inspect          # tree shape incl. a message
    python export_chat_sessions.py --start 2026-07-01 --end 2026-07-03
"""

import argparse
import csv
import json
import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, db

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("export_chat_sessions")

DATABASE_URL  = "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
SESSIONS_PATH = "chatSessions"
STORIES_PATH  = "stories"

# Window boundaries are interpreted in this zone. Kajang = UTC+8.
LOCAL_TZ = timezone(timedelta(hours=8))

# Message field names vary; first match wins.
ROLE_FIELDS = ["role", "sender", "author", "from", "type"]
TEXT_FIELDS = ["text", "content", "message", "body", "prompt"]
MSG_TIME_FIELDS = ["timestamp", "createdAt", "time", "sentAt"]

STUDENT_ROLES = {"user", "human", "student", "0"}
BOT_ROLES = {"assistant", "model", "ai", "bot", "system", "1"}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def init_app():
    if firebase_admin._apps:          # already initialised by an importing module
        logger.info("Firebase app already initialised, reusing it")
        return
    try:
        cred = credentials.Certificate("../Firebase/structuredcreativeplanning-fdea4acca240.json")
        
        firebase_admin.initialize_app(cred, {
            'databaseURL': DATABASE_URL
        })
        print("[DEBUG] Credentials loaded successfully")

        logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        raise


def first_key(d, candidates):
    if not isinstance(d, dict):
        return None
    lowered = {k.lower(): k for k in d}
    for c in candidates:
        if c.lower() in lowered:
            return d[lowered[c.lower()]]
    return None


def to_epoch_ms(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v * 1000) if v < 10_000_000_000 else int(v)
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            return to_epoch_ms(int(s))
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=LOCAL_TZ)
        return int(dt.timestamp() * 1000)
    return None


def fmt(ms):
    return "" if ms is None else datetime.fromtimestamp(ms / 1000, LOCAL_TZ).isoformat()


def normalise_messages(raw):
    """messages may be a list or a dict keyed by push-ID."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [m for m in raw if m is not None]
    if isinstance(raw, dict):
        return [raw[k] for k in sorted(raw) if raw[k] is not None]
    return []


def lexical_to_text(raw):
    """Flatten a Lexical/Slate node tree (or its JSON string) to plain text."""
    if raw is None:
        return ""
    data = raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return ""
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            return s          # already plain text
    parts = []

    def walk(node):
        if isinstance(node, list):
            for n in node:
                walk(n)
            return
        if not isinstance(node, dict):
            return
        if isinstance(node.get("text"), str):
            parts.append(node["text"])
        children = node.get("children") or []
        for c in children:
            walk(c)
        if node.get("type") in ("paragraph", "heading", "quote", "listitem", "list"):
            parts.append("\n")

    walk(data)
    text = "".join(parts)
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")
    return text.strip()


# --------------------------------------------------------------------------
# read
# --------------------------------------------------------------------------

def iter_sessions():
    """Yield (uid, session_id, session_dict, created_ms) for every session."""
    root = db.reference(SESSIONS_PATH).get() or {}
    if isinstance(root, list):
        root = {str(i): v for i, v in enumerate(root) if v is not None}
    for uid, sessions in root.items():
        if not isinstance(sessions, dict):
            continue
        for sid, sess in sessions.items():
            if not isinstance(sess, dict):
                continue
            meta = sess.get("metadata") or {}
            created = to_epoch_ms(first_key(meta, ["createdAt", "startedAt", "timestamp"]))
            if created is None:
                msgs = normalise_messages(sess.get("messages"))
                times = [to_epoch_ms(first_key(m, MSG_TIME_FIELDS))
                         for m in msgs if isinstance(m, dict)]
                times = [t for t in times if t]
                created = min(times) if times else None
            yield uid, sid, sess, created


def get_story(uid):
    return db.reference(f"{STORIES_PATH}/{uid}").get() or {}


# --------------------------------------------------------------------------
# modes
# --------------------------------------------------------------------------

def show_dates():
    """Month histogram of every session, so you can confirm which July."""
    counts, undated, uids = Counter(), 0, set()
    for uid, _sid, _s, created in iter_sessions():
        uids.add(uid)
        if created is None:
            undated += 1
        else:
            counts[datetime.fromtimestamp(created / 1000, LOCAL_TZ).strftime("%Y-%m")] += 1
    print(f"{sum(counts.values())} dated sessions across {len(uids)} uids "
          f"({undated} with no usable timestamp)\n")
    for month in sorted(counts):
        print(f"  {month}   {counts[month]:>4}  {'#' * min(counts[month], 50)}")


def inspect():
    root = db.reference(SESSIONS_PATH).get() or {}
    uid = next(iter(root), None)
    if uid is None:
        print("chatSessions is empty.")
        return
    sid = next(iter(root[uid]), None)
    sess = root[uid][sid]
    print(f"uid        {uid}")
    print(f"session    {sid}")
    print(f"keys       {list(sess.keys())}")
    print(f"metadata   {json.dumps(sess.get('metadata'), indent=2)[:600]}")
    msgs = normalise_messages(sess.get("messages"))
    print(f"\n{len(msgs)} messages. First two verbatim:")
    for m in msgs[:2]:
        print(json.dumps(m, indent=2)[:900])
    story = get_story(uid)
    print(f"\nstories/{uid} keys: {list(story.keys())}")
    st = (story.get("story-text") or {})
    print("story-text sample:", str(st.get("content"))[:300])


def export(start_ms, end_ms, outdir):
    sessions, uids = [], set()
    for uid, sid, sess, created in iter_sessions():
        if created is None or not (start_ms <= created <= end_ms):
            continue
        sessions.append((uid, sid, sess, created))
        uids.add(uid)

    print(f"{len(sessions)} sessions from {len(uids)} uids in window")

    stories = {uid: get_story(uid) for uid in sorted(uids)}

    with open(os.path.join(outdir, "chat_sessions_raw.json"), "w", encoding="utf-8") as f:
        json.dump({f"{u}/{s}": d for u, s, d, _ in sessions}, f,
                  ensure_ascii=False, indent=2)
    with open(os.path.join(outdir, "stories_raw.json"), "w", encoding="utf-8") as f:
        json.dump(stories, f, ensure_ascii=False, indent=2)

    turn_rows, sess_rows = [], []

    for uid, sid, sess, created in sessions:
        meta = sess.get("metadata") or {}
        title = first_key(meta, ["title"])
        if isinstance(title, (dict, list)):
            title = json.dumps(title, ensure_ascii=False)[:200]
        msgs = normalise_messages(sess.get("messages"))
        s_words = b_words = 0
        times = []

        for i, m in enumerate(msgs):
            if isinstance(m, str):
                m = {"text": m}
            raw_role = str(first_key(m, ROLE_FIELDS) or "").lower()
            role = ("student" if raw_role in STUDENT_ROLES else
                    "bot" if raw_role in BOT_ROLES else raw_role or "unknown")
            text = first_key(m, TEXT_FIELDS)
            if isinstance(text, (dict, list)):
                text = lexical_to_text(text)
            text = "" if text is None else str(text)
            wc = len(text.split())
            if role == "student":
                s_words += wc
            elif role == "bot":
                b_words += wc
            mts = to_epoch_ms(first_key(m, MSG_TIME_FIELDS))
            if mts:
                times.append(mts)
            turn_rows.append({
                "uid": uid, "session_id": sid, "turn_index": i,
                "role": role, "raw_role": raw_role,
                "timestamp": fmt(mts), "word_count": wc, "text": text,
            })

        dur = round((max(times) - min(times)) / 60000, 1) if len(times) > 1 else ""
        sess_rows.append({
            "uid": uid, "session_id": sid, "session_title": title or "",
            "created": fmt(created),
            "updated": fmt(to_epoch_ms(first_key(meta, ["updatedAt"]))),
            "n_turns": len(msgs),
            "n_student_turns": sum(1 for r in turn_rows
                                   if r["session_id"] == sid and r["role"] == "student"),
            "student_words": s_words, "bot_words": b_words,
            "student_bot_ratio": round(s_words / b_words, 3) if b_words else "",
            "duration_min": dur,
            "has_story": "yes" if stories.get(uid) else "no",
        })

    story_rows = []
    for uid, story in stories.items():
        text = lexical_to_text(((story.get("story-text") or {}).get("content")))
        summary = story.get("summary")
        if isinstance(summary, (dict, list)):
            summary = json.dumps(summary, ensure_ascii=False)
        story_rows.append({
            "uid": uid,
            "story_words": len(text.split()),
            "n_sessions_in_window": sum(1 for u, *_ in sessions if u == uid),
            "has_graph": "yes" if story.get("graph") else "no",
            "has_timeline": "yes" if story.get("timeline") else "no",
            "summary": (summary or "")[:2000],
            "story_text": text,
        })
        if text:
            with open(os.path.join(outdir, f"story_{uid}.txt"), "w", encoding="utf-8") as f:
                f.write(text)

    turn_rows.sort(key=lambda r: (r["uid"], r["session_id"], r["turn_index"]))
    sess_rows.sort(key=lambda r: (r["uid"], r["created"]))
    story_rows.sort(key=lambda r: r["uid"])

    for name, rows in (("chat_turns.csv", turn_rows),
                       ("chat_sessions.csv", sess_rows),
                       ("stories.csv", story_rows)):
        if not rows:
            continue
        with open(os.path.join(outdir, name), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)

    roles = Counter(r["role"] for r in turn_rows)
    print(f"{len(turn_rows)} turns  roles={dict(roles)}")
    print(f"{len(story_rows)} stories, "
          f"{sum(1 for r in story_rows if r['story_words'] == 0)} empty")
    print(f"written to {os.path.abspath(outdir)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2026-07-01")
    ap.add_argument("--end", default="2026-07-03", help="inclusive")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--dates", action="store_true")
    ap.add_argument("--inspect", action="store_true")
    args = ap.parse_args()

    init_app()

    if args.dates:
        return show_dates()
    if args.inspect:
        return inspect()

    start = datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
    end = (datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)
           + timedelta(days=1) - timedelta(milliseconds=1))
    print(f"Window {start.isoformat()} -> {end.isoformat()}")
    export(int(start.timestamp() * 1000), int(end.timestamp() * 1000), args.outdir)


if __name__ == "__main__":
    main()