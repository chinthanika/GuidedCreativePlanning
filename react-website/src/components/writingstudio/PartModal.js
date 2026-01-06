import React, { useState, useEffect } from 'react';
import './story-modals.css';

// Modal for creating/editing parts (chapters, scenes, notes, etc.)
const PartModal = ({ isOpen, closeModal, onSave, part = null, storyTitle }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('chapter');
  const [description, setDescription] = useState('');

  const partTypes = [
    { value: 'chapter', label: '📖 Chapter' },
    { value: 'scene', label: '🎬 Scene' },
    { value: 'notes', label: '📝 Notes' },
    { value: 'outline', label: '📋 Outline' },
    { value: 'other', label: '📄 Other' },
  ];

  useEffect(() => {
    if (isOpen) {
      if (part) {
        setTitle(part.title || '');
        setType(part.type || 'chapter');
        setDescription(part.description || '');
      } else {
        setTitle('');
        setType('chapter');
        setDescription('');
      }
    }
  }, [isOpen, part]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    onSave({ 
      title: title.trim(), 
      type, 
      description: description.trim() 
    });
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setType('chapter');
    setDescription('');
    closeModal();
  };

  return (
    <div className="story-modal-overlay" onClick={handleClose}>
      <div className="story-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="story-modal-header">
          <span>{part ? '✏️' : '➕'}</span>
          {part ? 'Edit Part' : 'Add New Part'}
        </h3>

        {storyTitle && !part && (
          <p className="story-modal-subtitle">Adding to: <strong>{storyTitle}</strong></p>
        )}

        <div className="story-modal-form">
          <div className="story-form-group">
            <label>Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {partTypes.map(pt => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="story-form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Enter ${type} title...`}
              autoFocus
            />
          </div>

          <div className="story-form-group">
            <label>Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={2}
            />
          </div>
        </div>

        <div className="story-modal-actions">
          <button 
            className="story-modal-btn story-btn-save" 
            onClick={handleSave}
          >
            {part ? 'Save Changes' : `Add ${type}`}
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

export default PartModal;
