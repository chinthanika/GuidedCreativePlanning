#!/usr/bin/env python3
"""
Drop stories written outside the study window from chat_analysis.xlsx.

Some students have stories left over from an earlier session (14 April 2026 in
this dataset). The Stories sheet sums every story a student ever wrote, so
those students' essay_words, writing_span_min and essay_text are all inflated.
This rebuilds the Stories and Drafts sheets from the in-window stories only,
and records what was removed on a new Excluded sheet.

Exact-duplicate stories (identical text saved twice) are also dropped, keeping
the earliest, so a student who saved the same essay twice is not double-counted.

Every other sheet is left untouched, including the Coding formulas.

Usage
-----
    python filter_stories.py --in chat_analysis.xlsx --out chat_analysis_filtered.xlsx
    python filter_stories.py --since 2026-07-01 --until 2026-07-03
"""

import argparse
import os
import re
from collections import defaultdict
from datetime import datetime

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

FONT = "Arial"
HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(name=FONT, size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name=FONT, size=10)
DROP_FILL = PatternFill("solid", fgColor="FCE4D6")


def sheet_rows(ws):
    """Return (headers, list of dicts) for a worksheet."""
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [h for h in rows[0]]
    return headers, [dict(zip(headers, r)) for r in rows[1:]]


def parse_dt(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], f)
        except ValueError:
            continue
    return None


def norm(t):
    return re.sub(r"\s+", " ", str(t or "")).strip().lower()


def words(t):
    return len(str(t or "").split())


