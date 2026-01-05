import React, { useState, useEffect } from 'react';
import {
    Library, Star, Trash2, FolderPlus, X, Search,
    Filter, BookOpen, Heart, Sparkles, Plus, Folder,
    Check, AlertTriangle, Compass
} from 'lucide-react';
import { useAuthValue } from '../../Firebase/AuthContext'

import SavedBookCard from '../../features/recommender/SavedBookCard';
import BrowseCollectionsPanel from '../../features/recommender/BrowseCollectionsPanel';

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
        try {
            const response = await fetch(`${API_BASE}/api/collections/add-book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, collectionId, bookId })
            });

            if (response.ok) {
                const data = await response.json();

                if (data.alreadyInCollection) {
                    console.log('Book already in collection');
                } else {
                    console.log('Book added to collection');
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

                console.log('Collection created successfully');
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
                    sessionId: 'browse-session', // Special session for browse mode
                    book: book
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Reload books to show the newly saved book
                await loadSavedBooks();
                console.log('Book saved successfully from browse:', result);
            } else {
                console.error('Save failed:', result);
                throw new Error(result.error || 'Failed to save book');
            }
        } catch (err) {
            console.error('Failed to save book from browse:', err);
            throw err;
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

                    {/* Browse Collections Button */}
                    <button
                        onClick={() => setShowBrowsePanel(true)}
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
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="library-search-input"
                        />
                    </div>

                    <select
                        value={filterGenre}
                        onChange={(e) => setFilterGenre(e.target.value)}
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
                        onChange={(e) => setSelectedCollection(e.target.value)}
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
                                    onClick={() => setShowBrowsePanel(true)}
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
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Browse Collections Panel */}
            {showBrowsePanel && (
                <BrowseCollectionsPanel
                    userId={userId}
                    isVisible={showBrowsePanel}
                    onToggle={() => setShowBrowsePanel(false)}
                    onSaveBook={handleSaveBookFromBrowse}
                />
            )}
        </div>
    );
};

export default LibraryPage;