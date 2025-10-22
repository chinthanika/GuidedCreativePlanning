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

    // Toast notification helper
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Fetch events
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

            console.log("Fetched events:", eventsArray);
            const sortedEvents = eventsArray.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            console.log("Sorted events:", sortedEvents);
            setEvents(sortedEvents);
        } catch (error) {
            console.error("Error fetching events:", error);
            showToast("Failed to load events", "error");
        } finally {
            setLoading(false);
        }
    };

    // Drag-and-drop
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

        // Batch update orders
        try {
            const updates = updatedItems.map(ev => ({
                eventId: ev.id,
                order: ev.order,
            }));

            await axios.post(`${API_BASE}/events/batch-update`, {
                userId,
                updates,
            });

            console.log("Reorder saved successfully.");
            showToast("Events reordered successfully!", "success");
        } catch (error) {
            console.error("Error saving reordered events:", error);
            showToast("Failed to save new order", "error");
            fetchEvents();
        } finally {
            setReordering(false);
        }
    };

    // Flip cards
    const handleCardClick = (id) => {
        setFlippedCard(flippedCard === id ? null : id);
    };

    // Add event
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
        } catch (error) {
            console.error("Error saving event:", error);
            showToast("Failed to save event", "error");
        }
    };

    // Edit event
    const handleEditEvent = (event, e) => {
        if (e) {
            e.stopPropagation(); // Prevent card flip
        }
        setSelectedEvent(event);
        setIsEventDetailsModalOpen(true);
        setFlippedCard(null); // Close any flipped cards
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
        } catch (error) {
            console.error("Error updating event:", error);
            showToast("Failed to update event", "error");
        }
    };

    // Delete event
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

    // Add this new handler function
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


    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading events...</p>
            </div>
        );
    }

    const handleGenerateImage = async (description) => {
        try {
            const response = await axios.post('https://guidedcreativeplanning-1.onrender.com/images', {
                description
            });
            return response.data.image_url;
        } catch (error) {
            console.error("Error generating image:", error);
            throw error;
        }
    };

    return (
        <div className="timeline-card-grid">
            {/* Toast Notification */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'success' ? '[PASS]' : '✕'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                </div>
            )}

            {/* Reordering Overlay */}
            {reordering && (
                <div className="reorder-overlay">
                    <div className="reorder-spinner"></div>
                    <p>Saving new order...</p>
                </div>
            )}

            <div className="timeline-header">
                <h2>Story Timeline</h2>
                <button onClick={handleAddEvent} className="timeline-btn btn-add">
                    + Add Event
                </button>
            </div>

            <p className="timeline-info">
                <strong>Tip:</strong> Drag cards to reorder events. Click a card to flip and see details.
            </p>

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
                                // Don't flip if clicking a button
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
                                {/* ... front card content ... */}
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

            {/* Stage Legend */}
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

            {/* Delete Confirmation Modal */}
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
