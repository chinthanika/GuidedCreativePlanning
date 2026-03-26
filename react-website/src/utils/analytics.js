// src/utils/analytics.js
/**
 * Frontend analytics utilities for tracking user interactions.
 * Handles page views, UI interactions, world AI events, and cross-feature session tracking.
 */

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

// ============================================
// PAGE VIEW / EXIT (generic)
// ============================================

export async function logPageView(userId, pageName, tlcStage) {
  if (!userId || !pageName) return;
  try {
    const res = await fetch(`${API_BASE}/api/log-page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pageName, tlcStage, timestamp: Date.now() })
    });
    const data = await res.json();
    return data?.pageViewId ?? null;
  } catch (error) {
    console.error('[Analytics] Page view log failed:', error);
    return null;
  }
}

export function logPageExit(userId, pageName, durationMs, pageViewId = null) {
  if (!userId || !pageName) return;
  const payload = JSON.stringify({ userId, pageName, durationMs, pageViewId, timestamp: Date.now() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/api/log-page-exit`, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(`${API_BASE}/api/log-page-exit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true
    }).catch(() => {});
  }
}

// ============================================
// GENERIC UI INTERACTION
// ============================================

export async function logUIInteraction(userId, feature, action, metadata = {}) {
  if (!userId || !feature || !action) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, feature, action, metadata })
    });
  } catch (error) {
    console.error('[Analytics] UI interaction log failed:', error);
  }
}

// ============================================
// CROSS-FEATURE SESSION TRACKING
// These functions fire on every page navigation and capture the
// whole-project signals: tool journey, stage transitions, tool re-use.
// Call logToolEntry() on every page mount and logToolExit() on every unmount.
// ============================================

/**
 * Log that the student entered a tool page.
 * Fires the cross-feature tool journey entry on the backend.
 * Returns an entryTimestamp so logToolExit() can compute duration.
 *
 * TLC stage map:
 *   library / bookRecs  → building_knowledge
 *   mentorText          → modelling
 *   storyMap (generate) → modelling  /  storyMap (analyze) → joint_construction
 *   timeline / chatbot / storyWorld → joint_construction
 *   storyEditor / feedback          → independent_construction
 *
 * @param {string} userId
 * @param {string} toolName  — 'bookRecs'|'mentorText'|'storyMap'|'timeline'|'chatbot'|'worldAI'|'feedback'
 * @param {string} tlcStage  — TLC stage for this tool
 * @returns {number} entryTimestamp (ms) to pass to logToolExit
 */
export async function logToolEntry(userId, toolName, tlcStage) {
  if (!userId || !toolName) return Date.now();
  const entryTimestamp = Date.now();
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: toolName,
        action: 'tool_entry',
        metadata: { tlcStage, entryTimestamp }
      })
    });
  } catch (error) {
    console.warn('[Analytics] logToolEntry failed:', error);
  }
  return entryTimestamp;
}

/**
 * Log that the student left a tool page.
 * Uses sendBeacon so it fires reliably on tab close / navigation.
 *
 * @param {string} userId
 * @param {string} toolName
 * @param {string} tlcStage
 * @param {number} entryTimestamp  — value returned by logToolEntry
 */
export function logToolExit(userId, toolName, tlcStage, entryTimestamp) {
  if (!userId || !toolName || !entryTimestamp) return;
  const durationMs = Date.now() - entryTimestamp;
  const payload = JSON.stringify({
    userId,
    feature: toolName,
    action: 'tool_exit',
    metadata: { tlcStage, durationMs, entryTimestamp }
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${API_BASE}/api/log-ui-interaction`,
      new Blob([payload], { type: 'application/json' })
    );
  } else {
    fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true
    }).catch(() => {});
  }
}

/**
 * Convenience hook-style helper.
 * Call once at the top of each tool page component:
 *
 *   useToolTracking(userId, 'worldAI', 'joint_construction');
 *
 * It logs entry on mount and exit on unmount automatically.
 *
 * @param {string} userId
 * @param {string} toolName
 * @param {string} tlcStage
 */
