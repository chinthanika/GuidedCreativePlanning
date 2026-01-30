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
    
    # Get most recent session. Wrap query in try/except because
    # ordering queries require an index ('.indexOn') in Realtime DB rules;
    # if the index is missing the query can raise and break analytics logging.
    try:
        recent_sessions = sessions_ref.order_by_child('lastActive').limit_to_last(1).get()
    except Exception as e:
        # Fail open: create a new session instead of crashing analytics
        try:
            new_session_id = f"session_{int(time.time() * 1000)}"
            sessions_ref.child(new_session_id).set({
                'startTime': int(time.time() * 1000),
                'lastActive': int(time.time() * 1000)
            })
            return new_session_id
        except Exception:
            # If even this fails, give a fallback session id
            return f"session_fallback_{int(time.time() * 1000)}"

    if recent_sessions:
        session_id, session_data = list(recent_sessions.items())[0]
        last_active = session_data.get('lastActive', 0)

        # If last activity was within 30 minutes, reuse session
        if (time.time() * 1000) - last_active < 1800000:  # 30 min
            # Update last active
            sessions_ref.child(session_id).update({
                'lastActive': int(time.time() * 1000)
            })
            return session_id
    
    # Create new session
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
    
    # 3. Check for stage transition
    _check_stage_transition(user_id, tlc_stage, tool_name, session_id)
    
    # 4. Update last active timestamp
    db.reference(f"analytics/{user_id}/sessionMetadata").update({
        'lastActiveTimestamp': timestamp
    })
    
    return {
        'journeyKey': journey_key,
        'timestamp': timestamp,
        'sessionId': session_id
    }


def _check_stage_transition(user_id, new_stage, tool_name, session_id):
    """
    Internal function to detect and log stage transitions.
    Identifies recursion (backward movement through TLC stages).
    """
    # Get last 2 journey entries
    journey_ref = db.reference(f"analytics/{user_id}/toolJourney")
    recent = journey_ref.order_by_child('timestamp').limit_to_last(2).get()
    
    if not recent or len(recent) < 2:
        return  # Not enough data to compare
    
    entries = sorted(recent.values(), key=lambda x: x['timestamp'])
    prev_stage = entries[-2].get('stage')
    
    if not prev_stage or prev_stage == new_stage:
        return  # No transition
    
    # Transition detected!
    stage_order = ['building_knowledge', 'modelling', 'joint_construction', 'independent_construction']
    
    try:
        prev_idx = stage_order.index(prev_stage)
        new_idx = stage_order.index(new_stage)
        
        if new_idx > prev_idx:
            transition_type = 'forward'
        elif new_idx < prev_idx:
            transition_type = 'backward'  # RECURSION!
        else:
            transition_type = 'lateral'
    except ValueError:
        transition_type = 'unknown'
    
    # Log transition
    transitions_ref = db.reference(f"analytics/{user_id}/stageTransitions")
    transitions_ref.push({
        'timestamp': int(time.time() * 1000),
        'from': prev_stage,
        'to': new_stage,
        'tool': tool_name,
        'transitionType': transition_type,
        'sessionId': session_id
    })


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
        tlc_stage='modelling',  # Story map gen is Modelling stage
        metadata=metadata
    )
    
    # Also update feature-specific metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    # Increment generation count
    gen_count = feature_ref.child('totalGenerations').get() or 0
    feature_ref.child('totalGenerations').set(gen_count + 1)
    
    # Add to generation triggers log
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
        tlc_stage='joint_construction',  # Analysis is Joint Construction
        metadata=metadata
    )
    
    # Update feature metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/storyMap")
    
    analysis_count = feature_ref.child('totalAnalyses').get() or 0
    feature_ref.child('totalAnalyses').set(analysis_count + 1)
    
    # Add full analysis result
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
    
    # Update feature metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/bookRecommendations")
    
    rec_count = feature_ref.child('totalRecommendationRequests').get() or 0
    feature_ref.child('totalRecommendationRequests').set(rec_count + 1)
    
    # Add recommendation details
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
    
    # Update feature metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/timeline")
    
    # Track coherence scores over time (shows improvement)
    coherence_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/timelineCoherenceScores")
    scores = coherence_ref.get() or []
    scores.append(overall_score)
    coherence_ref.set(scores)
    
    # Add full coherence check details
    feature_ref.child('coherenceChecks').push({
        'timestamp': int(time.time() * 1000),
        **metadata,
        'issues': issues_found
    })


def log_chat_message(user_id, chat_mode, message_role, message_length, current_stage=None):
    """
    Log chat interaction (BS or DT).
    Call this AFTER saving message to chat session.
    """
    tool_name = 'bsChatbot' if chat_mode == 'brainstorming' else 'dtChatbot'
    
    metadata = {
        'messageRole': message_role,  # 'user' | 'assistant'
        'messageLength': message_length,
        'currentStage': current_stage  # For BS: Clarify, Ideate, etc.
    }
    
    log_tool_interaction(
        user_id=user_id,
        tool_name=tool_name,
        interaction_type='message',
        tlc_stage='joint_construction',
        metadata=metadata
    )
    
    # Update feature metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/reflectiveChatbot")
    
    # Increment message counts
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
    
    # Track feedback scores over time
    scores_ref = db.reference(f"analytics/{user_id}/outcomeMetrics/feedbackScores")
    scores = scores_ref.get() or []
    scores.append(overall_score)
    scores_ref.set(scores)
    
    # Update feature metrics
    feature_ref = db.reference(f"analytics/{user_id}/featureMetrics/feedbackAssistant")
    
    submissions = feature_ref.child('totalSubmissions').get() or 0
    feature_ref.child('totalSubmissions').set(submissions + 1)


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