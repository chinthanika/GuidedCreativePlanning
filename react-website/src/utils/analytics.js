// src/utils/analytics.js
/**
 * Frontend analytics utilities for tracking user interactions.
 * Handles both page views and UI interactions.
 */

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

/**
 * Track when user navigates to a tool page.
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} pageName - 'mentorText' | 'storyMap' | 'timeline' | 'bookRecs' | 'chat' | 'feedback'
 * @param {string} tlcStage - 'building_knowledge' | 'modelling' | 'joint_construction' | 'independent_construction'
 */
export async function logPageView(userId, pageName, tlcStage) {
  if (!userId || !pageName) {
    console.warn('[Analytics] logPageView: Missing userId or pageName');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/log-page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        pageName,
        tlcStage,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.error('[Analytics] Page view log failed:', error);
    // Don't block UI if logging fails
  }
}

/**
 * Track when user exits a tool page.
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} pageName - Tool page name
 * @param {number} durationMs - Time spent on page in milliseconds
 */
export async function logPageExit(userId, pageName, durationMs) {
  if (!userId || !pageName) {
    console.warn('[Analytics] logPageExit: Missing userId or pageName');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/log-page-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        pageName,
        durationMs,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.error('[Analytics] Page exit log failed:', error);
    // Don't block UI if logging fails
  }
}

/**
 * Track UI interactions (button clicks, saves, etc.)
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} feature - 'mentorText' | 'storyMap' | 'timeline' | 'bookRecs' | 'chat' | 'feedback'
 * @param {string} action - Action type (e.g., 'open_analysis', 'search', 'filter', 'save_book')
 * @param {object} metadata - Feature-specific data
 */
export async function logUIInteraction(userId, feature, action, metadata = {}) {
  if (!userId || !feature || !action) {
    console.warn('[Analytics] logUIInteraction: Missing required fields');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature,
        action,
        metadata
      })
    });
  } catch (error) {
    console.error('[Analytics] UI interaction log failed:', error);
    // Don't block UI if logging fails
  }
}

/**
 * Debounce helper for search interactions.
 * 
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 500) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create a debounced search logger.
 * Usage:
 * const logSearch = createDebouncedSearchLogger(userId, 'mentorText', analyses);
 * logSearch('fantasy'); // Will only log after 500ms of no typing
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} feature - Feature name
 * @param {Array} data - Data to search through
 * @returns {Function} Debounced search logger
 */
export function createDebouncedSearchLogger(userId, feature, data) {
  return debounce((query) => {
    if (query.length >= 3) {
      // Only log meaningful searches (3+ characters)
      const resultsCount = data.filter(item => 
        JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
      ).length;
      
      logUIInteraction(userId, feature, 'search', {
        query,
        resultsCount
      });
    }
  }, 500);
}

/**
 * Track feature usage time (for modals, detail views, etc.)
 * Returns a cleanup function to call when feature is closed.
 * 
 * Usage:
 * const stopTracking = trackFeatureTime(userId, 'mentorText', 'view_analysis', { analysisId });
 * // ... user interacts with feature ...
 * stopTracking(); // Logs duration when done
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} feature - Feature name
 * @param {string} action - Action being tracked
 * @param {object} metadata - Additional metadata
 * @returns {Function} Cleanup function to stop tracking
 */
export function trackFeatureTime(userId, feature, action, metadata = {}) {
  const startTime = Date.now();
  
  return () => {
    const duration = Date.now() - startTime;
    logUIInteraction(userId, feature, `${action}_complete`, {
      ...metadata,
      durationMs: duration
    });
  };
}

/**
 * Batch logger for multiple rapid interactions.
 * Useful for drag-and-drop, graph editing, etc.
 * 
 * Usage:
 * const batchLogger = createBatchLogger(userId, 'storyMap');
 * batchLogger.log('move_node', { nodeId: '1' });
 * batchLogger.log('move_node', { nodeId: '2' });
 * batchLogger.flush(); // Sends all batched logs
 * 
 * @param {string} userId - Firebase user ID
 * @param {string} feature - Feature name
 * @returns {Object} Batch logger with log() and flush() methods
 */
