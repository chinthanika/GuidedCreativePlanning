import React from 'react';
import { X } from 'lucide-react';

const AnalysisPanel = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h3>🔍 Story Map Analysis</h3>
        <button onClick={onClose} className="icon-btn">
          <X size={18} />
        </button>
      </div>

      <div className="analysis-content">
        {children}
      </div>
    </div>
  );
};

export default AnalysisPanel;