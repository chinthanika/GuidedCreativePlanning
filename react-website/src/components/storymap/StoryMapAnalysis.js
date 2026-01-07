import { useState } from 'react';
import { AlertCircle, CheckCircle, Info, TrendingUp, Users, GitMerge } from 'lucide-react';

export default function StoryMapAnalysis({ data, onMergeNodes }) {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  const analyzeStructure = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:5000/api/story-map/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current_user_id', // Replace with actual user ID
          nodes: data.nodes,
          links: data.links,
          genre: 'fantasy', // Optional: get from user profile
          context: '' // Optional: allow user to provide context
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
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
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return <AlertCircle className="w-5 h-5" />;
      case 'medium': return <Info className="w-5 h-5" />;
      case 'low': return <TrendingUp className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'duplicate_detection': return <GitMerge className="w-5 h-5" />;
      case 'character_centrality': return <Users className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
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
    <div className="w-full max-w-4xl mx-auto p-6">
      {/* Analyze Button */}
      <div className="mb-6">
        <button
          onClick={analyzeStructure}
          disabled={isAnalyzing || data.nodes.length < 2}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
        >
          {isAnalyzing ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing Structure...
            </span>
          ) : (
            '🔍 Analyze Structure'
          )}
        </button>
        
        {data.nodes.length < 2 && (
          <p className="text-sm text-gray-500 mt-2">
            Need at least 2 entities to analyze structure
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Analysis Failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Overall Health Card */}
          <div className="bg-white border rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                Structure Analysis
              </h2>
              <div className="flex items-center gap-2">
                <div className={`px-4 py-2 rounded-full font-semibold ${
                  analysis.overall_health === 'good' ? 'bg-green-100 text-green-800' :
                  analysis.overall_health === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {analysis.overall_health.toUpperCase()}
                </div>
                <div className="text-3xl font-bold text-gray-700">
                  {analysis.overall_score}/100
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">{analysis.summary}</p>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{analysis.node_count}</div>
                <div className="text-sm text-gray-500">Entities</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{analysis.link_count}</div>
                <div className="text-sm text-gray-500">Relationships</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{analysis.avg_connections.toFixed(1)}</div>
                <div className="text-sm text-gray-500">Avg Connections</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{analysis.isolated_nodes}</div>
                <div className="text-sm text-gray-500">Isolated</div>
              </div>
            </div>
          </div>

          {/* Severity Summary */}
          {analysis.issues.length > 0 && (
            <div className="bg-white border rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Issues Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold text-red-900">{analysis.severity_counts.high}</div>
                    <div className="text-sm text-red-700">High Priority</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                  <Info className="w-6 h-6 text-yellow-600" />
                  <div>
                    <div className="text-2xl font-bold text-yellow-900">{analysis.severity_counts.medium}</div>
                    <div className="text-sm text-yellow-700">Medium</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold text-blue-900">{analysis.severity_counts.low}</div>
                    <div className="text-sm text-blue-700">Low Priority</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Issues by Category */}
          {Object.entries(analysis.issues_by_category).map(([category, issues]) => (
            <div key={category} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getCategoryIcon(category)}
                  <h3 className="font-semibold text-gray-900">
                    {categoryLabels[category] || category}
                  </h3>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                    {issues.length}
                  </span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedCategories[category] ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedCategories[category] && (
                <div className="px-6 pb-4 space-y-3">
                  {issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 ${getSeverityColor(issue.severity)}`}
                    >
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1 min-w-0">
                          {/* Entity Names */}
                          {issue.names && issue.names.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {issue.names.map((name, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-white bg-opacity-60 rounded text-sm font-medium"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Reasoning */}
                          <p className="text-sm font-medium mb-2">
                            {issue.reasoning}
                          </p>

                          {/* Question (for non-duplicate issues) */}
                          {issue.question && (
                            <p className="text-sm italic mb-3 opacity-90">
                              💭 {issue.question}
                            </p>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 mt-3">
                            {issue.action === 'merge' && (
                              <button
                                onClick={() => handleMergeClick(issue)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium flex items-center gap-2"
                              >
                                <GitMerge className="w-4 h-4" />
                                Merge → {issue.merge_suggestion}
                              </button>
                            )}
                            
                            {issue.confidence && (
                              <span className="text-xs px-2 py-1 bg-white bg-opacity-60 rounded">
                                {Math.round(issue.confidence * 100)}% confident
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Strengths */}
          {analysis.strengths && analysis.strengths.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">Strengths</h3>
                  <ul className="space-y-1">
                    {analysis.strengths.map((strength, idx) => (
                      <li key={idx} className="text-sm text-green-800">
                        ✓ {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Genre Insights */}
          {analysis.genre_insights && analysis.genre_insights.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 text-purple-600 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-purple-900 mb-2">Genre Insights</h3>
                  <ul className="space-y-1">
                    {analysis.genre_insights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-purple-800">
                        • {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}