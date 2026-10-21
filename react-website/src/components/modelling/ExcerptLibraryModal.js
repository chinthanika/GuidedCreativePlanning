import React, { useState, useMemo } from 'react';
import { X, Search, Copy, Check, ChevronDown, ChevronUp, Sparkles, BookMarked } from 'lucide-react';
import { logUIInteraction } from '../../utils/analytics';

const ExcerptLibraryModal = ({ excerpts, userId, onClose, onUseExcerpt }) => {
    const [query, setQuery] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return excerpts;
        return excerpts.filter(e =>
            e.novel.toLowerCase().includes(q) ||
            e.author.toLowerCase().includes(q) ||
            e.chapter.toLowerCase().includes(q)
        );
    }, [excerpts, query]);

    const handleCopy = async (item) => {
        try {
            await navigator.clipboard.writeText(item.text);
        } catch {
            // Fallback for older browsers / non-HTTPS contexts
            const ta = document.createElement('textarea');
            ta.value = item.text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopiedId(item.id);
        setTimeout(() => setCopiedId(null), 2000);

        logUIInteraction(userId, 'mentorText', 'copy_excerpt', {
            excerptId: item.id,
            novel: item.novel,
            charCount: item.text.length
        });
    };

    const handleToggle = (item) => {
        const opening = expandedId !== item.id;
        setExpandedId(opening ? item.id : null);
        if (opening) {
            logUIInteraction(userId, 'mentorText', 'preview_excerpt', { excerptId: item.id });
        }
    };

    const handleUse = (item) => {
        logUIInteraction(userId, 'mentorText', 'use_excerpt', { excerptId: item.id });
        onUseExcerpt(item);
    };

    return (
        <div className="mentor-text-modal-overlay" onClick={onClose}>
            <div
                className="mentor-text-modal-content excerpt-library-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mentor-text-modal-header">
                    <div className="mentor-text-modal-header-title">
                        <BookMarked className="w-6 h-6" style={{ color: '#2563eb' }} />
                        <h3>Excerpt Library</h3>
                    </div>
                    <button onClick={onClose} className="mentor-text-modal-close">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <p className="excerpt-library-intro">
                    Pick a passage, copy it, then paste it into "Analyze New Text".
                </p>

                <div className="mentor-text-search-wrapper excerpt-library-search">
                    <Search className="mentor-text-search-icon" />
                    <input
                        type="text"
                        placeholder="Search by novel, author or chapter..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="mentor-text-search-input"
                    />
                </div>

                <div className="excerpt-library-list">
                    {filtered.length === 0 ? (
                        <p className="excerpt-library-empty">No excerpts match your search.</p>
                    ) : (
                        filtered.map(item => {
                            const isOpen = expandedId === item.id;
                            const isCopied = copiedId === item.id;
                            return (
                                <div key={item.id} className="excerpt-library-item">
                                    <div className="excerpt-library-item-top">
                                        <div className="excerpt-library-meta">
                                            <h4>{item.novel}</h4>
                                            <p>
                                                {item.author} · {item.chapter}
                                            </p>
                                        </div>
                                        <div className="excerpt-library-actions">
                                            <button
                                                className="excerpt-library-btn secondary"
                                                onClick={() => handleToggle(item)}
                                            >
                                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                {isOpen ? 'Hide' : 'Preview'}
                                            </button>
                                            <button
                                                className="excerpt-library-btn secondary"
                                                onClick={() => handleCopy(item)}
                                            >
                                                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                {isCopied ? 'Copied!' : 'Copy'}
                                            </button>
                                            <button
                                                className="excerpt-library-btn primary"
                                                onClick={() => handleUse(item)}
                                            >
                                                <Sparkles className="w-4 h-4" />
                                                Use in analyzer
                                            </button>
                                        </div>
                                    </div>

                                    {isOpen && (
                                        <blockquote className="excerpt-library-text">
                                            {item.text}
                                            <span className="excerpt-library-chars">
                                                {item.text.length} characters
                                            </span>
                                        </blockquote>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExcerptLibraryModal;