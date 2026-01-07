import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthValue } from '../../Firebase/AuthContext';
import NewEventModal from "../../components/timeline/NewEventModal";
import EventDetailsModal from "../../components/timeline/EventDetailsModal";
import './timeline.css';

const TimelineCardGrid = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;
    const API_BASE = "https://guidedcreativeplanning-pfm.onrender.com/api";
    // const AI_API_BASE = "https://guidedcreativeplanning-ai.onrender.com";
    const AI_API_BASE = "http://localhost:5000"

    const [events, setEvents] = useState([]);
    const [flippedCard, setFlippedCard] = useState(null);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
    const [isEventDetailsModalOpen, setIsEventDetailsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [eventToDelete, setEventToDelete] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reordering, setReordering] = useState(false);
    const [toast, setToast] = useState(null);
    
    // AI Integration State
    const [aiInsight, setAiInsight] = useState(null);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [coherenceReport, setCoherenceReport] = useState(null);

    const stages = [
        "introduction",
        "rising action",
        "climax",
        "falling action",
        "resolution",
    ];

    const stageColors = {
        introduction: '#A7C7E7',
        'rising action': '#C1E1C1',
        climax: '#FAA0A0',
        'falling action': '#FFFAA0',
        resolution: '#C3B1E1',
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (!userId) return;
        fetchEvents();
    }, [userId]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_BASE}/events`, {
                params: { userId }
            });

            const eventsArray = Object.entries(response.data).map(([firebaseKey, event]) => ({
                id: firebaseKey,
                ...event,
            }));

            const sortedEvents = eventsArray.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            setEvents(sortedEvents);
        } catch (error) {
            console.error("Error fetching events:", error);
            showToast("Failed to load events", "error");
        } finally {
            setLoading(false);
        }
    };

    // AI Feature 1: Reflective Guide - Causal Reasoning Prompts
    const getAiInsight = async (event, context = 'reorder') => {
        if (!event || events.length < 2) return;
        
        setAiLoading(true);
        setShowAiPanel(true);
        setCoherenceReport(null);
        
        try {
            const response = await axios.post(`${AI_API_BASE}/api/timeline/reflect`, {
                userId,
                event: {
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    stage: event.stage,
                    order: event.order
                },
                timeline: events.map(e => ({
                    id: e.id,
                    title: e.title,
                    description: e.description,
                    stage: e.stage,
                    order: e.order,
                    isMainEvent: e.isMainEvent
                })),
                context
            });

            setAiInsight(response.data);
        } catch (error) {
            console.error("AI insight error:", error);
            showToast("Failed to get AI insight", "error");
        } finally {
            setAiLoading(false);
        }
    };

    // AI Feature 2: Feedback Assistant - Coherence Check
    const checkTimelineCoherence = async () => {
        if (events.length < 3) {
            showToast("Add at least 3 events to check coherence", "info");
            return;
        }

        setAiLoading(true);
        setShowAiPanel(true);
        setCoherenceReport(null);

        try {
            const response = await axios.post(`${AI_API_BASE}/api/timeline/coherence`, {
                userId,
                timeline: events.map(e => ({
                    id: e.id,
                    title: e.title,
                    description: e.description,
                    stage: e.stage,
                    order: e.order,
                    date: e.date,
                    isMainEvent: e.isMainEvent
                }))
            });

            setCoherenceReport(response.data);
            setAiInsight(null); // Clear any previous single-event insights
        } catch (error) {
            console.error("Coherence check error:", error);
            showToast("Failed to check timeline coherence", "error");
        } finally {
            setAiLoading(false);
        }
    };

    // Drag-and-drop handlers
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        setDragOverIndex(index);
        return false;
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();

        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const items = [...events];
        const draggedItem = items[draggedIndex];

        items.splice(draggedIndex, 1);
        items.splice(dropIndex, 0, draggedItem);

        const updatedItems = items.map((item, index) => ({
            ...item,
            order: index,
        }));

        setEvents(updatedItems);
        setDraggedIndex(null);
        setDragOverIndex(null);
        setReordering(true);

        // Trigger AI insight after reordering
        getAiInsight(draggedItem, 'reorder');

        try {
            const updates = updatedItems.map(ev => ({
                eventId: ev.id,
                order: ev.order,
            }));

            await axios.post(`${API_BASE}/events/batch-update`, {
                userId,
                updates,
            });

            showToast("Events reordered successfully!", "success");
        } catch (error) {
            console.error("Error saving reordered events:", error);
            showToast("Failed to save new order", "error");
            fetchEvents();
        } finally {
            setReordering(false);
        }
    };

    const handleCardClick = (id) => {
        setFlippedCard(flippedCard === id ? null : id);
    };

    const handleAddEvent = () => {
        setIsNewEventModalOpen(true);
    };

    const handleSaveNewEvent = async (newEvent) => {
        if (!newEvent.title || !newEvent.description) {
            alert("Title and description are required");
            return;
        }

        try {
            const maxOrder = events.length > 0 ? Math.max(...events.map(e => e.order ?? 0)) : 0;

            const eventData = {
                ...newEvent,
                order: maxOrder + 1,
            };

            const newFirebaseKey = `-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

            await axios.post(`${API_BASE}/events/update`, {
                userId,
                eventId: newFirebaseKey,
                updates: eventData,
            });

            fetchEvents();
            setIsNewEventModalOpen(false);
            showToast("Event added successfully!", "success");

            // Trigger AI insight for new event
            setTimeout(() => {
                getAiInsight({ ...eventData, id: newFirebaseKey }, 'add');
            }, 500);
        } catch (error) {
            console.error("Error saving event:", error);
            showToast("Failed to save event", "error");
        }
    };

    const handleEditEvent = (event, e) => {
        if (e) {
            e.stopPropagation();
        }
        setSelectedEvent(event);
        setIsEventDetailsModalOpen(true);
        setFlippedCard(null);
    };

    const handleSaveEditedEvent = async (updatedEvent) => {
        try {
            await axios.post(`${API_BASE}/events/update`, {
                userId,
                eventId: updatedEvent.id,
                updates: updatedEvent,
            });

            fetchEvents();
            setIsEventDetailsModalOpen(false);
            showToast("Event updated successfully!", "success");

            // Trigger AI insight after editing
            getAiInsight(updatedEvent, 'edit');
        } catch (error) {
            console.error("Error updating event:", error);
            showToast("Failed to update event", "error");
        }
    };

    const handleDeleteClick = (event) => {
        setEventToDelete(event);
        setShowDeleteModal(true);
        setFlippedCard(null);
    };

    const handleConfirmDelete = async () => {
        try {
            await axios.post(`${API_BASE}/events/delete`, {
                userId,
                eventId: eventToDelete.id,
            });

            fetchEvents();
            setShowDeleteModal(false);
            setEventToDelete(null);
            showToast("Event deleted successfully!", "success");
        } catch (error) {
            console.error("Error deleting event:", error);
            showToast("Failed to delete event", "error");
        }
    };

    const handleDeleteItem = async (event) => {
        try {
            await axios.post(`${API_BASE}/events/delete`, {
                userId,
                eventId: event.id,
            });

            fetchEvents();
            setIsEventDetailsModalOpen(false);
            showToast("Event deleted successfully!", "success");
        } catch (error) {
            console.error("Error deleting event:", error);
            showToast("Failed to delete event", "error");
        }
    };

    const handleGenerateImage = async (description) => {
        try {
            const response = await axios.post(`${AI_API_BASE}/images/generate`, {
                description
            });
            return response.data.image_url;
        } catch (error) {
            console.error("Error generating image:", error);
            throw error;
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading events...</p>
            </div>
        );
    }

    return (
        <div className="timeline-card-grid">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'success' ? '✓' : '✕'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                </div>
            )}

            {reordering && (
                <div className="reorder-overlay">
                    <div className="reorder-spinner"></div>
                    <p>Saving new order...</p>
                </div>
            )}

            <div className="timeline-header">
                <h2>Story Timeline</h2>
                <div className="timeline-header-actions">
                    <button 
                        onClick={checkTimelineCoherence} 
                        className="timeline-btn btn-ai-check"
                        disabled={events.length < 3}
                        title="Check timeline for inconsistencies and pacing issues"
                    >
                        🤖 Check Coherence
                    </button>
                    <button onClick={handleAddEvent} className="timeline-btn btn-add">
                        + Add Event
                    </button>
                </div>
            </div>

            <p className="timeline-info">
                <strong>Tip:</strong> Drag cards to reorder events. Click a card to flip and see details. 
                AI will provide insights as you build your timeline.
            </p>

            {/* AI Insight Panel */}
            {showAiPanel && (
                <div className="ai-insight-panel">
                    <div className="ai-panel-header">
                        <h3>🤖 AI Writing Assistant</h3>
                        <button 
                            onClick={() => setShowAiPanel(false)} 
                            className="ai-panel-close"
                        >
                            ✕
                        </button>
                    </div>

                    {aiLoading ? (
                        <div className="ai-loading">
                            <div className="spinner"></div>
                            <p>Analyzing your timeline...</p>
                        </div>
                    ) : coherenceReport ? (
                        <div className="coherence-report">
                            <div className="report-score">
                                <div className="score-circle" style={{
                                    borderColor: coherenceReport.overallScore >= 7 ? '#4caf50' : 
                                                coherenceReport.overallScore >= 5 ? '#ff9800' : '#f44336'
                                }}>
                                    <span className="score-value">{coherenceReport.overallScore}</span>
                                    <span className="score-label">/10</span>
                                </div>
                                <div className="score-description">
                                    <h4>Timeline Coherence</h4>
                                    <p>{coherenceReport.summary}</p>
                                </div>
                            </div>

                            {coherenceReport.issues && coherenceReport.issues.length > 0 && (
                                <div className="report-section">
                                    <h4>⚠️ Issues Found</h4>
                                    <ul className="issue-list">
                                        {coherenceReport.issues.map((issue, idx) => (
                                            <li key={idx} className={`issue-${issue.severity}`}>
                                                <strong>{issue.type}:</strong> {issue.description}
                                                {issue.suggestion && (
                                                    <p className="issue-suggestion">
                                                        💡 {issue.suggestion}
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {coherenceReport.strengths && coherenceReport.strengths.length > 0 && (
                                <div className="report-section">
                                    <h4>✨ Strengths</h4>
                                    <ul className="strength-list">
                                        {coherenceReport.strengths.map((strength, idx) => (
                                            <li key={idx}>{strength}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {coherenceReport.pacing && (
                                <div className="report-section">
                                    <h4>⏱️ Pacing Analysis</h4>
                                    <p>{coherenceReport.pacing.assessment}</p>
                                    {coherenceReport.pacing.suggestions && (
                                        <ul className="pacing-suggestions">
                                            {coherenceReport.pacing.suggestions.map((sugg, idx) => (
                                                <li key={idx}>{sugg}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : aiInsight ? (
                        <div className="single-event-insight">
                            <h4 className="insight-title">
                                {aiInsight.context === 'reorder' && '🔄 Reordering Reflection'}
                                {aiInsight.context === 'add' && '✨ New Event Insight'}
                                {aiInsight.context === 'edit' && '✏️ Edit Reflection'}
                            </h4>
                            
                            <div className="insight-event-context">
                                <strong>Event:</strong> {aiInsight.event?.title}
                            </div>

                            {aiInsight.questions && aiInsight.questions.length > 0 && (
                                <div className="insight-questions">
                                    <h5>💭 Consider These Questions:</h5>
                                    <ul>
                                        {aiInsight.questions.map((q, idx) => (
                                            <li key={idx}>{q}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {aiInsight.causality && (
                                <div className="insight-causality">
                                    <h5>🔗 Causal Chain:</h5>
                                    <p>{aiInsight.causality}</p>
                                </div>
                            )}

                            {aiInsight.suggestions && aiInsight.suggestions.length > 0 && (
                                <div className="insight-suggestions">
                                    <h5>💡 Suggestions:</h5>
                                    <ul>
                                        {aiInsight.suggestions.map((s, idx) => (
                                            <li key={idx}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            <NewEventModal
                isOpen={isNewEventModalOpen}
                closeModal={() => setIsNewEventModalOpen(false)}
                onSave={handleSaveNewEvent}
                stages={stages}
            />

            <EventDetailsModal
                isOpen={isEventDetailsModalOpen}
                closeModal={() => setIsEventDetailsModalOpen(false)}
                event={selectedEvent}
                onSave={handleSaveEditedEvent}
                onDelete={handleDeleteItem}
                onGenerateImage={handleGenerateImage}
            />

            <div className="timeline-grid">
                {events.map((event, index) => (
                    <div
                        key={event.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`card-wrapper ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index && draggedIndex !== index ? 'drag-over' : ''}`}
                    >
                        <div
                            className={`card-inner ${flippedCard === event.id ? 'flipped' : ''}`}
                            onClick={(e) => {
                                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                                    return;
                                }
                                handleCardClick(event.id);
                            }}
                        >
                            <div
                                className={`card-front ${event.isMainEvent ? 'main-event' : ''}`}
                                style={{
                                    backgroundColor: !event.useImageAsBackground ? stageColors[event.stage] : undefined,
                                    backgroundImage: event.useImageAsBackground && event.imageUrl ? `url(${event.imageUrl})` : undefined,
                                }}
                            >
                                <div className="card-front-content">
                                    <div className="card-header">
                                        <div>
                                            <h3 className="card-title">{event.title}</h3>
                                            <p className="card-stage">{event.stage}</p>
                                        </div>
                                        {event.isMainEvent && (
                                            <span className="badge-main">Main Event</span>
                                        )}
                                    </div>
                                </div>

                                <div className="card-footer">
                                    {event.date && (
                                        <span className="card-date">{event.date}</span>
                                    )}
                                    <span className="card-number">#{event.order + 1}</span>
                                </div>
                            </div>

                            <div className="card-back" style={{ borderTop: `4px solid ${stageColors[event.stage]}` }}>
                                <div>
                                    <h4 className="card-back-header" style={{ borderBottomColor: stageColors[event.stage] }}>Details</h4>
                                    <p className="card-description">{event.description}</p>
                                </div>

                                <div className="card-actions">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            getAiInsight(event, 'view');
                                        }}
                                        className="btn-ai"
                                        title="Get AI insights about this event"
                                    >
                                        🤖
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditEvent(event);
                                        }}
                                        className="btn-edit"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteClick(event);
                                        }}
                                        className="btn-delete"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="stage-legend">
                <h3>Story Stages</h3>
                <div className="stage-colors">
                    {Object.entries(stageColors).map(([stage, color]) => (
                        <div key={stage} className="stage-item">
                            <div className="stage-color-box" style={{ backgroundColor: color }} />
                            <span className="stage-label">{stage}</span>
                        </div>
                    ))}
                </div>
            </div>

            {showDeleteModal && (
                <div className="delete-modal">
                    <div className="modal-content">
                        <h3>Delete Event?</h3>
                        <p>
                            Are you sure you want to delete "{eventToDelete?.title}"? This action cannot be undone.
                        </p>
                        <div className="modal-actions">
                            <button onClick={() => setShowDeleteModal(false)} className="btn-cancel">
                                Cancel
                            </button>
                            <button onClick={handleConfirmDelete} className="btn-confirm-delete">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TimelineCardGrid;