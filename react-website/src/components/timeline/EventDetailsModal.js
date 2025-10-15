import React, { useState, useEffect } from "react";

const EventDetailsModal = ({ isOpen, closeModal, event, onSave, onDelete, onGenerateImage }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editableEvent, setEditableEvent] = useState(event || {});
    const [imageUrl, setImageUrl] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (event) {
            setEditableEvent(event);
            setImageUrl(event.imageUrl || "");
        }
        setIsEditing(false);
    }, [event]);

    if (!isOpen || !event) return null;

    const handleGenerateImage = async () => {
        if (!editableEvent.description) {
            alert("Please add a description first to generate an image.");
            return;
        }

        setIsGenerating(true);
        try {
            const generatedImageUrl = await onGenerateImage(editableEvent.description);
            setImageUrl(generatedImageUrl);
            setEditableEvent({ 
                ...editableEvent, 
                imageUrl: generatedImageUrl 
            });
        } catch (error) {
            console.error("Error generating image:", error);
            alert("Failed to generate image. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = () => {
        const eventToSave = {
            ...editableEvent,
            imageUrl: imageUrl || editableEvent.imageUrl
        };
        onSave(eventToSave);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if (window.confirm(`Delete "${event.title}"? This action cannot be undone.`)) {
            onDelete(event);
        }
    };

    const handleClose = () => {
        setEditableEvent(event);
        setImageUrl(event.imageUrl || "");
        setIsEditing(false);
        closeModal();
    };

    const stages = [
        "introduction",
        "rising action",
        "climax",
        "falling action",
        "resolution"
    ];

    return (
        <div className="timeline-modal-overlay" onClick={handleClose}>
            <div className="timeline-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="timeline-modal-header">
                    <span>📝</span>
                    {event.title}
                </h3>

                <div className="timeline-modal-form">
                    <div className="timeline-form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={editableEvent.title || ""}
                            onChange={(e) => setEditableEvent({ ...editableEvent, title: e.target.value })}
                            disabled={!isEditing}
                        />
                    </div>

                    <div className="timeline-form-group">
                        <label>Date</label>
                        <input
                            type="date"
                            value={editableEvent.date || ""}
                            onChange={(e) => setEditableEvent({ ...editableEvent, date: e.target.value })}
                            disabled={!isEditing}
                        />
                    </div>

                    <div className="timeline-form-group">
                        <label>Story Stage</label>
                        <select
                            value={editableEvent.stage || ""}
                            onChange={(e) => setEditableEvent({ ...editableEvent, stage: e.target.value })}
                            disabled={!isEditing}
                        >
                            {stages.map((stage) => (
                                <option key={stage} value={stage}>
                                    {stage.charAt(0).toUpperCase() + stage.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="timeline-form-group">
                        <label>Description</label>
                        <textarea
                            value={editableEvent.description || ""}
                            onChange={(e) => setEditableEvent({ ...editableEvent, description: e.target.value })}
                            rows={4}
                            disabled={!isEditing}
                        />
                    </div>

                    <div className="timeline-checkbox-group">
                        <input
                            type="checkbox"
                            id="isMainEventEdit"
                            checked={editableEvent.isMainEvent || false}
                            onChange={(e) => setEditableEvent({ 
                                ...editableEvent, 
                                isMainEvent: e.target.checked 
                            })}
                            disabled={!isEditing}
                        />
                        <label htmlFor="isMainEventEdit">Mark as Main Event</label>
                    </div>

                    {imageUrl && (
                        <div className="timeline-image-preview">
                            <img src={imageUrl} alt="Event visualization" />
                        </div>
                    )}

                    {imageUrl && (
                        <div className="timeline-checkbox-group">
                            <input
                                type="checkbox"
                                id="useAsBackground"
                                checked={editableEvent.useImageAsBackground || false}
                                onChange={(e) => setEditableEvent({ 
                                    ...editableEvent, 
                                    useImageAsBackground: e.target.checked 
                                })}
                                disabled={!isEditing}
                            />
                            <label htmlFor="useAsBackground">Use as card background</label>
                        </div>
                    )}

                    {isEditing && onGenerateImage && (
                        <button
                            onClick={handleGenerateImage}
                            className="timeline-modal-btn timeline-btn-generate"
                            disabled={isGenerating}
                            style={{ width: '100%' }}
                        >
                            {isGenerating ? "Generating..." : "🎨 Generate Image from Description"}
                        </button>
                    )}
                </div>

                <div className="timeline-modal-actions">
                    {isEditing ? (
                        <>
                            <button 
                                className="timeline-modal-btn timeline-btn-save" 
                                onClick={handleSave}
                            >
                                Save Changes
                            </button>
                            <button 
                                className="timeline-modal-btn timeline-btn-cancel" 
                                onClick={() => {
                                    setEditableEvent(event);
                                    setImageUrl(event.imageUrl || "");
                                    setIsEditing(false);
                                }}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                className="timeline-modal-btn timeline-btn-save" 
                                onClick={() => setIsEditing(true)}
                            >
                                Edit
                            </button>
                            <button 
                                className="timeline-modal-btn timeline-btn-delete" 
                                onClick={handleDelete}
                            >
                                Delete
                            </button>
                            <button 
                                className="timeline-modal-btn timeline-btn-cancel" 
                                onClick={handleClose}
                            >
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EventDetailsModal;