export function createBatchLogger(userId, feature) {
  let batch = [];
  let flushTimeout = null;
  
  const flush = async () => {
    if (batch.length === 0) return;
    
    try {
      await fetch(`${API_BASE}/api/log-ui-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          feature,
          interactions: batch
        })
      });
      batch = [];
    } catch (error) {
      console.error('[Analytics] Batch log failed:', error);
      batch = []; // Clear batch even on error
    }
  };
  
  return {
    log: (action, metadata = {}) => {
      batch.push({
        action,
        metadata,
        timestamp: Date.now()
      });
      
      // Auto-flush after 5 seconds of inactivity
      clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 5000);
      
      // Auto-flush if batch gets too large
      if (batch.length >= 10) {
        flush();
      }
    },
    flush
  };
}

export async function logStoryMapRender(userId, nodes, links) {
  if (!userId) {
    console.warn('[StoryMapAnalytics] Missing userId');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        nodeCount: nodes.length,
        linkCount: links.length,
        nodes,  // For calculating isolated nodes
        links
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Render log failed:', error);
  }
}

/**
 * Log node action (create, edit, delete, view)
 */
export async function logNodeAction(userId, actionType, nodeData, processingTimeMs = null) {
  if (!userId || !actionType || !nodeData) {
    console.warn('[StoryMapAnalytics] Missing required fields for node action');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-node-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        actionType,
        nodeData,
        processingTimeMs
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Node action log failed:', error);
  }
}

/**
 * Log link action (create, edit, delete, view)
 */
export async function logLinkAction(userId, actionType, linkData) {
  if (!userId || !actionType || !linkData) {
    console.warn('[StoryMapAnalytics] Missing required fields for link action');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-link-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        actionType,
        linkData
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Link action log failed:', error);
  }
}

/**
 * Log node merge operation
 * CRITICAL metric for duplicate detection effectiveness
 */
export async function logNodeMerge(userId, mergedNodeCount, primaryNodeLabel, processingTimeMs = null) {
  if (!userId || !mergedNodeCount || !primaryNodeLabel) {
    console.warn('[StoryMapAnalytics] Missing required fields for merge');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        mergedNodeCount,
        primaryNodeLabel,
        processingTimeMs
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Merge log failed:', error);
  }
}

/**
 * Log analysis panel interactions
 * Tracks engagement with AI feedback (AI as Deconstructor)
 */
export async function logAnalysisPanelInteraction(
  userId, 
  interactionType, 
  durationMs = null,
  issueInteractedWith = null
) {
  if (!userId || !interactionType) {
    console.warn('[StoryMapAnalytics] Missing required fields for panel interaction');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-analysis-panel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        interactionType,
        durationMs,
        issueInteractedWith
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Panel interaction log failed:', error);
  }
}

/**
 * Log view toggle (node vs label view)
 */
export async function logViewToggle(userId, viewMode) {
  if (!userId || !viewMode) {
    console.warn('[StoryMapAnalytics] Missing required fields for view toggle');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-view-toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        viewMode
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] View toggle log failed:', error);
  }
}

/**
 * Log merge mode interactions
 */
export async function logMergeModeAction(userId, actionType, nodesSelected = null) {
  if (!userId || !actionType) {
    console.warn('[StoryMapAnalytics] Missing required fields for merge mode');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-merge-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        actionType,
        nodesSelected
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Merge mode log failed:', error);
  }
}

/**
 * Create a time tracker for analysis panel
 * Returns cleanup function to log duration on close
 */
export function trackAnalysisPanelTime(userId, issueInteractedWith = null) {
  const startTime = Date.now();
  
  return () => {
    const duration = Date.now() - startTime;
    logAnalysisPanelInteraction(userId, 'close', duration, issueInteractedWith);
  };
}

/**
 * Batch logger for rapid graph manipulations
 * Useful for drag-and-drop node positioning
 */
export function createGraphBatchLogger(userId) {
  let batch = [];
  let flushTimeout = null;
  
  const flush = async () => {
    if (batch.length === 0) return;
    
    try {
      // Group by action type
      const grouped = batch.reduce((acc, action) => {
        const type = action.actionType;
        if (!acc[type]) acc[type] = [];
        acc[type].push(action);
        return acc;
      }, {});
      
      // Send batch for each action type
      for (const [actionType, actions] of Object.entries(grouped)) {
        // For now, just log the count
        console.log(`[StoryMapAnalytics] Batched ${actions.length} ${actionType} actions`);
      }
      
      batch = [];
    } catch (error) {
      console.error('[StoryMapAnalytics] Batch flush failed:', error);
      batch = [];
    }
  };
  
  return {
    logNodeAction: (actionType, nodeData) => {
      batch.push({
        type: 'node',
        actionType,
        nodeData,
        timestamp: Date.now()
      });
      
      // Auto-flush after 3 seconds of inactivity
      clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 3000);
      
      // Auto-flush if batch gets too large
      if (batch.length >= 10) {
        flush();
      }
    },
    flush
  };
}

/**
 * Helper to calculate iteration metrics
 * Call this when user makes significant changes after analysis
 */
export async function logIterationPattern(userId, iterationData) {
  /**
   * iterationData = {
   *   mapVersion: int,
   *   actionsTaken: int,
   *   timeSpent: int (ms),
   *   triggeredByAnalysis: bool
   * }
   */
  if (!userId || !iterationData) {
    console.warn('[StoryMapAnalytics] Missing iteration data');
    return;
  }
  
  try {
    await fetch(`${API_BASE}/api/story-map/log-iteration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        iterationData
      })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Iteration log failed:', error);
  }
}

