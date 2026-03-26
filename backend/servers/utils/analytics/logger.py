from firebase_admin import db
import time

# ============================================
# CORE LOGGING FUNCTIONS
# ============================================

def get_current_session_id(user_id):
    """
    Get or create current session ID for a user.
    A session = one continuous period of activity (30min timeout).
    """
    sessions_ref = db.reference(f"analytics/{user_id}/sessions")
    
    try:
        recent_sessions = sessions_ref.order_by_child('lastActive').limit_to_last(1).get()
    except Exception:
        try:
            new_session_id = f"session_{int(time.time() * 1000)}"
            sessions_ref.child(new_session_id).set({
                'startTime': int(time.time() * 1000),
                'lastActive': int(time.time() * 1000)
            })
            return new_session_id
        except Exception:
            return f"session_fallback_{int(time.time() * 1000)}"

    if recent_sessions:
        session_id, session_data = list(recent_sessions.items())[0]
        last_active = session_data.get('lastActive', 0)

        if (time.time() * 1000) - last_active < 1800000:  # 30 min
            sessions_ref.child(session_id).update({
                'lastActive': int(time.time() * 1000)
            })
            return session_id
    
    new_session_id = f"session_{int(time.time() * 1000)}"
    sessions_ref.child(new_session_id).set({
        'startTime': int(time.time() * 1000),
        'lastActive': int(time.time() * 1000)
    })
    
    return new_session_id


def log_tool_interaction(user_id, tool_name, interaction_type, tlc_stage, metadata=None):
    """
    Universal logging function - CALL THIS FROM EVERY FEATURE ENDPOINT.
    
    Args:
        user_id (str): Firebase user ID
        tool_name (str): 'storyMap' | 'bookRecs' | 'timeline' | 'chat' | 'feedback' | 'worldAI'
        interaction_type (str): 'view' | 'create' | 'edit' | 'analyze' | 'submit' | 'generate'
        tlc_stage (str): 'building_knowledge' | 'modelling' | 'joint_construction' | 'independent_construction'
        metadata (dict): Feature-specific data (optional)
    
    Returns:
        dict: Log entry created
    """
    timestamp = int(time.time() * 1000)
    session_id = get_current_session_id(user_id)
    
    # 1. Log to tool journey (chronological sequence)
    journey_ref = db.reference(f"analytics/{user_id}/toolJourney")
    journey_entry = {
        'timestamp': timestamp,
        'tool': tool_name,
        'interactionType': interaction_type,
        'stage': tlc_stage,
        'sessionId': session_id,
        'metadata': metadata or {}
    }
    journey_key = journey_ref.push(journey_entry).key
    
    # 2. Increment tool usage counter
    usage_ref = db.reference(f"analytics/{user_id}/toolUsage/{tool_name}")
    current_count = usage_ref.get() or 0
    usage_ref.set(current_count + 1)
    
    # 3. Check for TLC stage transition
    _check_stage_transition(user_id, tlc_stage, tool_name, session_id)

    # 4. Update tool-switching matrix
    _update_tool_transition_matrix(user_id, tool_name)
    
    # 5. Update last active timestamp + session interaction count
    session_ref = db.reference(f"analytics/{user_id}/sessionMetadata")
    session_data = session_ref.get() or {}
    session_ref.update({
        'lastActiveTimestamp': timestamp,
        'totalInteractions': (session_data.get('totalInteractions', 0) + 1),
        'currentTool': tool_name,
        'currentStage': tlc_stage,
    })

    # 6. Track furthest TLC stage reached
    _update_furthest_stage(user_id, tlc_stage)

    # 7. Accumulate time-in-stage
    _accrue_stage_time(user_id, tlc_stage, session_data.get('lastActiveTimestamp'), timestamp)
    
    return {
        'journeyKey': journey_key,
        'timestamp': timestamp,
        'sessionId': session_id
    }


