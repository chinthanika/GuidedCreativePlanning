import React from 'react';
import { X } from 'lucide-react';

const FeedbackPanel = ({ isOpen, onClose, feedback, isLoading }) => {
  if (!isOpen) return null;

  // Extract the actual feedback data
  // Handle both direct feedback and nested feedback.feedback structure
  const feedbackData = feedback?.feedback || feedback;
  const hasError = feedback?.error || feedbackData?.error;

  return (
    <div className="feedback-panel">
      <div className="feedback-header">
        <h3>📝 AI Feedback</h3>
        <button onClick={onClose} className="icon-btn">
          <X size={18} />
        </button>
      </div>

      {isLoading ? (
        <div className="feedback-loading">
          <div className="loading-spinner"></div>
          <p>Analyzing your draft...</p>
        </div>
      ) : hasError ? (
        <div className="feedback-error">
          <p><strong>Error:</strong> {hasError}</p>
          {feedback?.details && <p className="error-details">{feedback.details}</p>}
        </div>
      ) : feedbackData?.overallScore ? (
        <div className="feedback-content">
          <div className="feedback-score">
            Overall Score: <strong>{feedbackData.overallScore}/10</strong>
          </div>

          {feedbackData.topPriority && (
            <div className="feedback-priority">
              🎯 <strong>Top Priority:</strong> {feedbackData.topPriority}
            </div>
          )}

          {feedbackData.contextUsed && (
            <div className="context-info">
              <strong>Story Context Used:</strong>
              <ul>
                <li>{feedbackData.contextUsed.characters || 0} characters</li>
                <li>{feedbackData.contextUsed.locations || 0} locations</li>
                <li>{feedbackData.contextUsed.events || 0} events</li>
                <li>{feedbackData.contextUsed.relationships || 0} relationships</li>
              </ul>
            </div>
          )}

          {feedbackData.categories?.map((cat, idx) => (
            <div key={idx} className="feedback-category">
              <div className="category-header">
                <span className="category-icon">{cat.icon}</span>
                <strong>{cat.name}</strong>
                <span className="category-score">({cat.score}/10)</span>
              </div>
              <div className="category-strength">
                <strong>✓ Strength:</strong> {cat.strength}
              </div>
              <div className="category-suggestion">
                <strong>💡 Suggestion:</strong> {cat.suggestion}
              </div>
            </div>
          ))}

          {feedbackData.processingTime && (
            <div className="feedback-meta">
              <small>Analysis completed in {feedbackData.processingTime}ms</small>
            </div>
          )}
        </div>
      ) : (
        <div className="feedback-empty">
          <p>Click "Get Feedback" to analyze your draft with AI</p>
        </div>
      )}
    </div>
  );
};

export default FeedbackPanel;