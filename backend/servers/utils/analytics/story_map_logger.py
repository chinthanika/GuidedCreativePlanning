# utils/analytics/story_map_logger.py
"""
Comprehensive analytics logging for Story Map feature.
Tracks graph manipulation, AI analysis usage, and pedagogical framework metrics.
"""

import time
from firebase_admin import db
from utils.analytics.logger import log_tool_interaction

# ============================================
# CORE STORY MAP LOGGING FUNCTIONS
# ============================================

def log_story_map_graph_render(user_id, node_count, link_count, isolated_nodes=0):
    """
    Log when user renders/loads the story map graph.
    Tracks initial engagement with the tool.
    """
    metadata = {
        'nodeCount': node_count,
        'linkCount': link_count,
        'isolatedNodes': isolated_nodes,
        'avgConnectionsPerNode': round(link_count / node_count, 2) if node_count > 0 else 0
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='render_graph',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track total renders
    total_renders = feature_ref.child('totalGraphRenders').get() or 0
    feature_ref.child('totalGraphRenders').set(total_renders + 1)


def log_story_map_node_action(user_id, action_type, node_data, processing_time_ms=None):
    """
    Log node creation, editing, or deletion.
    
    Args:
        action_type: 'create' | 'edit' | 'delete' | 'view'
        node_data: dict containing node information (group, label, etc.)
    """
    metadata = {
        'actionType': action_type,
        'nodeGroup': node_data.get('group', 'Uncategorized'),
        'nodeLabel': node_data.get('label', '')[:50],  # Truncate for privacy
        'hasCustomFields': len([k for k in node_data.keys() if k not in ['id', 'label', 'group', 'aliases', 'level', 'note']]) > 0,
        'aliasCount': len(node_data.get('aliases', '').split(',')) if node_data.get('aliases') else 0,
        'processingTimeMs': processing_time_ms
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type=f'node_{action_type}',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Increment action-specific counters
    action_count = feature_ref.child(f'nodeActions/{action_type}').get() or 0
    feature_ref.child(f'nodeActions/{action_type}').set(action_count + 1)
    
    # Track node types created
    if action_type == 'create':
        group_count = feature_ref.child(f'nodesByGroup/{node_data.get("group", "Uncategorized")}').get() or 0
        feature_ref.child(f'nodesByGroup/{node_data.get("group", "Uncategorized")}').set(group_count + 1)
    
    # Log action history
    feature_ref.child('nodeActionHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_story_map_link_action(user_id, action_type, link_data):
    """
    Log link creation, editing, or deletion.
    
    Args:
        action_type: 'create' | 'edit' | 'delete' | 'view'
        link_data: dict containing link information
    """
    metadata = {
        'actionType': action_type,
        'linkType': link_data.get('type', 'Unspecified'),
        'hasContext': bool(link_data.get('context'))
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type=f'link_{action_type}',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Increment action-specific counters
    action_count = feature_ref.child(f'linkActions/{action_type}').get() or 0
    feature_ref.child(f'linkActions/{action_type}').set(action_count + 1)
    
    # Track relationship types used
    if action_type in ['create', 'edit']:
        rel_count = feature_ref.child(f'relationshipTypes/{link_data.get("type", "Unspecified")}').get() or 0
        feature_ref.child(f'relationshipTypes/{link_data.get("type", "Unspecified")}').set(rel_count + 1)


def log_story_map_merge(user_id, merged_node_count, primary_node_label, processing_time_ms=None):
    """
    Log when user merges nodes (duplicate resolution).
    This is a key indicator of AI Deconstructor effectiveness.
    """
    metadata = {
        'mergedNodeCount': merged_node_count,
        'primaryNodeLabel': primary_node_label[:50],
        'processingTimeMs': processing_time_ms
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='merge_nodes',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track total merges
    total_merges = feature_ref.child('totalMerges').get() or 0
    feature_ref.child('totalMerges').set(total_merges + 1)
    
    # Track merge statistics
    merge_stats = feature_ref.child('mergeStats').get() or {
        'totalNodesMerged': 0,
        'mergeEvents': 0
    }
    merge_stats['totalNodesMerged'] += merged_node_count
    merge_stats['mergeEvents'] += 1
    merge_stats['avgNodesPerMerge'] = merge_stats['totalNodesMerged'] / merge_stats['mergeEvents']
    feature_ref.child('mergeStats').set(merge_stats)
    
    # Log merge event
    feature_ref.child('mergeHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_story_map_analysis(
    user_id, 
    overall_score, 
    overall_health,
    node_count,
    link_count,
    issues_found,
    genre_inferred=None,
    processing_time_ms=None
):
    """
    Log when user runs story map analysis (AI as Deconstructor).
    This is a CRITICAL metric for testing the framework.
    """
    metadata = {
        'overallScore': overall_score,
        'overallHealth': overall_health,
        'nodeCount': node_count,
        'linkCount': link_count,
        'issuesFound': len(issues_found),
        'issuesBySeverity': _count_by_severity(issues_found),
        'issuesByCategory': _count_by_category(issues_found),
        'genreInferred': genre_inferred,
        'processingTimeMs': processing_time_ms
    }
    
    # Log to tool journey (Modelling stage - AI as Deconstructor)
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='analyze',
        tlc_stage='modelling',  # Analysis = Modelling & Deconstruction
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # ============================================
    # FEATURE-SPECIFIC METRICS (DETAILED)
    # ============================================
    
    # 1. Total analyses count
    total_analyses = feature_ref.child('totalAnalyses').get() or 0
    feature_ref.child('totalAnalyses').set(total_analyses + 1)
    
    # 2. Analysis score tracking (outcome metric)
    score_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/storyMapHealthScores")
    scores = score_ref.get() or []
    scores.append({
        'score': overall_score,
        'health': overall_health,
        'timestamp': int(time.time() * 1000)
    })
    score_ref.set(scores)
    
    # 3. Issue detection statistics
    issue_stats = feature_ref.child('issueStats').get() or {
        'totalIssuesDetected': 0,
        'analysisCount': 0
    }
    issue_stats['totalIssuesDetected'] += len(issues_found)
    issue_stats['analysisCount'] += 1
    issue_stats['avgIssuesPerAnalysis'] = issue_stats['totalIssuesDetected'] / issue_stats['analysisCount']
    feature_ref.child('issueStats').set(issue_stats)
    
    # 4. Issue severity distribution
    for severity, count in _count_by_severity(issues_found).items():
        severity_count = feature_ref.child(f'issuesBySeverity/{severity}').get() or 0
        feature_ref.child(f'issuesBySeverity/{severity}').set(severity_count + count)
    
    # 5. Issue category distribution
    for category, count in _count_by_category(issues_found).items():
        category_count = feature_ref.child(f'issuesByCategory/{category}').get() or 0
        feature_ref.child(f'issuesByCategory/{category}').set(category_count + count)
    
    # 6. Genre tracking
    if genre_inferred:
        genre_count = feature_ref.child(f'genresAnalyzed/{genre_inferred}').get() or 0
        feature_ref.child(f'genresAnalyzed/{genre_inferred}').set(genre_count + 1)
    
    # 7. Processing time statistics
    if processing_time_ms:
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
    
    # 8. Full analysis history
    feature_ref.child('analysisHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata,
        'issues': issues_found  # Full issue data for detailed analysis
    })
    
    # 9. Graph size at time of analysis
    graph_size_stats = feature_ref.child('graphSizeStats').get() or {
        'totalNodes': 0,
        'totalLinks': 0,
        'analysisCount': 0
    }
    graph_size_stats['totalNodes'] += node_count
    graph_size_stats['totalLinks'] += link_count
    graph_size_stats['analysisCount'] += 1
    graph_size_stats['avgNodesPerAnalysis'] = graph_size_stats['totalNodes'] / graph_size_stats['analysisCount']
    graph_size_stats['avgLinksPerAnalysis'] = graph_size_stats['totalLinks'] / graph_size_stats['analysisCount']
    feature_ref.child('graphSizeStats').set(graph_size_stats)


def log_story_map_analysis_panel_interaction(
    user_id, 
    interaction_type, 
    duration_ms=None,
    issue_interacted_with=None
):
    """
    Log interactions with the analysis panel.
    Tracks how users engage with AI feedback (AI as Deconstructor).
    
    Args:
        interaction_type: 'open' | 'close' | 'expand_category' | 'view_issue' | 'accept_suggestion' | 'dismiss_issue'
        duration_ms: Time spent in panel (for 'close' events)
        issue_interacted_with: Issue data if user interacted with specific issue
    """
    metadata = {
        'interactionType': interaction_type,
        'durationMs': duration_ms
    }
    
    if issue_interacted_with:
        metadata.update({
            'issueCategory': issue_interacted_with.get('category'),
            'issueSeverity': issue_interacted_with.get('severity'),
            'issueAction': issue_interacted_with.get('action')
        })
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type=f'analysis_panel_{interaction_type}',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track panel interactions
    panel_count = feature_ref.child(f'analysisPanelInteractions/{interaction_type}').get() or 0
    feature_ref.child(f'analysisPanelInteractions/{interaction_type}').set(panel_count + 1)
    
    # Track time spent in panel
    if interaction_type == 'close' and duration_ms:
        total_time = feature_ref.child('totalTimeInAnalysisPanel').get() or 0
        feature_ref.child('totalTimeInAnalysisPanel').set(total_time + duration_ms)
        
        # Average time per session
        total_closes = feature_ref.child('analysisPanelInteractions/close').get() or 1
        avg_time = (total_time + duration_ms) / total_closes
        feature_ref.child('avgTimeInAnalysisPanel').set(round(avg_time, 1))
    
    # Track issue interactions (AI effectiveness metric)
    if interaction_type in ['accept_suggestion', 'dismiss_issue'] and issue_interacted_with:
        issue_ref = feature_ref.child('issueInteractions')
        
        category = issue_interacted_with.get('category', 'unknown')
        action_type = 'accepted' if interaction_type == 'accept_suggestion' else 'dismissed'
        
        category_stats = issue_ref.child(category).get() or {'accepted': 0, 'dismissed': 0}
        category_stats[action_type] += 1
        
        # Calculate acceptance rate for this category
        total_interactions = category_stats['accepted'] + category_stats['dismissed']
        category_stats['acceptanceRate'] = round((category_stats['accepted'] / total_interactions) * 100, 1)
        
        issue_ref.child(category).set(category_stats)


def log_story_map_view_toggle(user_id, view_mode):
    """
    Log when user toggles between node view and label view.
    Tracks preference for visual vs. text-based navigation.
    """
    metadata = {
        'viewMode': view_mode  # 'node' | 'label'
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='toggle_view',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track view preferences
    view_count = feature_ref.child(f'viewToggles/{view_mode}').get() or 0
    feature_ref.child(f'viewToggles/{view_mode}').set(view_count + 1)


def log_story_map_merge_mode(user_id, action_type, nodes_selected=None):
    """
    Log merge mode interactions.
    Tracks how users engage with duplicate detection suggestions.
    
    Args:
        action_type: 'enter' | 'exit' | 'select_first' | 'select_second' | 'complete'
        nodes_selected: List of node IDs selected for merge
    """
    metadata = {
        'actionType': action_type,
        'nodesSelected': len(nodes_selected) if nodes_selected else 0
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type=f'merge_mode_{action_type}',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track merge mode usage
    mode_count = feature_ref.child(f'mergeModeActions/{action_type}').get() or 0
    feature_ref.child(f'mergeModeActions/{action_type}').set(mode_count + 1)
    
    # Calculate merge completion rate
    if action_type == 'complete':
        enters = feature_ref.child('mergeModeActions/enter').get() or 1
        completes = mode_count + 1
        completion_rate = round((completes / enters) * 100, 1)
        feature_ref.child('mergeCompletionRate').set(completion_rate)


# ============================================
# ADVANCED METRICS (PEDAGOGICAL FRAMEWORK)
# ============================================

def log_story_map_iteration_pattern(user_id, iteration_data):
    """
    Track iterative refinement patterns (Framework testing metric).
    
    Args:
        iteration_data: {
            'mapVersion': int,
            'actionsTaken': int,
            'timeSpent': int (ms),
            'triggeredByAnalysis': bool
        }
    """
    metadata = {
        **iteration_data,
        'timestamp': int(time.time() * 1000)
    }
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Track iteration history
    feature_ref.child('iterationHistory').push(metadata)
    
    # Calculate iteration statistics
    iteration_stats = feature_ref.child('iterationStats').get() or {
        'totalIterations': 0,
        'totalActionsAcrossIterations': 0,
        'totalTimeAcrossIterations': 0,
        'analysisTriggeredIterations': 0
    }
    
    iteration_stats['totalIterations'] += 1
    iteration_stats['totalActionsAcrossIterations'] += iteration_data.get('actionsTaken', 0)
    iteration_stats['totalTimeAcrossIterations'] += iteration_data.get('timeSpent', 0)
    if iteration_data.get('triggeredByAnalysis'):
        iteration_stats['analysisTriggeredIterations'] += 1
    
    iteration_stats['avgActionsPerIteration'] = iteration_stats['totalActionsAcrossIterations'] / iteration_stats['totalIterations']
    iteration_stats['avgTimePerIteration'] = iteration_stats['totalTimeAcrossIterations'] / iteration_stats['totalIterations']
    iteration_stats['analysisInfluenceRate'] = round((iteration_stats['analysisTriggeredIterations'] / iteration_stats['totalIterations']) * 100, 1)
    
    feature_ref.child('iterationStats').set(iteration_stats)


def log_story_map_ai_vs_manual_ratio(user_id):
    """
    Calculate and log the ratio of AI-generated vs. manually-created content.
    CRITICAL metric for testing Non-Functional Layer (User Agency).
    """
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Get node creation statistics
    node_actions = feature_ref.child('nodeActions').get() or {}
    manual_creates = node_actions.get('create', 0)
    
    # Get AI-generated node count (from generation events)
    generation_triggers = feature_ref.child('generationTriggers').get() or {}
    ai_generated_nodes = sum(trigger.get('nodesExtracted', 0) for trigger in generation_triggers.values())
    
    # Calculate ratio
    total_nodes = manual_creates + ai_generated_nodes
    if total_nodes > 0:
        manual_ratio = round((manual_creates / total_nodes) * 100, 1)
        ai_ratio = round((ai_generated_nodes / total_nodes) * 100, 1)
        
        feature_ref.child('contentCreationRatio').set({
            'manualPercentage': manual_ratio,
            'aiPercentage': ai_ratio,
            'totalNodes': total_nodes,
            'manualNodes': manual_creates,
            'aiNodes': ai_generated_nodes,
            'lastCalculated': int(time.time() * 1000)
        })


# ============================================
# SUMMARY & EXPORT FUNCTIONS
# ============================================

def get_story_map_summary(user_id):
    """
    Get comprehensive summary of Story Map metrics for a user.
    Used by admin dashboard.
    """
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    data = feature_ref.get() or {}
    
    outcome_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/storyMapHealthScores")
    health_scores = outcome_ref.get() or []
    
    summary = {
        'totalGraphRenders': data.get('totalGraphRenders', 0),
        'totalAnalyses': data.get('totalAnalyses', 0),
        'totalMerges': data.get('totalMerges', 0),
        'nodeActions': data.get('nodeActions', {}),
        'linkActions': data.get('linkActions', {}),
        'avgHealthScore': _calculate_avg_health_score(health_scores),
        'healthScoreImprovement': _calculate_health_improvement(health_scores),
        'mostCommonIssueCategory': _get_most_common(data.get('issuesByCategory', {})),
        'mostCommonIssueSeverity': _get_most_common(data.get('issuesBySeverity', {})),
        'issueAcceptanceRate': _calculate_overall_acceptance_rate(data.get('issueInteractions', {})),
        'contentCreationRatio': data.get('contentCreationRatio', {}),
        'avgNodesPerAnalysis': data.get('graphSizeStats', {}).get('avgNodesPerAnalysis', 0),
        'avgLinksPerAnalysis': data.get('graphSizeStats', {}).get('avgLinksPerAnalysis', 0),
        'avgTimeInAnalysisPanel': data.get('avgTimeInAnalysisPanel', 0),
        'analysisInfluenceRate': data.get('iterationStats', {}).get('analysisInfluenceRate', 0),
        'mergeCompletionRate': data.get('mergeCompletionRate', 0)
    }
    
    return summary


# ============================================
# UTILITY FUNCTIONS
# ============================================

def _count_by_severity(issues):
    """Count issues by severity level."""
    counts = {'high': 0, 'medium': 0, 'low': 0}
    for issue in issues:
        severity = issue.get('severity', 'low')
        counts[severity] = counts.get(severity, 0) + 1
    return counts


def _count_by_category(issues):
    """Count issues by category."""
    counts = {}
    for issue in issues:
        category = issue.get('category', 'other')
        counts[category] = counts.get(category, 0) + 1
    return counts


def _get_most_common(data_dict):
    """Find most common item in frequency dictionary."""
    if not data_dict:
        return None
    return max(data_dict.items(), key=lambda x: x[1])[0]


def _calculate_avg_health_score(health_scores):
    """Calculate average health score from list of score objects."""
    if not health_scores:
        return 0
    scores = [s.get('score', 0) for s in health_scores]
    return round(sum(scores) / len(scores), 1)


def _calculate_health_improvement(health_scores):
    """Calculate improvement in health score (first vs. last)."""
    if len(health_scores) < 2:
        return 0
    first_score = health_scores[0].get('score', 0)
    last_score = health_scores[-1].get('score', 0)
    return round(last_score - first_score, 1)


def _calculate_overall_acceptance_rate(issue_interactions):
    """Calculate overall issue acceptance rate across all categories."""
    if not issue_interactions:
        return 0
    
    total_accepted = sum(cat.get('accepted', 0) for cat in issue_interactions.values())
    total_dismissed = sum(cat.get('dismissed', 0) for cat in issue_interactions.values())
    total = total_accepted + total_dismissed
    
    if total == 0:
        return 0
    
    return round((total_accepted / total) * 100, 1)