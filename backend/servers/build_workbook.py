#!/usr/bin/env python3
"""
Merge the export outputs into a single Excel workbook for coding and analysis.

Inputs (from export_chat_sessions.py, all optional except the raw JSON)
----------------------------------------------------------------------
    chat_sessions_raw.json   authoritative source for turns, mode, stage, actions
    chat_sessions.csv        cross-checked against the JSON
    chat_turns.csv           cross-checked against the JSON
    stories.csv              story text per uid
    stories_raw.json         fallback if stories.csv is absent

Output
------
    chat_analysis.xlsx  with sheets:
        README        legend and column notes
        Sessions      one row per session
        Turns         one row per turn, HTML stripped, control payloads split out
        Ideas         SCAMPER ideas the bot logged, with its own evaluations
        Bot_Actions   every other control action (stage switches, graph writes)
        Stories       assembled essay per student, with revision metrics
        Drafts        every saved draft, in order, with word deltas
        Coding        blank rubric grid, one row per session

Usage
-----
    python build_workbook.py --indir . --out chat_analysis.xlsx
"""

import argparse
import csv
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

FONT = "Arial"

HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(name=FONT, size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name=FONT, size=10)
LINK_FONT = Font(name=FONT, size=10, color="008000")      # cross-sheet link
INPUT_FILL = PatternFill("solid", fgColor="FFFF00")       # fill these in
EXAMPLE_FILL = PatternFill("solid", fgColor="F2F2F2")
NOTE_FONT = Font(name=FONT, size=10, italic=True, color="808080")
TITLE_FONT = Font(name=FONT, size=12, bold=True)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

MAX_CELL = 32000        # Excel's hard limit is 32767


# --------------------------------------------------------------------------
# text cleaning
# --------------------------------------------------------------------------

