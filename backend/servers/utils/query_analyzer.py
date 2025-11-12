#!/usr/bin/env python3
"""
Query Quality Analyzer
Helps analyze and optimize search queries for book recommendations.
"""

import sys
import os
import logging
from typing import List, Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.recommendations.StoryElementExtractor import StoryElementExtractor
from utils.recommendations.book_sources import BookSourceManager

logger = logging.getLogger(__name__)


class QueryAnalyzer:
    """Analyzes query quality and suggests improvements."""
    
    def __init__(self):
        self.extractor = StoryElementExtractor()
        self.book_manager = BookSourceManager()
    
    def analyze_query(self, query: str) -> Dict[str, Any]:
        """
        Analyze a single query for quality metrics.
        
        Args:
            query: Search query string
            
        Returns:
            Analysis results dictionary
        """
        analysis = {
            'query': query,
            'word_count': len(query.split()),
            'has_genre': False,
            'has_age_indicator': False,
            'has_theme': False,
            'specificity_score': 0.0,
            'issues': [],
            'suggestions': []
        }
        
        query_lower = query.lower()
        
        # Check for genre
        genres = [
            'fantasy', 'sci-fi', 'science fiction', 'mystery', 'thriller',
            'horror', 'romance', 'contemporary', 'historical', 'dystopian'
        ]
        analysis['has_genre'] = any(g in query_lower for g in genres)
        
        # Check for age indicators
        age_indicators = ['young adult', 'ya', 'teen', 'middle grade', 'mg', 'children']
        analysis['has_age_indicator'] = any(a in query_lower for a in age_indicators)
        
        # Check for themes (common story elements)
        themes = [
            'magic', 'power', 'identity', 'friendship', 'love', 'betrayal',
            'coming-of-age', 'rebellion', 'adventure', 'survival', 'war',
            'family', 'discovery', 'revenge', 'sacrifice'
        ]
        analysis['has_theme'] = any(t in query_lower for t in themes)
        
        # Calculate specificity score (0-100)
        score = 0
        if analysis['has_genre']:
            score += 40
        if analysis['has_age_indicator']:
            score += 30
        if analysis['has_theme']:
            score += 30
        
        analysis['specificity_score'] = score
        
        # Identify issues
        if analysis['word_count'] < 2:
            analysis['issues'].append("Query too short (< 2 words)")
        if analysis['word_count'] > 8:
            analysis['issues'].append("Query too long (> 8 words) - may limit results")
        if not analysis['has_genre']:
            analysis['issues'].append("Missing genre - results may be too broad")
        if not analysis['has_theme']:
            analysis['issues'].append("Missing theme - results may be generic")
        
        # Generate suggestions
        if not analysis['has_genre']:
            analysis['suggestions'].append("Add genre (e.g., 'fantasy', 'sci-fi', 'mystery')")
        if not analysis['has_age_indicator']:
            analysis['suggestions'].append("Add age indicator (e.g., 'young adult', 'teen')")
        if not analysis['has_theme']:
            analysis['suggestions'].append("Add theme (e.g., 'identity', 'friendship', 'power')")
        if analysis['word_count'] > 6:
            analysis['suggestions'].append("Simplify query - focus on 3-5 key terms")
        
        return analysis
    
    def analyze_query_set(self, queries: List[str]) -> Dict[str, Any]:
        """
        Analyze a set of queries (e.g., from story extraction).
        
        Args:
            queries: List of query strings
            
        Returns:
            Analysis summary for the entire query set
        """
        if not queries:
            return {
                'query_count': 0,
                'avg_specificity': 0,
                'issues': ['No queries provided'],
                'queries': []
            }
        
        query_analyses = [self.analyze_query(q) for q in queries]
        
        avg_specificity = sum(a['specificity_score'] for a in query_analyses) / len(query_analyses)
        
        all_issues = []
        for analysis in query_analyses:
            all_issues.extend(analysis['issues'])
        
        # Deduplicate issues
        unique_issues = list(set(all_issues))
        
        summary = {
            'query_count': len(queries),
            'avg_specificity': avg_specificity,
            'issues': unique_issues,
            'queries': query_analyses,
            'recommendation': self._get_recommendation(avg_specificity, unique_issues)
        }
        
        return summary
    
    def _get_recommendation(self, avg_specificity: float, issues: List[str]) -> str:
        """Generate overall recommendation for query set."""
        if avg_specificity >= 80:
            return "Excellent - Queries are well-structured and specific"
        elif avg_specificity >= 60:
            return "Good - Queries should return relevant results"
        elif avg_specificity >= 40:
            return "Fair - Consider adding more specific terms"
        else:
            return "Poor - Queries need more specificity (genre, themes, age)"
    
    def test_query_effectiveness(self, query: str, limit: int = 5) -> Dict[str, Any]:
        """
        Test a query by fetching actual books and analyzing results.
        
        Args:
            query: Search query to test
            limit: Number of books to fetch
            
        Returns:
            Test results with books and analysis
        """
        results = {
            'query': query,
            'analysis': self.analyze_query(query),
            'books_found': 0,
            'books': [],
            'fetch_success': False,
            'error': None
        }
        
        try:
            themes = {'_searchQueries': [query]}
            books = self.book_manager._fetch_google_books_with_retry(themes, limit)
            
            results['books_found'] = len(books)
            results['books'] = books
            results['fetch_success'] = len(books) > 0
            
            if not books:
                results['error'] = "Query returned no results"
        
        except Exception as e:
            results['error'] = str(e)
        
        return results
    
    def compare_queries(self, queries: List[str], limit: int = 5) -> Dict[str, Any]:
        """
        Compare effectiveness of multiple queries.
        
        Args:
            queries: List of queries to compare
            limit: Number of books to fetch per query
            
        Returns:
            Comparison results
        """
        comparisons = []
        
        for query in queries:
            logger.info(f"Testing query: '{query}'")
            result = self.test_query_effectiveness(query, limit)
            comparisons.append(result)
        
        # Rank queries by effectiveness
        comparisons.sort(key=lambda x: x['books_found'], reverse=True)
        
        return {
            'queries_tested': len(queries),
            'comparisons': comparisons,
            'best_query': comparisons[0]['query'] if comparisons else None,
            'best_query_book_count': comparisons[0]['books_found'] if comparisons else 0
        }
    
    def suggest_query_improvements(self, story_elements: Dict[str, Any]) -> List[str]:
        """
        Suggest improved queries based on story elements.
        
        Args:
            story_elements: Extracted story elements dictionary
            
        Returns:
            List of suggested query strings
        """
        suggestions = []
        
        genre = story_elements.get('genre', {}).get('primary', '')
        themes = story_elements.get('themes', [])
        characters = story_elements.get('characterArchetypes', [])
        age = story_elements.get('ageAppropriate', {}).get('targetAge', '12-16')
        
        # Get age term
        age_term = 'young adult'
        if '8-10' in age or '10-12' in age:
            age_term = 'middle grade'
        
        # Strategy 1: Genre + Age + Top Theme
        if genre and themes:
            top_theme = themes[0].get('name', '')
            if top_theme:
                suggestions.append(f"{genre} {age_term} {top_theme}")
        
        # Strategy 2: Genre + Character + Theme
        if genre and characters and themes:
            char_type = characters[0].get('archetype', '')
            theme = themes[0].get('name', '')
            if char_type and theme:
                suggestions.append(f"{genre} {char_type} {theme}")
        
        # Strategy 3: Just Genre + Age (broader)
        if genre:
            suggestions.append(f"{genre} {age_term}")
        
        # Strategy 4: Two Themes (if available)
        if len(themes) >= 2:
            theme1 = themes[0].get('name', '')
            theme2 = themes[1].get('name', '')
            if theme1 and theme2:
                suggestions.append(f"{age_term} {theme1} {theme2}")
        
        return suggestions


