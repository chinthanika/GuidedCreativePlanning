
import React, { useState, useEffect } from 'react';
import {
    Library, Star, Trash2, FolderPlus, X, Search,
    Filter, BookOpen, Heart, Sparkles, Plus, Folder,
    Check, AlertTriangle
} from 'lucide-react';

const API_BASE = "http://localhost:5000";

// Create Collection Modal Component
const CreateCollectionModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [error, setError] = useState('');

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }

    if (name.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    onCreate({
      name: name.trim(),
      description: description.trim(),
      tags
    });
  };

  return (
    <div className="library-modal-overlay" onClick={onClose}>
      <div className="library-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-collection-header">
          <div className="library-collection-header-title">
            <Plus className="w-6 h-6 text-blue-600" />
            <h3>Create New Collection</h3>
          </div>
          <button className="library-close-btn" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="library-create-form">
          {error && (
            <div className="library-form-error">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="library-form-group">
            <label>Collection Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Summer Reading, Favorites"
              maxLength={50}
              className="library-form-input"
              autoFocus
            />
            <span className="library-form-hint">{name.length}/50 characters</span>
          </div>

          <div className="library-form-group">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              rows={3}
              maxLength={200}
              className="library-form-textarea"
            />
          </div>

          <div className="library-form-group">
            <label>Tags (optional)</label>
            <div className="library-tag-input-wrapper">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags (press Enter)"
                className="library-form-input"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="library-tag-add-btn"
                disabled={!tagInput.trim() || tags.length >= 10}
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="library-tag-list">
                {tags.map((tag, idx) => (
                  <span key={idx} className="library-tag-item">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="library-tag-remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <span className="library-form-hint">{tags.length}/10 tags</span>
          </div>

          <div className="library-form-actions">
            <button type="button" onClick={onClose} className="library-form-btn cancel">
              Cancel
            </button>
            <button type="submit" className="library-form-btn create">
              <Plus className="w-4 h-4" />
              Create Collection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCollectionModal;