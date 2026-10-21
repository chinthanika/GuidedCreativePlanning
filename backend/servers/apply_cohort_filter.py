#!/usr/bin/env python3
"""
Apply the study-cohort exclusions to chat_analysis_filtered.xlsx and verify
the final counts.

Exclusions
----------
1. The 08:00 group on 1 July 2026 - the group during which the design
   problems surfaced and the protocol was adjusted mid-session.
2. Anything outside 1-2 July 2026 (the 3 July sessions are voluntary
   out-of-study use by non-participants).

Sessions are dated by their first message timestamp, falling back to
metadata createdAt for sessions with no messages, so empty sessions are
counted rather than silently dropped.

Every other sheet is left untouched, including the Coding formulas.

Usage
-----
    python apply_cohort_filter.py --in chat_analysis_filtered.xlsx \
                                  --out chat_analysis_final.xlsx
    python apply_cohort_filter.py --dry-run
"""

import argparse
import os
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

STUDY_START = datetime(2026, 7, 1)
STUDY_END = datetime(2026, 7, 3)          # exclusive
PIVOT_DATE = datetime(2026, 7, 1).date()
PIVOT_HOUR = 8


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


def sheet_rows(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = list(rows[0])
    return headers, [dict(zip(headers, r)) for r in rows[1:]]


def write_sheet(wb, name, headers, rows, wrap_cols=(), index=None):
    if name in wb.sheetnames:
        old = wb[name]
        widths = {k: v.width for k, v in old.column_dimensions.items()}
        if index is None:
            index = wb.sheetnames.index(name)
        wb.remove(old)
    else:
        widths = {}
    ws = wb.create_sheet(name, index)
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30
    for r in rows:
        ws.append(r)
    for letter, w in widths.items():
        if w:
            ws.column_dimensions[letter].width = w
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
    ap.add_argument("--in", dest="src", default="chat_analysis_filtered.xlsx")
    ap.add_argument("--out", dest="dst", default="chat_analysis_final.xlsx")
    ap.add_argument("--turn-floor", type=int, default=8,
                    help="student turns needed for the RQ2 subset")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    wb = load_workbook(args.src)
    for need in ("Sessions", "Turns"):
        if need not in wb.sheetnames:
            raise SystemExit(f"{args.src} has no {need} sheet")

    s_head, sessions = sheet_rows(wb["Sessions"])
    t_head, turns = sheet_rows(wb["Turns"])

    # --- date each session by its first message, falling back to createdAt ---
    first_msg, student_turns = {}, defaultdict(int)
    for t in turns:
        sid = t.get("session_id")
        dt = parse_dt(t.get("timestamp"))
        if dt and (sid not in first_msg or dt < first_msg[sid]):
            first_msg[sid] = dt
        if str(t.get("role", "")).lower() == "student":
            student_turns[sid] += 1

    decisions = {}
    for s in sessions:
        sid = s.get("session_id")
        dt = first_msg.get(sid) or parse_dt(s.get("created"))
        if dt is None:
            decisions[sid] = ("drop", "no usable timestamp", None)
        elif not (STUDY_START <= dt < STUDY_END):
            decisions[sid] = ("drop", f"outside study window ({dt:%Y-%m-%d %H:%M})", dt)
        elif dt.date() == PIVOT_DATE and dt.hour == PIVOT_HOUR:
            decisions[sid] = ("drop", "08:00 group, 1 July (protocol pivot)", dt)
        else:
            decisions[sid] = ("keep", "", dt)

    kept_ids = {sid for sid, (d, _, _) in decisions.items() if d == "keep"}
    kept = [s for s in sessions if s.get("session_id") in kept_ids]
    dropped = [s for s in sessions if s.get("session_id") not in kept_ids]

    # ---------------- verification ----------------
    def counts(rows):
        ids = {r.get("session_id") for r in rows}
        uids = {r.get("uid") for r in rows}
        st = sum(student_turns.get(i, 0) for i in ids)
        elig = sum(1 for i in ids if student_turns.get(i, 0) >= args.turn_floor)
        empty = sum(1 for i in ids if student_turns.get(i, 0) == 0)
        return len(ids), len(uids), st, elig, empty

    n_s, n_u, n_t, n_e, n_0 = counts(kept)
    print("=" * 62)
    print("FINAL COHORT")
    print("=" * 62)
    print(f"  sessions                     {n_s}")
    print(f"  students                     {n_u}")
    print(f"  student turns                {n_t}")
    print(f"  sessions with 0 student turns{n_0:>4}")
    print(f"  sessions >= {args.turn_floor} student turns  {n_e}")

    by_group = defaultdict(lambda: [0, set()])
    for s in kept:
        dt = decisions[s["session_id"]][2]
        key = f"{dt:%Y-%m-%d} {dt.hour:02d}:00"
        by_group[key][0] += 1
        by_group[key][1].add(s.get("uid"))
    print("\n  by group (date / start hour):")
    for k in sorted(by_group):
        c, u = by_group[k]
        print(f"    {k}   {c:>3} sessions  {len(u):>3} students")

    print("\n  checks:")
    dates = {f"{decisions[s['session_id']][2]:%Y-%m-%d}" for s in kept}
    print(f"    dates present: {sorted(dates)}")
    print(f"    any 3 July remaining?  {'YES - PROBLEM' if any(d=='2026-07-03' for d in dates) else 'no'}")
    print(f"    any 08:00 on 1 July?   "
          f"{'YES - PROBLEM' if any(k.startswith('2026-07-01 08') for k in by_group) else 'no'}")

    reasons = defaultdict(lambda: [0, set()])
    for s in dropped:
        sid = s.get("session_id")
        r = decisions[sid][1]
        key = ("outside study window" if r.startswith("outside") else r)
        reasons[key][0] += 1
        reasons[key][1].add(s.get("uid"))
    print(f"\n  excluded: {len(dropped)} sessions")
    for r in sorted(reasons):
        c, u = reasons[r]
        print(f"    {r}: {c} sessions, {len(u)} students")

    if args.dry_run:
        print("\n[dry run] nothing written")
        return

    # ---------------- write ----------------
    kept_rows = [[s.get(h) for h in s_head] for s in kept]
    kept_turns = [[t.get(h) for h in t_head] for t in turns
                  if t.get("session_id") in kept_ids]

    write_sheet(wb, "Sessions", s_head, kept_rows, wrap_cols=("C", "P", "Q", "R"))
    write_sheet(wb, "Turns", t_head, kept_turns, wrap_cols=("J", "K"))

    for name, keycol in (("Ideas", "session_id"), ("Bot_Actions", "session_id")):
        if name in wb.sheetnames:
            h, rows = sheet_rows(wb[name])
            write_sheet(wb, name, h,
                        [[r.get(k) for k in h] for r in rows
                         if r.get(keycol) in kept_ids],
                        wrap_cols=("G", "L"))

    ex = []
    for s in dropped:
        sid = s.get("session_id")
        _, why, dt = decisions[sid]
        ex.append([s.get("uid"), sid, f"{dt:%Y-%m-%d %H:%M:%S}" if dt else "",
                   why, student_turns.get(sid, 0)])
    ws = write_sheet(wb, "Excluded_Sessions",
                     ["uid", "session_id", "first_message", "reason",
                      "student_turns"],
                     ex, index=len(wb.sheetnames))
    for i, w in enumerate([30, 24, 20, 44, 12], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.fill = DROP_FILL

    wb.save(args.dst)
    print("\nwrote", os.path.abspath(args.dst))


if __name__ == "__main__":
    main()