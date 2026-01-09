
import React from 'react';
import { X } from 'lucide-react';
import './feedback-panel.css'; // Import the CSS

const AnalysisPanel = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="feedback-panel">
      <div className="feedback-header">
        <h3>🔍 Story Map Analysis</h3>
        <button onClick={onClose} className="icon-btn">
          <X size={18} />
        </button>
      </div>

      <div className="feedback-content">
        {children}
      </div>
    </div>
  );
};

export default AnalysisPanel;