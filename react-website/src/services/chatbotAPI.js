import { database } from '../Firebase/firebase';
import { ref, push } from "firebase/database";

// Configuration
const CONSOLIDATED_SERVER_URL = process.env.REACT_APP_AI_SERVER_URL;

let sessionID = null;

/**
 * Send message to consolidated AI server and get instant response
 * @param {string} uid - User ID
 * @param {string} currentSessionID - Current session ID (optional)
 * @param {string} text - User message
 * @param {string} mode - Chat mode: "brainstorming" or "deepthinking"
 * @returns {Promise<Object>} Bot response with chat_message, session_id, mode, background_processing
 */
export const sendMessage = async (uid, currentSessionID, text, mode = "brainstorming") => {
  if (!uid) throw new Error("User not authenticated");

  const activeSessionID = currentSessionID || sessionID;

  // Call consolidated backend
  const botData = await getAIResponse(uid, text, activeSessionID, mode);

  // Save session ID for future calls
  if (botData.session_id) {
    sessionID = botData.session_id;
  }

  return botData;
};

/**
 * Call consolidated AI API
 * @param {string} uid - User ID
 * @param {string} userMessage - User's message
 * @param {string} currentSessionID - Current session ID
 * @param {string} mode - Chat mode
 * @returns {Promise<Object>} Response from AI
 */
async function getAIResponse(uid, userMessage, currentSessionID, mode = "brainstorming") {
  try {
    // Unified endpoint - mode determines which chat handler is used
    const endpoint = mode === "brainstorming" 
      ? "/chat/brainstorming"
      : "/chat/deepthinking";
    
    const url = `${CONSOLIDATED_SERVER_URL}${endpoint}`;

    console.log(`[Chatbot] Sending to ${endpoint}:`, {
      user_id: uid,
      session_id: currentSessionID || "new",
      message_preview: userMessage.substring(0, 50) + "..."
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        user_id: uid,
        session_id: currentSessionID || null
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Chatbot] HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();

    console.log(`[Chatbot] Response received:`, {
      has_message: !!data.chat_message,
      session_id: data.session_id,
      mode: data.mode,
      background_processing: data.background_processing
    });

    return {
      chat_message: data.chat_message || null,
      background_processing: data.background_processing || false,
      session_id: data.session_id,
      mode: data.mode
    };
  } catch (error) {
    console.error("[Chatbot] AI API error:", error);
    
    // Return user-friendly error
    return { 
      chat_message: `Sorry, I'm having trouble connecting to the AI server. ${error.message}`, 
      background_processing: false,
      session_id: currentSessionID,
      mode: mode,
      error: true
    };
  }
}

/**
 * Get current session ID
 * @returns {string|null} Current session ID
 */
export const getCurrentSessionID = () => {
  return sessionID;
};

/**
 * Set session ID (useful for restoring session)
 * @param {string} newSessionID - Session ID to set
 */
export const setSessionID = (newSessionID) => {
  sessionID = newSessionID;
  console.log(`[Chatbot] Session ID set to: ${newSessionID}`);
};

/**
 * Clear session (start fresh)
 */
export const clearSession = () => {
  sessionID = null;
  console.log("[Chatbot] Session cleared");
};

/**
 * Check if consolidated server is healthy
 * @returns {Promise<boolean>} True if server is healthy
 */
export const checkServerHealth = async () => {
  try {
    const response = await fetch(`${CONSOLIDATED_SERVER_URL}/health`, {
      method: "GET",
      timeout: 5000
    });

    if (!response.ok) return false;

    const data = await response.json();
    
    console.log("[Chatbot] Server health check:", data);
    
    return data.status === "ok";
  } catch (error) {
    console.error("[Chatbot] Health check failed:", error);
    return false;
  }
};

/**
 * Extract character entities from text
 * @param {string} text - Text to extract characters from
 * @returns {Promise<Object>} Extracted entities and relationships
 */
export const extractCharacters = async (text) => {
  try {
    const response = await fetch(`${CONSOLIDATED_SERVER_URL}/characters/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`[Chatbot] Character extraction:`, {
      entities: data.entities?.length || 0,
      relationships: data.relationships?.length || 0
    });

    return data;
  } catch (error) {
    console.error("[Chatbot] Character extraction error:", error);
    throw error;
  }
};

/**
 * Get world-building template suggestions
 * @param {string} userId - User ID
 * @param {string} itemType - Type of world-building item
 * @param {string} itemName - Name of the item
 * @param {Object} parentFields - Parent fields (optional)
 * @param {Object} existingFields - Existing fields (optional)
 * @returns {Promise<Object>} Suggested fields
 */
export const getWorldBuildingTemplate = async (
  userId, 
  itemType, 
  itemName, 
  parentFields = {}, 
  existingFields = {}
) => {
  try {
    const response = await fetch(`${CONSOLIDATED_SERVER_URL}/worldbuilding/suggest-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        itemType,
        itemName,
        parentFields,
        existingFields
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`[Chatbot] Template suggestion:`, {
      itemType,
      fields: data.suggestedFields?.length || 0
    });

    return data;
  } catch (error) {
    console.error("[Chatbot] Template suggestion error:", error);
    throw error;
  }
};

/**
 * Generate an image based on description
 * @param {string} description - Image description
 * @returns {Promise<Object>} Generated image URL
 */
export const generateImage = async (description) => {
  try {
    const response = await fetch(`${CONSOLIDATED_SERVER_URL}/images/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description })
    });

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error("Image generation not configured");
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`[Chatbot] Image generated:`, {
      url: data.image_url?.substring(0, 50) + "..."
    });

    return data;
  } catch (error) {
    console.error("[Chatbot] Image generation error:", error);
    throw error;
  }
};

/**
 * Configure server URL (useful for development/production switching)
 * @param {string} newUrl - New server URL
 */
export const setServerURL = (newUrl) => {
  // This would require making CONSOLIDATED_SERVER_URL mutable
  console.warn("[Chatbot] Server URL is currently hardcoded. Update CONSOLIDATED_SERVER_URL constant.");
  console.log(`[Chatbot] Requested URL: ${newUrl}`);
};

// Export server URL for reference
export { CONSOLIDATED_SERVER_URL };
