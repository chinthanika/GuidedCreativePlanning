"""
Theme extraction from conversation using DeepSeek API.
Analyzes student conversation to extract story themes, genres, and narrative elements.
"""

import os
import json
import logging
from typing import List, Dict, Any
import openai

logger = logging.getLogger(__name__)

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
DEEPSEEK_URL = os.getenv('DEEPSEEK_URL', 'https://api.deepseek.com')

THEME_EXTRACTION_PROMPT = """You are analyzing a creative writing conversation between a student (aged 12-18) and an AI writing coach. Your task is to extract structured information about the student's story idea to recommend relevant books.

Conversation History:
{conversation_text}

Extract the following information and return as JSON:

{{
  "genre": "primary genre (fantasy, sci-fi, contemporary realistic, historical, mystery, horror, romance, etc.)",
  "subgenres": ["list of subgenres or genre blends"],
  "themes": ["major themes (identity, power, love, betrayal, coming-of-age, revenge, redemption, etc.)"],
  "characterTypes": ["archetypes mentioned (reluctant hero, mentor, trickster, chosen one, antihero, etc.)"],
  "plotStructures": ["narrative structures (hero's journey, revenge plot, mystery, romance arc, etc.)"],
  "tone": "overall mood (dark, whimsical, serious, humorous, melancholic, hopeful)",
  "ageGroup": "target reader age (8-12, 12-16, 16-18, adult)",
  "settingType": "e.g., medieval fantasy, dystopian future, contemporary urban, historical 1920s, etc.",
  "conflicts": ["types of conflict (internal, external, person vs society, person vs nature, person vs technology)"],
  "confidence": {{
    "genre": 0.0-1.0,
    "themes": 0.0-1.0,
    "overall": 0.0-1.0
  }}
}}

CRITICAL RULES:
1. Extract from STUDENT messages only, not AI suggestions
2. If student's idea is vague/early-stage, use broader categories
3. Mark confidence <0.7 if uncertain
4. Return empty arrays [] if no information available
5. Do not invent details not mentioned in conversation
6. Prioritize explicit statements over implications

Return ONLY valid JSON, no additional text."""


class ThemeExtractor:
    """Extracts themes from conversation history for book recommendations."""
    
    def __init__(self, deepseek_client):
        """
        Args:
            deepseek_client: OpenAI client configured for DeepSeek
        """
        self.client = deepseek_client
    
    def extract_themes_from_conversation(self, conversation: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Extract themes from conversation history using DeepSeek.
        
        Args:
            conversation: List of message objects with 'role' and 'content' keys
            
        Returns:
            Dictionary containing extracted themes and metadata
        """
        try:
            # Format conversation for prompt
            conversation_text = self._format_conversation(conversation)
            
            # Build prompt
            prompt = THEME_EXTRACTION_PROMPT.format(conversation_text=conversation_text)
            
            # Call DeepSeek API
            logger.info("[THEME] Extracting themes from conversation")
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing creative writing conversations."},
                    {"role": "user", "content": prompt}
                ],
                response_format={'type': 'json_object'},
                stream=False,
                timeout=30
            )
            
            # Parse JSON response
            themes_text = response.choices[0].message.content.strip()
            themes = json.loads(themes_text)
            
            # Build search queries from themes
            themes['_searchQueries'] = self._build_search_queries(themes)
            
            logger.info(f"[THEME] Extracted: genre={themes.get('genre')}, "
                       f"themes={len(themes.get('themes', []))}, "
                       f"confidence={themes.get('confidence', {}).get('overall', 0):.2f}")
            
            return themes
            
        except json.JSONDecodeError as e:
            logger.error(f"[THEME] Failed to parse JSON: {e}")
            return self._fallback_keyword_extraction(conversation)
        except Exception as e:
            logger.exception(f"[THEME] Extraction failed: {e}")
            return self._fallback_keyword_extraction(conversation)
    
    def _format_conversation(self, conversation: List[Dict[str, Any]]) -> str:
        """Format conversation into readable text for prompt."""
        formatted = []
        
        # Take last 10 messages, prioritize user messages
        recent = conversation[-10:]
        
        for msg in recent:
            role = "Student" if msg.get('role') == 'user' else "AI Coach"
            content = msg.get('content', '')
            
            # Skip empty messages
            if not content.strip():
                continue
            
            # Truncate very long messages
            if len(content) > 500:
                content = content[:500] + "..."
            
            formatted.append(f"{role}: {content}")
        
        return "\n\n".join(formatted)
    
    def _build_search_queries(self, themes: Dict[str, Any]) -> List[str]:
        """
        Build search queries from extracted themes.
        
        Returns list of search strings to try with book APIs.
        """
        queries = []
        
        # Primary query: genre + age group + top themes
        genre = themes.get('genre', '')
        age_group = themes.get('ageGroup', '')
        theme_list = themes.get('themes', [])
        
        if genre:
            # "fantasy young adult magic identity"
            query_parts = [genre]
            
            # Add age-appropriate term
            if '12-16' in age_group or '16-18' in age_group:
                query_parts.append('young adult')
            elif '8-12' in age_group:
                query_parts.append('middle grade')
            
            # Add top 2 themes
            if theme_list:
                query_parts.extend(theme_list[:2])
            
            queries.append(' '.join(query_parts))
        
        # Secondary query: character types + themes
        char_types = themes.get('characterTypes', [])
        if char_types and theme_list:
            queries.append(f"{char_types[0]} {theme_list[0]}")
        
        # Tertiary query: just genre + subgenre
        subgenres = themes.get('subgenres', [])
        if genre and subgenres:
            queries.append(f"{genre} {subgenres[0]}")
        
        logger.debug(f"[THEME] Built {len(queries)} search queries: {queries}")
        return queries
    
    def _fallback_keyword_extraction(self, conversation: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Simple keyword-based extraction when AI fails.
        
        Returns basic theme structure with low confidence.
        """
        logger.warning("[THEME] Using fallback keyword extraction")
        
        # Combine all user messages
        text = ' '.join([
            msg.get('content', '') 
            for msg in conversation 
            if msg.get('role') == 'user'
        ]).lower()
        
        # Simple keyword matching
        genre = 'fiction'  # default
        if any(word in text for word in ['magic', 'fantasy', 'dragon', 'wizard']):
            genre = 'fantasy'
        elif any(word in text for word in ['space', 'robot', 'future', 'alien']):
            genre = 'science fiction'
        elif any(word in text for word in ['mystery', 'detective', 'solve']):
            genre = 'mystery'
        
        themes = []
        if 'power' in text or 'magic' in text:
            themes.append('power')
        if 'identity' in text or 'discover' in text or 'find out' in text:
            themes.append('identity')
        if 'friend' in text or 'relationship' in text:
            themes.append('friendship')
        
        return {
            'genre': genre,
            'subgenres': [],
            'themes': themes,
            'characterTypes': [],
            'plotStructures': [],
            'tone': 'unknown',
            'ageGroup': '12-16',  # default to YA
            'settingType': 'unknown',
            'conflicts': [],
            'confidence': {
                'genre': 0.4,
                'themes': 0.3,
                'overall': 0.3
            },
            '_searchQueries': [f"{genre} young adult"]
        }