def _check_stage_transition(user_id, new_stage, tool_name, session_id):
    """
    Detect and log TLC stage transitions.
    Backward transitions = recursion events — the key signal for non-linear TLC claim.
    """
    journey_ref = db.reference(f"analytics/{user_id}/toolJourney")
    try:
        recent = journey_ref.order_by_child('timestamp').limit_to_last(2).get()
    except Exception:
        return

    if not recent or len(recent) < 2:
        return

    entries = sorted(recent.values(), key=lambda x: x['timestamp'])
    prev_stage = entries[-2].get('stage')

    if not prev_stage or prev_stage == new_stage:
        return

    stage_order = ['building_knowledge', 'modelling', 'joint_construction', 'independent_construction']

    try:
        prev_idx = stage_order.index(prev_stage)
        new_idx = stage_order.index(new_stage)

        if new_idx > prev_idx:
            transition_type = 'forward'
        elif new_idx < prev_idx:
            transition_type = 'backward'  # RECURSION
        else:
            transition_type = 'lateral'
    except ValueError:
        transition_type = 'unknown'

    timestamp = int(time.time() * 1000)

    # Log to stage transitions list
    transitions_ref = db.reference(f"analytics/{user_id}/stageTransitions")
    transitions_ref.push({
        'timestamp': timestamp,
        'from': prev_stage,
        'to': new_stage,
        'tool': tool_name,
        'transitionType': transition_type,
        'sessionId': session_id
    })

    # Increment recursion counter if backward
    if transition_type == 'backward':
        summary_ref = db.reference(f"analytics/{user_id}/sessionMetadata")
        session_data = summary_ref.get() or {}
        summary_ref.update({
            'recursionCount': (session_data.get('recursionCount', 0) + 1)
        })


def _update_tool_transition_matrix(user_id, new_tool):
    """
    Track which tool the user came from → went to.
    Builds the transition matrix for post-study analysis.
    Stored as analytics/{uid}/toolTransitions/{from_tool}/{to_tool}: count
    """
    try:
        session_ref = db.reference(f"analytics/{user_id}/sessionMetadata")
        session_data = session_ref.get() or {}
        prev_tool = session_data.get('currentTool')

        if prev_tool and prev_tool != new_tool:
            matrix_ref = db.reference(
                f"analytics/{user_id}/toolTransitions/{prev_tool}/{new_tool}"
            )
            count = matrix_ref.get() or 0
            matrix_ref.set(count + 1)

            # Also track re-use rate: has this tool been used before?
            reuse_ref = db.reference(f"analytics/{user_id}/toolReuse/{new_tool}")
            reuse_data = reuse_ref.get() or {'visits': 0, 'isReuse': False}
            visits = reuse_data.get('visits', 0) + 1
            reuse_ref.set({
                'visits': visits,
                'isReuse': visits > 1
            })
    except Exception:
        pass  # Never let matrix tracking break the main log


def _update_furthest_stage(user_id, new_stage):
    """
    Track the furthest TLC stage a student has ever reached.
    Used for post-study stage distribution analysis.
    """
    stage_order = ['building_knowledge', 'modelling', 'joint_construction', 'independent_construction']
    try:
        summary_ref = db.reference(f"analytics/{user_id}/sessionMetadata")
        current_furthest = (summary_ref.get() or {}).get('furthestStageReached', 'building_knowledge')
        try:
            current_idx = stage_order.index(current_furthest)
            new_idx = stage_order.index(new_stage)
            if new_idx > current_idx:
                summary_ref.update({'furthestStageReached': new_stage})
        except ValueError:
            pass
    except Exception:
        pass


def _accrue_stage_time(user_id, current_stage, last_active_ms, now_ms):
    """
    Accumulate time spent in each TLC stage between interactions.
    Capped at 10 minutes per gap to avoid polluting data on long idle periods.
    """
    if not last_active_ms:
        return
    try:
        gap_ms = now_ms - last_active_ms
        if gap_ms <= 0 or gap_ms > 600_000:  # Cap at 10 minutes
            return
        stage_time_ref = db.reference(f"analytics/{user_id}/stageTimeMs/{current_stage}")
        current = stage_time_ref.get() or 0
        stage_time_ref.set(current + gap_ms)
    except Exception:
        pass


# ============================================
# FEATURE-SPECIFIC LOGGING HELPERS
# ============================================

