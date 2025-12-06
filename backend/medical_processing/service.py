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
            from datetime import datetime
            start_time = datetime.now()
            
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
                    'articles_stored': 0,
                    'processing_time_seconds': 0
                }
            
            # Step 2: Classify articles
            classification_result = self.classify_articles(articles, model_provider)
            if not classification_result['success']:
                return classification_result
            
            classified_articles = classification_result['classified_articles']
            
            # Calculate statistics from classified articles
            stats = self._calculate_article_statistics(classified_articles)
            
            # Step 3: Store articles
            storage_result = self.store_articles(classified_articles)
            if not storage_result['success']:
                return storage_result
            
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()
            
            logger.info("✅ Date range article processing completed successfully")
            
            return {
                'success': True,
                'articles_collected': len(articles),
                'articles_classified': len(classified_articles),
                'articles_stored': storage_result['stored_count'],
                'filtering_stats': collection_result['filtering_stats'],
                'processing_time_seconds': processing_time,
                'statistics': stats
            }
            
        except Exception as e:
            logger.error(f"Error in date range processing workflow: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def process_articles_from_last_update(self, email: str = None, model_provider: str = "claude") -> Dict:
        """Process articles from the last created_at timestamp to today."""
        try:
            from datetime import datetime, timedelta
            from .database.operations import ArticleDatabase
            from .database.schema import get_connection
            
            logger.info("Starting article processing from last update (created_at)")
            
            # Get the latest created_at timestamp from the database
            with ArticleDatabase() as db:
                latest_created_at_str = db.get_latest_created_at()
            
            if not latest_created_at_str:
                # If no articles exist, fetch from the last 7 days
                logger.info("No existing articles found. Fetching from last 7 days.")
                end_date = datetime.now()
                start_date = end_date - timedelta(days=7)
                start_date_str = start_date.strftime('%Y/%m/%d')
                end_date_str = end_date.strftime('%Y/%m/%d')
            else:
                # Parse the latest created_at timestamp
                try:
                    # Handle different timestamp formats
                    # SQLite timestamps can be in format: 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS'
                    latest_created_at_str = latest_created_at_str.replace('T', ' ')
                    
                    # Try parsing with microseconds
                    try:
                        latest_timestamp = datetime.strptime(latest_created_at_str, '%Y-%m-%d %H:%M:%S.%f')
                    except ValueError:
                        # Try without microseconds
                        try:
                            latest_timestamp = datetime.strptime(latest_created_at_str, '%Y-%m-%d %H:%M:%S')
                        except ValueError:
                            # Try just date format
                            latest_timestamp = datetime.strptime(latest_created_at_str.split()[0], '%Y-%m-%d')
                    
                    # Extract the date from the timestamp and add one day to avoid duplicates
                    latest_date = latest_timestamp.date()
                    start_date = datetime.combine(latest_date, datetime.min.time()) + timedelta(days=1)
                    end_date = datetime.now()
                    
                    # Format dates for the API (publication date range)
                    start_date_str = start_date.strftime('%Y/%m/%d')
                    end_date_str = end_date.strftime('%Y/%m/%d')
                    
                    logger.info(f"Last created_at: {latest_created_at_str}, fetching articles from {start_date_str} to {end_date_str}")
                except (ValueError, AttributeError) as e:
                    logger.error(f"Error parsing created_at timestamp {latest_created_at_str}: {e}")
                    # Fallback to last 7 days
                    end_date = datetime.now()
                    start_date = end_date - timedelta(days=7)
                    start_date_str = start_date.strftime('%Y/%m/%d')
                    end_date_str = end_date.strftime('%Y/%m/%d')
                    logger.info(f"Falling back to last 7 days: {start_date_str} to {end_date_str}")
            
            # Use the existing date range processing method
            result = self.process_articles_by_date_range(start_date_str, end_date_str, email, model_provider)
            
            # Add date range to result for email notifications
            result['start_date'] = start_date_str
            result['end_date'] = end_date_str
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing articles from last update: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def process_single_article(self, pmid_or_url: str, email: str = None, model_provider: str = "claude") -> Dict:
        """Process a single article by PMID or URL."""
        try:
            # Extract PMID
            pmid = pmid_or_url.strip()
            if "pubmed.ncbi.nlm.nih.gov" in pmid:
                 # Simple extraction: split by / and find the number
                 # e.g. https://pubmed.ncbi.nlm.nih.gov/12345678/ or https://pubmed.ncbi.nlm.nih.gov/12345678
                 parts = pmid.split('/')
                 for part in parts:
                     if part.isdigit():
                         pmid = part
                         break
            
            if not pmid.isdigit():
                 return {'success': False, 'error': 'Invalid PubMed ID or URL'}

            # Fetch details
            client = PubMedClient(email=email)
            articles = client.fetch_article_details([pmid])
            
            if not articles:
                return {'success': False, 'error': 'Article not found on PubMed'}
            
            article = articles[0]
            
            # Classify (force relevant)
            # Initialize classifier if needed
            from .classification.classifier import MedicalArticleClassifier
            if not self.classifier or self.classifier.model_provider != model_provider:
                self.classifier = MedicalArticleClassifier(model_provider=model_provider)
            
            # Use force_relevant=True to skip filtering
            result = self.classifier.classify_article_enhanced(article, force_relevant=True)
            
            article.update(result)
            
            # Store
            storage_result = self.store_articles([article])
            
            if not storage_result['success']:
                return storage_result
            
            return {
                'success': True,
                'article': article
            }
            
        except Exception as e:
            logger.error(f"Error processing single article: {e}")
            return {'success': False, 'error': str(e)}

    def _calculate_article_statistics(self, classified_articles: List[Dict]) -> Dict:
        """Calculate statistics from classified articles."""
        if not classified_articles:
            return {
                'avg_ranking_score': 0,
                'articles_score_8_plus': 0,
                'category_breakdown': {},
                'top_articles': []
            }
        
        # Calculate average ranking score and count high-scoring articles
        scores = []
        articles_score_8_plus = 0
        category_breakdown = {}
        
        for article in classified_articles:
            ranking_score = article.get('ranking_score', 0)
            if ranking_score is not None and ranking_score > 0:
                scores.append(float(ranking_score))
                if ranking_score >= 8:
                    articles_score_8_plus += 1
            
            # Category breakdown
            category = article.get('medical_category', 'Uncategorized')
            category_breakdown[category] = category_breakdown.get(category, 0) + 1
        
        avg_score = sum(scores) / len(scores) if scores else 0
        
        # Get top 5 articles by ranking score (only articles with score > 0)
        top_articles = sorted(
            [a for a in classified_articles if a.get('ranking_score') is not None and a.get('ranking_score', 0) > 0],
            key=lambda x: x.get('ranking_score', 0),
            reverse=True
        )[:5]
        
        # Format top articles for email (title and score only)
        top_articles_formatted = [
            {
                'title': article.get('title', 'Untitled')[:80] + ('...' if len(article.get('title', '')) > 80 else ''),
                'score': article.get('ranking_score', 0),
                'journal': article.get('journal', 'Unknown')
            }
            for article in top_articles
        ]
        
        return {
            'avg_ranking_score': round(avg_score, 2),
            'articles_score_8_plus': articles_score_8_plus,
            'category_breakdown': category_breakdown,
            'top_articles': top_articles_formatted
        }

# Global service instance
medical_articles_service = MedicalArticlesService()
