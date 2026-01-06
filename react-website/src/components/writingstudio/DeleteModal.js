import React, { useState, useEffect } from 'react';
import './story-modals.css';

// Delete confirmation modal
const DeleteModal = ({ isOpen, closeModal, onConfirm, itemType, itemTitle }) => {
  if (!isOpen) return null;

  return (
    <div className="story-modal-overlay" onClick={closeModal}>
      <div className="story-modal-content story-modal-small" onClick={(e) => e.stopPropagation()}>
        <h3 className="story-modal-header story-modal-danger">
          <span>⚠️</span>
          Delete {itemType}?
        </h3>

        <div className="story-modal-form">
          <p className="story-delete-warning">
            Are you sure you want to delete <strong>"{itemTitle}"</strong>?
          </p>
          <p className="story-delete-note">
            This action cannot be undone.
          </p>
        </div>

        <div className="story-modal-actions">
          <button 
            className="story-modal-btn story-btn-cancel" 
            onClick={closeModal}
          >
            Cancel
          </button>
          <button 
            className="story-modal-btn story-btn-delete" 
            onClick={() => {
              onConfirm();
              closeModal();
            }}
          >
            Delete {itemType}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;