export function useToolTracking(userId, toolName, tlcStage) {
  // This is a plain function that returns a useEffect-compatible pattern.
  // In the component, call it inside useEffect manually:
  //
  //   useEffect(() => {
  //     return useToolTracking(userId, 'worldAI', 'joint_construction');
  //   }, [userId]);
  //
  // Or use the React hook version below: useToolTrackingEffect
  let entryTs = null;
  logToolEntry(userId, toolName, tlcStage).then(ts => { entryTs = ts; });
  return () => {
    if (entryTs) logToolExit(userId, toolName, tlcStage, entryTs);
  };
}

// ============================================
// WORLD AI ANALYTICS
// TLC Stage: Joint Construction — AI as Reflective Guide
// ============================================

/**
 * Log when the student chooses a template option and the AI is called.
 * Call this in NewItemModal right before the AI request fires.
 *
 * @param {string} userId
 * @param {string} itemType   — e.g. 'Magic System'
 * @param {string} templateChoice — 'ai' | 'manual' | 'inherit' | 'none'
 */
export async function logWorldTemplateRequest(userId, itemType, templateChoice) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'worldAI',
        action: 'template_request',
        metadata: { itemType, templateChoice, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.warn('[WorldAnalytics] logWorldTemplateRequest failed:', error);
  }
}

/**
 * Log when a new item is saved from NewItemModal.
 * Captures acceptance rate — the key metric for whether AI scaffolding was used.
 *
 * @param {string} userId
 * @param {string} itemType
 * @param {string} templateChoice — 'ai' | 'manual' | 'inherit' | 'none'
 * @param {number} fieldsSuggested — how many fields AI returned (0 if not AI)
 * @param {number} fieldsAccepted  — how many AI fields student kept
 * @param {number} fieldsAddedManually — how many fields student added themselves
 * @param {number} filledFields   — fields with non-empty values at save time
 * @param {number} totalFields    — total fields on the item at save time
 */
export async function logWorldItemCreated(
  userId,
  itemType,
  templateChoice,
  fieldsSuggested,
  fieldsAccepted,
  fieldsAddedManually,
  filledFields,
  totalFields
) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'worldAI',
        action: 'item_created',
        metadata: {
          itemType,
          templateChoice,
          fieldsSuggested,
          fieldsAccepted,
          fieldsAddedManually,
          filledFields,
          totalFields,
          acceptanceRate: fieldsSuggested > 0
            ? Math.round((fieldsAccepted / fieldsSuggested) * 100) / 100
            : null,
          completionRate: totalFields > 0
            ? Math.round((filledFields / totalFields) * 100) / 100
            : null,
          timestamp: Date.now()
        }
      })
    });
  } catch (error) {
    console.warn('[WorldAnalytics] logWorldItemCreated failed:', error);
  }
}

/**
 * Log when a student returns to edit an existing item (saves changes via ItemDetailsModal).
 *
 * @param {string} userId
 * @param {string} itemType
 * @param {number} fieldsAdded   — new fields added in this edit session
 * @param {number} fieldsRemoved — fields removed in this edit session
 * @param {number} filledFields  — fields with non-empty values after edit
 * @param {number} totalFields   — total fields after edit
 */
export async function logWorldItemEdited(
  userId,
  itemType,
  fieldsAdded,
  fieldsRemoved,
  filledFields,
  totalFields
) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'worldAI',
        action: 'item_edited',
        metadata: {
          itemType,
          fieldsAdded,
          fieldsRemoved,
          filledFields,
          totalFields,
          completionRate: totalFields > 0
            ? Math.round((filledFields / totalFields) * 100) / 100
            : null,
          timestamp: Date.now()
        }
      })
    });
  } catch (error) {
    console.warn('[WorldAnalytics] logWorldItemEdited failed:', error);
  }
}

/**
 * Log when the student views the reflective prompt for a field.
 * This is the engagement signal for the pedagogical scaffolding.
 *
 * @param {string} userId
 * @param {string} fieldName
 * @param {string} itemType
 */
export async function logWorldReflectivePromptViewed(userId, fieldName, itemType) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        feature: 'worldAI',
        action: 'reflective_prompt_viewed',
        metadata: { fieldName, itemType, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.warn('[WorldAnalytics] logWorldReflectivePromptViewed failed:', error);
  }
}

