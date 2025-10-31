#!/usr/bin/env python3
"""Reclassify and re-score relevant articles with complete abstracts using Claude Sonnet 4.5."""

import sys
import os
import sqlite3
import time
import logging

# Add the medical_processing module to path
sys.path.insert(0, os.path.dirname(__file__))

from medical_processing.classification.classifier import MedicalArticleClassifier
from medical_processing.database.operations import ArticleDatabase, get_connection
from medical_processing.config import DATABASE_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_relevant_articles_with_data():
    """Get all relevant articles with their full data."""
    db_path = os.path.join(os.path.dirname(__file__), 'medical_articles.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Get all relevant articles with their article data
        query = """
            SELECT 
                a.id,
                a.pmid,
                a.title,
                a.abstract,
                a.journal,
                a.authors,
                a.publication_date,
                a.doi,
                a.url,
                a.medical_category,
                a.article_type,
                a.keywords,
                a.mesh_terms,
                a.publication_type,
                ec.ranking_score as current_ranking_score,
                ec.clinical_bottom_line as current_clinical_bottom_line
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1
            ORDER BY a.id
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        articles = []
        for row in rows:
            article = {
                'id': row[0],
                'pmid': row[1],
                'title': row[2],
                'abstract': row[3] or '',
                'journal': row[4] or '',
                'authors': row[5] or '',
                'publication_date': row[6],
                'doi': row[7] or '',
                'url': row[8] or '',
                'medical_category': row[9],
                'article_type': row[10] or '',
                'keywords': row[11] or '',
                'mesh_terms': row[12] or '',
                'publication_type': row[13] or '',
                'current_ranking_score': row[14],
                'current_clinical_bottom_line': row[15]
            }
            articles.append(article)
        
        return articles
        
    finally:
        conn.close()

def reclassify_articles(articles, model_provider="claude"):
    """Reclassify articles using Claude Sonnet 4.5."""
    classifier = MedicalArticleClassifier(model_provider=model_provider)
    
    reclassified = []
    errors = []
    
    for i, article in enumerate(articles):
        try:
            logger.info(f"Reclassifying article {i+1}/{len(articles)}: PMID {article['pmid']}")
            logger.info(f"  Title: {article['title'][:80]}...")
            logger.info(f"  Current ranking score: {article.get('current_ranking_score', 'N/A')}")
            logger.info(f"  Abstract length: {len(article['abstract'])} characters")
            
            # Prepare article data for classification
            article_data = {
                'pmid': article['pmid'],
                'title': article['title'],
                'abstract': article['abstract'],
                'journal': article['journal'],
                'mesh_terms': article['mesh_terms'],
                'publication_type': article['publication_type']
            }
            
            # Classify using inclusion-based method (same as regular classification)
            result = classifier.classify_article_enhanced_inclusion_based(article_data)
            
            # Add article ID for database update
            result['article_id'] = article['id']
            result['pmid'] = article['pmid']
            
            # Log changes
            old_score = article.get('current_ranking_score', 'N/A')
            new_score = result.get('ranking_score', 'N/A')
            logger.info(f"  ✅ Reclassified - Old score: {old_score}, New score: {new_score}")
            
            reclassified.append(result)
            
            # Rate limiting - be respectful to Claude API
            # Two API calls per article (filtering + classification)
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"  ❌ Error reclassifying PMID {article['pmid']}: {e}")
            errors.append({
                'pmid': article.get('pmid', 'unknown'),
                'error': str(e)
            })
    
    return reclassified, errors

def verify_update(db_conn, article_id, expected_score):
    """Verify that an update was actually saved to the database."""
    try:
        # Need to commit any pending changes first
        db_conn.commit()
        
        cursor = db_conn.cursor()
        cursor.execute('''
            SELECT ranking_score 
            FROM enhanced_classifications 
            WHERE article_id = ?
        ''', (article_id,))
        result = cursor.fetchone()
        if result:
            actual_score = result[0]
            # Check if score matches
            if actual_score == expected_score:
                return True, actual_score
            else:
                return False, f"Score mismatch: expected {expected_score}, got {actual_score}"
        else:
            return False, "No classification found"
    except Exception as e:
        return False, f"Verification error: {e}"

def update_classifications(reclassified_articles):
    """Update database with new classifications and verify each update."""
    updated_count = 0
    failed_count = 0
    failed_articles = []
    
    db_path = os.path.join(os.path.dirname(__file__), 'medical_articles.db')
    conn = sqlite3.connect(db_path)
    
    try:
        for i, result in enumerate(reclassified_articles):
            article_id = result['article_id']
            pmid = result.get('pmid', 'unknown')
            expected_score = result.get('ranking_score', 0)
            
            try:
                # Prepare classification data
                classification_data = {
                    'participants': result.get('participants'),
                    'medical_category': result.get('medical_category'),
                    'clinical_bottom_line': result.get('clinical_bottom_line'),
                    'tags': result.get('tags'),
                    'ranking_score': expected_score,
                    'ranking_breakdown': result.get('ranking_breakdown', {}),
                    'is_relevant': result.get('is_relevant', True),
                    'reason': result.get('reason')
                }
                
                # Extract individual points from ranking_breakdown
                breakdown = classification_data.get('ranking_breakdown', {})
                classification_data['focus_points'] = breakdown.get('focus_points', 0)
                classification_data['type_points'] = breakdown.get('type_points', 0)
                classification_data['prevalence_points'] = breakdown.get('prevalence_points', 0)
                classification_data['hospitalization_points'] = breakdown.get('hospitalization_points', 0)
                classification_data['clinical_outcome_points'] = breakdown.get('clinical_outcome_points', 0)
                classification_data['impact_factor_points'] = breakdown.get('impact_factor_points', 0)
                classification_data['temporality_points'] = breakdown.get('temporality_points', 0)
                classification_data['prevention_penalty_points'] = breakdown.get('prevention_penalty_points', 0)
                classification_data['biologic_penalty_points'] = breakdown.get('biologic_penalty_points', 0)
                classification_data['screening_penalty_points'] = breakdown.get('screening_penalty_points', 0)
                classification_data['scores_penalty_points'] = breakdown.get('scores_penalty_points', 0)
                classification_data['subanalysis_penalty_points'] = breakdown.get('subanalysis_penalty_points', 0)
                
                # Use ArticleDatabase context manager for proper transaction handling
                with ArticleDatabase() as db:
                    # Update the classification
                    success = db.update_enhanced_classification(article_id, classification_data)
                    
                    if success:
                        updated_count += 1
                        logger.info(f"  ✅ [{i+1}/{len(reclassified_articles)}] Updated article ID {article_id} (PMID {pmid}) - Score: {expected_score}")
                    else:
                        failed_count += 1
                        failed_articles.append({'pmid': pmid, 'id': article_id, 'error': 'Database update returned False'})
                        logger.error(f"  ❌ [{i+1}/{len(reclassified_articles)}] Failed to update article ID {article_id} (PMID {pmid})")
                
                # Verify the update after the context manager commits
                is_valid, verification_result = verify_update(conn, article_id, expected_score)
                if not is_valid:
                    # If verification fails but update said success, log warning but don't double-count
                    logger.warning(f"  ⚠️  Verification issue for article ID {article_id} (PMID {pmid}): {verification_result}")
                
            except Exception as e:
                failed_count += 1
                failed_articles.append({'pmid': pmid, 'id': article_id, 'error': str(e)})
                logger.error(f"  ❌ [{i+1}/{len(reclassified_articles)}] Exception updating article ID {article_id} (PMID {pmid}): {e}")
                conn.rollback()
        
    finally:
        conn.close()
    
    return updated_count, failed_count, failed_articles

def main():
    """Main function to reclassify relevant articles."""
    print("=" * 70)
    print("RECLASSIFYING RELEVANT ARTICLES WITH CLAUDE SONNET 4.5")
    print("=" * 70)
    print()
    
    # Get relevant articles
    print("Fetching relevant articles from database...")
    articles = get_relevant_articles_with_data()
    print(f"Found {len(articles)} relevant articles to reclassify")
    print()
    
    if len(articles) == 0:
        print("No relevant articles found. Nothing to reclassify.")
        return
    
    # Show summary
    print("Summary:")
    print(f"  Total articles: {len(articles)}")
    avg_abstract_len = sum(len(a.get('abstract', '')) for a in articles) / len(articles)
    print(f"  Average abstract length: {avg_abstract_len:.0f} characters")
    print()
    
    # Confirm
    confirm = input(f"Reclassify {len(articles)} articles using Claude Sonnet 4.5? This will make {len(articles) * 2} API calls. (yes/no): ")
    if confirm.lower() != "yes":
        print("Cancelled.")
        return
    
    print()
    print("Starting reclassification...")
    print("=" * 70)
    
    # Reclassify
    reclassified, errors = reclassify_articles(articles, model_provider="claude")
    
    print()
    print("=" * 70)
    print("RECLASSIFICATION COMPLETE")
    print("=" * 70)
    print(f"Successfully reclassified: {len(reclassified)} articles")
    print(f"Errors: {len(errors)} articles")
    
    if errors:
        print("\nErrors encountered:")
        for error in errors:
            print(f"  - PMID {error['pmid']}: {error['error']}")
    
    if reclassified:
        print()
        print("Updating database...")
        print("=" * 70)
        updated_count, failed_count, failed_articles = update_classifications(reclassified)
        print()
        print("=" * 70)
        print(f"✅ Successfully updated {updated_count} articles in database")
        if failed_count > 0:
            print(f"❌ Failed to update {failed_count} articles")
            for failed in failed_articles:
                print(f"   - PMID {failed['pmid']} (ID {failed['id']}): {failed['error']}")
        
        # Show summary of score changes
        print()
        print("=" * 70)
        print("SCORE CHANGES SUMMARY")
        print("=" * 70)
        
        # Get old scores from articles and compare
        score_changes = []
        for i, result in enumerate(reclassified):
            old_score = articles[i].get('current_ranking_score')
            new_score = result.get('ranking_score', 0)
            if old_score is not None:
                change = new_score - old_score
                score_changes.append({
                    'pmid': result['pmid'],
                    'old': old_score,
                    'new': new_score,
                    'change': change
                })
        
        if score_changes:
            avg_change = sum(c['change'] for c in score_changes) / len(score_changes)
            increased = sum(1 for c in score_changes if c['change'] > 0)
            decreased = sum(1 for c in score_changes if c['change'] < 0)
            unchanged = sum(1 for c in score_changes if c['change'] == 0)
            
            print(f"Articles with score changes: {len(score_changes)}")
            print(f"  Average change: {avg_change:+.1f} points")
            print(f"  Increased: {increased}")
            print(f"  Decreased: {decreased}")
            print(f"  Unchanged: {unchanged}")
            
            # Show top 5 increases and decreases
            sorted_changes = sorted(score_changes, key=lambda x: x['change'], reverse=True)
            print("\nTop 5 score increases:")
            for change in sorted_changes[:5]:
                print(f"  PMID {change['pmid']}: {change['old']} → {change['new']} ({change['change']:+.1f})")
            
            if decreased > 0:
                print("\nTop 5 score decreases:")
                for change in sorted_changes[-5:]:
                    print(f"  PMID {change['pmid']}: {change['old']} → {change['new']} ({change['change']:+.1f})")

if __name__ == "__main__":
    main()