// ============================================
// GRAPH VISUALIZATION INTERACTIONS
// ============================================

/**
 * Log graph visualization interactions (zoom, pan, hover)
 * @param {string} userId - Firebase user ID
 * @param {string} interactionType - 'zoom' | 'pan' | 'node_hover' | 'link_hover'
 * @param {object} metadata - Interaction-specific data
 */
export async function logGraphInteraction(userId, interactionType, metadata = {}) {
  if (!userId) return;
  
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'storyMap',
        action: `graph_${interactionType}`,
        metadata: {
          ...metadata,
          timestamp: Date.now()
        }
      })
    });
  } catch (error) {
    console.error('[Analytics] Graph interaction log failed:', error);
  }
}

// ============================================
// COGNITIVE LOAD INDICATORS
// ============================================

/**
 * Log cognitive load indicators (errors, modal abandonment, repeated edits)
 * @param {string} userId - Firebase user ID
 * @param {string} indicatorType - 'validation_error' | 'modal_abandoned' | 'repeated_edit' | 'undo' | 'redo'
 * @param {object} metadata - Context data
 */
export async function logCognitiveLoad(userId, indicatorType, metadata = {}) {
  if (!userId) return;
  
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'storyMap',
        action: `cognitive_load_${indicatorType}`,
        metadata: {
          ...metadata,
          timestamp: Date.now()
        }
      })
    });
  } catch (error) {
    console.error('[Analytics] Cognitive load log failed:', error);
  }
}

// ============================================
// TEMPLATE USAGE TRACKING
// ============================================

/**
 * Log template usage (node/link creation with field completion data)
 * @param {string} userId - Firebase user ID
 * @param {string} templateType - 'node_creation' | 'link_creation' | 'node_edit' | 'link_edit'
 * @param {object} metadata - Template-specific data
 */
export async function logTemplateUsage(userId, templateType, metadata = {}) {
  if (!userId) return;
  
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'storyMap',
        action: `template_${templateType}`,
        metadata: {
          ...metadata,
          timestamp: Date.now()
        }
      })
    });
  } catch (error) {
    console.error('[Analytics] Template usage log failed:', error);
  }
}

// ============================================
// BATCH LOGGER (for rapid interactions)
// ============================================

/**
 * Create a batch logger for multiple rapid interactions
 * Useful for drag-and-drop, graph editing, etc.
 */
export function createStoryMapBatchLogger(userId) {
  let batch = [];
  let flushTimeout = null;
  
  const flush = async () => {
    if (batch.length === 0) return;
    
    try {
      await fetch(`${API_BASE}/api/log-ui-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          feature: 'storyMap',
          interactions: batch
        })
      });
      batch = [];
    } catch (error) {
      console.error('[Analytics] Batch log failed:', error);
      batch = [];
    }
  };
  
  return {
    log: (action, metadata = {}) => {
      batch.push({
        action,
        metadata,
        timestamp: Date.now()
      });
      
      // Auto-flush after 5 seconds of inactivity
      clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 5000);
      
      // Auto-flush if batch gets too large
      if (batch.length >= 10) {
        flush();
      }
    },
    flush
  };
}

// ============================================
// TIMELINE ANALYTICS
// TLC Stage: Joint Construction — AI as Reflective Guide
// ============================================

/**
 * Log Timeline page entry.
 * Returns a pageViewKey the component stores and sends back on exit,
 * so the backend can match entry → exit and compute duration.
 *
 * Usage (in useEffect on mount):
 *   const key = await logTimelinePageView(userId);
 *   pageViewKeyRef.current = key;
 *
 * @param {string} userId - Firebase user ID
 * @returns {string|null} pageViewKey for later use in logTimelinePageExit
 */
export async function logTimelinePageView(userId) {
  if (!userId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/timeline/log-page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    return data?.pageViewKey ?? null;
  } catch (error) {
    console.warn('[TimelineAnalytics] logTimelinePageView failed:', error);
    return null;
  }
}

/**
 * Log Timeline page exit with duration.
 * Uses navigator.sendBeacon when available so the log fires reliably
 * even if the user closes the tab.
 *
 * Usage (in useEffect cleanup / beforeunload):
 *   logTimelinePageExit(userId, Date.now() - entryTime, pageViewKeyRef.current);
 *
 * @param {string} userId        - Firebase user ID
 * @param {number} durationMs    - Time spent on page in milliseconds
 * @param {string|null} pageViewKey - Key returned by logTimelinePageView
 */
export function logTimelinePageExit(userId, durationMs, pageViewKey = null) {
  if (!userId) return;
  const payload = JSON.stringify({ userId, durationMs, pageViewKey });

  // sendBeacon is fire-and-forget and survives page unload
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(`${API_BASE}/api/timeline/log-page-exit`, blob);
  } else {
    // Fallback for browsers without sendBeacon
    fetch(`${API_BASE}/api/timeline/log-page-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true   // Chrome/Edge — keeps request alive past page unload
    }).catch(() => {});
  }
}