// ============================================
// STORY MAP ANALYTICS
// ============================================

export async function logStoryMapRender(userId, nodes, links) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nodeCount: nodes.length, linkCount: links.length, nodes, links })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Render log failed:', error);
  }
}

export async function logNodeAction(userId, actionType, nodeData, processingTimeMs = null) {
  if (!userId || !actionType || !nodeData) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-node-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, actionType, nodeData, processingTimeMs })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Node action log failed:', error);
  }
}

export async function logLinkAction(userId, actionType, linkData) {
  if (!userId || !actionType || !linkData) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-link-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, actionType, linkData })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Link action log failed:', error);
  }
}

export async function logNodeMerge(userId, mergedNodeCount, primaryNodeLabel, processingTimeMs = null) {
  if (!userId || !mergedNodeCount || !primaryNodeLabel) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mergedNodeCount, primaryNodeLabel, processingTimeMs })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Merge log failed:', error);
  }
}

export async function logAnalysisPanelInteraction(userId, interactionType, durationMs = null, issueInteractedWith = null) {
  if (!userId || !interactionType) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-analysis-panel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, interactionType, durationMs, issueInteractedWith })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Panel interaction log failed:', error);
  }
}

export async function logViewToggle(userId, viewMode) {
  if (!userId || !viewMode) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-view-toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, viewMode })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] View toggle log failed:', error);
  }
}

export async function logMergeModeAction(userId, actionType, nodesSelected = null) {
  if (!userId || !actionType) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-merge-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, actionType, nodesSelected })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Merge mode log failed:', error);
  }
}

export function trackAnalysisPanelTime(userId, issueInteractedWith = null) {
  const startTime = Date.now();
  return () => {
    const duration = Date.now() - startTime;
    logAnalysisPanelInteraction(userId, 'close', duration, issueInteractedWith);
  };
}

export async function logIterationPattern(userId, iterationData) {
  if (!userId || !iterationData) return;
  try {
    await fetch(`${API_BASE}/api/story-map/log-iteration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, iterationData })
    });
  } catch (error) {
    console.error('[StoryMapAnalytics] Iteration log failed:', error);
  }
}

export async function logGraphInteraction(userId, interactionType, metadata = {}) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, feature: 'storyMap', action: `graph_${interactionType}`,
        metadata: { ...metadata, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.error('[Analytics] Graph interaction log failed:', error);
  }
}

export async function logCognitiveLoad(userId, indicatorType, metadata = {}) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, feature: 'storyMap', action: `cognitive_load_${indicatorType}`,
        metadata: { ...metadata, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.error('[Analytics] Cognitive load log failed:', error);
  }
}

export async function logTemplateUsage(userId, templateType, metadata = {}) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, feature: 'storyMap', action: `template_${templateType}`,
        metadata: { ...metadata, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.error('[Analytics] Template usage log failed:', error);
  }
}

// ============================================
// TIMELINE ANALYTICS
// ============================================

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

export function logTimelinePageExit(userId, durationMs, pageViewKey = null) {
  if (!userId) return;
  const payload = JSON.stringify({ userId, durationMs, pageViewKey });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/api/timeline/log-page-exit`, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(`${API_BASE}/api/timeline/log-page-exit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true
    }).catch(() => {});
  }
}

export async function logTimelineEventAction(userId, action, event, extra = {}) {
  if (!userId || !action || !event) return;
  try {
    await fetch(`${API_BASE}/api/timeline/log-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, action,
        eventId: event.id || '',
        stage: event.stage || 'unknown',
        isMainEvent: event.isMainEvent || false,
        ...extra
      })
    });
  } catch (error) {
    console.warn('[TimelineAnalytics] logTimelineEventAction failed:', error);
  }
}

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
// ============================================

export async function logChatPageView(userId) {
  if (!userId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/log-page-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pageName: 'reflectiveChatbot', tlcStage: 'joint_construction', timestamp: Date.now() })
    });
    const data = await res.json();
    return data?.pageViewId ?? null;
  } catch (error) {
    console.warn('[ChatAnalytics] logChatPageView failed:', error);
    return null;
  }
}

