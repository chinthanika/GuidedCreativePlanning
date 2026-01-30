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
  logIterationPattern
};