/**
 * Log Timeline event actions (created / edited / reordered / deleted).
 *
 * @param {string} userId     - Firebase user ID
 * @param {'created'|'edited'|'reordered'|'deleted'} action
 * @param {object} event      - The event object { id, stage, isMainEvent, ... }
 * @param {object} [extra]    - Extra fields per action type:
 *   created:   { hasDate: bool, descriptionLength: number }
 *   reordered: { fromIndex: number, toIndex: number }
 */
export async function logTimelineEventAction(userId, action, event, extra = {}) {
  if (!userId || !action || !event) return;
  try {
    await fetch(`${API_BASE}/api/timeline/log-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action,
        eventId:     event.id          || '',
        stage:       event.stage       || 'unknown',
        isMainEvent: event.isMainEvent || false,
        ...extra
      })
    });
  } catch (error) {
    console.warn('[TimelineAnalytics] logTimelineEventAction failed:', error);
  }
}

/**
 * Log which Timeline layout mode the student is using.
 * Call once on mount (default) and again whenever the student switches.
 *
 * @param {string} userId - Firebase user ID
 * @param {'linear'|'freytag'} mode
 */
export async function logTimelineMode(userId, mode) {
  if (!userId || !mode) return;
  try {
    await fetch(`${API_BASE}/api/timeline/log-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mode })
    });
  } catch (error) {
    console.warn('[TimelineAnalytics] logTimelineMode failed:', error);
  }
}

// ============================================
// CHATBOT ANALYTICS
// TLC Stage: Joint Construction — AI as Reflective Guide
// ============================================

/**
 * Log chatbot page entry.
 * Call in useEffect on mount inside ChatWindow.
 * Returns a pageViewKey to pass back on exit.
 *
 * @param {string} userId - Firebase user ID
 * @returns {string|null} pageViewKey
 */
export async function logChatPageView(userId) {
  if (!userId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/log-page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        pageName: 'reflectiveChatbot',
        tlcStage: 'joint_construction',
        timestamp: Date.now()
      })
    });
    const data = await res.json();
    return data?.pageViewId ?? null;
  } catch (error) {
    console.warn('[ChatAnalytics] logChatPageView failed:', error);
    return null;
  }
}

/**
 * Log chatbot page exit with duration.
 * Uses sendBeacon so it fires reliably on tab close.
 * Call in useEffect cleanup / beforeunload inside ChatWindow.
 *
 * @param {string} userId     - Firebase user ID
 * @param {number} durationMs - Time spent on page
 * @param {string|null} pageViewId - ID returned by logChatPageView
 */
export function logChatPageExit(userId, durationMs, pageViewId = null) {
  if (!userId) return;
  const payload = JSON.stringify({
    userId,
    pageName: 'reflectiveChatbot',
    durationMs,
    pageViewId,
    timestamp: Date.now()
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(`${API_BASE}/api/log-page-exit`, blob);
  } else {
    fetch(`${API_BASE}/api/log-page-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }
}

/**
 * Log when a new chat session starts and which mode was chosen.
 * Also increments the per-user total session counter on the backend.
 * Call this immediately after a new session is created in ChatWindow.
 *
 * @param {string} userId    - Firebase user ID
 * @param {string} sessionId - The new session ID
 * @param {'brainstorming'|'deepthinking'} mode - Starting mode
 */
export async function logChatSessionStart(userId, sessionId, mode) {
  if (!userId || !sessionId) return;
  try {
    await fetch(`${API_BASE}/api/chat/log-session-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionId, mode, timestamp: Date.now() })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatSessionStart failed:', error);
  }
}

