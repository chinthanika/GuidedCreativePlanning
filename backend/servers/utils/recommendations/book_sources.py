"""
Book source integrations: Google Books, Enhanced Open Library, Curated Collections.
Updated with improved Open Library subject mapping and quality analysis.
"""

import os
import json
import logging
import requests
import time
from typing import List, Dict, Any
from .SubjectMapper import SubjectMapper

logger = logging.getLogger("RECOMMENDATIONS")

GOOGLE_BOOKS_API_KEY = os.getenv('GOOGLE_BOOKS_API_KEY')
GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes'
OPENLIBRARY_URL = 'https://openlibrary.org/search.json'


class BookSourceManager:
    """Manages fetching books from multiple sources with enhanced Open Library integration."""
    
    def __init__(self, curated_collections_path=None):
        """
        Initialize book source manager with enhanced Open Library client.
        
        Args:
            curated_collections_path: Path to curated collections JSON file
        """
        self.curated_collections = {}
        self._load_curated_collections(curated_collections_path)
        
        # Initialize Open Library subject mappings
        self.subject_mapper = SubjectMapper()

        logger.info(
            f"[BOOKS] Subject mapping: "
            f"{'Dynamic + Fallback' if self.subject_mapper.enable_dynamic else 'Fallback Only'}"
        )

        # Session for requests
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'GuidedCreativePlanning/1.0 (Educational Research)'
        })
    
    def _load_curated_collections(self, path):
        """Load curated collections from file."""
        if path is None:
            possible_paths = [
                'curated_collections.json',
                'data/curated_collections.json',
                '../data/curated_collections.json',
                'utils/recommendations/curated_collections.json',
                os.path.join(os.path.dirname(__file__), 'curated_collections.json'),
                os.path.join(os.path.dirname(__file__), 'data', 'curated_collections.json'),
            ]
            
            for p in possible_paths:
                if os.path.exists(p):
                    path = p
                    break
        
        try:
            if path and os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    self.curated_collections = json.load(f)
                logger.info(f"[BOOKS] Loaded curated collections: {list(self.curated_collections.keys())}")
            else:
                self.curated_collections = self._get_default_collections()
        except Exception as e:
            logger.error(f"[BOOKS] Failed to load curated collections: {e}")
            self.curated_collections = self._get_default_collections()
    
    def _get_default_collections(self):
        """Return minimal default collections."""
        return {
            'coming_of_age': [{
                "id": "coa_1",
                "title": "The Perks of Being a Wallflower",
                "author": "Stephen Chbosky",
                "year": 1999,
                "rating": 4.2,
                "coverUrl": "https://covers.openlibrary.org/b/id/8235937-L.jpg",
                "description": "A coming-of-age story about friendship and self-discovery.",
                "categories": ["Contemporary", "Young Adult", "Coming of Age"]
            }]
        }
    
    def _parse_openlibrary_book_enhanced(self, doc: Dict) -> Dict[str, Any]:
        """Parse with subject mapping."""
        if not doc.get('title'):
            return None
        
        # Get basic info
        title = doc.get('title', 'Unknown')
        author_name = doc.get('author_name', ['Unknown'])
        author = author_name[0] if isinstance(author_name, list) else author_name
        year = doc.get('first_publish_year')
        
        # Cover
        cover_id = doc.get('cover_i')
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
            if cover_id else ''
        )
        
        # HYBRID MAPPING (replaces _map_subjects_to_categories)
        raw_subjects = doc.get('subject', [])
        query_context = getattr(self, '_current_query', '')  # Set during search
        
        mapped_categories, relevance_boost, method = self.subject_mapper.map_subjects(
            raw_subjects,
            query_context=query_context
        )
        
        # Rating
        rating = doc.get('ratings_average')
        
        return {
            'id': doc.get('key', '').replace('/works/', 'ol_'),
            'title': title,
            'author': author,
            'description': '',
            'coverUrl': cover_url,
            'rating': rating,
            'year': year,
            'categories': mapped_categories,
            'raw_subjects': raw_subjects[:10],
            'source': 'open_library',
            '_relevance_boost': relevance_boost,
            '_mapping_method': method  # Track which method was used
        }
    
    def _query_openlibrary_api_enhanced(
        self,
        query: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Query with context tracking."""
        # Store current query for context
        self._current_query = query
        
        try:
            params = {
                'q': query,
                'limit': min(limit, 100),
                'fields': 'key,title,author_name,first_publish_year,'
                        'cover_i,subject,ratings_average',
                'sort': 'rating desc'
            }
            
            response = self.session.get(OPENLIBRARY_URL, params=params, timeout=15)
            response.raise_for_status()
            
            data = response.json()
            docs = data.get('docs', [])
            
            books = []
            for doc in docs:
                book = self._parse_openlibrary_book_enhanced(doc)
                if book:
                    books.append(book)
            
            return books
        
        finally:
            # Always clear context, even on exception
            self._current_query = ''
    
    def get_mapping_metrics(self) -> Dict[str, Any]:
        """Get subject mapper metrics for monitoring."""
        return self.subject_mapper.get_metrics()
    
    def get_books_from_sources(
        self,
        themes: Dict[str, Any],
        filters: Dict[str, Any],
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Fetch books using three-tier subject approach with enhanced Open Library.
        
        Args:
            themes: Extracted themes from conversation
            filters: User filters (ageRange, pubDate, minRating)
            limit: Number of books to fetch
            
        Returns:
            List of book dictionaries with metadata
        """
        books = []
        
        # Tier 1: Google Books (if API key available)
        if GOOGLE_BOOKS_API_KEY:
            try:
                logger.info("[BOOKS] Trying Google Books (Tier 1)")
                google_books = self._fetch_google_books_with_retry(themes, limit)
                books.extend(google_books)
                logger.info(f"[BOOKS] Google Books: {len(google_books)} books")
            except Exception as e:
                logger.warning(f"[BOOKS] Google Books failed: {e}")
        
        # Tier 2: Enhanced Open Library (always try)
        if len(books) < 3:
            try:
                logger.info("[BOOKS] Trying Open Library (Tier 2)")
                openlibrary_books = self._fetch_openlibrary_enhanced(themes, limit)
                books.extend(openlibrary_books)
                logger.info(f"[BOOKS] Open Library: {len(openlibrary_books)} books")
            except Exception as e:
                logger.warning(f"[BOOKS] Open Library failed: {e}")
        
        # Tier 3: Curated Collections (fallback)
        if len(books) < 3:
            logger.info("[BOOKS] Using Curated Collections (Tier 3)")
            curated_books = self._match_curated_books(themes, limit)
            books.extend(curated_books)
            logger.info(f"[BOOKS] Curated: {len(curated_books)} books")
        
        # Apply filters
        filtered_books = self._apply_filters(books, filters)
        
        logger.info(f"[BOOKS] Total: {len(books)} fetched, {len(filtered_books)} after filters")
        return filtered_books
    
    # ============================================
    # GOOGLE BOOKS (Unchanged)
    # ============================================
    
    def _fetch_google_books_with_retry(
        self,
        themes: Dict[str, Any],
        limit: int,
        max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        """Fetch from Google Books with retry logic."""
        search_queries = themes.get('_searchQueries', [])
        
        if not search_queries:
            genre = themes.get('genre', 'fiction')
            search_queries = [f"{genre} young adult"]
        
        books = []
        
        for query_idx, query in enumerate(search_queries):
            for attempt in range(max_retries):
                try:
                    query_books = self._query_google_books_api(query, limit)
                    
                    if query_books:
                        logger.info(f"[GOOGLE] Query {query_idx + 1} succeeded: {len(query_books)} books")
                        logger.debug(f"[GOOGLE_BOOKS] Raw API response: {json.dumps(query_books, indent=2)}")
                        books.extend(query_books)
                        
                        if len(books) >= limit:
                            return books[:limit]
                        break
                    else:
                        break
                
                except requests.Timeout:
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                    break
                
                except requests.RequestException as e:
                    if attempt < max_retries - 1:
                        time.sleep(1)
                        continue
                    break
        
        # Fallback
        if not books:
            genre = themes.get('genre', 'fiction')
            try:
                books = self._query_google_books_api(f"{genre} young adult", limit)
            except:
                pass
        
        return books
    
    def _query_google_books_api(self, query: str, limit: int) -> List[Dict[str, Any]]:
        """Make API call to Google Books."""
        params = {
            'q': query,
            'maxResults': min(limit, 40),
            'orderBy': 'relevance'
        }
        
        if GOOGLE_BOOKS_API_KEY:
            params['key'] = GOOGLE_BOOKS_API_KEY
        
        response = self.session.get(GOOGLE_BOOKS_URL, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        items = data.get('items', [])
        
        books = []
        for item in items:
            book = self._parse_google_book(item)
            if book:
                books.append(book)
        
        return books
    
    def _parse_google_book(self, item: Dict) -> Dict[str, Any]:
        """Parse Google Books item."""
        volume_info = item.get('volumeInfo', {})
        
        if not volume_info.get('title'):
            return None
        print(f"[GOOGLE] Parsing book: {volume_info}")
        return {
            'id': item.get('id'),
            'title': volume_info.get('title', 'Unknown'),
            'author': volume_info.get('authors', ['Unknown'])[0] 
                     if volume_info.get('authors') else 'Unknown',
            'description': volume_info.get('description', ''),
            'coverUrl': volume_info.get('imageLinks', {}).get('thumbnail', ''),
            'rating': volume_info.get('averageRating'),
            'year': self._extract_year(volume_info.get('publishedDate', '')),
            'categories': volume_info.get('categories', []),
            'source': 'google_books'
        }
    
    # ============================================
    # ENHANCED OPEN LIBRARY
    # ============================================
    
    def _fetch_openlibrary_enhanced(
        self,
        themes: Dict[str, Any],
        limit: int,
        max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Enhanced Open Library fetching with improved subject mapping.
        
        Args:
            themes: Story themes with search queries
            limit: Max books to fetch
            max_retries: Retry attempts
            
        Returns:
            List of books with enhanced metadata
        """
        search_queries = themes.get('_searchQueries', [])
        
        if not search_queries:
            genre = themes.get('genre', 'fiction')
            search_queries = [f"{genre} young adult"]
        
        books = []
        
        for query_idx, query in enumerate(search_queries):
            logger.debug(f"[OPENLIBRARY] Query {query_idx + 1}: '{query}'")
            
            for attempt in range(max_retries):
                try:
                    query_books = self._query_openlibrary_api_enhanced(query, limit)
                    
                    if query_books:
                        logger.info(
                            f"[OPENLIBRARY] Query {query_idx + 1} succeeded: "
                            f"{len(query_books)} books"
                        )
                        logger.debug(f"[GOOGLE_BOOKS] Raw API response: {json.dumps(query_books, indent=2)}")
                        books.extend(query_books)
                        
                        if len(books) >= limit:
                            return books[:limit]
                        break
                    else:
                        break
                
                except requests.Timeout:
                    logger.warning(f"[OPENLIBRARY] Timeout (attempt {attempt + 1})")
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                    break
                
                except requests.RequestException as e:
                    logger.error(f"[OPENLIBRARY] Request failed: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(1)
                        continue
                    break
        
        # Fallback
        if not books:
            logger.info("[OPENLIBRARY] Trying genre fallback")
            genre = themes.get('genre', 'fiction')
            try:
                books = self._query_openlibrary_api_enhanced(f"{genre} fiction", limit)
            except:
                pass
        
        print(f"[OPENLIBRARY] Books fetched: {books}")
        return books
 
    # ============================================
    # CURATED COLLECTIONS
    # ============================================
    
    def _match_curated_books(
        self,
        themes: Dict[str, Any],
        limit: int
    ) -> List[Dict[str, Any]]:
        """Match themes to curated collections."""
        matched_books = []
        
        genre = themes.get('genre', '').lower()
        theme_list = [t.lower() for t in themes.get('themes', [])]
        
        collection_keywords = {
            'coming_of_age': ['identity', 'growing up', 'self-discovery'],
            'fantasy_worldbuilding': ['fantasy', 'magic', 'worldbuilding'],
            'unreliable_narrators': ['unreliable', 'mystery', 'twist'],
            'dystopian': ['dystopia', 'dystopian', 'rebellion'],
            'character_driven': ['character', 'relationships', 'emotional']
        }
        
        matched_collections = []
        for collection_name, keywords in collection_keywords.items():
            if any(kw in genre for kw in keywords):
                matched_collections.append(collection_name)
            elif any(kw in theme for kw in keywords for theme in theme_list):
                matched_collections.append(collection_name)
        
        if not matched_collections:
            matched_collections = ['coming_of_age']
        
        for collection_name in matched_collections:
            collection = self.curated_collections.get(collection_name, [])
            matched_books.extend(collection)
        
        # Deduplicate
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
        
        return unique_books[:limit]
    
    # ============================================
    # UTILITY METHODS
    # ============================================
    
    def _apply_filters(
        self,
        books: List[Dict],
        filters: Dict
    ) -> List[Dict]:
        """Apply user filters to book list."""
        if not filters:
            return books
        
        filtered = books
        
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
        
        # Minimum rating
        min_rating = filters.get('minRating')
        if min_rating:
            filtered = [b for b in filtered if b.get('rating') and b['rating'] >= min_rating]
        
        return filtered
    
    def _extract_year(self, date_str: str) -> int:
        """Extract year from date string."""
        if not date_str:
            return None
        try:
            return int(date_str[:4])
        except (ValueError, IndexError):
            return None