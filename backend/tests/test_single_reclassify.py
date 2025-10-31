#!/usr/bin/env python3
"""Test reclassifying a single article to verify database updates work."""

import sys
import os
import sqlite3
import time

sys.path.insert(0, os.path.dirname(__file__))

from medical_processing.classification.classifier import MedicalArticleClassifier
from medical_processing.database.operations import ArticleDatabase

def test_single_reclassify():
    """Test reclassifying one article."""
    db_path = os.path.join(os.path.dirname(__file__), 'medical_articles.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get one relevant article
    cursor.execute('''
        SELECT 
            a.id,
            a.pmid,
            a.title,
            a.abstract,
            a.journal,
            a.mesh_terms,
            a.publication_type,
            ec.ranking_score as current_score
        FROM articles a
        JOIN enhanced_classifications ec ON a.id = ec.article_id
        WHERE ec.is_relevant = 1
        LIMIT 1
    ''')
    
    row = cursor.fetchone()
    if not row:
        print("No relevant articles found")
        return
    
    article_id, pmid, title, abstract, journal, mesh_terms, pub_type, current_score = row
    conn.close()
    
    print("=" * 70)
    print("TESTING SINGLE ARTICLE RECLASSIFICATION")
    print("=" * 70)
    print(f"PMID: {pmid}")
    print(f"Title: {title[:60]}...")
    print(f"Current score: {current_score}")
    print(f"Abstract length: {len(abstract)} characters")
    print()
    
    # Prepare article data
    article_data = {
        'pmid': pmid,
        'title': title,
        'abstract': abstract or '',
        'journal': journal or '',
        'mesh_terms': mesh_terms or '',
        'publication_type': pub_type or ''
    }
    
    # Reclassify
    print("Reclassifying with Claude Sonnet 4.5...")
    classifier = MedicalArticleClassifier(model_provider="claude")
    result = classifier.classify_article_enhanced_inclusion_based(article_data)
    
    new_score = result.get('ranking_score', 0)
    print(f"✅ Reclassified - Old score: {current_score}, New score: {new_score}")
    print()
    
    # Update database
    print("Updating database...")
    classification_data = {
        'participants': result.get('participants'),
        'medical_category': result.get('medical_category'),
        'clinical_bottom_line': result.get('clinical_bottom_line'),
        'tags': result.get('tags'),
        'ranking_score': new_score,
        'ranking_breakdown': result.get('ranking_breakdown', {}),
        'is_relevant': result.get('is_relevant', True),
        'reason': result.get('reason')
    }
    
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
    
    try:
        with ArticleDatabase() as db:
            success = db.update_enhanced_classification(article_id, classification_data)
            if success:
                print(f"✅ Database update returned: {success}")
            else:
                print(f"❌ Database update returned: {success}")
                return
    except Exception as e:
        print(f"❌ Exception during update: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Verify update
    print()
    print("Verifying update...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT ranking_score, updated_at, clinical_bottom_line
        FROM enhanced_classifications
        WHERE article_id = ?
    ''', (article_id,))
    
    row = cursor.fetchone()
    if row:
        db_score, updated_at, bottom_line = row
        print(f"Database score: {db_score}")
        print(f"Updated timestamp: {updated_at}")
        print(f"Clinical bottom line: {bottom_line[:80] if bottom_line else 'None'}...")
        
        if db_score == new_score:
            print()
            print("=" * 70)
            print("✅ SUCCESS: Article was updated correctly!")
            print("=" * 70)
            print(f"Score changed from {current_score} to {new_score}")
            print(f"Update timestamp: {updated_at}")
        else:
            print()
            print("=" * 70)
            print("❌ FAILED: Score mismatch!")
            print("=" * 70)
            print(f"Expected: {new_score}, Got: {db_score}")
    else:
        print("❌ No classification found in database")
    
    conn.close()

if __name__ == "__main__":
    test_single_reclassify()