# ============================================
# INTERACTIVE CLI
# ============================================

def interactive_mode():
    """Run analyzer in interactive mode."""
    analyzer = QueryAnalyzer()
    
    print("="*70)
    print("QUERY QUALITY ANALYZER")
    print("="*70)
    print("\nOptions:")
    print("  1. Analyze a single query")
    print("  2. Compare multiple queries")
    print("  3. Test query with actual books")
    print("  4. Analyze story element queries")
    print("  5. Exit")
    
    while True:
        print("\n" + "-"*70)
        choice = input("Select option (1-5): ").strip()
        
        if choice == '1':
            query = input("Enter query to analyze: ").strip()
            if query:
                analysis = analyzer.analyze_query(query)
                print(f"\nQuery: '{query}'")
                print(f"Word Count: {analysis['word_count']}")
                print(f"Specificity Score: {analysis['specificity_score']}/100")
                print(f"Has Genre: {analysis['has_genre']}")
                print(f"Has Age Indicator: {analysis['has_age_indicator']}")
                print(f"Has Theme: {analysis['has_theme']}")
                if analysis['issues']:
                    print(f"\nIssues:")
                    for issue in analysis['issues']:
                        print(f"  - {issue}")
                if analysis['suggestions']:
                    print(f"\nSuggestions:")
                    for suggestion in analysis['suggestions']:
                        print(f"  - {suggestion}")
        
        elif choice == '2':
            print("\nEnter queries (one per line, empty line to finish):")
            queries = []
            while True:
                q = input(f"Query {len(queries)+1}: ").strip()
                if not q:
                    break
                queries.append(q)
            
            if queries:
                print(f"\nComparing {len(queries)} queries...")
                comparison = analyzer.compare_queries(queries)
                print(f"\nBest Query: '{comparison['best_query']}'")
                print(f"Books Found: {comparison['best_query_book_count']}")
                print("\nRankings:")
                for i, comp in enumerate(comparison['comparisons'], 1):
                    print(f"  {i}. '{comp['query']}' - {comp['books_found']} books")
        
        elif choice == '3':
            query = input("Enter query to test: ").strip()
            if query:
                print(f"\nTesting query: '{query}'")
                result = analyzer.test_query_effectiveness(query, limit=5)
                print(f"Books Found: {result['books_found']}")
                print(f"Specificity Score: {result['analysis']['specificity_score']}/100")
                if result['books']:
                    print("\nSample Books:")
                    for i, book in enumerate(result['books'][:3], 1):
                        print(f"  {i}. {book.get('title')} by {book.get('author')}")
                if result['error']:
                    print(f"\nError: {result['error']}")
        
        elif choice == '4':
            print("\nAnalyzing story element queries...")
            # Use a sample for demonstration
            sample_elements = {
                'genre': {'primary': 'fantasy', 'confidence': 0.8},
                'themes': [
                    {'name': 'magic', 'confidence': 0.8, 'prominence': 'primary'},
                    {'name': 'identity', 'confidence': 0.7, 'prominence': 'secondary'}
                ],
                'characterArchetypes': [
                    {'archetype': 'hero', 'confidence': 0.75}
                ],
                'ageAppropriate': {'targetAge': '12-16'}
            }
            
            extractor = StoryElementExtractor()
            queries = extractor.build_search_queries(sample_elements)
            
            print(f"\nGenerated Queries:")
            for i, q in enumerate(queries, 1):
                print(f"  {i}. {q}")
            
            summary = analyzer.analyze_query_set(queries)
            print(f"\nAverage Specificity: {summary['avg_specificity']:.1f}/100")
            print(f"Recommendation: {summary['recommendation']}")
            
            if summary['issues']:
                print(f"\nIssues Found:")
                for issue in summary['issues']:
                    print(f"  - {issue}")
        
        elif choice == '5':
            print("\nExiting...")
            break
        
        else:
            print("Invalid choice. Please select 1-5.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    interactive_mode()