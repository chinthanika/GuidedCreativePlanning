"""
Book source integrations: Google Books, Open Library, Curated Collections.
Implements three-tier hybrid fallback approach.
"""

import os
import json
import logging
import requests
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

GOOGLE_BOOKS_API_KEY = os.getenv('GOOGLE_BOOKS_API_KEY')
GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes'
OPENLIBRARY_URL = 'https://openlibrary.org/search.json'


class BookSourceManager:
    """Manages fetching books from multiple sources with fallback logic."""
    
    def __init__(self, curated_collections_path=None):
        """
        Initialize book source manager.
        
        Args:
            curated_collections_path: Path to curated collections JSON file.
                                     If None, looks in multiple default locations.
        """
        self.curated_collections = {}
        
        # Try multiple possible paths if no path specified
        if curated_collections_path is None:
            possible_paths = [
                'curated_collections.json',
                'data/curated_collections.json',
                '../data/curated_collections.json',
                'utils/recommendations/curated_collections.json',
                'utils/recommendations/data/curated_collections.json',  # ADDED: Actual location
                os.path.join(os.path.dirname(__file__), 'curated_collections.json'),
                os.path.join(os.path.dirname(__file__), 'data', 'curated_collections.json'),  # ADDED
                os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'curated_collections.json'),
            ]
            
            for path in possible_paths:
                abs_path = os.path.abspath(path)
                if os.path.exists(abs_path):
                    curated_collections_path = abs_path
                    logger.info(f"[BOOKS] Found curated collections at: {path}")
                    logger.info(f"[BOOKS] Absolute path: {abs_path}")
                    break
            
            if curated_collections_path is None:
                logger.warning("[BOOKS] Curated collections file not found in any default location")
                logger.warning(f"[BOOKS] Searched paths: {possible_paths}")
                logger.warning(f"[BOOKS] Current directory: {os.getcwd()}")
                logger.warning(f"[BOOKS] Script directory: {os.path.dirname(__file__)}")
                # Create default structure
                self.curated_collections = self._get_default_collections()
                return
        
        try:
            if os.path.exists(curated_collections_path):
                with open(curated_collections_path, 'r', encoding='utf-8') as f:
                    self.curated_collections = json.load(f)
                logger.info(f"[BOOKS] Loaded curated collections from: {curated_collections_path}")
                logger.info(f"[BOOKS] Collections: {list(self.curated_collections.keys())}")
                logger.info(f"[BOOKS] Total books: {sum(len(v) for v in self.curated_collections.values())}")
            else:
                logger.warning(f"[BOOKS] Curated collections not found: {curated_collections_path}")
                self.curated_collections = self._get_default_collections()
        except Exception as e:
            logger.error(f"[BOOKS] Failed to load curated collections: {e}")
            self.curated_collections = self._get_default_collections()
    
    def _get_default_collections(self):
        """Return minimal default collections as fallback."""
        logger.info("[BOOKS] Using default fallback collections")
        return {
            'coming_of_age': [
                {
                    "id": "coa_1",
                    "title": "The Perks of Being a Wallflower",
                    "author": "Stephen Chbosky",
                    "year": 1999,
                    "rating": 4.2,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A coming-of-age story about friendship, self-discovery, and finding your place in the world.",
                    "categories": ["Contemporary", "Young Adult", "Coming of Age"]
                }
            ],
            'fantasy_worldbuilding': [
                {
                    "id": "fbx_1",
                    "title": "The Name of the Wind",
                    "author": "Patrick Rothfuss",
                    "year": 2007,
                    "rating": 4.5,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A legendary hero tells his own story in a richly detailed fantasy world with complex magic.",
                    "categories": ["Fantasy", "Young Adult", "Magic"]
                }
            ],
            'dystopian': [
                {
                    "id": "dys_1",
                    "title": "The Hunger Games",
                    "author": "Suzanne Collins",
                    "year": 2008,
                    "rating": 4.3,
                    "coverUrl": "https://covers.openlibrary.org/b/id/7833604-L.jpg",
                    "description": "A girl fights for survival in a brutal televised competition in a dystopian future.",
                    "categories": ["Dystopian", "Young Adult", "Action"]
                }
            ],
            'unreliable_narrators': [
                {
                    "id": "un_1",
                    "title": "We Were Liars",
                    "author": "E. Lockhart",
                    "year": 2014,
                    "rating": 3.8,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A mysterious story with an unreliable narrator and shocking revelations.",
                    "categories": ["Mystery", "Young Adult", "Thriller"]
                }
            ],
            'character_driven': [
                {
                    "id": "cd_1",
                    "title": "The Fault in Our Stars",
                    "author": "John Green",
                    "year": 2012,
                    "rating": 4.3,
                    "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                    "description": "A deeply emotional character-driven story about two teenagers facing illness.",
                    "categories": ["Contemporary", "Young Adult", "Romance"]
                }
            ]
        }
    
    def get_books_from_sources(
        self, 
        themes: Dict[str, Any], 
        filters: Dict[str, Any],
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Fetch books using three-tier hybrid approach.
        
        Args:
            themes: Extracted themes from conversation
            filters: User-applied filters (ageRange, pubDate, minRating)
            limit: Number of books to fetch
            
        Returns:
            List of book dictionaries with metadata
        """
        books = []
        
        # Tier 1: Google Books (if API key available)
        if GOOGLE_BOOKS_API_KEY:
            try:
                logger.info("[BOOKS] Trying Google Books (Tier 1)")
                google_books = self._fetch_google_books(themes, limit)
                books.extend(google_books)
                logger.info(f"[BOOKS] Google Books returned {len(google_books)} books")
            except Exception as e:
                logger.warning(f"[BOOKS] Google Books failed: {e}")
        else:
            logger.info("[BOOKS] Skipping Google Books (no API key)")
        
        # Tier 2: Open Library (if Google Books insufficient)
        if len(books) < 3:
            try:
                logger.info("[BOOKS] Trying Open Library (Tier 2)")
                openlibrary_books = self._fetch_openlibrary_books(themes, limit)
                books.extend(openlibrary_books)
                logger.info(f"[BOOKS] Open Library returned {len(openlibrary_books)} books")
            except Exception as e:
                logger.warning(f"[BOOKS] Open Library failed: {e}")
        
        # Tier 3: Curated Collections (always try as fallback)
        if len(books) < 3:
            logger.info("[BOOKS] Using Curated Collections (Tier 3)")
            curated_books = self._match_curated_books(themes, limit)
            books.extend(curated_books)
            logger.info(f"[BOOKS] Curated collections returned {len(curated_books)} books")
        
        # Apply filters
        filtered_books = self._apply_filters(books, filters)
        
        logger.info(f"[BOOKS] Total: {len(books)} fetched, {len(filtered_books)} after filters")
        return filtered_books
    
    def _fetch_google_books(self, themes: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
        """Fetch books from Google Books API."""
        books = []
        search_queries = themes.get('_searchQueries', [])
        
        if not search_queries:
            logger.warning("[GOOGLE] No search queries provided")
            return books
        
        # Try first query (most specific)
        query = search_queries[0]
        
        try:
            params = {
                'q': query,
                'key': GOOGLE_BOOKS_API_KEY,
                'maxResults': limit,
                'orderBy': 'relevance',
            }
            
            response = requests.get(GOOGLE_BOOKS_URL, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            
            for item in items:
                book = self._parse_google_book(item)
                if book:
                    books.append(book)
            
            logger.debug(f"[GOOGLE] Query '{query}' returned {len(books)} books")
            
        except requests.RequestException as e:
            logger.error(f"[GOOGLE] API request failed: {e}")
            raise
        
        return books
    
    def _parse_google_book(self, item: Dict) -> Dict[str, Any]:
        """Parse Google Books API response item."""
        volume_info = item.get('volumeInfo', {})
        
        # Skip books without basic info
        if not volume_info.get('title'):
            return None
        
        book = {
            'id': item.get('id'),
            'title': volume_info.get('title', 'Unknown'),
            'author': volume_info.get('authors', ['Unknown'])[0] if volume_info.get('authors') else 'Unknown',
            'description': volume_info.get('description', ''),
            'coverUrl': volume_info.get('imageLinks', {}).get('thumbnail', ''),
            'rating': volume_info.get('averageRating'),
            'year': self._extract_year(volume_info.get('publishedDate', '')),
            'categories': volume_info.get('categories', []),
            'source': 'google_books'
        }
        
        return book
    
    def _fetch_openlibrary_books(self, themes: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
        """Fetch books from Open Library API."""
        books = []
        search_queries = themes.get('_searchQueries', [])
        
        if not search_queries:
            return books
        
        query = search_queries[0]
        
        try:
            params = {
                'q': query,
                'limit': limit,
                'fields': 'key,title,author_name,first_publish_year,cover_i,subject'
            }
            
            response = requests.get(OPENLIBRARY_URL, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            docs = data.get('docs', [])
            
            for doc in docs:
                book = self._parse_openlibrary_book(doc)
                if book:
                    books.append(book)
            
            logger.debug(f"[OPENLIBRARY] Query '{query}' returned {len(books)} books")
            
        except requests.RequestException as e:
            logger.error(f"[OPENLIBRARY] API request failed: {e}")
            raise
        
        return books
    
    def _parse_openlibrary_book(self, doc: Dict) -> Dict[str, Any]:
        """Parse Open Library API response document."""
        if not doc.get('title'):
            return None
        
        cover_id = doc.get('cover_i')
        cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else ''
        
        book = {
            'id': doc.get('key', '').replace('/works/', 'ol_'),
            'title': doc.get('title', 'Unknown'),
            'author': doc.get('author_name', ['Unknown'])[0] if doc.get('author_name') else 'Unknown',
            'description': '',  # Open Library often lacks descriptions
            'coverUrl': cover_url,
            'rating': None,
            'year': doc.get('first_publish_year'),
            'categories': doc.get('subject', [])[:3],  # Limit to top 3 subjects
            'source': 'open_library'
        }
        
        return book
    
    def _match_curated_books(self, themes: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
        """Match themes to curated collections."""
        matched_books = []
        
        # Simple keyword matching to collection names
        genre = themes.get('genre', '').lower()
        theme_list = [t.lower() for t in themes.get('themes', [])]
        
        logger.debug(f"[CURATED] Matching genre='{genre}', themes={theme_list}")
        logger.debug(f"[CURATED] Available collections: {list(self.curated_collections.keys())}")
        
        # Map themes to collections
        collection_keywords = {
            'coming_of_age': ['identity', 'growing up', 'self-discovery', 'coming-of-age'],
            'fantasy_worldbuilding': ['fantasy', 'magic', 'worldbuilding', 'magical'],
            'unreliable_narrators': ['unreliable', 'mystery', 'twist', 'deception'],
            'dystopian': ['dystopia', 'dystopian', 'totalitarian', 'rebellion', 'oppression'],
            'character_driven': ['character', 'relationships', 'internal', 'emotional']
        }
        
        # Find matching collections
        matched_collections = []
        for collection_name, keywords in collection_keywords.items():
            if any(kw in genre for kw in keywords):
                matched_collections.append(collection_name)
            elif any(kw in theme for kw in keywords for theme in theme_list):
                matched_collections.append(collection_name)
        
        # If no matches, use coming_of_age as default (most universal)
        if not matched_collections:
            matched_collections = ['coming_of_age']
        
        logger.info(f"[CURATED] Matched collections: {matched_collections}")
        
        # Collect books from matched collections
        for collection_name in matched_collections:
            collection = self.curated_collections.get(collection_name, [])
            logger.debug(f"[CURATED] Collection '{collection_name}' has {len(collection)} books")
            matched_books.extend(collection)
        
        # Remove duplicates and limit
        seen_titles = set()
        unique_books = []
        for book in matched_books:
            title = book.get('title', '').lower()
            if title not in seen_titles:
                seen_titles.add(title)
                unique_books.append({
                    **book,
                    'source': 'curated',
                    'id': f"curated_{book.get('title', '').replace(' ', '_')}"
                })
        
        logger.debug(f"[CURATED] Matched {len(matched_collections)} collections, "
                    f"found {len(unique_books)} unique books")
        
        return unique_books[:limit]
    
    def _apply_filters(self, books: List[Dict], filters: Dict) -> List[Dict]:
        """Apply user-specified filters to book list."""
        if not filters:
            return books
        
        filtered = books
        
        # Age range filter
        age_range = filters.get('ageRange')
        if age_range and age_range != 'any':
            # For now, skip age filtering (requires metadata we might not have)
            pass
        
        # Publication date filter
        pub_date = filters.get('pubDate')
        if pub_date and pub_date != 'any':
            current_year = 2025
            if pub_date == 'last5':
                filtered = [b for b in filtered if b.get('year') and b['year'] >= current_year - 5]
            elif pub_date == 'last10':
                filtered = [b for b in filtered if b.get('year') and b['year'] >= current_year - 10]
            elif pub_date == 'classic':
                filtered = [b for b in filtered if b.get('year') and b['year'] < current_year - 20]
        
        # Minimum rating filter
        min_rating = filters.get('minRating')
        if min_rating:
            filtered = [b for b in filtered if b.get('rating') and b['rating'] >= min_rating]
        
        return filtered
    
    def _extract_year(self, date_str: str) -> int:
        """Extract year from various date formats."""
        if not date_str:
            return None
        
        # Try to get first 4 digits
        try:
            year_str = date_str[:4]
            return int(year_str)
        except (ValueError, IndexError):
            return None