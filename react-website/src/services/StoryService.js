const API_URL = process.env.REACT_APP_PROFILE_MANAGER_URL || "https://guidedcreativeplanning-pfm.onrender.com" || 'http://localhost:5001';
const AI_URL = process.env.REACT_APP_AI_SERVER_URL || 'http://localhost:5000';

export const storyService = {
  // ============ STORIES ============
  
  async getStories(userId) {
    const response = await fetch(`${API_URL}/api/stories?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch stories');
    const data = await response.json();

    // Convert to array
    return Object.entries(data).map(([id, story]) => ({
      id,
      ...story
    }));
  },

  async createStory(userId, title, description = '') {
    const response = await fetch(`${API_URL}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, description })
    });
    if (!response.ok) throw new Error('Failed to create story');
    return response.json();
  },

  async updateStory(userId, storyId, updates) {
    const response = await fetch(`${API_URL}/api/stories/${storyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...updates })
    });
    if (!response.ok) throw new Error('Failed to update story');
    return response.json();
  },

  async deleteStory(userId, storyId) {
    const response = await fetch(`${API_URL}/api/stories/${storyId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to delete story');
    return response.json();
  },

  // ============ PARTS ============

  async createPart(userId, storyId, partData) {
    const response = await fetch(`${API_URL}/api/stories/${storyId}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId, 
        title: partData.title || 'Untitled Part',
        type: partData.type || 'chapter',
        description: partData.description || ''
      })
    });
    if (!response.ok) throw new Error('Failed to create part');
    return response.json();
  },

  async updatePart(userId, storyId, partId, updates) {
    const response = await fetch(`${API_URL}/api/stories/${storyId}/parts/${partId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...updates })
    });
    if (!response.ok) throw new Error('Failed to update part');
    return response.json();
  },

  async deletePart(userId, storyId, partId) {
    const response = await fetch(`${API_URL}/api/stories/${storyId}/parts/${partId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to delete part');
    return response.json();
  },

  // ============ DRAFTS ============

  async getDraft(userId, storyId, partId, draftId) {
    const response = await fetch(
      `${API_URL}/api/stories/${storyId}/parts/${partId}/drafts/${draftId}?userId=${userId}`
    );
    if (!response.ok) throw new Error('Failed to fetch draft');
    return response.json();
  },

  async createDraft(userId, storyId, partId, draftData = {}) {
    const response = await fetch(
      `${API_URL}/api/stories/${storyId}/parts/${partId}/drafts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          title: draftData.title || 'Draft 1'
        })
      }
    );
    if (!response.ok) throw new Error('Failed to create draft');
    return response.json();
  },

  async saveDraft(userId, storyId, partId, draftId, content, wordCount) {
    const response = await fetch(
      `${API_URL}/api/stories/${storyId}/parts/${partId}/drafts/${draftId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, content, wordCount })
      }
    );
    if (!response.ok) throw new Error('Failed to save draft');
    return response.json();
  },

  async updateDraft(userId, storyId, partId, draftId, updates) {
    const response = await fetch(
      `${API_URL}/api/stories/${storyId}/parts/${partId}/drafts/${draftId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates })
      }
    );
    if (!response.ok) throw new Error('Failed to update draft');
    return response.json();
  },

  async deleteDraft(userId, storyId, partId, draftId) {
    const response = await fetch(
      `${API_URL}/api/stories/${storyId}/parts/${partId}/drafts/${draftId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }
    );
    if (!response.ok) throw new Error('Failed to delete draft');
    return response.json();
  },

  // ============ FEEDBACK (NEW!) ============

  async requestFeedback(userId, storyId, partId, draftId, draftText) {
    // Input validation
    if (!draftText || draftText.trim().length < 50) {
      throw new Error('Draft must be at least 50 characters');
    }

    try {
      const response = await fetch(`${AI_URL}/api/stories/${storyId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          draftText: draftText.trim(),
          partId, 
          draftId 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to get feedback');
      }

      return data;
    } catch (error) {
      // Handle network errors
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to AI server. Check your connection.');
      }
      throw error;
    }
  },

  // ============ HELPER METHODS ============

  /**
   * Extract plain text from Slate.js editor value
   * @param {Array} slateValue - Slate.js document structure
   * @returns {string} Plain text content
   */
  extractTextFromSlate(slateValue) {
    if (!slateValue || !Array.isArray(slateValue)) {
      return '';
    }

    const extractNode = (node) => {
      if (node.text !== undefined) {
        return node.text;
      }
      
      if (node.children) {
        return node.children.map(extractNode).join('');
      }
      
      return '';
    };

    return slateValue.map(extractNode).join('\n').trim();
  },

  /**
   * Calculate word count from text
   * @param {string} text - Plain text
   * @returns {number} Word count
   */
  calculateWordCount(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
};

export default storyService;