def strip_html(raw):
    """Bot messages are HTML fragments. Return readable plain text."""
    if raw is None:
        return ""
    t = str(raw)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"</(p|div|h[1-6]|blockquote)>", "\n\n", t, flags=re.I)
    t = re.sub(r"<li[^>]*>", "\n  - ", t, flags=re.I)
    t = re.sub(r"</li>", "", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def parse_bot_message(raw):
    """
    Split a bot message into what the student actually saw and the control
    payload behind it.

    Two payload shapes appear in this database:
      1. the whole message is a JSON action array, with the visible reply
         buried in the "respond" action's data.message
      2. a <json>...</json> block sits inline, with prose around it

    Returns (visible_text, actions, payload_kind).
    """
    text = "" if raw is None else str(raw)
    actions, kind = [], ""

    # shape 2: inline <json> blocks
    blocks = re.findall(r"<json>(.*?)</json>", text, flags=re.S | re.I)
    if blocks:
        kind = "inline_json"
        text = re.sub(r"<json>.*?</json>", "", text, flags=re.S | re.I)
        for b in blocks:
            try:
                parsed = json.loads(strip_html(b))
                actions.extend(parsed if isinstance(parsed, list) else [parsed])
            except (json.JSONDecodeError, TypeError):
                pass

    plain = strip_html(text)

    # shape 1: the entire message is the action array
    if not actions and plain[:1] in "[{" and '"action"' in plain:
        try:
            parsed = json.loads(plain)
            actions = parsed if isinstance(parsed, list) else [parsed]
            kind = "full_json"
            plain = ""
        except json.JSONDecodeError:
            pass

    if not plain:
        # recover the visible reply from the respond action
        msgs = [a.get("data", {}).get("message")
                for a in actions
                if isinstance(a, dict) and a.get("action") == "respond"]
        plain = "\n\n".join(m for m in msgs if m)

    return plain.strip(), actions, kind


def clean_cell(v):
    if v is None:
        return ""
    if isinstance(v, (int, float)):
        return v
    s = str(v)
    s = ILLEGAL_CHARACTERS_RE.sub("", s)
    if len(s) > MAX_CELL:
        s = s[:MAX_CELL] + "\n...[truncated]"
    return s


def words(s):
    return len(str(s).split())


# --------------------------------------------------------------------------
# load
# --------------------------------------------------------------------------

def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def read_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def lexical_to_text(raw):
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
            return s
    parts = []

    def walk(n):
        if isinstance(n, list):
            for x in n:
                walk(x)
            return
        if not isinstance(n, dict):
            return
        if isinstance(n.get("text"), str):
            parts.append(n["text"])
        for c in n.get("children") or []:
            walk(c)
        if n.get("type") in ("paragraph", "heading", "quote", "listitem", "list"):
            parts.append("\n")

    walk(data)
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


def normalise_messages(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [m for m in raw if m is not None]
    if isinstance(raw, dict):
        # push IDs sort chronologically, but timestamp wins where present
        items = [(k, v) for k, v in raw.items() if v is not None]
        items.sort(key=lambda kv: (kv[1].get("timestamp", 0)
                                   if isinstance(kv[1], dict) else 0, kv[0]))
        return [v for _, v in items]
    return []


def fmt_ts(ms):
    if not ms:
        return ""
    try:
        return datetime.fromtimestamp(int(ms) / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError, TypeError):
        return ""


def ts_of(node, *names):
    """First usable epoch-ms timestamp among the named fields."""
    if not isinstance(node, dict):
        return 0
    for n in names:
        v = node.get(n)
        if isinstance(v, (int, float)) and v:
            return int(v)
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return 0


def ordered(container, *time_fields):
    """
    Sort a push-ID-keyed dict into chronological order.
    Push IDs already sort chronologically as strings, so they break ties.
    """
    if not isinstance(container, dict):
        return []
    items = [(k, v) for k, v in container.items() if isinstance(v, dict)]
    items.sort(key=lambda kv: (ts_of(kv[1], *time_fields), kv[0]))
    return items


def walk_stories(stories_raw):
    """
    Extract essays from stories/{uid}/stories/{storyId}/parts/{partId}/drafts/.

    The final essay is the latest draft of each part, parts in creation order.
    Every draft is also kept, so the draft chain is available as a revision
    trace.

    Returns (essays_by_uid, essay_rows, draft_rows).
    """
    essays, essay_rows, draft_rows = {}, [], []

    for uid in sorted(stories_raw or {}):
        node = stories_raw[uid] or {}
        if not isinstance(node, dict):
            continue

        uid_texts, uid_draft_count, uid_times = [], 0, []

        for story_id, story in ordered(node.get("stories"), "createdAt", "updatedAt"):
            parts = ordered(story.get("parts"), "createdAt", "updatedAt")
            part_texts = []

            for p_idx, (part_id, part) in enumerate(parts):
                drafts = ordered(part.get("drafts"), "createdAt", "updatedAt")
                prev_words = None

                for d_idx, (draft_id, draft) in enumerate(drafts):
                    text = lexical_to_text(draft.get("content"))
                    wc = words(text)
                    created = ts_of(draft, "createdAt")
                    updated = ts_of(draft, "updatedAt", "createdAt")
                    if created:
                        uid_times.append(created)
                    if updated:
                        uid_times.append(updated)
                    draft_rows.append([
                        uid, story_id, p_idx, part_id, d_idx, draft_id,
                        fmt_ts(created), fmt_ts(updated), wc,
                        "" if prev_words is None else wc - prev_words,
                        "yes" if d_idx == len(drafts) - 1 else "no",
                        clean_cell(text),
                    ])
                    prev_words = wc
                    uid_draft_count += 1

                # the part's final state is its last draft
                if drafts:
                    part_texts.append(lexical_to_text(drafts[-1][1].get("content")))

            story_text = "\n\n".join(t for t in part_texts if t)
            if story_text:
                uid_texts.append(story_text)

            essay_rows.append([
                uid, story_id,
                ts_of(story, "createdAt") and fmt_ts(ts_of(story, "createdAt")) or "",
                len(parts),
                sum(len(ordered(p.get("drafts"), "createdAt")) for _, p in parts),
                words(story_text),
                clean_cell(story_text),
            ])

        # fall back to the flat story-text node if the nested tree is empty
        combined = "\n\n".join(uid_texts).strip()
        if not combined:
            combined = lexical_to_text((node.get("story-text") or {}).get("content"))

        summ = node.get("summary")
        essays[uid] = {
            "text": combined,
            "summary": json.dumps(summ, ensure_ascii=False) if isinstance(summ, (dict, list)) else (summ or ""),
            "n_drafts": uid_draft_count,
            "has_graph": "yes" if node.get("graph") else "no",
            "has_timeline": "yes" if node.get("timeline") else "no",
            "first_write": fmt_ts(min(uid_times)) if uid_times else "",
            "last_write": fmt_ts(max(uid_times)) if uid_times else "",
            "span_min": round((max(uid_times) - min(uid_times)) / 60000, 1)
                        if len(uid_times) > 1 else "",
        }

    return essays, essay_rows, draft_rows


# --------------------------------------------------------------------------
# build rows
# --------------------------------------------------------------------------

def build(indir):
    raw = read_json(os.path.join(indir, "chat_sessions_raw.json"))
    if not raw:
        sys.exit("chat_sessions_raw.json not found or empty in " + os.path.abspath(indir))

    sessions_csv = {(r["uid"], r["session_id"]): r
                    for r in read_csv(os.path.join(indir, "chat_sessions.csv"))}
    turns_csv = read_csv(os.path.join(indir, "chat_turns.csv"))

    stories_raw = read_json(os.path.join(indir, "stories_raw.json"))
    if not stories_raw:
        sys.exit("stories_raw.json not found. The essays live in its nested "
                 "stories/parts/drafts tree, so stories.csv alone is not enough.")
    stories, essay_rows, draft_rows = walk_stories(stories_raw)

    sess_rows, turn_rows, idea_rows, action_rows = [], [], [], []

    for key in sorted(raw):
        uid, sid = key.split("/", 1) if "/" in key else ("", key)
        sess = raw[key] or {}
        meta = sess.get("metadata") or {}
        msgs = normalise_messages(sess.get("messages"))

        s_turns = b_turns = s_words = b_words = 0
        payloads = 0
        modes, stages, techniques = Counter(), Counter(), Counter()
        times, dontknow = [], 0

        for i, m in enumerate(msgs):
            if isinstance(m, str):
                m = {"content": m}
            role = str(m.get("role", "")).lower()
            role = ("student" if role in ("user", "human", "student")
                    else "bot" if role in ("assistant", "model", "ai", "bot") else role)
            ts = m.get("timestamp")
            if ts:
                times.append(int(ts))
            mode = m.get("mode", "")
            stage = m.get("stage", "")
            if mode:
                modes[mode] += 1
            if stage:
                stages[stage] += 1

            raw_content = m.get("content", "")
            if role == "bot":
                visible, actions, kind = parse_bot_message(raw_content)
                if kind:
                    payloads += 1
                b_turns += 1
                b_words += words(visible)
                for a in actions:
                    if not isinstance(a, dict):
                        continue
                    act = a.get("action", "")
                    data = a.get("data") or {}
                    if act == "log_idea":
                        ev = data.get("evaluations") or {}
                        tech = data.get("scamperTechnique", "")
                        if tech:
                            techniques[tech] += 1
                        idea_rows.append([
                            uid, sid, i, fmt_ts(ts), mode, stage,
                            clean_cell(data.get("idea", "")),
                            tech,
                            ev.get("flexibilityCategory", ""),
                            ev.get("originality", ""),
                            ev.get("elaboration", ""),
                            clean_cell(ev.get("reasoning", "")),
                        ])
                    elif act != "respond":
                        action_rows.append([
                            uid, sid, i, fmt_ts(ts), mode, stage, act,
                            clean_cell(a.get("reasoning", "")),
                            clean_cell(json.dumps(data, ensure_ascii=False)),
                        ])
            else:
                visible, kind = strip_html(raw_content), ""
                s_turns += 1
                s_words += words(visible)
                low = visible.lower().strip(" .!?")
                if low in ("idk", "i dont know", "i don't know", "im not sure",
                           "i'm not sure", "not sure", "dunno", "i dotn know",
                           "i dont understand", "i don't understand", "no", "okay", "ok"):
                    dontknow += 1

            turn_rows.append([
                uid, sid, i, role, mode, stage, fmt_ts(ts),
                words(visible), kind, clean_cell(visible),
                clean_cell(raw_content) if kind else "",
            ])

        dur = round((max(times) - min(times)) / 60000, 1) if len(times) > 1 else ""
        csv_row = sessions_csv.get((uid, sid), {})
        st = stories.get(uid, {})
        sess_rows.append([
            uid, sid, meta.get("title", ""),
            fmt_ts(meta.get("createdAt")), fmt_ts(meta.get("updatedAt")),
            meta.get("mode", "") or sess.get("currentMode", ""),
            len(msgs), s_turns, b_turns, s_words, b_words,
            round(s_words / b_words, 3) if b_words else "",
            round(s_words / s_turns, 1) if s_turns else "",
            dur, dontknow,
            "; ".join(f"{k}:{v}" for k, v in modes.most_common()),
            "; ".join(f"{k}:{v}" for k, v in stages.most_common()),
            "; ".join(f"{k}:{v}" for k, v in techniques.most_common()),
            payloads,
            sum(1 for r in idea_rows if r[0] == uid and r[1] == sid),
            "yes" if st.get("text") else "no",
            words(st.get("text", "")),
            csv_row.get("student_words", ""),
        ])

    # cross-check against the CSVs
    warnings = []
    if sessions_csv and len(sessions_csv) != len(sess_rows):
        warnings.append(f"chat_sessions.csv has {len(sessions_csv)} rows, "
                        f"raw JSON has {len(sess_rows)}")
    if turns_csv and len(turns_csv) != len(turn_rows):
        warnings.append(f"chat_turns.csv has {len(turns_csv)} rows, "
                        f"raw JSON has {len(turn_rows)}")

    story_rows = []
    uids_in_window = {r[0] for r in sess_rows}
    for uid in sorted(uids_in_window | set(stories)):
        st = stories.get(uid, {})
        n_parts = sum(r[3] for r in essay_rows if r[0] == uid)
        story_rows.append([
            uid,
            "yes" if uid in uids_in_window else "no",
            sum(1 for r in sess_rows if r[0] == uid),
            sum(1 for r in essay_rows if r[0] == uid),
            n_parts,
            st.get("n_drafts", 0),
            round(st.get("n_drafts", 0) / n_parts, 2) if n_parts else "",
            words(st.get("text", "")),
            st.get("first_write", ""), st.get("last_write", ""), st.get("span_min", ""),
            st.get("has_graph", ""), st.get("has_timeline", ""),
            clean_cell(st.get("summary", "")),
            clean_cell(st.get("text", "")),
        ])

    if not any(r[7] for r in story_rows):
        warnings.append("No essay text found in the nested stories tree - "
                        "check that stories_raw.json was exported after the "
                        "writing phase")

    return (sess_rows, turn_rows, idea_rows, action_rows, story_rows,
            essay_rows, draft_rows, warnings)


# --------------------------------------------------------------------------
# write
# --------------------------------------------------------------------------

def add_sheet(wb, title, headers, rows, widths, wrap_cols=(), freeze="A2"):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30

    for r in rows:
        ws.append([clean_cell(v) for v in r])

    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.font = BODY_FONT
            cell.alignment = Alignment(
                vertical="top",
                wrap_text=cell.column_letter in wrap_cols)

    ws.freeze_panes = freeze
    if ws.max_row > 1:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    return ws


def write_workbook(data, out):
    (sess, turns, ideas, actions, stories, essays, drafts, warnings) = data
    wb = Workbook()
    wb.remove(wb.active)

    readme = wb.create_sheet("README")

    add_sheet(
        wb, "Sessions",
        ["uid", "session_id", "title", "created", "updated", "mode",
         "n_turns", "n_student_turns", "n_bot_turns",
         "student_words", "bot_words", "student_bot_ratio",
         "mean_student_turn_words", "duration_min", "n_dontknow_turns",
         "modes_used", "stages_used", "scamper_techniques",
         "n_control_payloads", "n_ideas_logged",
         "has_story", "story_words", "csv_student_words"],
        sess,
        [30, 24, 32, 19, 19, 14, 9, 9, 9, 11, 11, 11, 12, 11, 11,
         28, 24, 30, 11, 11, 10, 11, 13],
        wrap_cols=("C", "P", "Q", "R"))

    add_sheet(
        wb, "Turns",
        ["uid", "session_id", "turn_index", "role", "mode", "stage",
         "timestamp", "word_count", "payload_kind", "visible_text",
         "raw_content_if_payload"],
        turns,
        [30, 24, 8, 9, 14, 10, 19, 8, 13, 90, 60],
        wrap_cols=("J", "K"))

    add_sheet(
        wb, "Ideas",
        ["uid", "session_id", "turn_index", "timestamp", "mode", "stage",
         "idea", "scamper_technique", "flexibility_category",
         "originality_bot", "elaboration_bot", "bot_reasoning"],
        ideas,
        [30, 24, 8, 19, 14, 10, 70, 16, 16, 13, 13, 60],
        wrap_cols=("G", "L"))

    add_sheet(
        wb, "Bot_Actions",
        ["uid", "session_id", "turn_index", "timestamp", "mode", "stage",
         "action", "reasoning", "data_json"],
        actions,
        [30, 24, 8, 19, 14, 10, 16, 60, 70],
        wrap_cols=("H", "I"))

    add_sheet(
        wb, "Stories",
        ["uid", "in_window", "n_sessions_in_window", "n_stories", "n_parts",
         "n_drafts", "drafts_per_part", "essay_words",
         "first_write", "last_write", "writing_span_min",
         "has_graph", "has_timeline", "summary", "essay_text"],
        stories,
        [30, 11, 11, 10, 9, 9, 12, 11, 19, 19, 12, 11, 12, 55, 100],
        wrap_cols=("N", "O"))

    add_sheet(
        wb, "Drafts",
        ["uid", "story_id", "part_index", "part_id", "draft_index", "draft_id",
         "created", "updated", "word_count", "delta_words_vs_prev",
         "is_final_draft", "draft_text"],
        drafts,
        [30, 24, 9, 24, 9, 24, 19, 19, 10, 12, 11, 100],
        wrap_cols=("L",))

    # ---------------- Coding ----------------
    dims = [("A", "Reflective depth"), ("B", "Locus of ideation"),
            ("C", "Divergence"), ("D", "Craft elaboration"),
            ("E", "Query sophistication"), ("F", "Uptake into essay"),
            ("G", "Bot scaffolding")]
    headers = (["uid", "session_id", "coder_id"] +
               [f"{k} {name}" for k, name in dims] +
               ["Reflection (A+E)", "Creativity (B+C+D)",
                "Dependence (6-B-G)", "Total", "notes"])
    ws = wb.create_sheet("Coding")
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 42

    ws.append(["EXAMPLE - delete this row", "-OwEXAMPLE1234567890", "C1",
               2, 1, 2, 1, 2, 1, 1, None, None, None, None,
               "student led the alien-creature pivot; bot supplied all HMW framing"])
    example_row = 2

    start = 3
    for i, r in enumerate(sess):
        row = start + i
        ws.cell(row=row, column=1, value=r[0])
        ws.cell(row=row, column=2, value=r[1])
        for c in range(4, 11):
            ws.cell(row=row, column=c).fill = INPUT_FILL

    for row in range(example_row, start + len(sess)):
        d = {k: get_column_letter(4 + i) for i, (k, _) in enumerate(dims)}
        ws.cell(row=row, column=11,
                value=f"=IF(COUNT({d['A']}{row},{d['E']}{row})=2,{d['A']}{row}+{d['E']}{row},\"\")")
        ws.cell(row=row, column=12,
                value=f"=IF(COUNT({d['B']}{row},{d['C']}{row},{d['D']}{row})=3,"
                      f"{d['B']}{row}+{d['C']}{row}+{d['D']}{row},\"\")")
        ws.cell(row=row, column=13,
                value=f"=IF(COUNT({d['B']}{row},{d['G']}{row})=2,6-{d['B']}{row}-{d['G']}{row},\"\")")
        ws.cell(row=row, column=14,
                value=f"=IF(COUNT(D{row}:J{row})=7,SUM(D{row}:J{row}),\"\")")

    for i, w in enumerate([30, 24, 9] + [7] * 7 + [12, 13, 13, 8, 55], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.font = BODY_FONT
            cell.alignment = Alignment(vertical="top", horizontal="center",
                                       wrap_text=cell.column_letter in ("A", "O"))
            cell.border = BORDER
    for cell in ws[example_row]:
        cell.fill = EXAMPLE_FILL
        cell.font = Font(name=FONT, size=10, italic=True)
    ws.freeze_panes = "D3"

    # ---------------- README ----------------
    n_sess = len(sess)
    last = 1 + n_sess
    lines = [
        ("Chatbot interaction dataset", TITLE_FONT),
        (f"Built {datetime.now().strftime('%Y-%m-%d %H:%M')} from the "
         f"structuredcreativeplanning RTDB export.", NOTE_FONT),
        ("", None),
        ("Sheets", TITLE_FONT),
        ("Sessions      one row per chat session, with process metrics", None),
        ("Turns         one row per message. visible_text has HTML stripped and", None),
        ("              control payloads unwrapped; word_count follows visible_text,", None),
        ("              not the raw field, so it differs from the CSV export.", None),
        ("Ideas         SCAMPER ideas the bot logged, with the bot's OWN ratings of", None),
        ("              originality / elaboration / flexibility. These are the model's", None),
        ("              judgements, not ground truth - treat as a variable to validate", None),
        ("              against your human coding, never as the criterion measure.", None),
        ("Bot_Actions   stage switches and story-graph writes", None),
        ("Stories       one row per student. essay_text is assembled from the", None),
        ("              latest draft of each part, parts in creation order.", None),
        ("Drafts        every draft ever saved, in order. delta_words_vs_prev is", None),
        ("              the change from the preceding draft of the SAME part, so", None),
        ("              negative values mark cutting, not error.", None),
        ("Coding        blank rubric grid - see below", None),
        ("", None),
        ("How to code", TITLE_FONT),
        ("Fill only the YELLOW cells in Coding, columns D-J, using 0-3 per the rubric.", None),
        ("Grey row 2 is a worked example - delete it before analysis.", None),
        ("The four composite columns are formulas and stay blank until their inputs", None),
        ("are complete. Do not type over them.", None),
        ("One row per session. A student with two sessions gets two rows, so decide", None),
        ("in advance whether the session or the student is your unit of analysis.", None),
        ("", None),
        ("Two things worth knowing before you code", TITLE_FONT),
        ("1. Some bot messages leaked raw JSON control payloads to the student.", None),
        ("   payload_kind in Turns marks them. Where payload_kind is 'full_json' the", None),
        ("   student saw the JSON itself, not prose - that is a tool failure, and", None),
        ("   scoring those exchanges for scaffolding quality would measure the bug.", None),
        ("   Sessions.n_control_payloads counts them per session.", None),
        ("2. drafts_per_part near 1.0 means the student wrote once and never", None),
        ("   revised. Higher values, especially with negative deltas in Drafts,", None),
        ("   mean real revision. This is your only process measure on the writing", None),
        ("   side, so check it before assuming essays are single-pass.", None),
        ("3. n_dontknow_turns counts student turns that are only 'idk' / 'okay' or", None),
        ("   similar. A high count against a long session is the signature of the", None),
        ("   bot carrying the ideation - relevant to dimension B and to Dependence.", None),
        ("", None),
        ("Counts", TITLE_FONT),
    ]
    for i, (text, font) in enumerate(lines, start=1):
        c = readme.cell(row=i, column=1, value=text)
        c.font = font or BODY_FONT
    r = len(lines) + 1
    for label, formula in [
        ("Sessions", f"=COUNTA(Sessions!B2:B{last})"),
        ("Turns", "=COUNTA(Turns!C2:C100000)"),
        ("Student turns", f"=SUM(Sessions!H2:H{last})"),
        ("Bot turns", f"=SUM(Sessions!I2:I{last})"),
        ("Distinct participants", f"=SUMPRODUCT((Sessions!A2:A{last}<>\"\")/"
                                  f"COUNTIF(Sessions!A2:A{last},Sessions!A2:A{last}&\"\"))"),
        ("Ideas logged", "=COUNTA(Ideas!A2:A100000)"),
        ("Sessions with a control payload", f"=COUNTIF(Sessions!S2:S{last},\">0\")"),
        ("Sessions with zero turns", f"=COUNTIF(Sessions!G2:G{last},0)"),
        ("Total student words", f"=SUM(Sessions!J2:J{last})"),
        ("Total bot words", f"=SUM(Sessions!K2:K{last})"),
        ("Mean student:bot word ratio", f"=IFERROR(AVERAGE(Sessions!L2:L{last}),\"\")"),
    ]:
        readme.cell(row=r, column=1, value=label).font = BODY_FONT
        cell = readme.cell(row=r, column=2, value=formula)
        cell.font = LINK_FONT
        r += 1

    if warnings:
        r += 1
        readme.cell(row=r, column=1, value="Cross-check warnings").font = TITLE_FONT
        for w in warnings:
            r += 1
            readme.cell(row=r, column=1, value=w).font = Font(
                name=FONT, size=10, color="C00000")

    readme.column_dimensions["A"].width = 78
    readme.column_dimensions["B"].width = 16
    readme.sheet_view.showGridLines = False

    wb.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", default=".", help="folder holding the export files")
    ap.add_argument("--out", default="chat_analysis.xlsx")
    args = ap.parse_args()

    data = build(args.indir)
    write_workbook(data, args.out)
    (sess, turns, ideas, actions, stories, essays, drafts, warnings) = data
    with_text = sum(1 for r in stories if r[7])
    print(f"Sessions {len(sess)}  Turns {len(turns)}  Ideas {len(ideas)}  "
          f"Actions {len(actions)}")
    print(f"Students {len(stories)}  with essay text {with_text}  "
          f"drafts {len(drafts)}")
    for w in warnings:
        print("WARNING:", w)
    print("wrote", os.path.abspath(args.out))


if __name__ == "__main__":
    main()