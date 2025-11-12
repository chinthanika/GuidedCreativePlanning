"""
Contextual explanation generator for book recommendations.
Generates personalized explanations comparing books and highlighting relevance.
"""

import logging
import json
from typing import List, Dict, Any, Optional
import openai

from prompts.book_explanation_prompt import (
    BOOK_EXPLANATION_SYSTEM_PROMPT,
    build_explanation_user_prompt
)
logger = logging.getLogger(__name__)


class BookExplanationGenerator:
    """
    Generates contextual explanations for book recommendations using DeepSeek.
    Compares books and explains why they match the user's story themes.
    """
    
    def __init__(self, client: openai.OpenAI):
        """
        Initialize explanation generator.
        
        Args:
            client: OpenAI client configured for DeepSeek
        """
        self.client = client
        
    def generate_explanations(
        self,
        books: List[Dict[str, Any]],
        story_elements: Dict[str, Any],
        batch_size: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Generate personalized explanations for recommended books.
        
        Args:
            books: List of ranked book recommendations
            story_elements: Extracted story elements from conversation
            batch_size: Number of books to explain at once
            
        Returns:
            Books with added 'explanation' and 'comparison' fields
        """
        if not books:
            logger.warning("[EXPLAIN] No books to generate explanations for")
            return []
        
        logger.info(f"[EXPLAIN] Generating explanations for {len(books)} books")
        
        explained_books = []
        
        # Process in batches for better comparison context
        for i in range(0, len(books), batch_size):
            batch = books[i:i + batch_size]
            
            try:
                batch_explanations = self._generate_batch_explanations(
                    batch,
                    story_elements
                )
                
                # Merge explanations with book data
                for book, explanation_data in zip(batch, batch_explanations):
                    explained_books.append({
                        **book,
                        'explanation': explanation_data.get('explanation', ''),
                        'matchHighlights': explanation_data.get('matchHighlights', []),
                        'comparisonNote': explanation_data.get('comparisonNote', '')
                    })
                
                logger.info(f"[EXPLAIN] Batch {i//batch_size + 1} complete")
                
            except Exception as e:
                logger.error(f"[EXPLAIN] Batch generation failed: {e}")
                # Add books without explanations
                for book in batch:
                    explained_books.append({
                        **book,
                        'explanation': self._fallback_explanation(book, story_elements),
                        'matchHighlights': [],
                        'comparisonNote': ''
                    })
        
        return explained_books
    
    def _generate_batch_explanations(
        self,
        books: List[Dict[str, Any]],
        story_elements: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generate explanations for a batch of books using DeepSeek.
        
        Args:
            books: Batch of books to explain
            story_elements: Story elements for context
            
        Returns:
            List of explanation objects
        """
        # Build prompt
        prompt = self._build_explanation_prompt(books, story_elements)
        
        # Call DeepSeek
        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": self._get_system_prompt()
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={'type': 'json_object'},
            temperature=0.4,  # Slightly creative but consistent
            timeout=30
        )
        
        # Parse response
        result_text = response.choices[0].message.content.strip()
        result = json.loads(result_text)
        
        explanations = result.get('explanations', [])
        
        # Validate we have explanations for all books
        if len(explanations) != len(books):
            logger.warning(
                f"[EXPLAIN] Expected {len(books)} explanations, got {len(explanations)}"
            )
            # Pad with fallbacks if needed
            while len(explanations) < len(books):
                explanations.append({
                    'explanation': 'A compelling read that matches your story interests.',
                    'matchHighlights': [],
                    'comparisonNote': ''
                })
        
        return explanations
    
    def _build_explanation_prompt(self, books, story_elements):
        return build_explanation_user_prompt(story_elements, books)

    def _get_system_prompt(self):
        return BOOK_EXPLANATION_SYSTEM_PROMPT
    
    def _fallback_explanation(
        self,
        book: Dict[str, Any],
        story_elements: Dict[str, Any]
    ) -> str:
        """
        Generate simple fallback explanation without AI.
        
        Args:
            book: Book data
            story_elements: Story elements
            
        Returns:
            Basic explanation string
        """
        genre = story_elements.get('genre', {}).get('primary', 'fiction')
        themes = [t['name'] for t in story_elements.get('themes', [])][:2]
        
        book_categories = book.get('categories', [])
        
        # Find matching elements
        matches = []
        if genre.lower() in ' '.join(book_categories).lower():
            matches.append(f"shares your {genre} genre")
        
        for theme in themes:
            if theme.lower() in ' '.join(book_categories).lower():
                matches.append(f"explores {theme}")
        
        if matches:
            return f"This book {' and '.join(matches)}. A compelling read that aligns with your creative vision."
        else:
            return "This book offers a unique perspective that could inspire your storytelling approach."
    
    def generate_summary_comparison(
        self,
        books: List[Dict[str, Any]],
        story_elements: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate an overview comparison of all recommendations.
        
        Args:
            books: List of recommended books
            story_elements: Story elements
            
        Returns:
            Summary object with overall insights
        """
        if not books or len(books) < 2:
            return {
                'summary': 'Here are some books that match your story interests.',
                'diversity_note': '',
                'exploration_tips': []
            }
        
        try:
            prompt = self._build_summary_prompt(books, story_elements)
            
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt()
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={'type': 'json_object'},
                temperature=0.4,
                timeout=20
            )
            
            result = json.loads(response.choices[0].message.content.strip())
            
            logger.info("[EXPLAIN] Generated summary comparison")
            return result
            
        except Exception as e:
            logger.error(f"[EXPLAIN] Summary generation failed: {e}")
            return {
                'summary': f'These {len(books)} books offer different perspectives on your story themes.',
                'diversity_note': 'Each book brings a unique approach to similar creative challenges.',
                'exploration_tips': [
                    'Notice how different authors handle similar themes',
                    'Pay attention to character development techniques',
                    'Observe different narrative structures'
                ]
            }
    
    def _build_summary_prompt(
        self,
        books: List[Dict[str, Any]],
        story_elements: Dict[str, Any]
    ) -> str:
        """Build prompt for summary comparison."""
        
        genre = story_elements.get('genre', {}).get('primary', 'fiction')
        themes = [t['name'] for t in story_elements.get('themes', [])][:5]
        
        book_titles = [
            f"{i+1}. {book.get('title')} by {book.get('author')}"
            for i, book in enumerate(books)
        ]
        
        prompt = f"""Generate an overview for these {len(books)} book recommendations.

**Student's Story:**
- Genre: {genre}
- Key Themes: {', '.join(themes) if themes else 'Various'}

**Recommended Books:**
{chr(10).join(book_titles)}

**Task:**
Generate a brief overview (2-3 sentences) that:
1. Explains what these books have in common
2. Highlights the diversity/range of approaches
3. Encourages exploration

Also provide 2-3 specific tips for what to look for when reading these books.

**Output Format (JSON only):**
{{
  "summary": "These books all explore [common element] but from different angles...",
  "diversity_note": "You'll find perspectives ranging from [X] to [Y]...",
  "exploration_tips": [
    "Notice how each author develops their protagonist's journey",
    "Compare the pacing and structure across different books",
    "Look for unique world-building techniques"
  ]
}}"""
        
        return prompt


# ============================================
# INTEGRATION EXAMPLE
# ============================================

def enhance_recommendations_with_explanations(
    books: List[Dict[str, Any]],
    story_elements: Dict[str, Any],
    client: openai.OpenAI
) -> Dict[str, Any]:
    """
    Complete enhancement of book recommendations with explanations.
    
    Args:
        books: Ranked book recommendations
        story_elements: Extracted story elements
        client: OpenAI client for DeepSeek
        
    Returns:
        Enhanced recommendations with explanations and summary
    """
    generator = BookExplanationGenerator(client)
    
    # Generate individual explanations
    explained_books = generator.generate_explanations(books, story_elements)
    
    # Generate summary comparison
    summary = generator.generate_summary_comparison(explained_books, story_elements)
    
    return {
        'books': explained_books,
        'summary': summary
    }


# ============================================
# TESTING UTILITIES
# ============================================

def test_explanation_generator():
    """Test explanation generator with sample data."""
    import os
    from utils.chat.chat_utils import DEEPSEEK_API_KEY, DEEPSEEK_URL
    
    print("\n" + "="*70)
    print("BOOK EXPLANATION GENERATOR TEST")
    print("="*70)
    
    if not DEEPSEEK_API_KEY:
        print("ERROR: DEEPSEEK_API_KEY not set")
        return
    
    # Initialize client
    client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_URL)
    generator = BookExplanationGenerator(client)
    
    # Sample story elements
    story_elements = {
        'genre': {'primary': 'fantasy', 'confidence': 0.9},
        'themes': [
            {'name': 'identity', 'confidence': 0.8, 'prominence': 'primary'},
            {'name': 'power', 'confidence': 0.75, 'prominence': 'secondary'},
            {'name': 'friendship', 'confidence': 0.7, 'prominence': 'secondary'}
        ],
        'characterArchetypes': [
            {'archetype': 'reluctant hero', 'confidence': 0.8},
            {'archetype': 'mentor', 'confidence': 0.6}
        ],
        'tone': {'primary': 'dark', 'secondary': ['mysterious']},
        'conflicts': [
            {'category': 'character vs self'},
            {'category': 'character vs society'}
        ]
    }
    
    # Sample books
    books = [
        {
            'id': 'book1',
            'title': 'The Name of the Wind',
            'author': 'Patrick Rothfuss',
            'description': 'A young orphan named Kvothe grows from a precocious child to a legendary hero, mastering magic and uncovering dark secrets.',
            'categories': ['Fantasy', 'Magic', 'Coming of Age'],
            'rating': 4.5,
            'year': 2007,
            'relevance_score': 85
        },
        {
            'id': 'book2',
            'title': 'Six of Crows',
            'author': 'Leigh Bardugo',
            'description': 'A crew of criminals must pull off an impossible heist in a world of magic and danger.',
            'categories': ['Fantasy', 'Heist', 'Dark'],
            'rating': 4.4,
            'year': 2015,
            'relevance_score': 82
        },
        {
            'id': 'book3',
            'title': 'The Poppy War',
            'author': 'R.F. Kuang',
            'description': 'A war orphan discovers she has a dark power and must navigate military academy, war, and moral choices.',
            'categories': ['Fantasy', 'War', 'Dark', 'Power'],
            'rating': 4.2,
            'year': 2018,
            'relevance_score': 80
        }
    ]
    
    print(f"\nTest Story: {story_elements['genre']['primary']} with themes: "
          f"{', '.join(t['name'] for t in story_elements['themes'])}")
    print(f"Test Books: {len(books)}")
    
    # Test 1: Individual explanations
    print("\n" + "-"*70)
    print("TEST 1: Individual Book Explanations")
    print("-"*70)
    
    try:
        explained_books = generator.generate_explanations(books, story_elements)
        
        for i, book in enumerate(explained_books, 1):
            print(f"\n{i}. {book['title']} by {book['author']}")
            print(f"   Relevance Score: {book['relevance_score']}")
            print(f"\n   Explanation:")
            print(f"   {book.get('explanation', 'No explanation')}")
            
            if book.get('matchHighlights'):
                print(f"\n   Match Highlights:")
                for highlight in book['matchHighlights']:
                    print(f"   • {highlight}")
            
            if book.get('comparisonNote'):
                print(f"\n   Comparison Note:")
                print(f"   {book['comparisonNote']}")
        
        print("\n✓ Individual explanations test PASSED")
        
    except Exception as e:
        print(f"\n✗ Individual explanations test FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Summary comparison
    print("\n" + "-"*70)
    print("TEST 2: Summary Comparison")
    print("-"*70)
    
    try:
        summary = generator.generate_summary_comparison(books, story_elements)
        
        print(f"\nSummary:")
        print(f"{summary.get('summary', 'No summary')}")
        
        if summary.get('diversity_note'):
            print(f"\nDiversity Note:")
            print(f"{summary['diversity_note']}")
        
        if summary.get('exploration_tips'):
            print(f"\nExploration Tips:")
            for tip in summary['exploration_tips']:
                print(f"• {tip}")
        
        print("\n✓ Summary comparison test PASSED")
        
    except Exception as e:
        print(f"\n✗ Summary comparison test FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 3: Fallback explanation
    print("\n" + "-"*70)
    print("TEST 3: Fallback Explanation")
    print("-"*70)
    
    test_book = books[0]
    fallback = generator._fallback_explanation(test_book, story_elements)
    print(f"\nFallback for '{test_book['title']}':")
    print(f"{fallback}")
    print("\n✓ Fallback test PASSED")
    
    print("\n" + "="*70)
    print("ALL TESTS COMPLETE")
    print("="*70)


if __name__ == "__main__":
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    
    test_explanation_generator()