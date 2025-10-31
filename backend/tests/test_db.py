#!/usr/bin/env python3
"""
Test script to load and extract information from the medical articles database
"""

import sqlite3
import json
from pathlib import Path

def test_database_connection():
    """Test basic database connection and structure"""
    db_path = Path(__file__).parent / "medical_articles.db"
    
    if not db_path.exists():
        print(f"❌ Database file not found at: {db_path}")
        return False
    
    print(f"✅ Database file found at: {db_path}")
    print(f"📊 Database size: {db_path.stat().st_size / 1024 / 1024:.2f} MB")
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"\n📋 Found {len(tables)} tables:")
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"  - {table_name}: {count} records")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
        return False

def explore_articles_table():
    """Explore the articles table structure and sample data"""
    db_path = Path(__file__).parent / "medical_articles.db"
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Check if articles table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='articles';")
        if not cursor.fetchone():
            print("❌ No 'articles' table found")
            conn.close()
            return
        
        # Get table schema
        cursor.execute("PRAGMA table_info(articles);")
        columns = cursor.fetchall()
        
        print(f"\n📊 Articles table schema ({len(columns)} columns):")
        for col in columns:
            print(f"  - {col[1]} ({col[2]}) {'NOT NULL' if col[3] else 'NULL'}")
        
        # Get sample records
        cursor.execute("SELECT * FROM articles LIMIT 3;")
        sample_records = cursor.fetchall()
        
        print(f"\n📄 Sample records:")
        for i, record in enumerate(sample_records, 1):
            print(f"\n  Record {i}:")
            for j, col in enumerate(columns):
                value = record[j] if j < len(record) else None
                if value and len(str(value)) > 100:
                    value = str(value)[:100] + "..."
                print(f"    {col[1]}: {value}")
        
        # Get some statistics
        cursor.execute("SELECT COUNT(*) FROM articles;")
        total_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT journal) FROM articles WHERE journal IS NOT NULL;")
        journal_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT substr(publication_date, 1, 4)) FROM articles WHERE publication_date IS NOT NULL;")
        year_count = cursor.fetchone()[0]
        
        print(f"\n📈 Statistics:")
        print(f"  - Total articles: {total_count}")
        print(f"  - Unique journals: {journal_count}")
        print(f"  - Years covered: {year_count}")
        
        # Get recent articles
        cursor.execute("SELECT title, journal, publication_date FROM articles WHERE publication_date IS NOT NULL ORDER BY publication_date DESC LIMIT 5;")
        recent_articles = cursor.fetchall()
        
        print(f"\n🆕 Most recent articles:")
        for article in recent_articles:
            year = article[2][:4] if article[2] else "Unknown"
            print(f"  - {article[0][:80]}... ({article[1]}, {year})")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error exploring articles table: {e}")

def test_medical_articles_lib():
    """Test the medical articles library integration"""
    try:
        from medical_articles import ArticleDatabase, MedicalArticleClassifier, PubMedClient
        
        print(f"\n🔬 Testing Medical Articles Library:")
        
        # Test ArticleDatabase
        print(f"  - ArticleDatabase: ✅ Available")
        
        # Test MedicalArticleClassifier
        print(f"  - MedicalArticleClassifier: ✅ Available")
        
        # Test PubMedClient
        print(f"  - PubMedClient: ✅ Available")
        
        # Try to get connection from the library
        try:
            from medical_articles import get_connection
            conn = get_connection()
            if conn:
                print(f"  - Database connection: ✅ Working")
                conn.close()
            else:
                print(f"  - Database connection: ❌ Failed")
        except Exception as e:
            print(f"  - Database connection: ❌ Error - {e}")
        
    except ImportError as e:
        print(f"❌ Error importing medical articles library: {e}")

def main():
    """Main test function"""
    print("🧪 Testing Medical Articles Database Integration")
    print("=" * 50)
    
    # Test database connection
    if test_database_connection():
        # Explore articles table
        explore_articles_table()
    
    # Test medical articles library
    test_medical_articles_lib()
    
    print("\n✅ Database testing complete!")

if __name__ == "__main__":
    main()
