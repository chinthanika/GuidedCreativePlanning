// src/services/sessionsAPI.js

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * Get all sessions for a user
 */
export const getSessions = async (userId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch sessions: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Get sessions error:', error);
        throw error;
    }
};

/**
 * Rename a session
 */
export const renameSession = async (userId, sessionId, title) => {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, sessionId, title })
        });

        if (!response.ok) {
            throw new Error(`Failed to rename session: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Rename session error:', error);
        throw error;
    }
};

/**
 * Delete a session
 */
export const deleteSession = async (userId, sessionId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, sessionId })
        });

        if (!response.ok) {
            throw new Error(`Failed to delete session: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Delete session error:', error);
        throw error;
    }
};

/**
 * Generate AI title for a session
 */
export const generateSessionTitle = async (userId, sessionId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, sessionId })
        });

        if (!response.ok) {
            throw new Error(`Failed to generate title: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Generate title error:', error);
        throw error;
    }
};