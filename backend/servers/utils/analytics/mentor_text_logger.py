# utils/analytics/mentor_text_logger.py (UPDATED VERSION)
"""
Enhanced analytics logging for Mentor Text Analysis feature.
Tracks AI analysis, user interactions, and learning outcomes.
"""

import time
from firebase_admin import db
from utils.analytics.logger import log_tool_interaction

def log_mentor_text_analysis(
    user_id, 
    excerpt_length, 
    teaching_points_count,
    genre_identified,
    focus_area,
    validation_quality,
    processing_time_ms
):
    """
    Log when user analyzes a mentor text excerpt.
    Creates comprehensive feature-specific metrics.
    """
    metadata = {
        'excerptLength': excerpt_length,
        'teachingPointsCount': teaching_points_count,
        'genreIdentified': genre_identified,
        'focusArea': focus_area,
        'validationQuality': validation_quality,
        'processingTimeMs': processing_time_ms
    }
    
    # Log to tool journey (universal tracking)
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='analyze',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    # ============================================
    # FEATURE-SPECIFIC METRICS (DETAILED)
    # ============================================
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # 1. Total analyses count
    total_analyses = feature_ref.child('totalAnalyses').get() or 0
    feature_ref.child('totalAnalyses').set(total_analyses + 1)
    
    # 2. Analyses by focus area (which topics are students interested in?)
    focus_count = feature_ref.child(f'analysesByFocus/{focus_area}').get() or 0
    feature_ref.child(f'analysesByFocus/{focus_area}').set(focus_count + 1)
    
    # 3. Analyses by genre (what genres do students study?)
    if genre_identified:
        genre_count = feature_ref.child(f'analysesByGenre/{genre_identified}').get() or 0
        feature_ref.child(f'analysesByGenre/{genre_identified}').set(genre_count + 1)
    
    # 4. Quality distribution (how good are AI analyses?)
    quality_count = feature_ref.child(f'qualityDistribution/{validation_quality}').get() or 0
    feature_ref.child(f'qualityDistribution/{validation_quality}').set(quality_count + 1)
    
    # 5. Teaching points statistics
    teaching_points_stats = feature_ref.child('teachingPointsStats').get() or {
        'total': 0,
        'count': 0,
        'min': 999,
        'max': 0
    }
    teaching_points_stats['total'] += teaching_points_count
    teaching_points_stats['count'] += 1
    teaching_points_stats['min'] = min(teaching_points_stats['min'], teaching_points_count)
    teaching_points_stats['max'] = max(teaching_points_stats['max'], teaching_points_count)
    teaching_points_stats['average'] = teaching_points_stats['total'] / teaching_points_stats['count']
    feature_ref.child('teachingPointsStats').set(teaching_points_stats)
    
    # 6. Excerpt length statistics
    excerpt_stats = feature_ref.child('excerptLengthStats').get() or {
        'total': 0,
        'count': 0,
        'min': 999999,
        'max': 0
    }
    excerpt_stats['total'] += excerpt_length
    excerpt_stats['count'] += 1
    excerpt_stats['min'] = min(excerpt_stats['min'], excerpt_length)
    excerpt_stats['max'] = max(excerpt_stats['max'], excerpt_length)
    excerpt_stats['average'] = excerpt_stats['total'] / excerpt_stats['count']
    feature_ref.child('excerptLengthStats').set(excerpt_stats)
    
    # 7. Processing time statistics (AI performance tracking)
    processing_stats = feature_ref.child('processingTimeStats').get() or {
        'total': 0,
        'count': 0,
        'min': 999999,
        'max': 0
    }
    processing_stats['total'] += processing_time_ms
    processing_stats['count'] += 1
    processing_stats['min'] = min(processing_stats['min'], processing_time_ms)
    processing_stats['max'] = max(processing_stats['max'], processing_time_ms)
    processing_stats['average'] = processing_stats['total'] / processing_stats['count']
    feature_ref.child('processingTimeStats').set(processing_stats)
    
    # 8. Analysis history (full chronological log)
    feature_ref.child('analysisHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })
    
    # 9. Session-based tracking (analyses per session)
    current_date = time.strftime('%Y-%m-%d')
    daily_count = feature_ref.child(f'dailyAnalyses/{current_date}').get() or 0
    feature_ref.child(f'dailyAnalyses/{current_date}').set(daily_count + 1)
    
    # 10. First vs. repeat usage tracking
    if total_analyses == 0:
        feature_ref.child('firstAnalysisTimestamp').set(int(time.time() * 1000))
    else:
        feature_ref.child('lastAnalysisTimestamp').set(int(time.time() * 1000))


def log_mentor_text_view(user_id, analysis_id, view_duration_ms=None):
    """
    Log when user views a saved mentor text analysis.
    Tracks engagement with saved analyses.
    """
    metadata = {
        'analysisId': analysis_id,
        'viewDuration': view_duration_ms
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='view_analysis',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # Track total views
    total_views = feature_ref.child('totalAnalysisViews').get() or 0
    feature_ref.child('totalAnalysisViews').set(total_views + 1)
    
    # Track time spent reviewing
    if view_duration_ms:
        total_review_time = feature_ref.child('totalReviewTime').get() or 0
        feature_ref.child('totalReviewTime').set(total_review_time + view_duration_ms)
        
        # Average review time per view
        avg_review_time = (total_review_time + view_duration_ms) / (total_views + 1)
        feature_ref.child('avgReviewTime').set(round(avg_review_time, 1))
    
    # Track which analyses are viewed (engagement metric)
    feature_ref.child(f'analysisViews/{analysis_id}').push({
        'timestamp': int(time.time() * 1000),
        'duration': view_duration_ms
    })


def log_mentor_text_deletion(user_id, analysis_id, was_viewed=False):
    """
    Log when user deletes a mentor text analysis.
    Helps understand if users find analyses valuable.
    """
    metadata = {
        'analysisId': analysis_id,
        'wasViewed': was_viewed
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='delete_analysis',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # Track total deletions
    deletions = feature_ref.child('totalDeletions').get() or 0
    feature_ref.child('totalDeletions').set(deletions + 1)
    
    # Track deletions by type
    if was_viewed:
        viewed_deletions = feature_ref.child('deletionsAfterViewing').get() or 0
        feature_ref.child('deletionsAfterViewing').set(viewed_deletions + 1)
    else:
        immediate_deletions = feature_ref.child('immediateDeletions').get() or 0
        feature_ref.child('immediateDeletions').set(immediate_deletions + 1)
    
    # Calculate retention rate
    total_analyses = feature_ref.child('totalAnalyses').get() or 0
    if total_analyses > 0:
        retention_rate = ((total_analyses - deletions - 1) / total_analyses) * 100
        feature_ref.child('retentionRate').set(round(retention_rate, 1))


def log_mentor_text_search(user_id, search_query, results_count):
    """
    Log when user searches their mentor text library.
    Tracks search behavior and effectiveness.
    """
    metadata = {
        'searchQuery': search_query,
        'resultsCount': results_count
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='search',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # Track total searches
    total_searches = feature_ref.child('totalSearches').get() or 0
    feature_ref.child('totalSearches').set(total_searches + 1)
    
    # Track search effectiveness (found results or not?)
    if results_count > 0:
        successful_searches = feature_ref.child('successfulSearches').get() or 0
        feature_ref.child('successfulSearches').set(successful_searches + 1)
    else:
        failed_searches = feature_ref.child('failedSearches').get() or 0
        feature_ref.child('failedSearches').set(failed_searches + 1)
    
    # Track common search terms
    feature_ref.child('searchHistory').push({
        'timestamp': int(time.time() * 1000),
        'query': search_query,
        'resultsCount': results_count
    })
    
    # Calculate search success rate
    if total_searches > 0:
        successful = feature_ref.child('successfulSearches').get() or 0
        success_rate = (successful / (total_searches + 1)) * 100
        feature_ref.child('searchSuccessRate').set(round(success_rate, 1))


def log_mentor_text_filter(user_id, filter_type, filter_value):
    """
    Log when user applies a filter to their library.
    Tracks how users organize and find analyses.
    """
    metadata = {
        'filterType': filter_type,
        'filterValue': filter_value
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='filter',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # Track filter usage by type
    filter_count = feature_ref.child(f'filterUsage/{filter_type}').get() or 0
    feature_ref.child(f'filterUsage/{filter_type}').set(filter_count + 1)
    
    # Track specific filter values used
    value_count = feature_ref.child(f'filterValues/{filter_type}/{filter_value}').get() or 0
    feature_ref.child(f'filterValues/{filter_type}/{filter_value}').set(value_count + 1)
    
    # Total filter interactions
    total_filters = feature_ref.child('totalFilterUses').get() or 0
    feature_ref.child('totalFilterUses').set(total_filters + 1)


def log_mentor_text_create_modal_open(user_id, current_analyses_count):
    """
    Log when user opens the create analysis modal.
    Tracks intent to create (vs. actual creation).
    """
    metadata = {
        'currentAnalysesCount': current_analyses_count
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='mentorText',
        interaction_type='open_create_modal',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    
    # Track modal opens
    modal_opens = feature_ref.child('createModalOpens').get() or 0
    feature_ref.child('createModalOpens').set(modal_opens + 1)
    
    # Track conversion rate (modal opens vs. actual analyses)
    total_analyses = feature_ref.child('totalAnalyses').get() or 0
    if modal_opens > 0:
        conversion_rate = (total_analyses / (modal_opens + 1)) * 100
        feature_ref.child('createConversionRate').set(round(conversion_rate, 1))


def get_mentor_text_summary(user_id):
    """
    Get a summary of all Mentor Text metrics for a user.
    Useful for dashboard display.
    """
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/mentorText")
    data = feature_ref.get() or {}
    
    summary = {
        'totalAnalyses': data.get('totalAnalyses', 0),
        'totalViews': data.get('totalAnalysisViews', 0),
        'totalSearches': data.get('totalSearches', 0),
        'totalFilters': data.get('totalFilterUses', 0),
        'totalDeletions': data.get('totalDeletions', 0),
        'retentionRate': data.get('retentionRate', 100.0),
        'avgTeachingPoints': data.get('teachingPointsStats', {}).get('average', 0),
        'avgExcerptLength': data.get('excerptLengthStats', {}).get('average', 0),
        'avgProcessingTime': data.get('processingTimeStats', {}).get('average', 0),
        'mostUsedFocus': _get_most_common(data.get('analysesByFocus', {})),
        'mostAnalyzedGenre': _get_most_common(data.get('analysesByGenre', {})),
        'qualityDistribution': data.get('qualityDistribution', {}),
        'searchSuccessRate': data.get('searchSuccessRate', 0),
        'createConversionRate': data.get('createConversionRate', 0)
    }
    
    return summary


def _get_most_common(data_dict):
    """Helper to find most common item in a frequency dictionary."""
    if not data_dict:
        return None
    return max(data_dict.items(), key=lambda x: x[1])[0]