"""
Medical Articles Processing Service

This service provides high-level functions for processing medical articles
that can be called from the Flask backend endpoints.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .data_collection.pubmed_client import PubMedClient
# Lazy import classification to avoid hard dependency at startup on optional AI SDKs
from .database.operations import batch_insert_articles
from .database.schema import (
    create_database, 
    migrate_database, 
    add_hidden_from_dashboard_column,
    add_new_penalty_scoring_columns,
    add_temporality_points_column,
    migrate_penalty_scoring_columns
)
from .config import JOURNALS

logger = logging.getLogger(__name__)

class MedicalArticlesService:
    """Service class for medical articles processing operations."""
    
    def __init__(self):
        """Initialize the service."""
        self.pubmed_client = PubMedClient()
        self.classifier = None  # Will be initialized when needed
        
    def initialize_database(self):
        """Initialize and migrate the database."""
        try:
            create_database()
            migrate_database()
            add_new_penalty_scoring_columns()  # Adds metabolic_penalty_points and other columns
            add_temporality_points_column()
            migrate_penalty_scoring_columns()
            add_hidden_from_dashboard_column()
            logger.info("✅ Database initialized and migrated successfully")
            return True
        except Exception as e:
            logger.error(f"❌ Error initializing database: {e}")
            return False
    
    def collect_articles_by_date_range(self, start_date: str, end_date: str, email: str = None) -> Dict:
        """Collect articles from a specific date range."""
        try:
            client = PubMedClient(email=email)
            journal_names = list(JOURNALS.values())
            
            # Search for articles in the specified date range
            pmids = client.search_articles_custom_date(journal_names, start_date, end_date)
            
            if not pmids:
                logger.warning(f"No articles found for date range {start_date} to {end_date}")
                return {
                    'articles': [],
                    'filtering_stats': client.get_filtering_stats(),
                    'success': True
                }
            
            # Fetch article details
            articles = client.fetch_article_details(pmids)
            filtering_stats = client.get_filtering_stats()
            
            logger.info(f"Successfully collected {len(articles)} articles for date range {start_date} to {end_date}")
            
            return {
                'articles': articles,
                'filtering_stats': filtering_stats,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Error collecting articles: {e}")
            return {
                'articles': [],
                'filtering_stats': {},
                'success': False,
                'error': str(e)
            }
    
    def collect_weekly_articles(self, email: str = None) -> Dict:
        """Collect articles from the last 7 days."""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        start_date_str = start_date.strftime('%Y/%m/%d')
        end_date_str = end_date.strftime('%Y/%m/%d')
        
        logger.info(f"Collecting weekly articles from {start_date_str} to {end_date_str}")
        
        return self.collect_articles_by_date_range(start_date_str, end_date_str, email)
    
    def classify_articles(self, articles: List[Dict], model_provider: str = "claude") -> Dict:
        """Classify a batch of articles using AI."""
        try:
            if not articles:
                return {
                    'classified_articles': [],
                    'success': True,
                    'message': 'No articles to classify'
                }
            
            # Initialize classifier if needed (lazy import to avoid startup errors)
            from .classification.classifier import MedicalArticleClassifier, classify_articles_batch
            if not self.classifier or self.classifier.model_provider != model_provider:
                self.classifier = MedicalArticleClassifier(model_provider=model_provider)
            
            # Classify articles
            classified_articles = classify_articles_batch(articles, model_provider=model_provider)
            
            logger.info(f"Successfully classified {len(classified_articles)} articles")
            
            return {
                'classified_articles': classified_articles,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Error classifying articles: {e}")
            return {
                'classified_articles': [],
                'success': False,
                'error': str(e)
            }
    
    def store_articles(self, articles: List[Dict]) -> Dict:
        """Store classified articles in the database."""
        try:
            if not articles:
                return {
                    'stored_count': 0,
                    'success': True,
                    'message': 'No articles to store'
                }
            
            # Store articles in database
            stored_count = batch_insert_articles(articles)
            
            logger.info(f"Successfully stored {stored_count} articles in database")
            
            return {
                'stored_count': stored_count,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"Error storing articles: {e}")
            return {
                'stored_count': 0,
                'success': False,
                'error': str(e)
            }
    
    def process_weekly_articles(self, email: str = None, model_provider: str = "claude") -> Dict:
        """Complete weekly processing workflow: collect, classify, and store articles."""
        try:
            logger.info("Starting weekly article processing workflow")
            
            # Step 1: Collect articles
            collection_result = self.collect_weekly_articles(email)
            if not collection_result['success']:
                return collection_result
            
            articles = collection_result['articles']
            if not articles:
                return {
                    'success': True,
                    'message': 'No new articles found for the week',
                    'articles_collected': 0,
                    'articles_classified': 0,
                    'articles_stored': 0
                }
            
            # Step 2: Classify articles
            classification_result = self.classify_articles(articles, model_provider)
            if not classification_result['success']:
                return classification_result
            
            classified_articles = classification_result['classified_articles']
            
            # Step 3: Store articles
            storage_result = self.store_articles(classified_articles)
            if not storage_result['success']:
                return storage_result
            
            logger.info("✅ Weekly article processing completed successfully")
            
            return {
                'success': True,
                'articles_collected': len(articles),
                'articles_classified': len(classified_articles),
                'articles_stored': storage_result['stored_count'],
                'filtering_stats': collection_result['filtering_stats']
            }
            
        except Exception as e:
            logger.error(f"Error in weekly processing workflow: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def process_articles_by_date_range(self, start_date: str, end_date: str, 
                                     email: str = None, model_provider: str = "claude") -> Dict:
        """Complete processing workflow for a specific date range."""
        try:
            logger.info(f"Starting article processing for date range {start_date} to {end_date}")
            
            # Step 1: Collect articles
            collection_result = self.collect_articles_by_date_range(start_date, end_date, email)
            if not collection_result['success']:
                return collection_result
            
            articles = collection_result['articles']
            if not articles:
                return {
                    'success': True,
                    'message': f'No new articles found for date range {start_date} to {end_date}',
                    'articles_collected': 0,
                    'articles_classified': 0,
                    'articles_stored': 0
                }
            
            # Step 2: Classify articles
            classification_result = self.classify_articles(articles, model_provider)
            if not classification_result['success']:
                return classification_result
            
            classified_articles = classification_result['classified_articles']
            
            # Step 3: Store articles
            storage_result = self.store_articles(classified_articles)
            if not storage_result['success']:
                return storage_result
            
            logger.info("✅ Date range article processing completed successfully")
            
            return {
                'success': True,
                'articles_collected': len(articles),
                'articles_classified': len(classified_articles),
                'articles_stored': storage_result['stored_count'],
                'filtering_stats': collection_result['filtering_stats']
            }
            
        except Exception as e:
            logger.error(f"Error in date range processing workflow: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Global service instance
medical_articles_service = MedicalArticlesService()