/**
 * Log when the student sets (or changes) their focus area at the start of a session.
 * Call this when the user sends their first message or explicitly picks a focus.
 *
 * @param {string} userId    - Firebase user ID
 * @param {string} sessionId - Current session ID
 * @param {string} focusArea - 'character' | 'plot' | 'setting' | 'theme' | 'conflict'
 * @param {'brainstorming'|'deepthinking'} mode
 */
export async function logChatFocusArea(userId, sessionId, focusArea, mode) {
  if (!userId || !sessionId || !focusArea) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: mode === 'brainstorming' ? 'bsChatbot' : 'dtChatbot',
        action: 'focus_area_set',
        metadata: { sessionId, focusArea, mode, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatFocusArea failed:', error);
  }
}

/**
 * Log when the student switches mode (BS ↔ DT) mid-session.
 *
 * @param {string} userId    - Firebase user ID
 * @param {string} sessionId - Current session ID
 * @param {'brainstorming'|'deepthinking'} fromMode
 * @param {'brainstorming'|'deepthinking'} toMode
 */
export async function logChatModeSwitch(userId, sessionId, fromMode, toMode) {
  if (!userId || !sessionId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'reflectiveChatbot',
        action: 'mode_switch',
        metadata: { sessionId, fromMode, toMode, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatModeSwitch failed:', error);
  }
}

/**
 * Log a user message with its length so the backend can compute
 * per-session message-length trends (the primary metacognitive deepening signal).
 *
 * Call this in handleSend() in ChatWindow, BEFORE awaiting sendMessage(),
 * so it captures the raw user input length.
 *
 * @param {string} userId      - Firebase user ID
 * @param {string} sessionId   - Current session ID
 * @param {number} messageLength - Character count of the user message
 * @param {number} messageIndex  - Position in session (0-based count of user msgs so far)
 * @param {'brainstorming'|'deepthinking'} mode
 * @param {string|null} currentStage - BS CPS stage if known (Clarify/Ideate/Develop/Implement)
 */
export async function logChatUserMessage(userId, sessionId, messageLength, messageIndex, mode, currentStage = null) {
  if (!userId || !sessionId) return;
  try {
    await fetch(`${API_BASE}/api/chat/log-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        sessionId,
        messageLength,
        messageIndex,
        mode,
        currentStage,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatUserMessage failed:', error);
  }
}

/**
 * Log a CPS stage transition for Brainstorming mode.
 * This mirrors the stage switch into the main analytics tree
 * so it appears in the cross-study stage transition log.
 *
 * Call this whenever BSConversationFlowManager.switch_stage() is triggered.
 * The best place is right after the backend returns a response that includes
 * a stage change (you can detect this by comparing stage before/after).
 *
 * @param {string} userId    - Firebase user ID
 * @param {string} sessionId - Current session ID
 * @param {string} fromStage - e.g. 'Clarify'
 * @param {string} toStage   - e.g. 'Ideate'
 * @param {'auto'|'manual'} trigger - Whether user or system triggered it
 */
export async function logChatStageTransition(userId, sessionId, fromStage, toStage, trigger = 'auto') {
  if (!userId || !sessionId || !fromStage || !toStage) return;
  try {
    await fetch(`${API_BASE}/api/chat/log-stage-transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        sessionId,
        fromStage,
        toStage,
        trigger,
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatStageTransition failed:', error);
  }
}


// Export all functions
export default {
  logPageView,
  logPageExit,
  logUIInteraction,
  debounce,
  createDebouncedSearchLogger,
  trackFeatureTime,
  createBatchLogger,
  logStoryMapRender,
  logNodeAction,
  logLinkAction,
  logNodeMerge,
  logAnalysisPanelInteraction,
  logViewToggle,
  logMergeModeAction,
  trackAnalysisPanelTime,
  createGraphBatchLogger,
  logIterationPattern,
  logGraphInteraction,
  logCognitiveLoad,
  logTemplateUsage,
  createStoryMapBatchLogger,
  // Timeline
  logTimelinePageView,
  logTimelinePageExit,
  logTimelineEventAction,
  logTimelineMode,
  // Chatbot
  logChatPageView,
  logChatPageExit,
  logChatSessionStart,
  logChatFocusArea,
  logChatModeSwitch,
  logChatUserMessage,
  logChatStageTransition
};