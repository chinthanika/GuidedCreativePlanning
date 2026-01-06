import React from 'react';
import { X } from 'lucide-react';

const FeedbackPanel = ({ isOpen, onClose, feedback, isLoading }) => {
  if (!isOpen) return null;

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
      ) : feedback?.error ? (
        <div className="feedback-error">
          <p>{feedback.error}</p>
        </div>
      ) : feedback ? (
        <div className="feedback-content">
          <div className="feedback-score">
            Overall Score: <strong>{feedback.overallScore}/10</strong>
          </div>

          {feedback.topPriority && (
            <div className="feedback-priority">
              🎯 Top Priority: {feedback.topPriority}
            </div>
          )}

          {feedback.contextUsed && (
            <div className="context-info">
              <strong>Story Context Used:</strong>
              <ul>
                <li>{feedback.contextUsed.characters} characters</li>
                <li>{feedback.contextUsed.locations} locations</li>
                <li>{feedback.contextUsed.events} events</li>
                <li>{feedback.contextUsed.relationships} relationships</li>
              </ul>
            </div>
          )}

          {feedback.categories?.map((cat, idx) => (
            <div key={idx} className="feedback-category">
              <div className="category-header">
                <span className="category-icon">{cat.icon}</span>
                <strong>{cat.name}</strong>
                <span className="category-score">({cat.score}/10)</span>
              </div>
              <div className="category-strength">
                <strong>Strength:</strong> {cat.strength}
              </div>
              <div className="category-suggestion">
                <strong>Suggestion:</strong> {cat.suggestion}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="feedback-empty">
          Click "Get Feedback" to analyze your draft with AI
        </div>
      )}
    </div>
  );
};

export default FeedbackPanel;
