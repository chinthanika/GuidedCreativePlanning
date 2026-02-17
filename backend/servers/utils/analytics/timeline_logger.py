"""
utils/analytics/timeline_logger.py

Analytics logger for the Timeline feature.
TLC Stage: Joint Construction — AI as Reflective Guide

Tracked metrics (per spec):
  Usage
  -----
  - Time spent on page          → via log_timeline_page_view / log_timeline_page_exit
  - Total events created        → log_timeline_event_created
  - Total manual event edits    → log_timeline_event_edited
  - Mode used: linear vs Freytag's Pyramid → log_timeline_mode_used
  - Events marked as major vs minor → stored on creation/edit

  Coherence checks
  ----------------
  - Total coherence checks run             → log_timeline_coherence_check
  - Event count at time of each check      → stored per check
  - Overall coherence score per check      → stored longitudinally as array
  - Issues found per check                 → stored per check
  - Genre used for check                   → stored per check
  - Score change between consecutive checks → computed and stored

  Cross-feature / TLC
  -------------------
  - TLC stage tag on every journey entry   → via log_tool_interaction (tlc_stage='joint_construction')
"""

import time
import logging
from firebase_admin import db

from utils.analytics.logger import log_tool_interaction

logger = logging.getLogger("TIMELINE_ANALYTICS")


# ─────────────────────────────────────────────
# PAGE-LEVEL TRACKING
# ─────────────────────────────────────────────

def log_timeline_page_view(user_id: str) -> str | None:
    """
    Record when the student navigates to the Timeline page.
    Returns the page-view record key so the frontend can close it on exit.
    """
    try:
        now = int(time.time() * 1000)

        # TLC journey entry
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="page_view",
            tlc_stage="joint_construction",
            metadata={"timestamp": now},
        )

        # Dedicated page-view record (duration filled on exit)
        ref = db.reference(f"analytics/{user_id}/pageViews")
        key = ref.push({
            "pageName": "timeline",
            "entryTimestamp": now,
            "exitTimestamp": None,
            "duration": None,
        }).key

        logger.info(f"[TIMELINE] page_view for {user_id} (key={key})")
        return key

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_page_view failed: {e}")
        return None


def log_timeline_page_exit(user_id: str, duration_ms: int, page_view_key: str | None = None) -> None:
    """
    Record when the student leaves the Timeline page.
    Updates the open page-view record and accumulates total feature time.
    """
    try:
        now = int(time.time() * 1000)

        # Close the open page-view record
        if page_view_key:
            db.reference(f"analytics/{user_id}/pageViews/{page_view_key}").update({
                "exitTimestamp": now,
                "duration": duration_ms,
            })
        else:
            # Fallback: find the most recent unclosed timeline view
            views_ref = db.reference(f"analytics/{user_id}/pageViews")
            all_views = views_ref.order_by_child("entryTimestamp").get() or {}
            for key, v in reversed(list(all_views.items())):
                if v.get("pageName") == "timeline" and v.get("exitTimestamp") is None:
                    views_ref.child(key).update({"exitTimestamp": now, "duration": duration_ms})
                    break

        # Accumulate total time in feature
        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        total = feat_ref.child("totalTimeMs").get() or 0
        feat_ref.child("totalTimeMs").set(total + duration_ms)

        logger.info(f"[TIMELINE] page_exit for {user_id}, duration={duration_ms}ms")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_page_exit failed: {e}")


# ─────────────────────────────────────────────
# EVENT CRUD TRACKING
# ─────────────────────────────────────────────

def log_timeline_event_created(
    user_id: str,
    event_id: str,
    stage: str,
    is_main_event: bool,
    has_date: bool,
    description_length: int,
) -> None:
    """
    Log when the student creates a new timeline event.
    Increments total event count and records event-level metadata.
    """
    try:
        # TLC journey entry
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="event_created",
            tlc_stage="joint_construction",
            metadata={
                "eventId": event_id,
                "stage": stage,
                "isMainEvent": is_main_event,
                "hasDate": has_date,
                "descriptionLength": description_length,
            },
        )

        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")

        # Total events counter
        total = feat_ref.child("totalEventsCreated").get() or 0
        feat_ref.child("totalEventsCreated").set(total + 1)

        # Major vs minor split
        if is_main_event:
            major = feat_ref.child("majorEventsCreated").get() or 0
            feat_ref.child("majorEventsCreated").set(major + 1)
        else:
            minor = feat_ref.child("minorEventsCreated").get() or 0
            feat_ref.child("minorEventsCreated").set(minor + 1)

        # Stage distribution counter
        stage_count = feat_ref.child(f"stageDistribution/{stage}").get() or 0
        feat_ref.child(f"stageDistribution/{stage}").set(stage_count + 1)

        logger.info(f"[TIMELINE] event_created for {user_id} (stage={stage}, main={is_main_event})")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_event_created failed: {e}")


def log_timeline_event_edited(
    user_id: str,
    event_id: str,
    stage: str,
    is_main_event: bool,
) -> None:
    """
    Log when the student manually edits an existing event.
    Increments total manual-edit count.
    """
    try:
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="event_edited",
            tlc_stage="joint_construction",
            metadata={
                "eventId": event_id,
                "stage": stage,
                "isMainEvent": is_main_event,
            },
        )

        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        total = feat_ref.child("totalManualEdits").get() or 0
        feat_ref.child("totalManualEdits").set(total + 1)

        logger.info(f"[TIMELINE] event_edited for {user_id} (eventId={event_id})")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_event_edited failed: {e}")


