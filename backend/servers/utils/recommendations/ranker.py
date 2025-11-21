"""
Enhanced book ranking with improved scoring system.
Updated scoring weights based on your requirements:
- Theme matches: 40% (up from 30%)
- Keyword matches in description: 30% (maintained)
- High rating (>4.0): 15% (increased from basic check)
- Publication recency: 10%
- Source priority: 5%
"""

import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class BookRanker:
    """
    Enhanced ranker with improved scoring and diversity enforcement.
    
    Scoring breakdown (out of 100):
    - Theme/genre matches: 40 points
    - Description keyword matches: 30 points  
    - Rating quality: 15 points
    - Publication recency: 10 points
    - Source priority: 5 points
    """
    
    def rank_and_deduplicate_books(
        self,
        books: List[Dict[str, Any]],
        themes: Dict[str, Any],
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Rank books by relevance + filter preferences.
        """
        if not books:
            logger.warning("[RANKER] No books to rank")
            return []
        
        # Step 1: Calculate base relevance scores
        scored_books = []
        for book in books:
            score_breakdown = self._calculate_relevance_score_detailed(book, themes)
            
            # Add filter bonus if present
            filter_bonus = book.get('_relevance_boost', 0.0)
            
            scored_books.append({
                **book,
                'relevance_score': score_breakdown['total'] + filter_bonus,
                'score_breakdown': {
                    **score_breakdown,
                    'filter_bonus': filter_bonus  # Track separately
                }
            })
        
        # Step 2: Deduplicate
        unique_books = self._deduplicate_books(scored_books)
        
        # Step 3: Sort by total score (base + filter bonus)
        ranked_books = sorted(
            unique_books, 
            key=lambda b: b['relevance_score'], 
            reverse=True
        )
        
        # Step 4: Enforce diversity
        diverse_books = self._enforce_diversity(ranked_books, limit)
        
        logger.info(
            f"[RANKER] Ranked {len(books)} -> {len(unique_books)} unique -> "
            f"{len(diverse_books)} diverse"
        )
        
        return diverse_books[:limit]
    
    def _calculate_relevance_score_detailed(
        self, 
        book: Dict, 
        themes: Dict
    ) -> Dict[str, float]:
        """
        Calculate detailed relevance score with component breakdown.
        
        Returns breakdown dict with:
        - theme_score (max 40)
        - keyword_score (max 30)
        - rating_score (max 15)
        - recency_score (max 10)
        - source_score (max 5)
        - total (sum of above)
        """
        breakdown = {
            'theme_score': 0.0,
            'keyword_score': 0.0,
            'rating_score': 0.0,
            'recency_score': 0.0,
            'source_score': 0.0,
            'total': 0.0
        }
        
        # 1. THEME/GENRE MATCHES (40 points max) - INCREASED WEIGHT
        theme_score = self._score_theme_matches(book, themes)
        breakdown['theme_score'] = min(theme_score, 40)
        
        # 2. DESCRIPTION KEYWORD MATCHES (30 points max)
        keyword_score = self._score_keyword_matches(book, themes)
        breakdown['keyword_score'] = min(keyword_score, 30)
        
        # 3. RATING QUALITY (15 points max) - ENHANCED SCORING
        rating_score = self._score_rating_quality(book)
        breakdown['rating_score'] = min(rating_score, 15)
        
        # 4. PUBLICATION RECENCY (10 points max)
        recency_score = self._score_publication_recency(book)
        breakdown['recency_score'] = min(recency_score, 10)
        
        # 5. SOURCE PRIORITY (5 points max)
        source_score = self._score_source_priority(book)
        breakdown['source_score'] = min(source_score, 5)
        
        # Calculate total
        breakdown['total'] = (
            breakdown['theme_score'] +
            breakdown['keyword_score'] +
            breakdown['rating_score'] +
            breakdown['recency_score'] +
            breakdown['source_score']
        )
        
        return breakdown
    
    def _score_theme_matches(self, book: Dict, themes: Dict) -> float:
        """
        Score based on theme/genre matches (max 40 points).
        
        Breakdown:
        - Genre match in categories: 15 points
        - Genre match in description: 10 points
        - Each theme match in description: 10 points
        - Each theme match in categories: 5 points
        """
        score = 0.0
        
        description = (book.get('description') or '').lower()
        categories = [c.lower() for c in book.get('categories', [])]
        categories_text = ' '.join(categories)
        
        # Extract from themes dict
        genre = themes.get('genre', '').lower()
        theme_list = [t.lower() for t in themes.get('themes', [])]
        
        # Genre matching (25 points possible)
        if genre:
            # Exact or fuzzy genre match in categories
            if any(genre in cat or cat in genre for cat in categories):
                score += 15
                logger.debug(f"[SCORE] Genre '{genre}' in categories: +15")
            
            # Genre in description
            if genre in description:
                score += 10
                logger.debug(f"[SCORE] Genre '{genre}' in description: +10")
        
        # Theme matching (up to 15 points)
        for theme in theme_list[:3]:  # Top 3 themes
            theme_lower = theme.lower()
            
            # Theme in description (prioritized)
            if theme_lower in description:
                score += 10
                logger.debug(f"[SCORE] Theme '{theme}' in description: +10")
            
            # Theme in categories
            elif any(theme_lower in cat for cat in categories):
                score += 5
                logger.debug(f"[SCORE] Theme '{theme}' in categories: +5")
        
        return score
    
    def _score_keyword_matches(self, book: Dict, themes: Dict) -> float:
        """
        Score based on keyword matches in description (max 30 points).
        
        Checks for:
        - Character archetypes
        - Plot structures
        - Tone/atmosphere
        - Setting elements
        """
        score = 0.0
        
        description = (book.get('description') or '').lower()
        
        if not description or description == 'no description available':
            return 0.0
        
        # Character archetypes (up to 10 points)
        char_types = themes.get('characterTypes', [])
        for char_type in char_types[:2]:  # Top 2 character types
            keywords = char_type.lower().split()
            # Check if any keyword appears in description
            if any(kw in description for kw in keywords):
                score += 5
                logger.debug(f"[SCORE] Character type '{char_type}' match: +5")
        
        # Plot structures (up to 10 points)
        plot_structures = themes.get('plotStructures', [])
        if isinstance(plot_structures, list):
            for structure in plot_structures[:2]:
                keywords = structure.lower().split()
                if any(kw in description for kw in keywords):
                    score += 5
                    logger.debug(f"[SCORE] Plot structure '{structure}' match: +5")
        elif isinstance(plot_structures, str):
            keywords = plot_structures.lower().split()
            if any(kw in description for kw in keywords):
                score += 10
                logger.debug(f"[SCORE] Plot structure match: +10")
        
        # Tone/atmosphere (5 points)
        tone = themes.get('tone', '').lower()
        if tone and tone in description:
            score += 5
            logger.debug(f"[SCORE] Tone '{tone}' match: +5")
        
        # Setting (5 points)
        setting = themes.get('settingType', '').lower()
        if setting:
            setting_keywords = setting.split()
            if any(kw in description for kw in setting_keywords if len(kw) > 3):
                score += 5
                logger.debug(f"[SCORE] Setting match: +5")
        
        return score
    
    def _score_rating_quality(self, book: Dict) -> float:
        """
        Enhanced rating quality scoring (max 15 points).
        
        Scoring tiers:
        - 4.5+: 15 points (excellent)
        - 4.0-4.49: 12 points (very good)
        - 3.5-3.99: 8 points (good)
        - 3.0-3.49: 4 points (decent)
        - <3.0: 0 points
        """
        rating = book.get('rating')
        
        if not rating:
            return 0.0
        
        if rating >= 4.5:
            return 15.0
        elif rating >= 4.0:
            return 12.0
        elif rating >= 3.5:
            return 8.0
        elif rating >= 3.0:
            return 4.0
        else:
            return 0.0
    
    def _score_publication_recency(self, book: Dict) -> float:
        """
        Score based on publication recency (max 10 points).
        
        Tiers:
        - Last 5 years: 10 points
        - 6-10 years: 7 points
        - 11-20 years: 4 points
        - 20+ years: 2 points (classics still get points)
        """
        year = book.get('year')
        
        if not year:
            return 0.0
        
        current_year = 2025
        age = current_year - year
        
        if age <= 5:
            return 10.0
        elif age <= 10:
            return 7.0
        elif age <= 20:
            return 4.0
        else:
            return 2.0  # Classics still get some points
    
    def _score_source_priority(self, book: Dict) -> float:
        """
        Score based on source quality (max 5 points).
        
        Priority:
        - Google Books with description: 5 points
        - Curated collection: 4 points
        - Google Books without description: 3 points
        - Open Library with good mapping: 2 points
        - Open Library basic: 1 point
        """
        source = book.get('source')
        description = book.get('description')
        mapping_method = book.get('_mapping_method')
        
        if source == 'google_books':
            if description and len(description) > 100:
                return 5.0
            else:
                return 3.0
        elif source == 'curated':
            return 4.0
        elif source == 'open_library':
            # Reward good subject mapping
            if mapping_method == 'dynamic':
                return 2.0
            else:
                return 1.0
        else:
            return 0.0
    
    def _deduplicate_books(self, books: List[Dict]) -> List[Dict]:
        """
        Remove duplicate books (same title + author).
        Keeps the version with highest score.
        """
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
                # Find existing book with this key
                for i, existing in enumerate(unique):
                    existing_key = (
                        re.sub(r'[^\w\s]', '', existing.get('title', '').lower()),
                        existing.get('author', '').lower()
                    )
                    
                    if existing_key == key:
                        # Keep version with higher score or better data
                        if (book.get('relevance_score', 0) > existing.get('relevance_score', 0) or
                            (book.get('description') and not existing.get('description'))):
                            unique[i] = book
                            logger.debug(f"[DEDUP] Replaced duplicate: {title}")
                        break
        
        logger.debug(f"[RANKER] Deduplicated {len(books)} -> {len(unique)} unique books")
        return unique
    
    def _enforce_diversity(
        self, 
        ranked_books: List[Dict], 
        limit: int
    ) -> List[Dict]:
        """
        Enforce diversity in top recommendations:
        - No more than 2 books by same author in top results
        - Prefer variety of categories
        - Balance high-scoring books with diverse perspectives
        """
        selected = []
        authors_seen = {}
        categories_seen = set()
        
        for book in ranked_books:
            if len(selected) >= limit:
                break
            
            # Author diversity check
            author = book.get('author', 'Unknown')
            author_count = authors_seen.get(author, 0)
            
            # Strict limit: max 2 books per author
            if author_count >= 2:
                logger.debug(f"[DIVERSITY] Skipping {book['title']} - author limit")
                continue
            
            # Category diversity (prefer variety after first 3 books)
            book_categories = set(c.lower() for c in book.get('categories', []))
            
            if len(selected) >= 3:
                # Check if this adds new categories
                new_categories = book_categories - categories_seen
                
                # Skip if no new categories AND score isn't significantly higher
                if not new_categories and selected:
                    score_threshold = selected[-1]['relevance_score'] + 10
                    if book['relevance_score'] < score_threshold:
                        logger.debug(
                            f"[DIVERSITY] Skipping {book['title']} - "
                            f"no new categories, score not high enough"
                        )
                        continue
            
            # Add book
            selected.append(book)
            authors_seen[author] = author_count + 1
            categories_seen.update(book_categories)
            
            logger.debug(
                f"[DIVERSITY] Selected: {book['title']} "
                f"(score: {book['relevance_score']:.1f}, author count: {author_count + 1})"
            )
        
        return selected
    
    def get_ranking_summary(
        self, 
        books: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Get summary statistics about ranking results.
        
        Args:
            books: Ranked books with score_breakdown
            
        Returns:
            Summary statistics dictionary
        """
        if not books:
            return {
                'total_books': 0,
                'avg_score': 0,
                'score_range': (0, 0),
                'avg_breakdown': {}
            }
        
        total_books = len(books)
        scores = [b.get('relevance_score', 0) for b in books]
        
        # Calculate average breakdown
        breakdown_keys = ['theme_score', 'keyword_score', 'rating_score', 
                         'recency_score', 'source_score']
        avg_breakdown = {}
        
        for key in breakdown_keys:
            values = [
                b.get('score_breakdown', {}).get(key, 0) 
                for b in books 
                if b.get('score_breakdown')
            ]
            avg_breakdown[key] = sum(values) / len(values) if values else 0
        
        return {
            'total_books': total_books,
            'avg_score': sum(scores) / total_books,
            'score_range': (min(scores), max(scores)),
            'avg_breakdown': avg_breakdown,
            'top_sources': self._count_sources(books)
        }
    
    def _count_sources(self, books: List[Dict]) -> Dict[str, int]:
        """Count books by source."""
        sources = {}
        for book in books:
            source = book.get('source', 'unknown')
            sources[source] = sources.get(source, 0) + 1
        return sources


# ============================================
# TESTING
# ============================================

def test_enhanced_ranker():
    """Test enhanced ranker with sample books."""
    print("\n" + "="*70)
    print("ENHANCED BOOK RANKER TEST")
    print("="*70)
    
    ranker = BookRanker()
    
    # Sample themes
    themes = {
        'genre': 'fantasy',
        'themes': ['magic', 'identity', 'power'],
        'characterTypes': ['reluctant hero', 'mentor'],
        'plotStructures': 'hero journey',
        'tone': 'dark',
        'settingType': 'medieval fantasy'
    }
    
    # Sample books with varying quality
    books = [
        {
            'id': '1',
            'title': 'The Name of the Wind',
            'author': 'Patrick Rothfuss',
            'description': 'A young hero discovers his magical powers and embarks on a hero journey through a dark fantasy world. Explores themes of identity and power.',
            'categories': ['Fantasy', 'Magic', 'Coming of Age'],
            'rating': 4.5,
            'year': 2007,
            'source': 'google_books'
        },
        {
            'id': '2',
            'title': 'Six of Crows',
            'author': 'Leigh Bardugo',
            'description': 'A reluctant hero leads a crew through a dangerous heist in a dark fantasy world of magic.',
            'categories': ['Fantasy', 'Heist', 'Dark'],
            'rating': 4.4,
            'year': 2015,
            'source': 'google_books'
        },
        {
            'id': '3',
            'title': 'Generic Fantasy Book',
            'author': 'Unknown Author',
            'description': '',
            'categories': ['Fantasy'],
            'rating': 3.2,
            'year': 1995,
            'source': 'open_library',
            '_mapping_method': 'fallback'
        },
        {
            'id': '4',
            'title': 'The Poppy War',
            'author': 'R.F. Kuang',
            'description': 'A war orphan discovers dark powers and must navigate identity, power, and moral choices.',
            'categories': ['Fantasy', 'War', 'Dark'],
            'rating': 4.2,
            'year': 2018,
            'source': 'google_books'
        }
    ]
    
    print(f"\nThemes: {themes}")
    print(f"Testing with {len(books)} sample books\n")
    
    # Rank books
    ranked = ranker.rank_and_deduplicate_books(books, themes, limit=5)
    
    print("-"*70)
    print("RANKING RESULTS")
    print("-"*70)
    
    for i, book in enumerate(ranked, 1):
        print(f"\n{i}. {book['title']} by {book['author']}")
        print(f"   Total Score: {book['relevance_score']:.1f}/100")
        
        breakdown = book.get('score_breakdown', {})
        print(f"   Breakdown:")
        print(f"     - Theme matches: {breakdown.get('theme_score', 0):.1f}/40")
        print(f"     - Keywords: {breakdown.get('keyword_score', 0):.1f}/30")
        print(f"     - Rating: {breakdown.get('rating_score', 0):.1f}/15")
        print(f"     - Recency: {breakdown.get('recency_score', 0):.1f}/10")
        print(f"     - Source: {breakdown.get('source_score', 0):.1f}/5")
        print(f"   Rating: {book.get('rating', 'N/A')} | Year: {book.get('year', 'N/A')}")
    
    # Summary
    summary = ranker.get_ranking_summary(ranked)
    
    print("\n" + "-"*70)
    print("RANKING SUMMARY")
    print("-"*70)
    print(f"Total books: {summary['total_books']}")
    print(f"Average score: {summary['avg_score']:.1f}")
    print(f"Score range: {summary['score_range'][0]:.1f} - {summary['score_range'][1]:.1f}")
    print(f"\nAverage breakdown:")
    for key, value in summary['avg_breakdown'].items():
        print(f"  {key}: {value:.1f}")
    print(f"\nSources: {summary['top_sources']}")
    
    print("\n" + "="*70)
    print("TEST COMPLETE")
    print("="*70)


if __name__ == "__main__":
    import logging
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    
    test_enhanced_ranker()