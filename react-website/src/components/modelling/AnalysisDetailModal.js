import React, { useState, useEffect } from 'react';
import { 
    X, BookOpen, Lightbulb, Target, Award, 
    ChevronDown, ChevronUp, Loader2, Trash2 
} from 'lucide-react';

import './analysis-details.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

const AnalysisDetailModal = ({ 
    analysisId, 
    userId, 
    isOpen, 
    onClose, 
    onDelete,
    initialData = null  // For showing results immediately after creation
}) => {
    const [analysis, setAnalysis] = useState(initialData);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState(null);
    const [expandedPoints, setExpandedPoints] = useState(new Set());

    useEffect(() => {
        if (isOpen && !initialData && analysisId && userId) {
            loadFullAnalysis();
        }
    }, [isOpen, analysisId, userId, initialData]);

    const loadFullAnalysis = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/mentor-text/library/${analysisId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                const data = await response.json();
                setAnalysis(data.analysis);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load analysis');
            }
        } catch (err) {
            console.error('Failed to load analysis:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const togglePoint = (index) => {
        const newExpanded = new Set(expandedPoints);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedPoints(newExpanded);
    };

    const handleDelete = () => {
        onDelete(analysisId);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="analysis-detail-overlay" onClick={onClose}>
            <div 
                className="analysis-detail-modal" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="analysis-detail-header">
                    <div className="analysis-detail-header-title">
                        <BookOpen className="w-6 h-6" style={{ color: '#f59e0b' }} />
                        <h2>Mentor Text Analysis</h2>
                    </div>
                    <div className="analysis-detail-header-actions">
                        {analysisId && (
                            <button
                                onClick={handleDelete}
                                className="analysis-detail-delete-btn"
                                title="Delete analysis"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose} className="analysis-detail-close-btn">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="analysis-detail-content">
                    {loading ? (
                        <div className="analysis-detail-loading">
                            <Loader2 className="w-16 h-16 analysis-loading-spinner" />
                            <p>Loading full analysis...</p>
                        </div>
                    ) : error ? (
                        <div className="analysis-detail-error">
                            <p>{error}</p>
                            <button onClick={loadFullAnalysis} className="analysis-retry-btn">
                                Try Again
                            </button>
                        </div>
                    ) : analysis ? (
                        <>
                            {/* Genre & Focus Badges */}
                            <div className="analysis-detail-badges">
                                <div className="analysis-genre-badge">
                                    📖 {analysis.genreIdentified || 'General Fiction'}
                                </div>
                                <div className="analysis-focus-badge">
                                    Focus: {analysis.metadata?.userProvided?.focus?.replace(/_/g, ' ') || 'general'}
                                </div>
                            </div>

                            {/* Overall Lesson */}
                            {analysis.overallLesson && (
                                <div className="analysis-overall-lesson">
                                    <div className="analysis-lesson-icon">
                                        <Lightbulb className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3>Key Takeaway</h3>
                                        <p>{analysis.overallLesson}</p>
                                    </div>
                                </div>
                            )}

                            {/* Pedagogical Rationale */}
                            {analysis.pedagogicalRationale && (
                                <div className="analysis-rationale">
                                    <h4>Teaching Approach</h4>
                                    <p>{analysis.pedagogicalRationale}</p>
                                </div>
                            )}

                            {/* Teaching Points */}
                            <div className="analysis-teaching-points">
                                <h3 className="analysis-section-title">
                                    Teaching Points ({analysis.teachingPoints?.length || 0})
                                </h3>

                                {analysis.teachingPoints?.map((point, idx) => (
                                    <div key={idx} className="analysis-teaching-point">
                                        <div 
                                            className="analysis-point-header"
                                            onClick={() => togglePoint(idx)}
                                        >
                                            <div className="analysis-point-header-left">
                                                <div className="analysis-point-number">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <h4 className="analysis-point-title">
                                                        {point.techniqueName}
                                                    </h4>
                                                    {point.traitCategory && (
                                                        <div className="analysis-trait-badge">
                                                            {point.traitCategory.replace(/_/g, ' ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <button className="analysis-expand-btn">
                                                {expandedPoints.has(idx) ? (
                                                    <ChevronUp className="w-5 h-5" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>

                                        {expandedPoints.has(idx) && (
                                            <div className="analysis-point-content">
                                                {/* What Author Does */}
                                                <div className="analysis-point-section">
                                                    <h5>What the Author Does</h5>
                                                    <p>{point.whatAuthorDoes}</p>
                                                </div>

                                                {/* How It Works */}
                                                <div className="analysis-point-section">
                                                    <h5>How It Works</h5>
                                                    <p>{point.howItWorks}</p>
                                                </div>

                                                {/* Why It Matters */}
                                                <div className="analysis-point-section">
                                                    <h5>Why It Matters</h5>
                                                    <p>{point.whyItMatters}</p>
                                                </div>

                                                {/* Genre Convention */}
                                                {point.genreConvention && (
                                                    <div className="analysis-point-section analysis-convention">
                                                        <h5>Genre Convention</h5>
                                                        <p>{point.genreConvention}</p>
                                                    </div>
                                                )}

                                                {/* Student Application */}
                                                <div className="analysis-point-section analysis-application">
                                                    <div className="analysis-application-header">
                                                        <Target className="w-5 h-5" />
                                                        <h5>Try This in Your Story</h5>
                                                    </div>
                                                    <p>{point.studentApplication}</p>
                                                    {point.bloomsLevel && (
                                                        <div className="analysis-blooms-badge">
                                                            Cognitive Level: {point.bloomsLevel}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Related Techniques */}
                            {analysis.relatedTechniques && analysis.relatedTechniques.length > 0 && (
                                <div className="analysis-related-techniques">
                                    <h4>Related Techniques to Explore</h4>
                                    <div className="analysis-technique-tags">
                                        {analysis.relatedTechniques.map((tech, idx) => (
                                            <span key={idx} className="analysis-technique-tag">
                                                {tech}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Metadata Footer */}
                            {analysis.metadata && (
                                <div className="analysis-metadata-footer">
                                    <div className="analysis-meta-item">
                                        <span>Excerpt Length:</span>
                                        <strong>{analysis.metadata.excerptLength} characters</strong>
                                    </div>
                                    {analysis.metadata.validation && (
                                        <div className="analysis-meta-item">
                                            <span>Quality:</span>
                                            <strong className={`analysis-quality-${analysis.metadata.validation.quality}`}>
                                                {analysis.metadata.validation.quality}
                                            </strong>
                                        </div>
                                    )}
                                    <div className="analysis-meta-item">
                                        <span>Processing Time:</span>
                                        <strong>{(analysis.metadata.processingTime / 1000).toFixed(1)}s</strong>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="analysis-detail-empty">
                            <p>No analysis data available</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalysisDetailModal;