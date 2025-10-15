import React, { useState, useEffect } from "react";

const NewEventModal = ({ isOpen, closeModal, onSave, stages }) => {
    const [event, setEvent] = useState({
        date: "",
        title: "",
        description: "",
        isMainEvent: false,
        stage: stages && stages[0] ? stages[0] : "introduction",
    });

    useEffect(() => {
        if (!isOpen) {
            setEvent({
                date: "",
                title: "",
                description: "",
                isMainEvent: false,
                stage: stages && stages[0] ? stages[0] : "introduction",
            });
        }
    }, [isOpen, stages]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!event.title || !event.description) {
            alert("Please fill in title and description.");
            return;
        }
        onSave(event);
    };

    const handleClose = () => {
        setEvent({
            date: "",
            title: "",
            description: "",
            isMainEvent: false,
            stage: stages && stages[0] ? stages[0] : "introduction",
        });
        closeModal();
    };

    return (
        <div className="timeline-modal-overlay" onClick={handleClose}>
            <div className="timeline-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="timeline-modal-header">
                    <span>➕</span>
                    Add New Event
                </h3>

                <div className="timeline-modal-form">
                    <div className="timeline-form-group">
                        <label>Title *</label>
                        <input
                            type="text"
                            value={event.title}
                            onChange={(e) => setEvent({ ...event, title: e.target.value })}
                            placeholder="Enter event title..."
                            autoFocus
                        />
                    </div>

                    <div className="timeline-form-group">
                        <label>Description *</label>
                        <textarea
                            value={event.description}
                            onChange={(e) => setEvent({ ...event, description: e.target.value })}
                            placeholder="Describe what happens in this event..."
                            rows={4}
                        />
                    </div>

                    <div className="timeline-form-group">
                        <label>Story Stage *</label>
                        <select
                            value={event.stage}
                            onChange={(e) => setEvent({ ...event, stage: e.target.value })}
                        >
                            {stages && stages.map((stage) => (
                                <option key={stage} value={stage}>
                                    {stage.charAt(0).toUpperCase() + stage.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="timeline-form-group">
                        <label>Date (Optional)</label>
                        <input
                            type="date"
                            value={event.date}
                            onChange={(e) => setEvent({ ...event, date: e.target.value })}
                        />
                    </div>

                    <div className="timeline-checkbox-group">
                        <input
                            type="checkbox"
                            id="isMainEvent"
                            checked={event.isMainEvent}
                            onChange={(e) => setEvent({ ...event, isMainEvent: e.target.checked })}
                        />
                        <label htmlFor="isMainEvent">Mark as Main Event</label>
                    </div>
                </div>

                <div className="timeline-modal-actions">
                    <button 
                        className="timeline-modal-btn timeline-btn-save" 
                        onClick={handleSave}
                    >
                        Create Event
                    </button>
                    <button 
                        className="timeline-modal-btn timeline-btn-cancel" 
                        onClick={handleClose}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewEventModal;