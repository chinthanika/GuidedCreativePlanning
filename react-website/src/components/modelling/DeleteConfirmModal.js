import React from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

const DeleteConfirmModal = ({ analysis, onConfirm, onCancel }) => {
    const truncatedExcerpt = analysis.excerpt?.substring(0, 100) || 'this analysis';

    return (
        <div className="mentor-text-modal-overlay" onClick={onCancel}>
            <div 
                className="mentor-text-confirm-modal" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mentor-text-confirm-icon">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>

                <h3 className="mentor-text-confirm-title">
                    Delete This Analysis?
                </h3>

                <p className="mentor-text-confirm-message">
                    You're about to delete the analysis for:
                </p>

                <div className="mentor-text-confirm-excerpt">
                    "{truncatedExcerpt}..."
                </div>

                <p className="mentor-text-confirm-warning">
                    This action cannot be undone.
                </p>

                <div className="mentor-text-confirm-actions">
                    <button
                        onClick={onCancel}
                        className="mentor-text-confirm-btn cancel"
                    >
                        <X className="w-4 h-4" />
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="mentor-text-confirm-btn delete"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal;