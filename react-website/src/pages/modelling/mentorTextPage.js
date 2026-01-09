import React, { useState, useEffect } from 'react';
import {
    BookOpen, Plus, Search, Filter, Sparkles, 
    Loader2, AlertTriangle, X, Trash2
} from 'lucide-react';
import { useAuthValue } from '../../Firebase/AuthContext';

import MentorTextCard from '../../components/modelling/MentorTextCard';
import CreateAnalysisModal from '../../components/modelling/CreateAnalysisModal';
import DeleteConfirmModal from '../../components/modelling/DeleteConfirmModal';
import AnalysisDetailModal from '../../components/modelling/AnalysisDetailModal';

import "./mentor-text-page.css";

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

const MentorTextPage = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser?.uid;
    
    const [analyses, setAnalyses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterGenre, setFilterGenre] = useState('all');
    const [filterFocus, setFilterFocus] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [detailModal, setDetailModal] = useState({ isOpen: false, analysisId: null, data: null });

    useEffect(() => {
        loadAnalyses();
    }, [userId]);

    const loadAnalyses = async () => {
        if (!userId) {
            setError('Please log in to view your mentor text analyses');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/mentor-text/library`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                const data = await response.json();
                setAnalyses(data.analyses || []);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to load analyses');
            }
        } catch (err) {
            console.error('Failed to load analyses:', err);
            setError(`Network error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAnalysis = async (analysisData) => {
        try {
            const response = await fetch(`${API_BASE}/api/mentor-text/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    excerpt: analysisData.excerpt,
                    genre: analysisData.genre,
                    focus: analysisData.focus
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Analysis created:', data);
                
                // Close create modal
                setShowCreateModal(false);
                
                // IMMEDIATELY open detail modal with the fresh analysis
                setDetailModal({
                    isOpen: true,
                    analysisId: null, // No ID yet since it's fresh
                    data: data // Pass the full response
                });
                
                // Reload library in background
                await loadAnalyses();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create analysis');
            }
        } catch (err) {
            console.error('Failed to create analysis:', err);
            throw err; // Let modal handle error display
        }
    };

    const handleOpenDetail = (analysis) => {
        setDetailModal({
            isOpen: true,
            analysisId: analysis.id,
            data: null // Will be loaded by modal
        });
    };

    const handleCloseDetail = () => {
        setDetailModal({ isOpen: false, analysisId: null, data: null });
    };

    const handleDeleteAnalysis = async (analysisId) => {
        if (!userId) return;

        const previousAnalyses = analyses;
        setAnalyses(prev => prev.filter(a => a.id !== analysisId));

        try {
            const response = await fetch(`${API_BASE}/api/mentor-text/library/${analysisId}/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (!response.ok) {
                throw new Error('Failed to delete analysis');
            }
        } catch (err) {
            console.error('Failed to delete analysis:', err);
            setAnalyses(previousAnalyses);
            setError('Failed to delete analysis. Please try again.');
        } finally {
            setDeleteTarget(null);
        }
    };

    // Extract unique genres and focus areas from analyses
    const genres = ['all', ...new Set(
        analyses.map(a => a.genreIdentified).filter(Boolean)
    )];

    const focusAreas = ['all', ...new Set(
        analyses.map(a => a.focus).filter(Boolean)
    )];

    // Filter analyses
    const filteredAnalyses = analyses.filter(analysis => {
        const matchesSearch = 
            analysis.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            analysis.genreIdentified?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesGenre = 
            filterGenre === 'all' || 
            analysis.genreIdentified === filterGenre;

        const matchesFocus = 
            filterFocus === 'all' || 
            analysis.focus === filterFocus;

        return matchesSearch && matchesGenre && matchesFocus;
    });

    if (loading) {
        return (
            <div className="mentor-text-page">
                <div className="mentor-text-loading">
                    <div className="mentor-text-loading-spinner">
                        <Sparkles className="w-16 h-16" />
                    </div>
                    <p>Loading your mentor text analyses...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mentor-text-page">
                <div className="mentor-text-error">
                    <div className="mentor-text-error-icon">
                        <X className="w-16 h-16" />
                    </div>
                    <h2 className="mentor-text-error-title">Unable to load analyses</h2>
                    <p className="mentor-text-error-message">{error}</p>
                    <button
                        onClick={loadAnalyses}
                        className="mentor-text-retry-btn"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mentor-text-page">
            {/* Header */}
            <div className="mentor-text-header">
                <div className="mentor-text-header-content">
                    <div className="mentor-text-header-title">
                        <div className="mentor-text-header-icon">
                            <BookOpen className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1>Mentor Text Analysis</h1>
                            <p className="mentor-text-header-subtitle">
                                Learn from published stories • {filteredAnalyses.length} analysis{filteredAnalyses.length !== 1 ? 'es' : ''}
                            </p>
                        </div>
                    </div>

                    {/* Create New Analysis Button */}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="mentor-text-create-btn"
                    >
                        <Plus className="w-5 h-5" />
                        Analyze New Text
                    </button>
                </div>

                {/* Search and Filters */}
                <div className="mentor-text-controls">
                    <div className="mentor-text-search-wrapper">
                        <Search className="mentor-text-search-icon" />
                        <input
                            type="text"
                            placeholder="Search by excerpt or genre..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="mentor-text-search-input"
                        />
                    </div>

                    <select
                        value={filterGenre}
                        onChange={(e) => setFilterGenre(e.target.value)}
                        className="mentor-text-filter-select"
                    >
                        {genres.map(genre => (
                            <option key={genre} value={genre}>
                                {genre === 'all' ? 'All Genres' : genre}
                            </option>
                        ))}
                    </select>

                    <select
                        value={filterFocus}
                        onChange={(e) => setFilterFocus(e.target.value)}
                        className="mentor-text-filter-select"
                    >
                        {focusAreas.map(focus => (
                            <option key={focus} value={focus}>
                                {focus === 'all' ? 'All Focus Areas' : focus.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="mentor-text-content">
                {filteredAnalyses.length === 0 ? (
                    <div className="mentor-text-empty">
                        {analyses.length === 0 ? (
                            <>
                                <BookOpen className="mentor-text-empty-icon" />
                                <h3 className="mentor-text-empty-title">
                                    No mentor texts analyzed yet
                                </h3>
                                <p className="mentor-text-empty-text">
                                    Start analyzing published excerpts to learn professional writing techniques
                                </p>
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="mentor-text-create-cta-btn"
                                >
                                    <Plus className="w-5 h-5" />
                                    Analyze Your First Text
                                </button>
                            </>
                        ) : (
                            <>
                                <Search className="mentor-text-empty-icon" />
                                <h3 className="mentor-text-empty-title">
                                    No analyses match your filters
                                </h3>
                                <p className="mentor-text-empty-text">
                                    Try adjusting your search or filters
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        <p className="mentor-text-flip-hint">
                            💡 <strong>Tip:</strong> Click any card to flip and see the full analysis
                        </p>
                        
                        <div className="mentor-text-flip-grid">
                            {filteredAnalyses.map((analysis) => (
                                <MentorTextCard
                                    key={analysis.id}
                                    analysis={analysis}
                                    onOpenDetail={handleOpenDetail}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Create Analysis Modal */}
            {showCreateModal && (
                <CreateAnalysisModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateAnalysis}
                />
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <DeleteConfirmModal
                    analysis={deleteTarget}
                    onConfirm={() => handleDeleteAnalysis(deleteTarget.id)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {/* Analysis Detail Modal */}
            <AnalysisDetailModal
                analysisId={detailModal.analysisId}
                userId={userId}
                isOpen={detailModal.isOpen}
                onClose={handleCloseDetail}
                onDelete={(id) => {
                    handleCloseDetail();
                    // Find the full analysis object for delete confirmation
                    const analysisToDelete = analyses.find(a => a.id === id);
                    if (analysisToDelete) {
                        setDeleteTarget(analysisToDelete);
                    }
                }}
                initialData={detailModal.data}
            />
        </div>
    );
};

export default MentorTextPage;