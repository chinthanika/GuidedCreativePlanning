import React, { useState, useEffect } from 'react';

const RenameWorldModal = ({ isOpen, closeModal, currentName, onSave }) => {
    const [worldName, setWorldName] = useState(currentName || '');

    useEffect(() => {
        if (currentName) {
            setWorldName(currentName);
        }
    }, [currentName]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!worldName.trim()) {
            alert('World name cannot be empty');
            return;
        }
        onSave(worldName.trim());
    };

    const handleClose = () => {
        setWorldName(currentName || '');
        closeModal();
    };

    return (
        <div className="world-modal-overlay" onClick={handleClose}>
            <div className="world-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <h3 className="world-modal-header">
                    📖 Rename World
                </h3>

                <div className="world-modal-form">
                    <div className="form-group">
                        <label>World Name</label>
                        <input
                            type="text"
                            value={worldName}
                            onChange={(e) => setWorldName(e.target.value)}
                            placeholder="Enter world name..."
                            autoFocus
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleSave();
                                }
                            }}
                        />
                    </div>
                </div>

                <div className="world-modal-actions">
                    <button className="world-modal-btn btn-save" onClick={handleSave}>
                        Save
                    </button>
                    <button className="world-modal-btn btn-cancel" onClick={handleClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RenameWorldModal;