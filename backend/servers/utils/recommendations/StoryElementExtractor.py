"""
Story element extraction utilities for book recommendation system.
Handles formatting, validation, and fallback extraction (non-AI operations).
"""

import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class StoryElementExtractor:
    """
    Utility class for story element extraction operations.
    AI calls happen in the server endpoint, this handles data processing.
    """
    
    @staticmethod
    def format_conversation(conversation: List[Dict[str, Any]]) -> str:
        """
        Format conversation into readable text for extraction prompt.
        Prioritizes recent user messages.
        
        Args:
            conversation: List of message objects with 'role' and 'content' keys
            
        Returns:
            Formatted conversation string for AI prompt
        """
        formatted = []
        
        # Take last 15 messages, but prioritize user messages
        recent = conversation[-15:]
        user_messages = [m for m in recent if m.get('role') == 'user']
        ai_messages = [m for m in recent if m.get('role') == 'assistant']
        
        # Include more user messages than AI messages
        selected_messages = []
        
        # Always include all user messages
        for msg in recent:
            if msg.get('role') == 'user':
                selected_messages.append(msg)
        
        # Add AI context (max 5 messages for brevity)
        ai_context = [m for m in ai_messages[-5:]]
        for msg in recent:
            if msg in ai_context and msg not in selected_messages:
                selected_messages.append(msg)
        
        # Sort by timestamp if available
        if all('timestamp' in m for m in selected_messages):
            selected_messages.sort(key=lambda x: x.get('timestamp', 0))
        
        # Format messages
        for msg in selected_messages:
            role = "Student" if msg.get('role') == 'user' else "AI Coach"
            content = msg.get('content', '').strip()
            
            if not content:
                continue
            
            # Truncate very long messages
            if len(content) > 800:
                content = content[:800] + "..."
            
            formatted.append(f"{role}: {content}")
        
        return "\n\n".join(formatted)
    
    @staticmethod
    def validate_extraction(elements: Dict[str, Any]) -> bool:
        """
        Validate that extraction meets minimum quality standards.
        
        Args:
            elements: Extracted story elements dictionary
            
        Returns:
            True if extraction is valid, False otherwise
        """
        # Check required fields exist
        required_fields = [
            'genre', 'subgenres', 'themes', 'characterArchetypes',
            'plotStructure', 'tone', 'overallConfidence'
        ]
        
        if not all(field in elements for field in required_fields):
            logger.warning("[STORY_EXTRACT] Missing required fields")
            return False
        
        # Check overall confidence
        overall_confidence = elements.get('overallConfidence', 0)
        if overall_confidence < 0.3:
            logger.warning(
                f"[STORY_EXTRACT] Overall confidence too low: {overall_confidence}"
            )
            return False
        
        # Check genre confidence
        genre_confidence = elements.get('genre', {}).get('confidence', 0)
        if genre_confidence < 0.4:
            logger.warning(
                f"[STORY_EXTRACT] Genre confidence too low: {genre_confidence}"
            )
            return False
        
        # Check that at least one high-confidence element exists
        has_solid_element = (
            genre_confidence >= 0.6 or
            any(t.get('confidence', 0) >= 0.6 for t in elements.get('themes', [])) or
            any(c.get('confidence', 0) >= 0.6 for c in elements.get('characterArchetypes', []))
        )
        
        if not has_solid_element:
            logger.warning("[STORY_EXTRACT] No high-confidence elements found")
            return False
        
        return True
    
    @staticmethod
    def keyword_extraction_fallback(conversation: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Simple keyword-based extraction when AI fails.
        Returns basic structure with low confidence.
        
        Args:
            conversation: List of message objects
            
        Returns:
            Basic extracted elements dictionary
        """
        logger.warning("[STORY_EXTRACT] Using keyword-based fallback extraction")
        
        # Combine all user messages
        text = ' '.join([
            msg.get('content', '') 
            for msg in conversation 
            if msg.get('role') == 'user'
        ]).lower()
        
        # Genre detection
        genre = 'fiction'
        genre_confidence = 0.3
        
        genre_keywords = {
            'fantasy': ['magic', 'wizard', 'dragon', 'fantasy', 'spell', 'enchant'],
            'sci-fi': ['space', 'robot', 'future', 'alien', 'technology', 'science'],
            'mystery': ['mystery', 'detective', 'solve', 'clue', 'investigate'],
            'horror': ['horror', 'scary', 'monster', 'fear', 'terror'],
            'romance': ['love', 'romance', 'relationship', 'heart'],
            'contemporary realistic': ['realistic', 'modern', 'contemporary', 'everyday']
        }
        
        for g, keywords in genre_keywords.items():
            if sum(1 for kw in keywords if kw in text) >= 2:
                genre = g
                genre_confidence = 0.5
                break
        
        # Theme detection
        themes = []
        theme_keywords = {
            'identity': ['identity', 'self', 'who am i', 'discover', 'find myself'],
            'power': ['power', 'control', 'strength', 'ability'],
            'friendship': ['friend', 'friendship', 'companion', 'ally'],
            'coming-of-age': ['grow', 'growing up', 'learn', 'change', 'mature'],
            'betrayal': ['betray', 'trust', 'backstab', 'deceive']
        }
        
        for theme, keywords in theme_keywords.items():
            if any(kw in text for kw in keywords):
                themes.append({
                    'name': theme,
                    'description': f'Detected from conversation keywords',
                    'prominence': 'secondary',
                    'confidence': 0.4
                })
        
        # Character detection
        characters = []
        if any(word in text for word in ['protagonist', 'hero', 'main character']):
            characters.append({
                'archetype': 'hero',
                'role': 'protagonist',
                'description': 'Mentioned in conversation',
                'confidence': 0.5
            })
        
        # Build minimal structure
        return {
            'genre': {
                'primary': genre,
                'confidence': genre_confidence
            },
            'subgenres': [],
            'themes': themes if themes else [{
                'name': 'exploration',
                'description': 'General story exploration',
                'prominence': 'primary',
                'confidence': 0.3
            }],
            'motifs': [],
            'characterArchetypes': characters,
            'plotStructure': {
                'primaryStructure': 'unknown',
                'elements': [],
                'pacing': 'unknown',
                'confidence': 0.2
            },
            'tone': {
                'primary': 'unknown',
                'secondary': [],
                'atmosphere': 'unknown',
                'confidence': 0.2
            },
            'settingType': {
                'temporal': 'unknown',
                'spatial': 'unknown',
                'worldbuilding': 'unknown',
                'confidence': 0.2
            },
            'narrativePerspective': {
                'pov': 'unknown',
                'tense': 'unknown',
                'confidence': 0.0
            },
            'conflicts': [],
            'ageAppropriate': {
                'targetAge': '12-16',
                'contentWarnings': [],
                'readingLevel': 'young adult',
                'confidence': 0.4
            },
            'emotionalCore': {
                'centralEmotion': 'unknown',
                'characterGrowth': 'unknown',
                'confidence': 0.2
            },
            'overallConfidence': 0.35,
            '_metadata': {
                'messageCount': len(conversation),
                'userMessages': sum(1 for m in conversation if m.get('role') == 'user'),
                'fallbackUsed': True
            }
        }
    
    @staticmethod
    def minimal_extraction_fallback(conversation: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Minimal extraction for very short conversations (< 3 messages).
        
        Args:
            conversation: List of message objects
            
        Returns:
            Minimal extracted elements dictionary
        """
        logger.warning("[STORY_EXTRACT] Minimal extraction for short conversation")
        
        return {
            'genre': {
                'primary': 'fiction',
                'confidence': 0.2
            },
            'subgenres': [],
            'themes': [],
            'motifs': [],
            'characterArchetypes': [],
            'plotStructure': {
                'primaryStructure': 'unknown',
                'elements': [],
                'pacing': 'unknown',
                'confidence': 0.0
            },
            'tone': {
                'primary': 'unknown',
                'secondary': [],
                'atmosphere': 'unknown',
                'confidence': 0.0
            },
            'settingType': {
                'temporal': 'unknown',
                'spatial': 'unknown',
                'worldbuilding': 'unknown',
                'confidence': 0.0
            },
            'narrativePerspective': {
                'pov': 'unknown',
                'tense': 'unknown',
                'confidence': 0.0
            },
            'conflicts': [],
            'ageAppropriate': {
                'targetAge': '12-16',
                'contentWarnings': [],
                'readingLevel': 'young adult',
                'confidence': 0.3
            },
            'emotionalCore': {
                'centralEmotion': 'unknown',
                'characterGrowth': 'unknown',
                'confidence': 0.0
            },
            'overallConfidence': 0.2,
            '_metadata': {
                'messageCount': len(conversation),
                'userMessages': sum(1 for m in conversation if m.get('role') == 'user'),
                'insufficientData': True
            }
        }
    
    @staticmethod
    def build_search_queries(elements: Dict[str, Any]) -> List[str]:
        """
        Generate optimized search queries from extracted elements.
        Used for book recommendation API calls.
        
        Args:
            elements: Extracted story elements dictionary
            
        Returns:
            List of search query strings
        """
        queries = []
        
        # Primary query: genre + age + top themes
        genre = elements.get('genre', {}).get('primary', '')
        age_group = elements.get('ageAppropriate', {}).get('targetAge', '12-16')
        themes = elements.get('themes', [])
        
        if genre:
            query_parts = [genre]
            
            # Add age-appropriate term
            if '12-16' in age_group or '14-16' in age_group:
                query_parts.append('young adult')
            elif '8-10' in age_group or '10-12' in age_group:
                query_parts.append('middle grade')
            
            # Add top 2 themes with high confidence
            high_conf_themes = [
                t['name'] for t in themes 
                if t.get('confidence', 0) >= 0.6
            ][:2]
            query_parts.extend(high_conf_themes)
            
            queries.append(' '.join(query_parts))
        
        # Secondary query: subgenre + primary theme
        subgenres = elements.get('subgenres', [])
        if subgenres and themes:
            subgenre = subgenres[0].get('name', '')
            primary_theme = next(
                (t['name'] for t in themes if t.get('prominence') == 'primary'),
                themes[0]['name'] if themes else ''
            )
            if subgenre and primary_theme:
                queries.append(f"{subgenre} {primary_theme}")
        
        # Tertiary query: character archetype + conflict
        characters = elements.get('characterArchetypes', [])
        conflicts = elements.get('conflicts', [])
        
        if characters and conflicts:
            char = characters[0].get('archetype', '')
            conflict = conflicts[0].get('category', '').replace('character vs ', '')
            if char and conflict:
                queries.append(f"{char} {conflict}")
        
        # Fallback: just genre
        if not queries and genre:
            queries.append(genre)
        
        logger.debug(f"[STORY_EXTRACT] Generated {len(queries)} search queries: {queries}")
        return queries