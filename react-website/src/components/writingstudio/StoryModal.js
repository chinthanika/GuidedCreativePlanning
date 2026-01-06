import React, { useState, useEffect } from 'react';
import './story-modals.css';

// Modal for creating/editing stories
const StoryModal = ({ isOpen, closeModal, onSave, story = null }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (story) {
        setTitle(story.title || '');
        setDescription(story.description || '');
      } else {
        setTitle('');
        setDescription('');
      }
    }
  }, [isOpen, story]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    onSave({ title: title.trim(), description: description.trim() });
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    closeModal();
  };

  return (
    <div className="story-modal-overlay" onClick={handleClose}>
      <div className="story-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="story-modal-header">
          <span>{story ? '✏️' : '➕'}</span>
          {story ? 'Edit Story' : 'Create New Story'}
        </h3>

        <div className="story-modal-form">
          <div className="story-form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter story title..."
              autoFocus
            />
          </div>

          <div className="story-form-group">
            <label>Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your story..."
              rows={3}
            />
          </div>
        </div>

        <div className="story-modal-actions">
          <button 
            className="story-modal-btn story-btn-save" 
            onClick={handleSave}
          >
            {story ? 'Save Changes' : 'Create Story'}
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

export default StoryModal;