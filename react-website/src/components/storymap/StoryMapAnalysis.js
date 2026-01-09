import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, TrendingUp, Users, GitMerge } from 'lucide-react';
import './feedback-panel.css';

export default function StoryMapAnalysis({ 
  data, 
  onMergeNodes, 
  autoAnalyze = false, 
  cachedAnalysis = null,
  onAnalysisComplete 
}) {
  const [analysis, setAnalysis] = useState(cachedAnalysis);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const hasAnalyzedRef = useRef(false);

  const AI_API_BASE_URL = process.env.REACT_APP_AI_API_BASE_URL || 'https://guidedcreativeplanning-ai.onrender.com' || 'http://localhost:5000/';

  // Load cached analysis if provided
  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      hasAnalyzedRef.current = true;
    }
  }, [cachedAnalysis]);

  // Auto-analyze when component mounts if autoAnalyze is true
  useEffect(() => {
    if (autoAnalyze && data.nodes.length >= 2 && !hasAnalyzedRef.current) {
      hasAnalyzedRef.current = true;
      analyzeStructure();
    }
  }, [autoAnalyze, data.nodes.length]);

  const analyzeStructure = async () => {
    if (isAnalyzing) {
      console.log('Already analyzing, skipping...');
      return;
    }

    console.log('Starting analysis...');
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch(`${AI_API_BASE_URL}/api/story-map/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current_user_id',
          nodes: data.nodes,
          links: data.links,
          genre: 'fantasy',
          context: ''
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
      
      // Notify parent component
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
      console.log('Analysis complete');
    } catch (err) {
      setError(err.message);
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleMergeClick = (issue) => {
    if (issue.action === 'merge' && issue.affected_entities) {
      onMergeNodes(issue.affected_entities, issue.merge_suggestion);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'severity-high';
      case 'medium': return 'severity-medium';
      case 'low': return 'severity-low';
      default: return 'severity-default';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return 'ℹ️';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'duplicate_detection': return '🔀';
      case 'character_centrality': return '👥';
      case 'structural_coherence': return '🏗️';
      case 'genre_pattern': return '📚';
      case 'narrative_consistency': return '📖';
      case 'relationship_diversity': return '🔗';
      default: return 'ℹ️';
    }
  };

  const categoryLabels = {
    duplicate_detection: 'Duplicate Entities',
    structural_coherence: 'Structure & Coherence',
    genre_pattern: 'Genre Patterns',
    narrative_consistency: 'Narrative Consistency',
    relationship_diversity: 'Relationship Diversity',
    character_centrality: 'Character Roles'
  };

  return (
    <div>
      {/* Loading state */}
      {isAnalyzing && (
        <div className="feedback-loading">
          <div className="loading-spinner"></div>
          <p>Analyzing your story structure...</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="feedback-error">
          <strong>Analysis Failed</strong>
          <p>{error}</p>
          <div className="error-details">
            Please try again or contact support if the issue persists.
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !isAnalyzing && (
        <div>
          {/* Overall Score */}
          <div className="feedback-score">
            <strong>Overall Health: {analysis.overall_score}/100</strong>
            <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
              Status: {analysis.overall_health.toUpperCase()}
            </div>
          </div>

          {/* Summary */}
          {analysis.summary && (
            <div className="context-info">
              <strong>Summary</strong>
              <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {analysis.summary}
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="context-info">
            <strong>Graph Statistics</strong>
            <ul>
              <li>{analysis.node_count} entities in your story</li>
              <li>{analysis.link_count} relationships mapped</li>
              <li>{analysis.avg_connections.toFixed(1)} average connections per entity</li>
              {analysis.isolated_nodes > 0 && (
                <li style={{ color: 'var(--error-main)' }}>
                  {analysis.isolated_nodes} isolated entities
                </li>
              )}
            </ul>
          </div>

          {/* Priority Issues */}
          {analysis.severity_counts && analysis.severity_counts.high > 0 && (
            <div className="feedback-priority">
              <strong>⚠️ Priority Attention Required</strong>
              <div style={{ marginTop: '4px' }}>
                {analysis.severity_counts.high} high-priority {analysis.severity_counts.high === 1 ? 'issue' : 'issues'} found
              </div>
            </div>
          )}

          {/* Issues by Category */}
          {Object.entries(analysis.issues_by_category || {}).map(([category, issues]) => (
            <div key={category} className="feedback-category">
              <div 
                className="category-header"
                onClick={() => toggleCategory(category)}
                style={{ cursor: 'pointer' }}
              >
                <span className="category-icon">{getCategoryIcon(category)}</span>
                <strong>{categoryLabels[category] || category}</strong>
                <span className="category-score">
                  {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>

              {expandedCategories[category] && (
                <div style={{ marginTop: '12px', paddingLeft: '24px' }}>
                  {issues.map((issue, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: idx < issues.length - 1 ? '1px solid var(--divider)' : 'none'
                      }}
                    >
                      {/* Entity Names */}
                      {issue.names && issue.names.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          {issue.names.map((name, i) => (
                            <span 
                              key={i}
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                margin: '0 4px 4px 0',
                                background: 'var(--background-default)',
                                border: '1px solid var(--divider)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Severity & Reasoning */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px' }}>{getSeverityIcon(issue.severity)}</span>
                        <div style={{ flex: 1 }}>
                          <div className="category-suggestion">
                            {issue.reasoning}
                          </div>
                        </div>
                      </div>

                      {/* Question */}
                      {issue.question && (
                        <div style={{ 
                          marginTop: '8px',
                          padding: '8px',
                          background: 'var(--background-default)',
                          borderRadius: '4px',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic'
                        }}>
                          💭 {issue.question}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {issue.action === 'merge' && (
                        <button
                          onClick={() => handleMergeClick(issue)}
                          style={{
                            marginTop: '8px',
                            padding: '6px 12px',
                            background: 'var(--primary-main)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <GitMerge size={14} />
                          Merge → {issue.merge_suggestion}
                        </button>
                      )}

                      {/* Confidence */}
                      {issue.confidence && (
                        <div style={{ 
                          marginTop: '8px',
                          fontSize: '12px',
                          color: 'var(--text-disabled)'
                        }}>
                          {Math.round(issue.confidence * 100)}% confident
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Strengths */}
          {analysis.strengths && analysis.strengths.length > 0 && (
            <div className="feedback-category">
              <div className="category-header">
                <span className="category-icon">✨</span>
                <strong>Strengths</strong>
              </div>
              {analysis.strengths.map((strength, idx) => (
                <div key={idx} className="category-strength">
                  <strong>✓</strong> {strength}
                </div>
              ))}
            </div>
          )}

          {/* Genre Insights */}
          {analysis.genre_insights && analysis.genre_insights.length > 0 && (
            <div className="feedback-category">
              <div className="category-header">
                <span className="category-icon">📚</span>
                <strong>Genre Insights</strong>
              </div>
              {analysis.genre_insights.map((insight, idx) => (
                <div key={idx} className="category-suggestion">
                  • {insight}
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          {analysis.timestamp && (
            <div className="feedback-meta">
              <small>
                Analysis completed • {new Date(analysis.timestamp).toLocaleString()}
                {analysis.processing_time_ms && ` • ${(analysis.processing_time_ms / 1000).toFixed(1)}s`}
              </small>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!analysis && !isAnalyzing && !error && (
        <div className="feedback-empty">
          <p>
            Click "Analyze Structure" to get AI-powered insights about your story map.
          </p>
        </div>
      )}
    </div>
  );
}