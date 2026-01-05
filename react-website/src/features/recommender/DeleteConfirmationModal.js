import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

const DeleteConfirmModal = ({ book, onConfirm, onCancel }) => {
  return (
    <div className="library-modal-overlay" onClick={onCancel}>
      <div className="library-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-confirm-icon">
          <AlertTriangle className="w-12 h-12 text-red-500" />
        </div>
        <h3 className="library-confirm-title">Remove from Library?</h3>
        <p className="library-confirm-message">
          Are you sure you want to remove <strong>{book.title}</strong>? This action cannot be undone.
        </p>
        <div className="library-confirm-actions">
          <button 
            className="library-confirm-btn cancel"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button 
            className="library-confirm-btn confirm"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            <Trash2 className="w-4 h-4" />
            Remove Book
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;