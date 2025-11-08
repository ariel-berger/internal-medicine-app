#!/usr/bin/env python3
"""
Export relevant articles from the last 2 weeks to CSV.
"""

import sys
import os
import sqlite3
import csv
from datetime import datetime, timedelta
import json

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

def get_database_path():
    """Get the path to the medical articles database."""
    # Try to find the database in the backend directory
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    db_path = os.path.join(backend_dir, 'medical_articles.db')
    
    if not os.path.exists(db_path):
        # Try current directory
        db_path = 'medical_articles.db'
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database file not found. Tried: {os.path.join(backend_dir, 'medical_articles.db')} and {db_path}")
    
    return db_path

def get_relevant_articles_from_last_week():
    """Get all relevant articles published in the last 14 days (2 weeks)."""
    db_path = get_database_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Calculate date range (last 14 days / 2 weeks)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=14)
        
        # Format dates for SQL query (YYYY-MM-DD)
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        print(f"📅 Fetching relevant articles from {start_date_str} to {end_date_str} (last 2 weeks)")
        
        # Query for relevant articles from the last 2 weeks
        # Join articles with enhanced_classifications to get is_relevant flag
        query = """
            SELECT 
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
                ec.ranking_score,
                ec.clinical_bottom_line,
                ec.tags,
                ec.participants,
                ec.reason,
                ec.focus_points,
                ec.type_points,
                ec.prevalence_points,
                ec.hospitalization_points,
                ec.clinical_outcome_points,
                ec.impact_factor_points,
                ec.temporality_points,
                ec.neurology_penalty_points,
                ec.prevention_penalty_points,
                ec.biologic_penalty_points,
                ec.screening_penalty_points,
                ec.scores_penalty_points,
                ec.subanalysis_penalty_points
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1
            AND a.publication_date >= ?
            AND a.publication_date <= ?
            ORDER BY ec.ranking_score DESC, a.publication_date DESC
        """
        
        cursor.execute(query, (start_date_str, end_date_str))
        rows = cursor.fetchall()
        
        # Get column names
        columns = [description[0] for description in cursor.description]
        
        # Convert rows to dictionaries
        articles = []
        for row in rows:
            article = dict(zip(columns, row))
            # Parse tags JSON if it exists
            if article.get('tags'):
                try:
                    article['tags'] = json.loads(article['tags'])
                except (json.JSONDecodeError, TypeError):
                    article['tags'] = []
            else:
                article['tags'] = []
            articles.append(article)
        
        print(f"✅ Found {len(articles)} relevant articles from the last 2 weeks")
        
        return articles, start_date_str, end_date_str
        
    except sqlite3.Error as e:
        print(f"❌ Error querying database: {e}")
        return [], None, None
    finally:
        conn.close()

def export_to_csv(articles, start_date, end_date):
    """Export articles to CSV file."""
    if not articles:
        print("⚠️  No articles to export")
        return None
    
    # Create filename with date range
    filename = f"relevant_articles_{start_date}_to_{end_date}.csv"
    
    # Flatten the data for CSV export
    # Handle tags as comma-separated string
    flattened_articles = []
    for article in articles:
        flat_article = article.copy()
        # Convert tags list to comma-separated string
        if isinstance(flat_article.get('tags'), list):
            flat_article['tags'] = ', '.join(flat_article['tags'])
        elif flat_article.get('tags') is None:
            flat_article['tags'] = ''
        
        # Ensure all fields are strings (handle None values)
        for key, value in flat_article.items():
            if value is None:
                flat_article[key] = ''
            elif not isinstance(value, str):
                flat_article[key] = str(value)
        
        flattened_articles.append(flat_article)
    
    # Write to CSV
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            if flattened_articles:
                fieldnames = list(flattened_articles[0].keys())
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(flattened_articles)
        
        print(f"✅ Exported {len(articles)} articles to {filename}")
        print(f"📁 File location: {os.path.abspath(filename)}")
        return filename
        
    except Exception as e:
        print(f"❌ Error writing CSV file: {e}")
        return None

def main():
    """Main function."""
    print("="*60)
    print("EXPORT RELEVANT ARTICLES FROM LAST 2 WEEKS")
    print("="*60)
    
    # Get relevant articles
    articles, start_date, end_date = get_relevant_articles_from_last_week()
    
    if not articles:
        print("⚠️  No relevant articles found from the last 2 weeks")
        return
    
    # Export to CSV
    filename = export_to_csv(articles, start_date, end_date)
    
    if filename:
        print("\n" + "="*60)
        print(f"✅ Export completed successfully!")
        print(f"📄 File: {filename}")
        print(f"📊 Articles: {len(articles)}")
        print("="*60)
    else:
        print("\n❌ Export failed")

if __name__ == "__main__":
    main()

