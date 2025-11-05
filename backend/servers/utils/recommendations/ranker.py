"""
Book ranking and deduplication logic.
Scores books based on relevance, quality, and diversity.
"""

import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class BookRanker:
    """Ranks and deduplicates books based on relevance to themes."""
    
    def rank_and_deduplicate_books(
        self,
        books: List[Dict[str, Any]],
        themes: Dict[str, Any],
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Rank books by relevance and deduplicate.
        
        Args:
            books: List of book dictionaries from various sources
            themes: Extracted themes from conversation
            limit: Number of top books to return
            
        Returns:
            List of top-ranked, deduplicated books with scores
        """
        if not books:
            logger.warning("[RANKER] No books to rank")
            return []
        
        # Step 1: Calculate relevance scores
        scored_books = []
        for book in books:
            score = self._calculate_relevance_score(book, themes)
            scored_books.append({
                **book,
                'relevance_score': score
            })
        
        # Step 2: Deduplicate
        unique_books = self._deduplicate_books(scored_books)
        
        # Step 3: Sort by score
        ranked_books = sorted(unique_books, key=lambda b: b['relevance_score'], reverse=True)
        
        # Step 4: Enforce diversity
        diverse_books = self._enforce_diversity(ranked_books, limit)
        
        logger.info(f"[RANKER] Ranked {len(books)} books -> {len(unique_books)} unique -> "
                   f"{len(diverse_books)} diverse (top {limit})")
        
        return diverse_books[:limit]
    
    def _calculate_relevance_score(self, book: Dict, themes: Dict) -> float:
        """
        Calculate relevance score (0-100).
        
        Weighting:
        - Theme matches: 40%
        - Description keyword matches: 30%
        - Rating quality: 15%
        - Publication recency: 10%
        - Source priority: 5%
        """
        score = 0.0
        
        # 1. Theme matches (up to 40 points)
        theme_score = self._score_theme_matches(book, themes)
        score += min(theme_score, 40)
        
        # 2. Description keyword matches (up to 30 points)
        keyword_score = self._score_keyword_matches(book, themes)
        score += min(keyword_score, 30)
        
        # 3. Rating quality (up to 15 points)
        rating = book.get('rating')
        if rating:
            if rating >= 4.5:
                score += 15
            elif rating >= 4.0:
                score += 10
            elif rating >= 3.5:
                score += 5
        
        # 4. Publication recency (up to 10 points)
        year = book.get('year')
        if year:
            current_year = 2025
            age = current_year - year
            if age <= 5:
                score += 10
            elif age <= 10:
                score += 7
            elif age <= 20:
                score += 4
        
        # 5. Source priority (up to 5 points)
        source = book.get('source')
        if source == 'google_books' and book.get('description'):
            score += 5
        elif source == 'curated':
            score += 4
        elif source == 'google_books':
            score += 3
        elif source == 'open_library':
            score += 1
        
        return score
    
    def _score_theme_matches(self, book: Dict, themes: Dict) -> float:
        """Score based on theme matches in description and categories."""
        score = 0.0
        
        description = (book.get('description') or '').lower()
        categories = [c.lower() for c in book.get('categories', [])]
        
        theme_list = themes.get('themes', [])
        genre = themes.get('genre', '').lower()
        
        # Genre match
        if genre:
            if any(genre in cat for cat in categories):
                score += 15
            if genre in description:
                score += 10
        
        # Theme matches
        for theme in theme_list:
            theme_lower = theme.lower()
            if theme_lower in description:
                score += 10
            if any(theme_lower in cat for cat in categories):
                score += 5
        
        return score
    
    def _score_keyword_matches(self, book: Dict, themes: Dict) -> float:
        """Score based on character types and plot structure keywords."""
        score = 0.0
        
        description = (book.get('description') or '').lower()
        
        # Character types
        char_types = themes.get('characterTypes', [])
        for char_type in char_types:
            # Normalize character type (e.g., "reluctant hero" -> "reluctant")
            keywords = char_type.lower().split()
            if any(kw in description for kw in keywords):
                score += 5
        
        # Plot structures
        plot_structures = themes.get('plotStructures', [])
        for structure in plot_structures:
            keywords = structure.lower().split()
            if any(kw in description for kw in keywords):
                score += 5
        
        # Tone/setting
        tone = themes.get('tone', '').lower()
        if tone and tone in description:
            score += 3
        
        setting = themes.get('settingType', '').lower()
        if setting:
            setting_keywords = setting.split()
            if any(kw in description for kw in setting_keywords):
                score += 3
        
        return score
    
    def _deduplicate_books(self, books: List[Dict]) -> List[Dict]:
        """Remove duplicate books (same title + author)."""
        seen = {}
        unique = []
        
        for book in books:
            # Normalize title and author
            title = re.sub(r'[^\w\s]', '', book.get('title', '').lower())
            author = book.get('author', '').lower()
            
            key = (title, author)
            
            if key not in seen:
                seen[key] = True
                unique.append(book)
            else:
                # If duplicate has better data (description), replace
                if book.get('description') and not unique[-1].get('description'):
                    # Find and replace the existing entry
                    for i, existing in enumerate(unique):
                        existing_key = (
                            re.sub(r'[^\w\s]', '', existing.get('title', '').lower()),
                            existing.get('author', '').lower()
                        )
                        if existing_key == key:
                            unique[i] = book
                            break
        
        logger.debug(f"[RANKER] Deduplicated {len(books)} -> {len(unique)} unique books")
        return unique
    
    def _enforce_diversity(self, ranked_books: List[Dict], limit: int) -> List[Dict]:
        """
        Enforce diversity in top recommendations:
        - No more than 2 books by same author in top 5
        - Prefer variety of genres/categories
        """
        selected = []
        authors_seen = {}
        categories_seen = set()
        
        for book in ranked_books:
            # Author diversity check
            author = book.get('author', 'Unknown')
            author_count = authors_seen.get(author, 0)
            
            # Allow max 2 books per author
            if author_count >= 2:
                continue
            
            # Category diversity (prefer variety)
            book_categories = set(c.lower() for c in book.get('categories', []))
            
            # If we have enough books, prefer new categories
            if len(selected) >= 3:
                if book_categories and book_categories.issubset(categories_seen):
                    # Skip if all categories already seen (unless score is significantly higher)
                    if selected and book['relevance_score'] < selected[-1]['relevance_score'] + 10:
                        continue
            
            # Add book
            selected.append(book)
            authors_seen[author] = author_count + 1
            categories_seen.update(book_categories)
            
            if len(selected) >= limit:
                break
        
        return selected