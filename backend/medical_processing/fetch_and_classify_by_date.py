#!/usr/bin/env python3
"""
Script to fetch articles from a specified date range using PubMed client and classify them using the classifier.
Stores all data in the database.
"""

import logging
import sys
import os
import argparse
from datetime import datetime, timedelta
from typing import List, Dict

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from medical_processing.data_collection.pubmed_client import PubMedClient
from medical_processing.classification.classifier import classify_articles_batch
from medical_processing.database.operations import batch_insert_articles
from medical_processing.database.schema import create_database, migrate_database
from config import JOURNALS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('fetch_and_classify_by_date.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def collect_articles_by_date_range(start_date: str, end_date: str, email: str = None) -> Dict[str, any]:
    """Collect articles from a specific date range."""
    client = PubMedClient(email=email)
    
    # Get journal names from config
    journal_names = list(JOURNALS.values())
    
    # Search for articles in the specified date range
    pmids = client.search_articles_custom_date(journal_names, start_date, end_date)
    
    if not pmids:
        logger.warning(f"No articles found for date range {start_date} to {end_date}")
        return {
            'articles': [],
            'filtering_stats': client.get_filtering_stats()
        }
    
    # Fetch article details
    articles = client.fetch_article_details(pmids)
    
    # Get filtering statistics
    filtering_stats = client.get_filtering_stats()
    
    logger.info(f"Successfully collected {len(articles)} articles for date range {start_date} to {end_date}")
    if filtering_stats['ahead_of_print_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['ahead_of_print_filtered']} ahead-of-print articles")
    if filtering_stats['title_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['title_filtered']} articles with filtered terms in title")
    if filtering_stats['vaccine_dose_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['vaccine_dose_filtered']} articles with vaccine + dose/dosing in title")
    
    return {
        'articles': articles,
        'filtering_stats': filtering_stats
    }

def main():
    """Main function to fetch and classify articles from a specified date range."""
    parser = argparse.ArgumentParser(description='Fetch and classify medical articles from a specified date range')
    parser.add_argument('start_date', help='Start date in YYYY/MM/DD format (e.g., 2025/01/01)')
    parser.add_argument('end_date', help='End date in YYYY/MM/DD format (e.g., 2025/01/07)')
    parser.add_argument('--email', help='Email address for PubMed API (optional but recommended)')
    parser.add_argument('--model', choices=['claude', 'gemini'], default='claude', 
                       help='AI model to use for classification (default: claude)')
    
    args = parser.parse_args()
    
    # Validate date format
    try:
        datetime.strptime(args.start_date, '%Y/%m/%d')
        datetime.strptime(args.end_date, '%Y/%m/%d')
    except ValueError:
        logger.error("ERROR: Invalid date format. Please use YYYY/MM/DD format (e.g., 2025/01/01)")
        return
    
    # Validate date range
    start_dt = datetime.strptime(args.start_date, '%Y/%m/%d')
    end_dt = datetime.strptime(args.end_date, '%Y/%m/%d')
    
    if start_dt > end_dt:
        logger.error("ERROR: Start date must be before or equal to end date")
        return
    
    if (end_dt - start_dt).days > 365:
        logger.warning("WARNING: Date range is longer than 1 year. This may take a while and could hit API limits.")
    
    logger.info("="*60)
    logger.info("STARTING ARTICLE FETCH AND CLASSIFICATION BY DATE RANGE")
    logger.info("="*60)
    logger.info(f"Date Range: {args.start_date} to {args.end_date}")
    logger.info(f"AI Model: {args.model.upper()}")
    logger.info("="*60)
    
    # Initialize database
    logger.info("Initializing database...")
    create_database()
    migrate_database()
    logger.info("SUCCESS: Database initialized successfully")
    
    # Step 1: Fetch articles from specified date range
    logger.info("\n" + "="*40)
    logger.info("STEP 1: FETCHING ARTICLES FROM DATE RANGE")
    logger.info("="*40)
    
    try:
        # Collect articles from the specified date range
        result = collect_articles_by_date_range(args.start_date, args.end_date, args.email)
        articles = result['articles']
        filtering_stats = result['filtering_stats']
        
        logger.info(f"Collection Results:")
        logger.info(f"   - Articles collected: {len(articles)}")
        logger.info(f"   - Ahead of print filtered: {filtering_stats['ahead_of_print_filtered']}")
        logger.info(f"   - Non-research filtered: {filtering_stats['non_research_filtered']}")
        logger.info(f"   - No abstract filtered: {filtering_stats['no_abstract_filtered']}")
        logger.info(f"   - Title terms filtered: {filtering_stats['title_filtered']}")
        logger.info(f"   - Vaccine + dose/dosing filtered: {filtering_stats['vaccine_dose_filtered']}")
        
        if not articles:
            logger.warning("WARNING: No articles found for the specified date range. Exiting.")
            return
            
    except Exception as e:
        logger.error(f"ERROR: Error fetching articles: {e}")
        return
    
    # Step 2: Classify articles
    logger.info("\n" + "="*40)
    logger.info("STEP 2: CLASSIFYING ARTICLES")
    logger.info("="*40)
    
    try:
        # Use specified AI model for classification
        model_name = "Claude Sonnet 4.5" if args.model == "claude" else "Gemini 2.5 Pro"
        logger.info(f"Starting classification with {model_name}...")
        classified_articles = classify_articles_batch(articles, model_provider=args.model)
        
        # Analyze classification results
        relevant_count = sum(1 for article in classified_articles if article.get('is_relevant', False))
        irrelevant_count = len(classified_articles) - relevant_count
        
        logger.info(f"Classification Results:")
        logger.info(f"   - Total articles processed: {len(classified_articles)}")
        logger.info(f"   - Relevant articles: {relevant_count}")
        logger.info(f"   - Irrelevant articles: {irrelevant_count}")
        
        # Show breakdown by medical category for relevant articles
        relevant_articles = [a for a in classified_articles if a.get('is_relevant', False)]
        if relevant_articles:
            category_counts = {}
            for article in relevant_articles:
                category = article.get('medical_category', 'Unknown')
                category_counts[category] = category_counts.get(category, 0) + 1
            
            logger.info(f"Relevant articles by category:")
            for category, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
                logger.info(f"   - {category}: {count}")
        
        # Show rejection reasons for irrelevant articles
        irrelevant_articles = [a for a in classified_articles if not a.get('is_relevant', False)]
        if irrelevant_articles:
            reasons = {}
            for article in irrelevant_articles:
                reason = article.get('reason', 'Unknown')
                reasons[reason] = reasons.get(reason, 0) + 1
            
            logger.info(f"Rejection reasons:")
            for reason, count in sorted(reasons.items(), key=lambda x: x[1], reverse=True):
                logger.info(f"   - {reason}: {count}")
        
    except Exception as e:
        logger.error(f"ERROR: Error classifying articles: {e}")
        return
    
    # Step 3: Store in database
    logger.info("\n" + "="*40)
    logger.info("STEP 3: STORING IN DATABASE")
    logger.info("="*40)
    
    try:
        logger.info("Storing articles and classifications in database...")
        inserted_count = batch_insert_articles(classified_articles)
        
        logger.info(f"SUCCESS: Successfully stored {inserted_count} out of {len(classified_articles)} articles")
        
        if inserted_count < len(classified_articles):
            logger.warning(f"WARNING: {len(classified_articles) - inserted_count} articles were not stored (likely duplicates)")
        
    except Exception as e:
        logger.error(f"ERROR: Error storing articles in database: {e}")
        return
    
    # Final summary
    logger.info("\n" + "="*60)
    logger.info("DATE RANGE FETCH AND CLASSIFICATION COMPLETED")
    logger.info("="*60)
    logger.info(f"Final Summary:")
    logger.info(f"   - Date range: {args.start_date} to {args.end_date}")
    logger.info(f"   - Articles fetched: {len(articles)}")
    logger.info(f"   - Articles classified: {len(classified_articles)}")
    logger.info(f"   - Articles stored: {inserted_count}")
    logger.info(f"   - Relevant articles: {relevant_count}")
    logger.info(f"   - Irrelevant articles: {irrelevant_count}")
    logger.info(f"   - AI model used: {model_name}")
    logger.info(f"   - Processing completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Show some examples of relevant articles
    if relevant_articles:
        logger.info(f"\nSample relevant articles:")
        for i, article in enumerate(relevant_articles[:3]):  # Show first 3
            logger.info(f"   {i+1}. {article.get('title', 'No title')[:80]}...")
            logger.info(f"      Category: {article.get('medical_category', 'Unknown')}")
            logger.info(f"      Score: {article.get('ranking_score', 0)}/13")
            logger.info(f"      Journal: {article.get('journal', 'Unknown')}")

if __name__ == "__main__":
    main()