def log_story_map_generation(user_id, input_text, nodes_extracted, links_extracted, processing_time_ms):
    """Log when user generates a story map from text."""
    metadata = {
        'inputLength': len(input_text),
        'wordCount': len(input_text.split()),
        'nodesExtracted': nodes_extracted,
        'linksExtracted': links_extracted,
        'processingTimeMs': processing_time_ms
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='generate',
        tlc_stage='modelling',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    gen_count = feature_ref.child('totalGenerations').get() or 0
    feature_ref.child('totalGenerations').set(gen_count + 1)
    feature_ref.child('generationTriggers').push(metadata)


def log_story_map_analysis(user_id, overall_score, issues_found, genre_inferred, genre_confidence):
    """Log when user runs story map analysis."""
    metadata = {
        'overallScore': overall_score,
        'issuesFound': len(issues_found),
        'issuesBySeverity': _count_by_severity(issues_found),
        'genreInferred': genre_inferred,
        'genreConfidence': genre_confidence
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='storyMap',
        interaction_type='analyze',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    analysis_count = feature_ref.child('totalAnalyses').get() or 0
    feature_ref.child('totalAnalyses').set(analysis_count + 1)
    feature_ref.child('analysisResults').push({
        'timestamp': int(time.time() * 1000),
        **metadata,
        'issues': issues_found
    })


def log_book_recommendation(user_id, extracted_elements, books_returned, books_viewed_count):
    """Log when user requests book recommendations."""
    metadata = {
        'genre': extracted_elements.get('genre', {}).get('primary'),
        'themes': [t['name'] for t in extracted_elements.get('themes', [])],
        'extractionConfidence': extracted_elements.get('overallConfidence', 0),
        'booksReturned': books_returned,
        'booksViewed': books_viewed_count
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='bookRecs',
        interaction_type='generate',
        tlc_stage='building_knowledge',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/bookRecommendations")
    rec_count = feature_ref.child('totalRecommendationRequests').get() or 0
    feature_ref.child('totalRecommendationRequests').set(rec_count + 1)
    feature_ref.child('recommendations').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_timeline_coherence(user_id, event_count, overall_score, issues_found, genre_used):
    """Log when user runs timeline coherence check."""
    metadata = {
        'eventCount': event_count,
        'overallScore': overall_score,
        'issuesFound': len(issues_found),
        'genreUsed': genre_used
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='timeline',
        interaction_type='coherence_check',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
    coherence_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/timelineCoherenceScores")
    scores = coherence_ref.get() or []
    scores.append(overall_score)
    coherence_ref.set(scores)
    feature_ref.child('coherenceChecks').push({
        'timestamp': int(time.time() * 1000),
        **metadata,
        'issues': issues_found
    })


def log_chat_message(user_id, chat_mode, message_role, message_length, current_stage=None):
    """Log chat interaction (BS or DT)."""
    tool_name = 'bsChatbot' if chat_mode == 'brainstorming' else 'dtChatbot'
    
    metadata = {
        'messageRole': message_role,
        'messageLength': message_length,
        'currentStage': current_stage
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name=tool_name,
        interaction_type='message',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/reflectiveChatbot")
    total_messages = feature_ref.child('totalMessages').get() or 0
    feature_ref.child('totalMessages').set(total_messages + 1)
    
    if message_role == 'user':
        user_messages = feature_ref.child('userMessages').get() or 0
        feature_ref.child('userMessages').set(user_messages + 1)


def log_feedback_submission(user_id, word_count, overall_score, category_scores):
    """Log when user submits draft for feedback."""
    metadata = {
        'wordCount': word_count,
        'overallScore': overall_score,
        'categoryScores': category_scores
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name='feedback',
        interaction_type='submit',
        tlc_stage='independent_construction',
        metadata=metadata
    )
    
    scores_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/feedbackScores")
    scores = scores_ref.get() or []
    scores.append(overall_score)
    scores_ref.set(scores)
    
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/feedbackAssistant")
    submissions = feature_ref.child('totalSubmissions').get() or 0
    feature_ref.child('totalSubmissions').set(submissions + 1)


# ============================================
# WORLD AI LOGGING
# TLC Stage: Joint Construction — AI as Reflective Guide
# ============================================

def log_world_ai_template_suggestion(user_id, item_type, fields_suggested, template_choice):
    """
    Log when the AI suggests a template for a new world item.
    Called from /worldbuilding/suggest-template endpoint.

    Args:
        user_id (str): Firebase user ID
        item_type (str): The type label the student gave (e.g. 'Magic System')
        fields_suggested (int): Number of fields the AI returned
        template_choice (str): 'ai' | 'manual' | 'inherit' | 'none'
    """
    metadata = {
        'itemType': item_type,
        'fieldsSuggested': fields_suggested,
        'templateChoice': template_choice,
    }

    log_tool_interaction(
        user_id=user_id,
        tool_name='worldAI',
        interaction_type='template_suggestion',
        tlc_stage='joint_construction',
        metadata=metadata
    )

    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/worldAI")

    # Total AI suggestion requests
    total = feature_ref.child('totalTemplateSuggestions').get() or 0
    feature_ref.child('totalTemplateSuggestions').set(total + 1)

    # Count by template choice (ai / manual / inherit / none)
    choice_count = feature_ref.child(f'templateChoices/{template_choice}').get() or 0
    feature_ref.child(f'templateChoices/{template_choice}').set(choice_count + 1)

    # Log each suggestion event for longitudinal analysis
    feature_ref.child('suggestionHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_world_item_created(user_id, item_type, fields_accepted, fields_suggested,
                            fields_added_manually, template_choice):
    """
    Log when a new world item is saved.
    Called from WorldBuildingWidget after handleSaveNewItem succeeds.
    Sent via /api/log-ui-interaction from the frontend.

    Args:
        user_id (str): Firebase user ID
        item_type (str): e.g. 'Character', 'Location'
        fields_accepted (int): AI-suggested fields the student accepted
        fields_suggested (int): Total fields AI suggested
        fields_added_manually (int): Fields the student added themselves
        template_choice (str): 'ai' | 'manual' | 'inherit' | 'none'
    """
    acceptance_rate = (
        round(fields_accepted / fields_suggested, 2) if fields_suggested > 0 else None
    )

    metadata = {
        'itemType': item_type,
        'templateChoice': template_choice,
        'fieldsSuggested': fields_suggested,
        'fieldsAccepted': fields_accepted,
        'fieldsAddedManually': fields_added_manually,
        'acceptanceRate': acceptance_rate,
    }

    log_tool_interaction(
        user_id=user_id,
        tool_name='worldAI',
        interaction_type='item_created',
        tlc_stage='joint_construction',
        metadata=metadata
    )

    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/worldAI")

    total_items = feature_ref.child('totalItemsCreated').get() or 0
    feature_ref.child('totalItemsCreated').set(total_items + 1)

    # Running acceptance rate stats
    acc_stats = feature_ref.child('acceptanceRateStats').get() or {
        'total': 0, 'count': 0
    }
    if acceptance_rate is not None:
        acc_stats['total'] = acc_stats.get('total', 0) + acceptance_rate
        acc_stats['count'] = acc_stats.get('count', 0) + 1
        acc_stats['average'] = round(acc_stats['total'] / acc_stats['count'], 2)
        feature_ref.child('acceptanceRateStats').set(acc_stats)

    # Item type distribution
    type_count = feature_ref.child(f'itemTypeDistribution/{item_type}').get() or 0
    feature_ref.child(f'itemTypeDistribution/{item_type}').set(type_count + 1)

    # Log creation event
    feature_ref.child('creationHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_world_field_completion(user_id, item_type, total_fields, filled_fields):
    """
    Log what fraction of custom fields a student actually filled in.
    Called from the frontend when an item is saved/edited.
    High completion = template was useful. Low completion = template ignored.

    Args:
        user_id (str): Firebase user ID
        item_type (str): Item type label
        total_fields (int): Number of custom fields on the item
        filled_fields (int): Number that had a non-empty value at save time
    """
    if total_fields == 0:
        return

    completion_rate = round(filled_fields / total_fields, 2)

    metadata = {
        'itemType': item_type,
        'totalFields': total_fields,
        'filledFields': filled_fields,
        'completionRate': completion_rate,
    }

    log_tool_interaction(
        user_id=user_id,
        tool_name='worldAI',
        interaction_type='field_completion',
        tlc_stage='joint_construction',
        metadata=metadata
    )

    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/worldAI")

    # Running completion rate stats
    comp_stats = feature_ref.child('fieldCompletionStats').get() or {
        'total': 0, 'count': 0
    }
    comp_stats['total'] = comp_stats.get('total', 0) + completion_rate
    comp_stats['count'] = comp_stats.get('count', 0) + 1
    comp_stats['average'] = round(comp_stats['total'] / comp_stats['count'], 2)
    feature_ref.child('fieldCompletionStats').set(comp_stats)

    feature_ref.child('completionHistory').push({
        'timestamp': int(time.time() * 1000),
        **metadata
    })


def log_world_item_edited(user_id, item_type, fields_added, fields_removed):
    """
    Log when a student returns to edit a world item (manage fields or edit values).
    Called via /api/log-ui-interaction from ItemDetailsModal.

    Args:
        user_id (str): Firebase user ID
        item_type (str): Item type label
        fields_added (int): New fields added in this edit session
        fields_removed (int): Fields removed in this edit session
    """
    metadata = {
        'itemType': item_type,
        'fieldsAdded': fields_added,
        'fieldsRemoved': fields_removed,
    }

    log_tool_interaction(
        user_id=user_id,
        tool_name='worldAI',
        interaction_type='item_edited',
        tlc_stage='joint_construction',
        metadata=metadata
    )

    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/worldAI")
    edits = feature_ref.child('totalItemEdits').get() or 0
    feature_ref.child('totalItemEdits').set(edits + 1)


# ============================================
# UTILITY FUNCTIONS
# ============================================

def _count_by_severity(issues):
    """Helper to count issues by severity level."""
    counts = {'high': 0, 'medium': 0, 'low': 0}
    for issue in issues:
        severity = issue.get('severity', 'low')
        counts[severity] = counts.get(severity, 0) + 1
    return counts