"""
Book Recommendations Package
Initializes all recommendation system components.
"""

from .theme_extractor import ThemeExtractor
from .book_sources import BookSourceManager
from .ranker import BookRanker

__all__ = ['ThemeExtractor', 'BookSourceManager', 'BookRanker']