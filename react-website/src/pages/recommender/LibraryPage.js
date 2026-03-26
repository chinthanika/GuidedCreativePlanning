import React, { useState, useEffect, useRef } from 'react';
import {
    Library, Trash2, X, Search,
    BookOpen, Sparkles, Plus, Compass
} from 'lucide-react';
import { useAuthValue } from '../../Firebase/AuthContext'

import SavedBookCard from '../../features/recommender/SavedBookCard';
import BrowseCollectionsPanel from '../../features/recommender/BrowseCollectionsPanel';

import { logPageView, logPageExit, logUIInteraction, createDebouncedSearchLogger } from '../../utils/analytics';
import "./library-page.css";

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

const LibraryPage = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser?.uid;
    const [books, setBooks] = useState([]);
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterGenre, setFilterGenre] = useState('all');
    const [selectedCollection, setSelectedCollection] = useState('all');
    const [showBrowsePanel, setShowBrowsePanel] = useState(false);

    // ─── Analytics refs ───────────────────────────────────────────────────────
    const pageEntryTimeRef = useRef(Date.now());
    const pageViewIdRef = useRef(null);

    // ─── Page-view / page-exit tracking ──────────────────────────────────────
    useEffect(() => {
        if (!userId) return;

        pageEntryTimeRef.current = Date.now();

        // Log page view and store the returned ID for the matching exit event
        const logView = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/log-page-view`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        pageName: 'library',
                        tlcStage: 'building_knowledge',
                        timestamp: Date.now()
                    })
                });
                const data = await res.json();
                pageViewIdRef.current = data.pageViewId || null;
            } catch { /* non-blocking */ }
        };
        logView();

        return () => {
            const durationMs = Date.now() - pageEntryTimeRef.current;
            // Use sendBeacon so the exit fires even if the tab is closing
            const payload = JSON.stringify({
                userId,
                pageName: 'library',
                durationMs,
                pageViewId: pageViewIdRef.current,
                timestamp: Date.now()
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(`${API_BASE}/api/log-page-exit`, payload);
            } else {
                fetch(`${API_BASE}/api/log-page-exit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                }).catch(() => {});
            }
        };
    }, [userId]);

    // ─── Debounced search logger ──────────────────────────────────────────────
    // Re-create logger whenever the books list changes so result counts are fresh
    const logSearchRef = useRef(null);
    useEffect(() => {
        if (!userId) return;
        logSearchRef.current = createDebouncedSearchLogger(userId, 'bookRecs', books);
    }, [userId, books]);

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (logSearchRef.current && value.length >= 3) {
            logSearchRef.current(value);
        }
    };

    // ─── Genre filter logging ─────────────────────────────────────────────────
    const handleGenreChange = (e) => {
        const genre = e.target.value;
        setFilterGenre(genre);
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'filter_genre', { genre });
        }
    };

    // ─── Collection filter logging ────────────────────────────────────────────
    const handleCollectionChange = (e) => {
        const collectionId = e.target.value;
        setSelectedCollection(collectionId);
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'filter_collection', { collectionId });
        }
    };

    useEffect(() => {
        loadSavedBooks();
        loadCollections();
    }, [userId]);

    const loadSavedBooks = async () => {
        if (!userId) {
            setError('Please log in to view your library');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/book-recommendations/saved`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                const data = await response.json();
                setBooks(data.savedBooks || []);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to load saved books');
            }
        } catch (err) {
            console.error('Failed to load saved books:', err);
            setError(`Network error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadCollections = async () => {
        if (!userId) return;

        try {
            const response = await fetch(`${API_BASE}/api/collections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                const data = await response.json();
                setCollections(data.collections || []);
            } else {
                console.error('Failed to load collections');
            }
        } catch (err) {
            console.error('Failed to load collections:', err);
        }
    };

    const handleRemoveBook = async (bookId) => {
        if (!userId) return;

        const previousBooks = books;
        setBooks(prev => prev.filter(b => b.id !== bookId));

        // Log the removal
        logUIInteraction(userId, 'bookRecs', 'remove_book', { bookId });

        try {
            const response = await fetch(`${API_BASE}/api/book-recommendations/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, bookId })
            });

            if (!response.ok) {
                throw new Error('Failed to remove book');
            }
        } catch (err) {
            console.error('Failed to remove book:', err);
            setBooks(previousBooks);
            setError('Failed to remove book. Please try again.');
        }
    };

    const handleMoveToCollection = async (bookId, collectionId) => {
        // Log the action
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'move_to_collection', {
                bookId,
                collectionId
            });
        }

        try {
            const response = await fetch(`${API_BASE}/api/collections/add-book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, collectionId, bookId })
            });

            if (response.ok) {
                const data = await response.json();
                if (!data.alreadyInCollection) {
                    loadCollections();
                }
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to add book to collection');
            }
        } catch (err) {
            console.error('Failed to add book to collection:', err);
            setError('Network error: Could not add book to collection');
        }
    };

    const handleCreateCollection = async (collectionData, bookId = null) => {
        // Log collection creation
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'create_collection', {
                hasInitialBook: !!bookId
            });
        }

        try {
            const response = await fetch(`${API_BASE}/api/collections/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, ...collectionData })
            });

            if (response.ok) {
                const data = await response.json();
                const newCollection = data.collection;

                await loadCollections();

                if (bookId) {
                    await handleMoveToCollection(bookId, newCollection.id);
                }
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to create collection');
            }
        } catch (err) {
            console.error('Failed to create collection:', err);
            setError('Network error: Could not create collection');
        }
    };

    const handleSaveBookFromBrowse = async (book) => {
        try {
            const response = await fetch(`${API_BASE}/api/book-recommendations/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    sessionId: 'browse-session',
                    book: book
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                await loadSavedBooks();

                // Log book saved from browse panel
                if (userId) {
                    logUIInteraction(userId, 'bookRecs', 'save_book', {
                        bookId: book.id,
                        bookTitle: book.title,
                        source: 'browse'
                    });
                }
            } else {
                throw new Error(result.error || 'Failed to save book');
            }
        } catch (err) {
            console.error('Failed to save book from browse:', err);
            throw err;
        }
    };

    const handleBrowseOpen = () => {
        setShowBrowsePanel(true);
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'open_browse_panel', {});
        }
    };

    const handleBrowseClose = () => {
        setShowBrowsePanel(false);
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'close_browse_panel', {});
        }
    };

    const genres = ['all', ...new Set(
        books.flatMap(b => b.categories || [])
    )];

    const selectedCollectionBookIds = selectedCollection !== 'all'
        ? collections.find(c => c.id === selectedCollection)?.bookIds || []
        : null;

    const filteredBooks = books
        .filter(book => {
            const matchesSearch =
                book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                book.author.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesGenre =
                filterGenre === 'all' ||
                (book.categories && book.categories.includes(filterGenre));

            const matchesCollection =
                selectedCollection === 'all' ||
                (selectedCollectionBookIds && selectedCollectionBookIds.includes(book.id));

            return matchesSearch && matchesGenre && matchesCollection;
        });

    if (loading) {
        return (
            <div className="library-page">
                <div className="library-loading">
                    <div className="library-loading-spinner">
                        <Sparkles className="w-16 h-16" />
                    </div>
                    <p>Loading your library...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="library-page">
                <div className="library-error">
                    <div className="library-error-icon">
                        <X className="w-16 h-16" />
                    </div>
                    <h2 className="library-error-title">Unable to load library</h2>
                    <p className="library-error-message">{error}</p>
                    <button
                        onClick={loadSavedBooks}
                        className="library-retry-btn"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="library-page">
            {/* Header */}
            <div className="library-header">
                <div className="library-header-content">
                    <div className="library-header-title">
                        <div className="library-header-icon">
                            <Library className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1>My Library</h1>
                            <p className="library-header-subtitle">
                                {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''}
                                {selectedCollection !== 'all' && ` in ${collections.find(c => c.id === selectedCollection)?.name || 'collection'}`}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleBrowseOpen}
                        className="library-browse-btn"
                    >
                        <Compass className="w-5 h-5" />
                        Browse Collections
                    </button>
                </div>

                {/* Search and Filters */}
                <div className="library-controls">
                    <div className="library-search-wrapper">
                        <Search className="library-search-icon" />
                        <input
                            type="text"
                            placeholder="Search by title or author..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="library-search-input"
                        />
                    </div>

                    <select
                        value={filterGenre}
                        onChange={handleGenreChange}
                        className="library-filter-select"
                    >
                        {genres.map(genre => (
                            <option key={genre} value={genre}>
                                {genre === 'all' ? 'All Genres' : genre}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedCollection}
                        onChange={handleCollectionChange}
                        className="library-filter-select"
                    >
                        <option value="all">All Collections</option>
                        {collections.map(collection => (
                            <option key={collection.id} value={collection.id}>
                                {collection.name} ({collection.bookIds?.length || 0})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="library-content">
                {filteredBooks.length === 0 ? (
                    <div className="library-empty">
                        {books.length === 0 ? (
                            <>
                                <BookOpen className="library-empty-icon" />
                                <h3 className="library-empty-title">
                                    Your library is empty
                                </h3>
                                <p className="library-empty-text">
                                    Start saving books from recommendations or browse collections to build your reading list
                                </p>
                                <button
                                    onClick={handleBrowseOpen}
                                    className="library-browse-cta-btn"
                                >
                                    <Compass className="w-5 h-5" />
                                    Browse Collections
                                </button>
                            </>
                        ) : (
                            <>
                                <Search className="library-empty-icon" />
                                <h3 className="library-empty-title">
                                    No books match your filters
                                </h3>
                                <p className="library-empty-text">
                                    Try adjusting your search, genre, or collection filters
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="library-flip-grid">
                        {filteredBooks.map((book) => (
                            <SavedBookCard
                                key={book.id}
                                book={book}
                                onRemove={handleRemoveBook}
                                onMoveToCollection={handleMoveToCollection}
                                onCreateCollection={handleCreateCollection}
                                collections={collections}
                                userId={userId}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showBrowsePanel && (
                <BrowseCollectionsPanel
                    userId={userId}
                    isVisible={showBrowsePanel}
                    onToggle={handleBrowseClose}
                    onSaveBook={handleSaveBookFromBrowse}
                />
            )}
        </div>
    );
};

export default LibraryPage;