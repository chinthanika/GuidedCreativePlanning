// src/components/chatbot/SessionsPanel.jsx

import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Edit2, Sparkles, Plus, X } from 'lucide-react';
import { getSessions, renameSession, deleteSession, generateSessionTitle } from '../../services/sessionsAPI';
import './sessionsPanel.css';

const SessionsPanel = ({ userId, currentSessionId, onSelectSession, onNewSession, isVisible, onToggle }) => {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [generatingTitleFor, setGeneratingTitleFor] = useState(null);
    const [error, setError] = useState(null);

    // Load sessions
    useEffect(() => {
        if (isVisible && userId) {
            loadSessions();
        }
    }, [isVisible, userId]);

    const loadSessions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getSessions(userId);
            setSessions(data.sessions || []);
        } catch (err) {
            setError('Failed to load sessions');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSession = (sessionId) => {
        onSelectSession(sessionId);
        onToggle(); // Close panel on mobile
    };

    const handleStartEdit = (session) => {
        setEditingId(session.sessionId);
        setEditTitle(session.title);
    };

    const handleSaveEdit = async (sessionId) => {
        if (!editTitle.trim()) {
            setEditingId(null);
            return;
        }

        try {
            await renameSession(userId, sessionId, editTitle.trim());
            setSessions(sessions.map(s => 
                s.sessionId === sessionId 
                    ? { ...s, title: editTitle.trim() }
                    : s
            ));
            setEditingId(null);
        } catch (err) {
            setError('Failed to rename session');
            console.error(err);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditTitle('');
    };

    const handleDelete = async (sessionId) => {
        if (!window.confirm('Delete this session? This cannot be undone.')) {
            return;
        }

        try {
            await deleteSession(userId, sessionId);
            setSessions(sessions.filter(s => s.sessionId !== sessionId));
            
            // If deleted current session, create new one
            if (sessionId === currentSessionId) {
                onNewSession();
            }
        } catch (err) {
            setError('Failed to delete session');
            console.error(err);
        }
    };

    const handleGenerateTitle = async (sessionId) => {
        setGeneratingTitleFor(sessionId);
        try {
            const result = await generateSessionTitle(userId, sessionId);
            if (result.success) {
                setSessions(sessions.map(s => 
                    s.sessionId === sessionId 
                        ? { ...s, title: result.title }
                        : s
                ));
            }
        } catch (err) {
            setError('Failed to generate title');
            console.error(err);
        } finally {
            setGeneratingTitleFor(null);
        }
    };

    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className={`sessions-panel ${isVisible ? 'visible' : ''}`}>
            <div className="sessions-header">
                <h2>
                    <MessageSquare size={20} />
                    Chat Sessions
                </h2>
                <button className="close-btn" onClick={onToggle}>
                    <X size={20} />
                </button>
            </div>

            <button className="new-session-btn" onClick={onNewSession}>
                <Plus size={18} />
                New Chat
            </button>

            {error && (
                <div className="sessions-error">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="sessions-list">
                {loading ? (
                    <div className="sessions-loading">Loading sessions...</div>
                ) : sessions.length === 0 ? (
                    <div className="sessions-empty">
                        No previous sessions
                    </div>
                ) : (
                    sessions.map(session => (
                        <div 
                            key={session.sessionId}
                            className={`session-item ${session.sessionId === currentSessionId ? 'active' : ''}`}
                        >
                            {editingId === session.sessionId ? (
                                <div className="session-edit">
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveEdit(session.sessionId);
                                            if (e.key === 'Escape') handleCancelEdit();
                                        }}
                                        autoFocus
                                        maxLength={100}
                                    />
                                    <div className="edit-actions">
                                        <button 
                                            className="save-btn"
                                            onClick={() => handleSaveEdit(session.sessionId)}
                                        >
                                            Save
                                        </button>
                                        <button 
                                            className="cancel-btn"
                                            onClick={handleCancelEdit}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div 
                                        className="session-content"
                                        onClick={() => handleSelectSession(session.sessionId)}
                                    >
                                        <div className="session-title">{session.title}</div>
                                        <div className="session-meta">
                                            <span className="session-mode">{session.mode}</span>
                                            {session.stage && (
                                                <span className="session-stage"> • {session.stage}</span>
                                            )}
                                            <span className="session-time"> • {formatDate(session.updatedAt)}</span>
                                        </div>
                                        <div className="session-messages">
                                            {session.messageCount} messages
                                        </div>
                                    </div>
                                    <div className="session-actions">
                                        <button
                                            className="action-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartEdit(session);
                                            }}
                                            title="Rename"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        {/* Only show AI title button if title is still default */}
                                        {(session.title === 'New Chat' || session.title === 'Untitled Chat') && (
                                            <button
                                                className="action-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleGenerateTitle(session.sessionId);
                                                }}
                                                disabled={generatingTitleFor === session.sessionId}
                                                title="Generate AI title"
                                            >
                                                {generatingTitleFor === session.sessionId ? (
                                                    <span className="spinner-small" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                            </button>
                                        )}
                                        <button
                                            className="action-btn delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(session.sessionId);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SessionsPanel;