def log_timeline_event_reordered(
    user_id: str,
    event_id: str,
    from_index: int,
    to_index: int,
) -> None:
    """
    Log a drag-and-drop reorder.
    Tracked separately from edits — no field was changed, only position.
    """
    try:
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="event_reordered",
            tlc_stage="joint_construction",
            metadata={
                "eventId": event_id,
                "fromIndex": from_index,
                "toIndex": to_index,
            },
        )

        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        total = feat_ref.child("totalReorders").get() or 0
        feat_ref.child("totalReorders").set(total + 1)

        logger.info(f"[TIMELINE] event_reordered for {user_id} ({from_index}→{to_index})")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_event_reordered failed: {e}")


def log_timeline_event_deleted(
    user_id: str,
    event_id: str,
    stage: str,
) -> None:
    """
    Log when the student deletes an event.
    Allows researcher to see net additions vs. churn.
    """
    try:
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="event_deleted",
            tlc_stage="joint_construction",
            metadata={"eventId": event_id, "stage": stage},
        )

        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        total = feat_ref.child("totalEventsDeleted").get() or 0
        feat_ref.child("totalEventsDeleted").set(total + 1)

        logger.info(f"[TIMELINE] event_deleted for {user_id} (eventId={event_id})")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_event_deleted failed: {e}")


# ─────────────────────────────────────────────
# MODE TRACKING
# ─────────────────────────────────────────────

def log_timeline_mode_used(user_id: str, mode: str) -> None:
    """
    Log which layout mode the student is using (linear vs Freytag's Pyramid).
    Called on first page load and again whenever the student switches mode.

    Args:
        mode: 'linear' | 'freytag'
    """
    try:
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="mode_selected",
            tlc_stage="joint_construction",
            metadata={"mode": mode},
        )

        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        feat_ref.child("lastModeUsed").set(mode)

        # Per-mode usage counts for distribution analysis
        mode_count = feat_ref.child(f"modeUsage/{mode}").get() or 0
        feat_ref.child(f"modeUsage/{mode}").set(mode_count + 1)

        logger.info(f"[TIMELINE] mode_selected for {user_id}: {mode}")

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_mode_used failed: {e}")


# ─────────────────────────────────────────────
# COHERENCE CHECK TRACKING  (core framework signal)
# ─────────────────────────────────────────────

def log_timeline_coherence_check(
    user_id: str,
    overall_score: float,
    event_count: int,
    issues_found: list,
    genre_used: str | None = None,
) -> dict:
    """
    Log a coherence check and compute score change vs. previous check.

    This is the primary framework-validation signal for the Timeline:
    longitudinal coherence scores show whether scaffolded planning
    improved structural quality over time.

    Args:
        user_id:       Firebase UID
        overall_score: Score returned by the AI (0–10)
        event_count:   Number of events in the timeline at time of check
        issues_found:  Raw issues list from the AI response
        genre_used:    Genre passed to the coherence endpoint (optional)

    Returns:
        Dict with { score, scoreChange, checkNumber, previousScore }
        so the caller can surface the delta to the student.
    """
    try:
        now = int(time.time() * 1000)

        # ── 1. Retrieve existing longitudinal scores ──
        scores_ref = db.reference(
            f"analytics/{user_id}/outcomeMetrics/timelineCoherenceScores"
        )
        existing_scores: list = scores_ref.get() or []

        # ── 2. Compute score change ──
        previous_score = existing_scores[-1] if existing_scores else None
        score_change = (
            round(overall_score - previous_score, 2)
            if previous_score is not None
            else None
        )

        # ── 3. Append new score ──
        existing_scores.append(overall_score)
        scores_ref.set(existing_scores)

        check_number = len(existing_scores)

        # ── 4. Store per-check detail ──
        check_detail = {
            "checkNumber": check_number,
            "timestamp": now,
            "overallScore": overall_score,
            "scoreChange": score_change,
            "eventCount": event_count,
            "issueCount": len(issues_found),
            "issuesBySeverity": {
                "high":   sum(1 for i in issues_found if i.get("severity") == "high"),
                "medium": sum(1 for i in issues_found if i.get("severity") == "medium"),
                "low":    sum(1 for i in issues_found if i.get("severity") == "low"),
            },
            "genreUsed": genre_used,
        }

        checks_ref = db.reference(
            f"analytics/{user_id}/featureMetrics/timeline/coherenceChecks"
        )
        checks_ref.push(check_detail)

        # ── 5. Update rolling feature-level counters ──
        feat_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
        total_checks = feat_ref.child("totalCoherenceChecks").get() or 0
        feat_ref.child("totalCoherenceChecks").set(total_checks + 1)
        feat_ref.child("lastCoherenceScore").set(overall_score)
        if check_number == 1:
            feat_ref.child("firstCoherenceScore").set(overall_score)

        # ── 6. TLC journey entry ──
        log_tool_interaction(
            user_id=user_id,
            tool_name="timeline",
            interaction_type="coherence_check",
            tlc_stage="joint_construction",
            metadata={
                "score": overall_score,
                "scoreChange": score_change,
                "eventCount": event_count,
                "checkNumber": check_number,
                "genre": genre_used,
            },
        )

        logger.info(
            f"[TIMELINE] coherence_check #{check_number} for {user_id}: "
            f"score={overall_score}, change={score_change}, events={event_count}"
        )

        return {
            "score": overall_score,
            "scoreChange": score_change,
            "checkNumber": check_number,
            "previousScore": previous_score,
        }

    except Exception as e:
        logger.warning(f"[TIMELINE] log_timeline_coherence_check failed: {e}")
        return {
            "score": overall_score,
            "scoreChange": None,
            "checkNumber": None,
            "previousScore": None,
        }