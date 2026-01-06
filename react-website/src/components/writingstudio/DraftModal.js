import React, { useState, useEffect } from 'react';
import './story-modals.css';

// Modal for creating/editing drafts
const DraftModal = ({ isOpen, closeModal, onSave, draft = null, partTitle }) => {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (draft) {
        setTitle(draft.title || `Draft ${draft.version || 1}`);
      } else {
        setTitle('');
      }
    }
  }, [isOpen, draft]);

  if (!isOpen) return null;

  const handleSave = () => {
    const finalTitle = title.trim() || 'Untitled Draft';
    onSave({ title: finalTitle });
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    closeModal();
  };

  return (
    <div className="story-modal-overlay" onClick={handleClose}>
      <div className="story-modal-content story-modal-small" onClick={(e) => e.stopPropagation()}>
        <h3 className="story-modal-header">
          <span>{draft ? '✏️' : '➕'}</span>
          {draft ? 'Rename Draft' : 'Create New Draft'}
        </h3>

        {partTitle && !draft && (
          <p className="story-modal-subtitle">For: <strong>{partTitle}</strong></p>
        )}

        <div className="story-modal-form">
          <div className="story-form-group">
            <label>Draft Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Draft 1, Final Draft, Revision 2..."
              autoFocus
            />
          </div>
        </div>

        <div className="story-modal-actions">
          <button 
            className="story-modal-btn story-btn-save" 
            onClick={handleSave}
          >
            {draft ? 'Save' : 'Create Draft'}
          </button>
          <button 
            className="story-modal-btn story-btn-cancel" 
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DraftModal;