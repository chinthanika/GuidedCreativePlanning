"""
Hybrid Subject Mapper for Open Library Integration.
Uses DeepSeek for dynamic mapping with hardcoded fallback.
"""

import os
import json
import time
import logging
from typing import List, Dict, Any, Tuple, Optional
from collections import OrderedDict
import openai

from ..chat.chat_utils import DEEPSEEK_API_KEY

logger = logging.getLogger(__name__)

# Configuration
USE_DYNAMIC_MAPPING = 'true'
MAPPING_CACHE_SIZE = 500  # LRU cache size
DEEPSEEK_URL = os.getenv('DEEPSEEK_URL', 'https://api.deepseek.com')


class LRUCache:
    """Simple LRU cache for mapping results."""
    
    def __init__(self, capacity: int = 500):
        self.cache = OrderedDict()
        self.capacity = capacity
    
    def get(self, key: str) -> Optional[Any]:
        if key not in self.cache:
            return None
        # Move to end (most recently used)
        self.cache.move_to_end(key)
        return self.cache[key]
    
    def put(self, key: str, value: Any):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            # Remove oldest item
            self.cache.popitem(last=False)
    
    def clear(self):
        self.cache.clear()


class MappingMetrics:
    """Track mapping performance metrics."""
    
    def __init__(self):
        self.metrics = {
            'dynamic_success': 0,
            'dynamic_failure': 0,
            'fallback_used': 0,
            'cache_hits': 0,
            'total_calls': 0,
            'relevance_scores': {
                'dynamic': [],
                'fallback': []
            },
            'latencies': []
        }
    
    def record_success(self, method: str, relevance: float, latency: float):
        """Record successful mapping."""
        self.metrics['total_calls'] += 1
        
        if method == 'dynamic':
            self.metrics['dynamic_success'] += 1
            self.metrics['relevance_scores']['dynamic'].append(relevance)
        elif method == 'fallback':
            self.metrics['fallback_used'] += 1
            self.metrics['relevance_scores']['fallback'].append(relevance)
        
        self.metrics['latencies'].append(latency)
    
    def record_failure(self):
        """Record failed dynamic mapping (fallback used)."""
        self.metrics['dynamic_failure'] += 1
        self.metrics['fallback_used'] += 1
        self.metrics['total_calls'] += 1
    
    def record_cache_hit(self):
        """Record cache hit."""
        self.metrics['cache_hits'] += 1
        self.metrics['total_calls'] += 1
    
    def get_summary(self) -> Dict[str, Any]:
        """Get metrics summary."""
        total = self.metrics['total_calls']
        
        if total == 0:
            return {'error': 'No data'}
        
        dynamic_relevance = self.metrics['relevance_scores']['dynamic']
        fallback_relevance = self.metrics['relevance_scores']['fallback']
        
        return {
            'total_calls': total,
            'cache_hit_rate': self.metrics['cache_hits'] / total,
            'dynamic_success_rate': self.metrics['dynamic_success'] / total,
            'fallback_rate': self.metrics['fallback_used'] / total,
            'avg_dynamic_relevance': sum(dynamic_relevance) / len(dynamic_relevance) if dynamic_relevance else 0,
            'avg_fallback_relevance': sum(fallback_relevance) / len(fallback_relevance) if fallback_relevance else 0,
            'avg_latency_ms': sum(self.metrics['latencies']) / len(self.metrics['latencies']) * 1000 if self.metrics['latencies'] else 0
        }