def write_sheet(wb, name, headers, rows, widths, wrap_cols=(), index=None):
    """Replace a sheet wholesale, keeping its position in the tab order."""
    if name in wb.sheetnames:
        if index is None:
            index = wb.sheetnames.index(name)
        wb.remove(wb[name])
    ws = wb.create_sheet(name, index)
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30
    for r in rows:
        ws.append(r)
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.font = BODY_FONT
            cell.alignment = Alignment(vertical="top",
                                       wrap_text=cell.column_letter in wrap_cols)
    ws.freeze_panes = "A2"
    if ws.max_row > 1:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    return ws


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="chat_analysis.xlsx")
    ap.add_argument("--out", dest="dst", default="chat_analysis_filtered.xlsx")
    ap.add_argument("--since", default="2026-07-01",
                    help="keep stories whose first draft is on or after this date")
    ap.add_argument("--until", default="2026-07-03",
                    help="keep stories whose first draft is before this date")
    ap.add_argument("--keep-duplicates", action="store_true",
                    help="do not drop stories whose text duplicates another")
    args = ap.parse_args()

    since = datetime.strptime(args.since, "%Y-%m-%d")
    until = datetime.strptime(args.until, "%Y-%m-%d")

    wb = load_workbook(args.src)          # default load keeps formulas
    for need in ("Stories", "Drafts"):
        if need not in wb.sheetnames:
            raise SystemExit(f"{args.src} has no {need} sheet - "
                             "rebuild it with build_workbook.py first")

    d_head, drafts = sheet_rows(wb["Drafts"])
    s_head, stories = sheet_rows(wb["Stories"])

    # ---- group drafts by story ----
    by_story = defaultdict(list)
    for d in drafts:
        by_story[(d["uid"], d["story_id"])].append(d)

    story_info = {}
    for key, ds in by_story.items():
        ds.sort(key=lambda x: (parse_dt(x["created"]) or datetime.max,
                               x["part_index"], x["draft_index"]))
        first = next((parse_dt(x["created"]) for x in ds if parse_dt(x["created"])), None)
        # final draft of each part, parts in order
        finals = {}
        for x in ds:
            if str(x.get("is_final_draft", "")).lower() == "yes":
                finals[x["part_index"]] = x["draft_text"]
        if not finals:                      # fall back to last draft per part
            for x in ds:
                finals[x["part_index"]] = x["draft_text"]
        text = "\n\n".join(finals[k] or "" for k in sorted(finals)).strip()
        story_info[key] = {"drafts": ds, "first": first, "text": text,
                           "n_parts": len(finals)}

    # ---- decide keep / drop ----
    decisions, seen_text = {}, {}
    for key in sorted(story_info, key=lambda k: (k[0], story_info[k]["first"] or datetime.max)):
        info = story_info[key]
        first = info["first"]
        if first is None:
            decisions[key] = "drop: no draft timestamp"
        elif first < since:
            decisions[key] = f"drop: written {first:%Y-%m-%d}, before {args.since}"
        elif first >= until:
            decisions[key] = f"drop: written {first:%Y-%m-%d}, on or after {args.until}"
        else:
            sig = (key[0], norm(info["text"]))
            if info["text"] and sig in seen_text and not args.keep_duplicates:
                decisions[key] = f"drop: duplicate of {seen_text[sig][1]}"
            else:
                if info["text"]:
                    seen_text[sig] = key
                decisions[key] = "keep"

    kept = {k for k, v in decisions.items() if v == "keep"}

    # ---- rebuild Drafts ----
    new_drafts = [[d.get(h) for h in d_head] for d in drafts
                  if (d["uid"], d["story_id"]) in kept]

    # ---- rebuild Stories ----
    per_uid = defaultdict(list)
    for key in kept:
        per_uid[key[0]].append(key)

    new_stories, excluded = [], []
    for s in stories:
        uid = s["uid"]
        keys = sorted(per_uid.get(uid, []),
                      key=lambda k: story_info[k]["first"] or datetime.max)
        texts, times, n_parts, n_drafts = [], [], 0, 0
        for k in keys:
            info = story_info[k]
            if info["text"]:
                texts.append(info["text"])
            n_parts += info["n_parts"]
            n_drafts += len(info["drafts"])
            for x in info["drafts"]:
                dt = parse_dt(x["created"])
                if dt:
                    times.append(dt)
        essay = "\n\n".join(texts).strip()
        span = round((max(times) - min(times)).total_seconds() / 60, 1) if len(times) > 1 else ""
        new_stories.append([
            uid, s.get("in_window"), s.get("n_sessions_in_window"),
            len(keys), n_parts, n_drafts,
            round(n_drafts / n_parts, 2) if n_parts else "",
            words(essay),
            f"{min(times):%Y-%m-%d %H:%M:%S}" if times else "",
            f"{max(times):%Y-%m-%d %H:%M:%S}" if times else "",
            span,
            s.get("has_graph"), s.get("has_timeline"), s.get("summary"),
            essay,
        ])

    for key, why in sorted(decisions.items()):
        if why == "keep":
            continue
        info = story_info[key]
        excluded.append([
            key[0], key[1], why,
            f"{info['first']:%Y-%m-%d %H:%M:%S}" if info["first"] else "",
            len(info["drafts"]), words(info["text"]),
            (info["text"] or "")[:300],
        ])

    write_sheet(wb, "Drafts", d_head, new_drafts,
                [30, 24, 9, 24, 9, 24, 19, 19, 10, 12, 11, 100], wrap_cols=("L",))
    write_sheet(wb, "Stories", s_head, new_stories,
                [30, 11, 11, 10, 9, 9, 12, 11, 19, 19, 12, 11, 12, 55, 100],
                wrap_cols=("N", "O"))
    ws = write_sheet(wb, "Excluded",
                     ["uid", "story_id", "reason", "first_draft_created",
                      "n_drafts", "words", "text_preview"],
                     excluded, [30, 24, 44, 19, 9, 9, 80], wrap_cols=("G",),
                     index=len(wb.sheetnames))
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.fill = DROP_FILL

    # ---- refresh the two story columns on Sessions ----
    if "Sessions" in wb.sheetnames:
        sess = wb["Sessions"]
        head = [c.value for c in sess[1]]
        lookup = {r[0]: (r[7], r[14]) for r in new_stories}   # uid -> (words, essay?)
        if "has_story" in head and "story_words" in head:
            hc, wc = head.index("has_story") + 1, head.index("story_words") + 1
            uc = head.index("uid") + 1
            for r in range(2, sess.max_row + 1):
                uid = sess.cell(r, uc).value
                w, txt = lookup.get(uid, (0, ""))
                sess.cell(r, hc, value="yes" if txt else "no")
                sess.cell(r, wc, value=w)

    wb.save(args.dst)

    before = sum(1 for s in stories if s.get("essay_words"))
    after = sum(1 for r in new_stories if r[7])
    changed = [(r[0], s.get("essay_words"), r[7])
               for r, s in zip(new_stories, stories) if s.get("essay_words") != r[7]]
    print(f"stories kept {len(kept)} of {len(story_info)}  |  excluded {len(excluded)}")
    print(f"students with essay text: {before} -> {after}")
    if changed:
        print(f"\n{len(changed)} students' word counts changed:")
        for uid, old, new in changed:
            print(f"  {uid[:16]}...  {old} -> {new}")
    print("\nwrote", os.path.abspath(args.dst))


if __name__ == "__main__":
    main()