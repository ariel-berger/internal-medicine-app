#!/usr/bin/env python3
"""
Delete articles from the database that were published on or after a specific date.
This script will:
1. Show a preview of articles to be deleted
2. Delete related records in enhanced_classifications table
3. Delete articles from the articles table

Usage:
  python backend/scripts/delete_articles_by_date.py 2025-10-29
"""

import os
import sys
import sqlite3
from datetime import datetime
from typing import List, Dict

# Ensure backend modules are importable when running from project root or scripts
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from medical_processing.database.schema import get_connection


def get_articles_by_date(cutoff_date: str) -> List[Dict]:
    """Get all articles published on or after the cutoff date."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, pmid, title, journal, publication_date
            FROM articles
            WHERE publication_date >= ?
            ORDER BY publication_date DESC
        """, (cutoff_date,))
        
        columns = [desc[0] for desc in cursor.description]
        articles = []
        for row in cursor.fetchall():
            article = dict(zip(columns, row))
            articles.append(article)
        
        return articles
    finally:
        conn.close()


def delete_articles_by_date(cutoff_date: str, dry_run: bool = False) -> Dict:
    """
    Delete articles published on or after the cutoff date.
    
    Args:
        cutoff_date: Date string in YYYY-MM-DD format
        dry_run: If True, only show what would be deleted without actually deleting
    
    Returns:
        Dictionary with deletion statistics
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # First, get the article IDs that will be deleted
        cursor.execute("""
            SELECT id FROM articles
            WHERE publication_date >= ?
        """, (cutoff_date,))
        
        article_ids = [row[0] for row in cursor.fetchall()]
        
        if not article_ids:
            return {
                'articles_deleted': 0,
                'classifications_deleted': 0,
                'message': f'No articles found with publication_date >= {cutoff_date}'
            }
        
        # Count enhanced_classifications that will be deleted
        placeholders = ','.join('?' for _ in article_ids)
        cursor.execute(f"""
            SELECT COUNT(*) FROM enhanced_classifications
            WHERE article_id IN ({placeholders})
        """, article_ids)
        classifications_count = cursor.fetchone()[0]
        
        if dry_run:
            return {
                'articles_to_delete': len(article_ids),
                'classifications_to_delete': classifications_count,
                'message': f'DRY RUN: Would delete {len(article_ids)} articles and {classifications_count} classifications'
            }
        
        # Delete enhanced_classifications first (foreign key constraint)
        if classifications_count > 0:
            cursor.execute(f"""
                DELETE FROM enhanced_classifications
                WHERE article_id IN ({placeholders})
            """, article_ids)
            classifications_deleted = cursor.rowcount
        else:
            classifications_deleted = 0
        
        # Delete articles
        cursor.execute("""
            DELETE FROM articles
            WHERE publication_date >= ?
        """, (cutoff_date,))
        articles_deleted = cursor.rowcount
        
        conn.commit()
        
        return {
            'articles_deleted': articles_deleted,
            'classifications_deleted': classifications_deleted,
            'message': f'Successfully deleted {articles_deleted} articles and {classifications_deleted} classifications'
        }
        
    except sqlite3.Error as e:
        conn.rollback()
        raise Exception(f"Database error: {e}")
    finally:
        conn.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: python backend/scripts/delete_articles_by_date.py YYYY-MM-DD [--dry-run] [--yes]")
        print("Example: python backend/scripts/delete_articles_by_date.py 2025-10-29")
        sys.exit(1)
    
    cutoff_date = sys.argv[1]
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    skip_confirm = '--yes' in sys.argv or '-y' in sys.argv
    
    # Validate date format
    try:
        datetime.strptime(cutoff_date, '%Y-%m-%d')
    except ValueError:
        print(f"Error: Invalid date format. Expected YYYY-MM-DD, got: {cutoff_date}")
        sys.exit(1)
    
    print(f"{'='*60}")
    print(f"Deleting articles published on or after: {cutoff_date}")
    if dry_run:
        print("DRY RUN MODE - No changes will be made")
    print(f"{'='*60}\n")
    
    # Show preview of articles to be deleted
    print("Preview of articles to be deleted:")
    print("-" * 60)
    articles = get_articles_by_date(cutoff_date)
    
    if not articles:
        print("No articles found with publication_date >= " + cutoff_date)
        sys.exit(0)
    
    for i, article in enumerate(articles[:10], 1):  # Show first 10
        print(f"{i}. PMID: {article.get('pmid', 'N/A')} | "
              f"Date: {article.get('publication_date', 'N/A')} | "
              f"Journal: {article.get('journal', 'N/A')[:30]}")
        print(f"   Title: {article.get('title', 'N/A')[:70]}...")
    
    if len(articles) > 10:
        print(f"\n... and {len(articles) - 10} more articles")
    
    print(f"\nTotal articles to delete: {len(articles)}")
    
    if dry_run:
        result = delete_articles_by_date(cutoff_date, dry_run=True)
        print(f"\n{result['message']}")
        return
    
    # Confirm deletion (unless --yes flag is provided)
    if not skip_confirm:
        print("\nWARNING: This will permanently delete articles from the database!")
        try:
            response = input("Type 'DELETE' to confirm: ")
            if response != 'DELETE':
                print("Deletion cancelled.")
                sys.exit(0)
        except (EOFError, KeyboardInterrupt):
            print("\nDeletion cancelled (no input available).")
            print("Use --yes flag to skip confirmation.")
            sys.exit(0)
    
    # Perform deletion
    print("\nDeleting articles...")
    try:
        result = delete_articles_by_date(cutoff_date, dry_run=False)
        print(f"\nSUCCESS: {result['message']}")
        print(f"   - Articles deleted: {result['articles_deleted']}")
        print(f"   - Classifications deleted: {result['classifications_deleted']}")
    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