class SubjectMapper:
    """
    Hybrid subject mapper using DeepSeek for dynamic mapping with hardcoded fallback.
    
    Features:
    - Dynamic AI-powered mapping via DeepSeek
    - Hardcoded keyword matching as fallback
    - LRU caching for performance
    - Metrics tracking for monitoring
    - Feature flag for easy enable/disable
    """
    
    def __init__(
        self,
        api_key: str = DEEPSEEK_API_KEY,
        base_url: str = DEEPSEEK_URL,
        cache_size: int = MAPPING_CACHE_SIZE,
        enable_dynamic: bool = USE_DYNAMIC_MAPPING
    ):
        """
        Initialize subject mapper.
        
        Args:
            api_key: DeepSeek API key
            base_url: DeepSeek API base URL
            cache_size: LRU cache capacity
            enable_dynamic: Whether to use dynamic mapping
        """
        self.enable_dynamic = enable_dynamic and bool(api_key)
        
        # Initialize DeepSeek client if dynamic mapping enabled
        if self.enable_dynamic:
            try:
                self.client = openai.OpenAI(api_key=api_key, base_url=base_url)
                logger.info("[MAPPER] Dynamic mapping enabled with DeepSeek")
            except Exception as e:
                logger.error(f"[MAPPER] Failed to initialize DeepSeek: {e}")
                self.enable_dynamic = False
                self.client = None
        else:
            self.client = None
            logger.info("[MAPPER] Dynamic mapping disabled, using fallback only")
        
        # Load hardcoded mappings
        self.fallback_mappings = self._build_fallback_mappings()
        
        # Initialize cache and metrics
        self.cache = LRUCache(capacity=cache_size)
        self.metrics = MappingMetrics()
    
    def _build_fallback_mappings(self) -> Dict[str, List[str]]:
        """Build hardcoded subject-to-category mappings."""
        return {
            'fantasy': [
                'fantasy', 'magic', 'wizards', 'dragons', 'sorcery',
                'enchantment', 'magical realism', 'high fantasy', 'urban fantasy'
            ],
            'sci-fi': [
                'science fiction', 'dystopia', 'dystopian', 'space opera',
                'cyberpunk', 'time travel', 'artificial intelligence',
                'robots', 'aliens', 'future', 'apocalyptic', 'post-apocalyptic'
            ],
            'mystery': [
                'mystery', 'detective', 'crime', 'thriller', 'suspense',
                'murder mystery', 'whodunit', 'noir', 'spy'
            ],
            'horror': [
                'horror', 'supernatural', 'ghosts', 'vampires', 'zombies',
                'psychological horror', 'gothic', 'paranormal'
            ],
            'romance': [
                'romance', 'love story', 'romantic', 'relationships',
                'love triangle', 'contemporary romance'
            ],
            'coming-of-age': [
                'coming of age', 'bildungsroman', 'young adult',
                'teen', 'adolescence', 'growing up', 'self-discovery', 'identity'
            ],
            'adventure': [
                'adventure', 'quest', 'journey', 'exploration', 'survival', 'action'
            ],
            'historical': [
                'historical fiction', 'historical', 'period drama',
                'war', 'world war', 'medieval'
            ],
            'contemporary': [
                'realistic fiction', 'contemporary', 'modern', 'slice of life'
            ],
            'friendship': ['friendship', 'friends', 'companionship', 'loyalty'],
            'family': ['family', 'family relationships', 'siblings', 'parents'],
            'power': ['power', 'corruption', 'politics', 'authority'],
            'rebellion': ['rebellion', 'revolution', 'resistance', 'oppression'],
            'identity': ['identity', 'self-discovery', 'belonging', 'purpose'],
            'betrayal': ['betrayal', 'trust', 'deception', 'secrets']
        }
    
    def map_subjects(
        self,
        subjects: List[str],
        query_context: str = "",
        force_fallback: bool = False
    ) -> Tuple[List[str], float, str]:
        """
        Map Open Library subjects to standardized categories.
        
        Args:
            subjects: Raw Open Library subject tags
            query_context: Original search query for context
            force_fallback: Force use of fallback (for testing)
            
        Returns:
            Tuple of (categories, relevance_score, method_used)
        """
        if not subjects:
            return ([], 0.0, 'empty')
        
        # Generate cache key
        cache_key = self._generate_cache_key(subjects, query_context)
        
        # Check cache
        cached = self.cache.get(cache_key)
        if cached:
            self.metrics.record_cache_hit()
            logger.debug(f"[MAPPER] Cache hit for {subjects[:3]}...")
            return (*cached, 'cached')
        
        # Try dynamic mapping if enabled and not forced fallback
        if self.enable_dynamic and not force_fallback:
            start_time = time.time()
            try:
                categories, relevance = self._dynamic_map(subjects, query_context)
                latency = time.time() - start_time
                
                # Validate quality
                if categories and relevance >= 0.2:
                    result = (categories, relevance)
                    self.cache.put(cache_key, result)
                    self.metrics.record_success('dynamic', relevance, latency)
                    logger.debug(
                        f"[MAPPER] Dynamic mapping: {subjects[:3]}... → "
                        f"{categories[:3]} (score: {relevance:.2f})"
                    )
                    return (*result, 'dynamic')
                else:
                    logger.warning(
                        f"[MAPPER] Low quality dynamic mapping (score: {relevance:.2f}), "
                        "using fallback"
                    )
                    raise ValueError("Low quality mapping")
                
            except Exception as e:
                logger.warning(f"[MAPPER] Dynamic mapping failed: {e}, using fallback")
                self.metrics.record_failure()
        
        # Fallback to hardcoded mapping
        start_time = time.time()
        categories, relevance = self._hardcoded_map(subjects)
        latency = time.time() - start_time
        
        result = (categories, relevance)
        self.cache.put(cache_key, result)
        self.metrics.record_success('fallback', relevance, latency)
        
        logger.debug(
            f"[MAPPER] Fallback mapping: {subjects[:3]}... → "
            f"{categories[:3]} (score: {relevance:.2f})"
        )
        
        return (*result, 'fallback')
    
    def _generate_cache_key(self, subjects: List[str], query: str) -> str:
        """Generate cache key from subjects and query."""
        subjects_str = ','.join(sorted([s.lower().strip() for s in subjects]))
        query_str = query.lower().strip()
        return f"{subjects_str}|{query_str}"
    
    def _dynamic_map(
        self,
        subjects: List[str],
        query_context: str
    ) -> Tuple[List[str], float]:
        """
        Use DeepSeek to map subjects dynamically.
        
        Args:
            subjects: Raw subject tags
            query_context: Search query for context
            
        Returns:
            Tuple of (categories, relevance_score)
        """
        if not self.client:
            raise RuntimeError("DeepSeek client not initialized")
        
        # Build prompt
        prompt = self._build_mapping_prompt(subjects, query_context)
        
        # Call DeepSeek with JSON mode
        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": "You are a literary categorization expert specializing in young adult literature."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={'type': 'json_object'},
            temperature=0.3,  # Low temperature for consistency
            timeout=10
        )
        
        # Parse response
        result_text = response.choices[0].message.content.strip()
        result = json.loads(result_text)
        
        # Extract and validate
        categories = result.get('categories', [])
        relevance = float(result.get('relevance_score', 0.5))
        
        # Validation
        if not isinstance(categories, list):
            raise ValueError("Invalid categories format")
        
        if not 0 <= relevance <= 1:
            raise ValueError(f"Invalid relevance score: {relevance}")
        
        if not categories:
            raise ValueError("No categories returned")
        
        # Limit to top 5
        categories = categories[:5]
        
        return (categories, relevance)
    
    def _build_mapping_prompt(
        self,
        subjects: List[str],
        query_context: str
    ) -> str:
        """Build prompt for DeepSeek mapping."""
        return f"""Map these Open Library subjects to standardized story categories for book recommendations.

**Search Query:** "{query_context}"

**Open Library Subjects:** {json.dumps(subjects)}

**Standardized Categories:**
- **Genres:** Fantasy, Sci-Fi, Mystery, Horror, Romance, Contemporary, Historical, Adventure, Thriller, Dystopian
- **Themes:** Coming-of-Age, Identity, Power, Rebellion, Friendship, Family, Betrayal, Redemption, Survival, Love
- **Elements:** Magic, Technology, Supernatural, Realistic, Action, Suspense, Humor, Dark, Light

**Task:** Analyze the subjects and query context to determine the most relevant standardized categories.

**Output Format (JSON only, no explanation):**
{{
  "categories": ["Category1", "Category2", "Category3"],
  "relevance_score": 0.85,
  "reasoning": "brief explanation of mapping logic"
}}

**Rules:**
1. Include 2-5 most relevant categories
2. Prioritize categories that match the query context
3. relevance_score (0.0-1.0) = confidence in subject-query match
4. Use standardized category names exactly as listed above
5. Consider both explicit matches and semantic relationships
6. Higher relevance = subjects closely match query intent

**Examples:**

Input: Query="fantasy magic young adult", Subjects=["Fantasy", "Magic", "Young Adult", "Wizards"]
Output: {{"categories": ["Fantasy", "Magic", "Coming-of-Age"], "relevance_score": 0.95, "reasoning": "Strong genre and theme match"}}

Input: Query="dystopian rebellion", Subjects=["Science Fiction", "Dystopia", "Political"]
Output: {{"categories": ["Dystopian", "Rebellion", "Sci-Fi"], "relevance_score": 0.90, "reasoning": "Exact dystopian match with political rebellion theme"}}

Input: Query="contemporary realistic", Subjects=["Fiction", "Family", "Relationships"]
Output: {{"categories": ["Contemporary", "Family", "Realistic"], "relevance_score": 0.75, "reasoning": "Realistic fiction with family focus"}}

Now map the provided subjects."""
    
    def _hardcoded_map(
        self,
        subjects: List[str]
    ) -> Tuple[List[str], float]:
        """
        Fallback to hardcoded keyword matching.
        
        Args:
            subjects: Raw subject tags
            
        Returns:
            Tuple of (categories, relevance_score)
        """
        subjects_lower = [s.lower().strip() for s in subjects]
        
        matched_categories = set()
        match_count = 0.0
        
        # Try to match each subject to keywords
        for category, keywords in self.fallback_mappings.items():
            for subject in subjects_lower:
                for keyword in keywords:
                    if keyword in subject or subject in keyword:
                        matched_categories.add(category.replace('-', ' ').title())
                        match_count += 1.0
                        break  # Move to next subject
        
        # Calculate relevance score
        if matched_categories:
            # Score = matches / total subjects, capped at 1.0
            relevance = min(match_count / len(subjects_lower), 1.0)
        else:
            # No matches - use raw subjects as-is
            matched_categories = set(subjects[:3])
            relevance = 0.0
        
        return (list(matched_categories), relevance)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current mapping metrics."""
        return self.metrics.get_summary()
    
    def clear_cache(self):
        """Clear mapping cache."""
        self.cache.clear()
        logger.info("[MAPPER] Cache cleared")


# ============================================
# TESTING UTILITIES
# ============================================

def test_subject_mapper():
    """Test subject mapper with sample data."""
    print("\n" + "="*70)
    print("HYBRID SUBJECT MAPPER TEST")
    print("="*70)
    
    mapper = SubjectMapper()
    
    test_cases = [
        {
            'subjects': ['Fantasy', 'Magic', 'Young Adult', 'Wizards', 'Coming of Age'],
            'query': 'fantasy young adult magic',
            'expected': ['Fantasy', 'Magic', 'Coming Of Age']
        },
        {
            'subjects': ['Science Fiction', 'Dystopia', 'Rebellion', 'Young Adult'],
            'query': 'dystopian rebellion young adult',
            'expected': ['Dystopian', 'Sci Fi', 'Rebellion']
        },
        {
            'subjects': ['Mystery', 'Detective', 'Crime', 'Thriller'],
            'query': 'mystery detective thriller',
            'expected': ['Mystery', 'Thriller']
        },
        {
            'subjects': ['Contemporary Fiction', 'Family', 'Relationships', 'Realistic'],
            'query': 'contemporary realistic family',
            'expected': ['Contemporary', 'Family', 'Realistic']
        }
    ]
    
    print(f"\nDynamic Mapping: {'ENABLED' if mapper.enable_dynamic else 'DISABLED'}")
    print(f"Cache Size: {MAPPING_CACHE_SIZE}")
    print(f"\nRunning {len(test_cases)} test cases...\n")
    
    for i, test in enumerate(test_cases, 1):
        print(f"Test {i}: {test['query']}")
        print(f"  Subjects: {', '.join(test['subjects'])}")
        
        # Test dynamic
        categories, relevance, method = mapper.map_subjects(
            test['subjects'],
            query_context=test['query']
        )
        
        print(f"  Result: {', '.join(categories)}")
        print(f"  Relevance: {relevance:.2f}")
        print(f"  Method: {method}")
        
        # Test fallback
        fallback_cats, fallback_rel, fallback_method = mapper.map_subjects(
            test['subjects'],
            force_fallback=True
        )
        
        print(f"  Fallback: {', '.join(fallback_cats)} (score: {fallback_rel:.2f})")
        
        # Calculate match quality
        expected_set = set([e.lower() for e in test['expected']])
        result_set = set([c.lower() for c in categories])
        
        overlap = len(expected_set & result_set)
        match_pct = (overlap / len(expected_set)) * 100 if expected_set else 0
        
        print(f"  Match: {overlap}/{len(expected_set)} ({match_pct:.0f}%)")
        print()
    
    # Show metrics
    metrics = mapper.get_metrics()
    print("\n" + "="*70)
    print("METRICS SUMMARY")
    print("="*70)
    for key, value in metrics.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.3f}")
        else:
            print(f"  {key}: {value}")

if __name__ == "__main__":
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    
    test_subject_mapper()