import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthValue } from '../../Firebase/AuthContext';
import { logAnalysisPanelInteraction } from '../../utils/analytics';
import './feedback-panel.css';

const AnalysisPanel = ({ isOpen, onClose, children }) => {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;
  
  const [panelOpenTime, setPanelOpenTime] = useState(null);
  
  useEffect(() => {
    if (isOpen) {
      setPanelOpenTime(Date.now());
    } else if (panelOpenTime) {
      // Panel closed - log duration
      const timeSpent = Date.now() - panelOpenTime;
      
      if (userId) {
        logAnalysisPanelInteraction(userId, 'close', timeSpent);
      }
      
      setPanelOpenTime(null);
    }
  }, [isOpen, userId]);
  
  const handleClose = () => {
    // Track explicit close action
    if (panelOpenTime && userId) {
      const timeSpent = Date.now() - panelOpenTime;
      
      logAnalysisPanelInteraction(userId, 'close', timeSpent, {
        closeMethod: 'button'
      });
    }
    
    onClose();
  };
  
  if (!isOpen) return null;

  return (
    <div className="feedback-panel">
      <div className="feedback-header">
        <h3>🔍 Story Map Analysis</h3>
        <button onClick={handleClose} className="icon-btn">
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