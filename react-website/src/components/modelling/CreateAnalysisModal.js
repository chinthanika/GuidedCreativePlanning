import React, { useState } from 'react';
import { X, Sparkles, Loader2, AlertTriangle, BookOpen } from 'lucide-react';

const GENRE_OPTIONS = [
    { value: 'general fiction', label: 'General Fiction' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'mystery', label: 'Mystery' },
    { value: 'romance', label: 'Romance' },
    { value: 'science_fiction', label: 'Science Fiction' },
    { value: 'contemporary_realistic', label: 'Contemporary Realistic' },
    { value: 'horror', label: 'Horror' },
    { value: 'thriller', label: 'Thriller' },
    { value: 'historical', label: 'Historical Fiction' },
    { value: 'literary fiction', label: 'Literary Fiction' }
];

const FOCUS_OPTIONS = [
    { value: 'general', label: 'General Analysis' },
    { value: 'character_development', label: 'Character Development' },
    { value: 'plot_structure', label: 'Plot Structure' },
    { value: 'worldbuilding', label: 'Worldbuilding' },
    { value: 'dialogue', label: 'Dialogue' },
    { value: 'pacing', label: 'Pacing & Tension' },
    { value: 'description', label: 'Description & Setting' },
    { value: 'theme', label: 'Theme Development' },
    { value: 'voice', label: 'Voice & Style' },
    { value: 'opening', label: 'Story Opening' },
    { value: 'conflict', label: 'Conflict & Stakes' }
];

const CreateAnalysisModal = ({ onClose, onCreate }) => {
    const [excerpt, setExcerpt] = useState('');
    const [genre, setGenre] = useState('general fiction');
    const [focus, setFocus] = useState('general');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const charCount = excerpt.length;
    const isValid = charCount >= 100 && charCount <= 6000;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!isValid) {
            setError('Excerpt must be between 100 and 6000 characters');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onCreate({ excerpt, genre, focus });
            // Modal will be closed by parent on success
        } catch (err) {
            setError(err.message || 'Failed to create analysis');
            setLoading(false);
        }
    };

    return (
        <div className="mentor-text-modal-overlay" onClick={onClose}>
            <div 
                className="mentor-text-modal-content" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="mentor-text-modal-header">
                    <div className="mentor-text-modal-header-title">
                        <BookOpen className="w-6 h-6" style={{ color: '#2563eb' }} />
                        <h3>Analyze a Mentor Text</h3>
                    </div>
                    <button onClick={onClose} className="mentor-text-modal-close">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="mentor-text-create-form">
                    {error && (
                        <div className="mentor-text-form-error">
                            <AlertTriangle className="w-5 h-5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Excerpt Input */}
                    <div className="mentor-text-form-group">
                        <label>
                            Story Excerpt <span className="mentor-text-required">*</span>
                        </label>
                        <textarea
                            value={excerpt}
                            onChange={(e) => setExcerpt(e.target.value)}
                            placeholder="Paste a scene or passage from a published story you admire...

Example: 'The old man sat in the shadows, watching. He had waited thirty years for this moment, and now that it had arrived, he felt nothing but emptiness. The gun was cold in his hand.'"
                            className="mentor-text-form-textarea"
                            rows={10}
                            disabled={loading}
                        />
                        <div className="mentor-text-char-count">
                            <span className={charCount < 100 || charCount > 6000 ? 'text-red-600' : 'text-gray-600'}>
                                {charCount} / 6000 characters
                            </span>
                            {charCount < 100 && (
                                <span className="text-red-600 text-sm">
                                    (Need at least 100)
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Genre Selection */}
                    <div className="mentor-text-form-group">
                        <label>Genre</label>
                        <select
                            value={genre}
                            onChange={(e) => setGenre(e.target.value)}
                            className="mentor-text-form-select"
                            disabled={loading}
                        >
                            {GENRE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <p className="mentor-text-form-hint">
                            Helps AI identify genre-specific techniques
                        </p>
                    </div>

                    {/* Focus Area Selection */}
                    <div className="mentor-text-form-group">
                        <label>Focus Area</label>
                        <select
                            value={focus}
                            onChange={(e) => setFocus(e.target.value)}
                            className="mentor-text-form-select"
                            disabled={loading}
                        >
                            {FOCUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <p className="mentor-text-form-hint">
                            What aspect of craft to focus on in the analysis
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="mentor-text-form-actions">
                        <button
                            type="button"
                            onClick={onClose}
                            className="mentor-text-form-btn cancel"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="mentor-text-form-btn analyze"
                            disabled={!isValid || loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mentor-text-loading-spinner" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5" />
                                    Analyze Excerpt
                                </>
                            )}
                        </button>
                    </div>

                    {/* Info Box */}
                    <div className="mentor-text-info-box">
                        <h4>💡 How it works</h4>
                        <ul>
                            <li>AI identifies 3-5 specific writing techniques</li>
                            <li>Explains WHY each technique works</li>
                            <li>Connects to genre conventions when applicable</li>
                            <li>Provides actionable tips for your own writing</li>
                        </ul>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateAnalysisModal;