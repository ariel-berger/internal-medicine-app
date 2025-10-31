"""
Medical Articles Processing Module

This module provides functionality for:
- Collecting articles from PubMed
- AI-powered classification using Claude/Gemini
- Database operations for medical articles
- Weekly automated processing
"""

from .data_collection.pubmed_client import PubMedClient
from .classification.classifier import MedicalArticleClassifier, classify_articles_batch
from .database.operations import batch_insert_articles, get_connection
from .database.schema import create_database, migrate_database
from .config import JOURNALS, MEDICAL_CATEGORIES, ARTICLE_TYPES

__all__ = [
    'PubMedClient',
    'MedicalArticleClassifier', 
    'classify_articles_batch',
    'batch_insert_articles',
    'get_connection',
    'create_database',
    'migrate_database',
    'JOURNALS',
    'MEDICAL_CATEGORIES', 
    'ARTICLE_TYPES'
]