export function logChatPageExit(userId, durationMs, pageViewId = null) {
  if (!userId) return;
  const payload = JSON.stringify({ userId, pageName: 'reflectiveChatbot', durationMs, pageViewId, timestamp: Date.now() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/api/log-page-exit`, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(`${API_BASE}/api/log-page-exit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true
    }).catch(() => {});
  }
}

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

export async function logChatModeSwitch(userId, sessionId, fromMode, toMode) {
  if (!userId || !sessionId) return;
  try {
    await fetch(`${API_BASE}/api/log-ui-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId, feature: 'reflectiveChatbot', action: 'mode_switch',
        metadata: { sessionId, fromMode, toMode, timestamp: Date.now() }
      })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatModeSwitch failed:', error);
  }
}

export async function logChatUserMessage(userId, sessionId, messageLength, messageIndex, mode, currentStage = null) {
  if (!userId || !sessionId) return;
  try {
    await fetch(`${API_BASE}/api/chat/log-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionId, messageLength, messageIndex, mode, currentStage, timestamp: Date.now() })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatUserMessage failed:', error);
  }
}

export async function logChatStageTransition(userId, sessionId, fromStage, toStage, trigger = 'auto') {
  if (!userId || !sessionId || !fromStage || !toStage) return;
  try {
    await fetch(`${API_BASE}/api/chat/log-stage-transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionId, fromStage, toStage, trigger, timestamp: Date.now() })
    });
  } catch (error) {
    console.warn('[ChatAnalytics] logChatStageTransition failed:', error);
  }
}

// ============================================
// UTILITY HELPERS
// ============================================

export function debounce(func, wait = 500) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function createDebouncedSearchLogger(userId, feature, data) {
  return debounce((query) => {
    if (query.length >= 3) {
      const resultsCount = data.filter(item =>
        JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
      ).length;
      logUIInteraction(userId, feature, 'search', { query, resultsCount });
    }
  }, 500);
}

export function trackFeatureTime(userId, feature, action, metadata = {}) {
  const startTime = Date.now();
  return () => {
    const duration = Date.now() - startTime;
    logUIInteraction(userId, feature, `${action}_complete`, { ...metadata, durationMs: duration });
  };
}

export function createBatchLogger(userId, feature) {
  let batch = [];
  let flushTimeout = null;

  const flush = async () => {
    if (batch.length === 0) return;
    try {
      await fetch(`${API_BASE}/api/log-ui-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, feature, interactions: batch })
      });
      batch = [];
    } catch (error) {
      console.error('[Analytics] Batch log failed:', error);
      batch = [];
    }
  };

  return {
    log: (action, metadata = {}) => {
      batch.push({ action, metadata, timestamp: Date.now() });
      clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 5000);
      if (batch.length >= 10) flush();
    },
    flush
  };
}

export function createGraphBatchLogger(userId) {
  let batch = [];
  let flushTimeout = null;

  const flush = async () => {
    if (batch.length === 0) return;
    batch = [];
  };

  return {
    logNodeAction: (actionType, nodeData) => {
      batch.push({ type: 'node', actionType, nodeData, timestamp: Date.now() });
      clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 3000);
      if (batch.length >= 10) flush();
    },
    flush
  };
}

export function createStoryMapBatchLogger(userId) {
  return createBatchLogger(userId, 'storyMap');
}

// ============================================
// EXPORTS
// ============================================

export default {
  // Generic
  logPageView,
  logPageExit,
  logUIInteraction,
  // Cross-feature session
  logToolEntry,
  logToolExit,
  useToolTracking,
  // World AI
  logWorldTemplateRequest,
  logWorldItemCreated,
  logWorldItemEdited,
  logWorldReflectivePromptViewed,
  // Story Map
  logStoryMapRender,
  logNodeAction,
  logLinkAction,
  logNodeMerge,
  logAnalysisPanelInteraction,
  logViewToggle,
  logMergeModeAction,
  trackAnalysisPanelTime,
  logIterationPattern,
  logGraphInteraction,
  logCognitiveLoad,
  logTemplateUsage,
  createGraphBatchLogger,
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
  logChatStageTransition,
  // Utilities
  debounce,
  createDebouncedSearchLogger,
  trackFeatureTime,
  createBatchLogger,
};