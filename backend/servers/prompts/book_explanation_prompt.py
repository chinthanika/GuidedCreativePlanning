"""
Simplified book explanation prompt system.
Converts complex template to static prompt like mapping_system_prompt.
"""

# System prompt for explanation generation
BOOK_EXPLANATION_SYSTEM_PROMPT = """You are an expert book recommendation specialist for young writers (aged 12-18). 

Generate personalized explanations that help students understand WHY each book matches their creative vision and HOW it compares to other recommendations.

For each book, provide:
1. **Explanation** (2-3 sentences): Draw concrete connections between the book and the student's story elements (genre, themes, characters, tone). Reference specific elements from the book description. Be encouraging and writer-focused.

2. **Match Highlights** (2-4 bullet points): Specific matching elements formatted as "Element: Detail". Examples:
   - "Theme: Identity crisis through magical discovery"
   - "Character: Reluctant hero forced into leadership"
   - "Tone: Dark but hopeful atmosphere"
   Keep each highlight concise (5-10 words).

3. **Comparison Note** (1 sentence, optional): What makes THIS book unique compared to others in the list (different tone, perspective, pacing, focus). Use empty string if books are very similar.

Guidelines:
- Be SPECIFIC to both the student's story AND the book (avoid generic praise)
- Use craft-focused language (structure, pacing, character arc, theme development)
- If a book is a weaker match, acknowledge it subtly but remain constructive
- Reference at least ONE student story element and ONE book element per explanation
- Make highlights unique across books (no copy-paste)
- Neutral tone: "This book explores..." not "You should read..."
- Focus on what writers can learn, not just what's entertaining
Output JSON format:
{
  "explanations": [
    {
      "explanation": "...",
      "matchHighlights": ["...", "..."],
      "comparisonNote": "..."
    }
  ]
}

Be specific, be comparative, be educational."""


def build_explanation_user_prompt(story_elements: dict, books: list) -> str:
    """
    Build concise user prompt for explanation generation.
    
    Args:
        story_elements: Extracted story elements
        books: List of books to explain
        
    Returns:
        Formatted user prompt
    """
    # Extract key story context
    genre = story_elements.get('genre', {}).get('primary', 'fiction')
    themes = [t['name'] for t in story_elements.get('themes', [])][:4]
    characters = [c['archetype'] for c in story_elements.get('characterArchetypes', [])][:3]
    tone = story_elements.get('tone', {}).get('primary', 'neutral')
    conflicts = [c.get('category', '') for c in story_elements.get('conflicts', [])][:2]
    
    # Build story context section
    story_context = f"Genre: {genre}"
    if themes:
        story_context += f" | Themes: {', '.join(themes)}"
    if characters:
        story_context += f" | Characters: {', '.join(characters)}"
    if tone:
        story_context += f" | Tone: {tone}"
    if conflicts:
        story_context += f" | Conflicts: {', '.join(conflicts)}"
    
    # Format books concisely
    book_entries = []
    for idx, book in enumerate(books, 1):
        # Truncate description
        desc = book.get('description', 'No description')[:250]
        if len(book.get('description', '')) > 250:
            desc += '...'
        
        entry = f"{idx}. {book.get('title')} by {book.get('author')}\n"
        entry += f"   Categories: {', '.join(book.get('categories', [])[:4])}\n"
        entry += f"   Rating: {book.get('rating', 'N/A')} | Relevance: {book.get('relevance_score', 0):.0f}/100\n"
        entry += f"   {desc}"
        
        book_entries.append(entry)
    
    # Build final prompt
    prompt = f"""Student's Story:
{story_context}

Books to Explain:
{chr(10).join(book_entries)}

Generate explanations for all {len(books)} books, connecting each to the student's story elements. Output JSON only."""
    
    return prompt


# Example usage
if __name__ == "__main__":
    print("="*70)
    print("SIMPLIFIED BOOK EXPLANATION PROMPT TEST")
    print("="*70)
    
    # Example data
    story_elements = {
        'genre': {'primary': 'fantasy', 'confidence': 0.9},
        'themes': [
            {'name': 'identity', 'confidence': 0.8},
            {'name': 'power', 'confidence': 0.75}
        ],
        'characterArchetypes': [
            {'archetype': 'reluctant hero', 'confidence': 0.8}
        ],
        'tone': {'primary': 'dark'},
        'conflicts': [
            {'category': 'character vs self'}
        ]
    }
    
    books = [
        {
            'title': 'The Name of the Wind',
            'author': 'Patrick Rothfuss',
            'description': 'A young orphan named Kvothe discovers his magical heritage and embarks on a quest for knowledge and revenge.',
            'categories': ['Fantasy', 'Magic', 'Coming of Age'],
            'rating': 4.5,
            'relevance_score': 85
        },
        {
            'title': 'Six of Crows',
            'author': 'Leigh Bardugo',
            'description': 'A crew of criminals must pull off an impossible heist in a world of dark magic.',
            'categories': ['Fantasy', 'Heist', 'Dark'],
            'rating': 4.4,
            'relevance_score': 82
        }
    ]
    
    # Build prompt
    user_prompt = build_explanation_user_prompt(story_elements, books)
    
    print("\n--- SYSTEM PROMPT ---")
    print(BOOK_EXPLANATION_SYSTEM_PROMPT)
    
    print("\n--- USER PROMPT ---")
    print(user_prompt)
    
    print("\n--- COMPARISON ---")
    print(f"System prompt length: {len(BOOK_EXPLANATION_SYSTEM_PROMPT)} chars")
    print(f"User prompt length: {len(user_prompt)} chars")
    print(f"Total: {len(BOOK_EXPLANATION_SYSTEM_PROMPT) + len(user_prompt)} chars")
    print("\nOriginal build_explanation_user_prompt length: ~6000+ chars")
    print(f"Reduction: ~{(1 - (len(BOOK_EXPLANATION_SYSTEM_PROMPT) + len(user_prompt)) / 6000) * 100:.0f}%")
    
    print("\n" + "="*70)