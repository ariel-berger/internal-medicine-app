import sqlite3
import json
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import logging
from .schema import get_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class JournalImpactDatabase:
    """Database operations for managing journal impact scores."""
    
    def __init__(self):
        self.conn = None
    
    def __enter__(self):
        self.conn = get_connection()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
    
    def insert_journal_impact(self, journal_data: Dict) -> Optional[int]:
        """Insert or update journal impact score data."""
        try:
            cursor = self.conn.cursor()
            
            # Check if journal already exists
            cursor.execute("SELECT id FROM journal_impact_scores WHERE journal_name = ?", 
                         (journal_data['journal_name'],))
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                update_query = '''
                    UPDATE journal_impact_scores 
                    SET journal_abbreviation = ?, impact_factor = ?, h_index = ?,
                        sjr_score = ?, eigenfactor_score = ?, article_influence_score = ?,
                        year = ?, source = ?, last_updated = CURRENT_TIMESTAMP, notes = ?
                    WHERE journal_name = ?
                '''
                
                values = (
                    journal_data.get('journal_abbreviation'),
                    journal_data.get('impact_factor'),
                    journal_data.get('h_index'),
                    journal_data.get('sjr_score'),
                    journal_data.get('eigenfactor_score'),
                    journal_data.get('article_influence_score'),
                    journal_data.get('year'),
                    journal_data.get('source'),
                    journal_data.get('notes'),
                    journal_data['journal_name']
                )
                
                cursor.execute(update_query, values)
                journal_id = existing[0]
                logger.info(f"Updated impact score for journal: {journal_data['journal_name']}")
                
            else:
                # Insert new record
                insert_query = '''
                    INSERT INTO journal_impact_scores (
                        journal_name, journal_abbreviation, impact_factor, h_index,
                        sjr_score, eigenfactor_score, article_influence_score,
                        year, source, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                '''
                
                values = (
                    journal_data['journal_name'],
                    journal_data.get('journal_abbreviation'),
                    journal_data.get('impact_factor'),
                    journal_data.get('h_index'),
                    journal_data.get('sjr_score'),
                    journal_data.get('eigenfactor_score'),
                    journal_data.get('article_influence_score'),
                    journal_data.get('year'),
                    journal_data.get('source'),
                    journal_data.get('notes')
                )
                
                cursor.execute(insert_query, values)
                journal_id = cursor.lastrowid
                logger.info(f"Inserted impact score for journal: {journal_data['journal_name']}")
            
            self.conn.commit()
            return journal_id
            
        except sqlite3.Error as e:
            logger.error(f"Error inserting/updating journal impact: {e}")
            self.conn.rollback()
            return None
    
    def get_journal_impact(self, journal_name: str) -> Optional[Dict]:
        """Get impact score data for a specific journal."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM journal_impact_scores 
                WHERE journal_name = ? OR journal_abbreviation = ?
            ''', (journal_name, journal_name))
            
            row = cursor.fetchone()
            if row:
                columns = [desc[0] for desc in cursor.description]
                return dict(zip(columns, row))
            return None
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching journal impact: {e}")
            return None
    
    def get_all_journal_impacts(self) -> List[Dict]:
        """Get impact scores for all journals."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM journal_impact_scores 
                ORDER BY impact_factor DESC NULLS LAST
            ''')
            
            columns = [desc[0] for desc in cursor.description]
            journals = []
            
            for row in cursor.fetchall():
                journal = dict(zip(columns, row))
                journals.append(journal)
            
            return journals
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching all journal impacts: {e}")
            return []
    
    def get_journals_by_impact_range(self, min_impact: float, max_impact: float) -> List[Dict]:
        """Get journals within a specific impact factor range."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM journal_impact_scores 
                WHERE impact_factor >= ? AND impact_factor <= ?
                ORDER BY impact_factor DESC
            ''', (min_impact, max_impact))
            
            columns = [desc[0] for desc in cursor.description]
            journals = []
            
            for row in cursor.fetchall():
                journal = dict(zip(columns, row))
                journals.append(journal)
            
            return journals
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching journals by impact range: {e}")
            return []
    
    def get_journal_statistics(self) -> Dict:
        """Get statistics about journal impact scores."""
        try:
            cursor = self.conn.cursor()
            
            # Total journals
            cursor.execute("SELECT COUNT(*) FROM journal_impact_scores")
            total_journals = cursor.fetchone()[0]
            
            # Average impact factor
            cursor.execute("SELECT AVG(impact_factor) FROM journal_impact_scores WHERE impact_factor IS NOT NULL")
            avg_impact = cursor.fetchone()[0]
            
            # Top journals by impact factor
            cursor.execute('''
                SELECT journal_name, impact_factor 
                FROM journal_impact_scores 
                WHERE impact_factor IS NOT NULL
                ORDER BY impact_factor DESC 
                LIMIT 10
            ''')
            top_journals = cursor.fetchall()
            
            # Journals by year
            cursor.execute('''
                SELECT year, COUNT(*) as count 
                FROM journal_impact_scores 
                WHERE year IS NOT NULL
                GROUP BY year 
                ORDER BY year DESC
            ''')
            journals_by_year = dict(cursor.fetchall())
            
            return {
                'total_journals': total_journals,
                'average_impact_factor': avg_impact,
                'top_journals': top_journals,
                'journals_by_year': journals_by_year
            }
            
        except sqlite3.Error as e:
            logger.error(f"Error getting journal statistics: {e}")
            return {}

class ArticleDatabase:
    """Database operations for managing articles."""
    
    def __init__(self):
        self.conn = None
    
    def __enter__(self):
        self.conn = get_connection()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
    
    def insert_article(self, article_data: Dict) -> Optional[int]:
        """Insert a new article into the database."""
        try:
            cursor = self.conn.cursor()
            
            # Check if article already exists
            cursor.execute("SELECT id FROM articles WHERE pmid = ?", (article_data['pmid'],))
            existing = cursor.fetchone()
            
            if existing:
                logger.info(f"Article with PMID {article_data['pmid']} already exists")
                return existing[0]
            
            # Insert new article
            insert_query = '''
                INSERT INTO articles (
                    pmid, title, abstract, journal, authors, author_affiliations,
                    publication_date, doi, url, medical_category, article_type,
                    keywords, mesh_terms, publication_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            '''
            
            values = (
                article_data['pmid'],
                article_data['title'],
                article_data['abstract'],
                article_data['journal'],
                article_data['authors'],
                article_data['author_affiliations'],
                article_data['publication_date'],
                article_data['doi'],
                article_data['url'],
                article_data.get('medical_category'),
                article_data.get('article_type'),
                article_data['keywords'],
                article_data['mesh_terms'],
                article_data.get('publication_type', '')
            )
            
            cursor.execute(insert_query, values)
            article_id = cursor.lastrowid
            
            self.conn.commit()
            logger.info(f"Inserted article with PMID {article_data['pmid']}")
            
            return article_id
            
        except sqlite3.Error as e:
            logger.error(f"Error inserting article: {e}")
            self.conn.rollback()
            return None
    
    def update_article_classification(self, article_id: int, medical_category: str, 
                                    article_type: str, category_confidence: float = None,
                                    type_confidence: float = None) -> bool:
        """Update article classification."""
        try:
            cursor = self.conn.cursor()
            
            # Update main article record
            cursor.execute('''
                UPDATE articles 
                SET medical_category = ?, article_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (medical_category, article_type, article_id))
            
            # Insert classification scores if provided
            if category_confidence is not None or type_confidence is not None:
                cursor.execute('''
                    INSERT OR REPLACE INTO classification_scores 
                    (article_id, medical_category, article_type, category_confidence, 
                     type_confidence, classifier_version)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (article_id, medical_category, article_type, category_confidence,
                      type_confidence, "v1.0"))
            
            self.conn.commit()
            return True
            
        except sqlite3.Error as e:
            logger.error(f"Error updating classification: {e}")
            self.conn.rollback()
            return False
    
    def update_enhanced_classification(self, article_id: int, classification_data: Dict) -> bool:
        """Update article with enhanced classification results from Claude."""
        try:
            cursor = self.conn.cursor()
            
            # Update main article record with basic classification
            cursor.execute('''
                UPDATE articles 
                SET medical_category = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (classification_data.get('medical_category'), article_id))
            
            # Extract ranking breakdown
            ranking_breakdown = classification_data.get('ranking_breakdown', {})
            
            # Store enhanced classification results
            cursor.execute('''
                INSERT OR REPLACE INTO enhanced_classifications 
                (article_id, participants, is_relevant, reason, medical_category, 
                 clinical_bottom_line, tags, ranking_score, focus_points, type_points,
                 prevalence_points, hospitalization_points, clinical_outcome_points, impact_factor_points,
                 neurology_penalty_points, metabolic_penalty_points, screening_penalty_points, scores_penalty_points,
                 subanalysis_penalty_points, prognosis_penalty_points, classifier_version, created_at, updated_at, temporality_points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
            ''', (
                article_id,
                classification_data.get('participants'),
                classification_data.get('is_relevant', False),
                classification_data.get('reason'),
                classification_data.get('medical_category'),
                classification_data.get('clinical_bottom_line'),
                json.dumps(classification_data.get('tags', [])),
                classification_data.get('ranking_score', 0),
                ranking_breakdown.get('focus_points', 0),
                ranking_breakdown.get('type_points', 0),
                ranking_breakdown.get('prevalence_points', 0),
                ranking_breakdown.get('hospitalization_points', 0),
                ranking_breakdown.get('clinical_outcome_points', 0),
                ranking_breakdown.get('impact_factor_points', 0),
                classification_data.get('neurology_penalty_points', 0),
                classification_data.get('metabolic_penalty_points', 0),
                classification_data.get('screening_penalty_points', 0),
                classification_data.get('scores_penalty_points', 0),
                classification_data.get('subanalysis_penalty_points', 0),
                classification_data.get('prognosis_penalty_points', 0),
                "claude-sonnet-4.5-20250929",
                ranking_breakdown.get('temporality_points', 0)
            ))
                
            self.conn.commit()
            logger.info(f"Updated enhanced classification for article {article_id}")
            return True
            
        except sqlite3.Error as e:
            logger.error(f"Error updating enhanced classification: {e}")
            self.conn.rollback()
            return False
    
    def get_unclassified_articles(self, limit: int = 100) -> List[Dict]:
        """Get articles that haven't been classified yet."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT id, pmid, title, abstract, journal, keywords, mesh_terms
                FROM articles 
                WHERE medical_category IS NULL OR article_type IS NULL
                LIMIT ?
            ''', (limit,))
            
            columns = [desc[0] for desc in cursor.description]
            articles = []
            
            for row in cursor.fetchall():
                article = dict(zip(columns, row))
                articles.append(article)
            
            return articles
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching unclassified articles: {e}")
            return []
    
    def get_articles_by_category(self, medical_category: str, limit: int = 100) -> List[Dict]:
        """Get articles by medical category."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM articles 
                WHERE medical_category = ?
                ORDER BY publication_date DESC
                LIMIT ?
            ''', (medical_category, limit))
            
            columns = [desc[0] for desc in cursor.description]
            articles = []
            
            for row in cursor.fetchall():
                article = dict(zip(columns, row))
                articles.append(article)
            
            return articles
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching articles by category: {e}")
            return []
    
    def get_recent_articles(self, days: int = 7) -> List[Dict]:
        """Get articles from the last N days."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM articles 
                WHERE created_at >= datetime('now', '-{} days')
                ORDER BY created_at DESC
            '''.format(days))
            
            columns = [desc[0] for desc in cursor.description]
            articles = []
            
            for row in cursor.fetchall():
                article = dict(zip(columns, row))
                articles.append(article)
            
            return articles
            
        except sqlite3.Error as e:
            logger.error(f"Error fetching recent articles: {e}")
            return []
    
    def get_statistics(self) -> Dict:
        """Get database statistics."""
        try:
            cursor = self.conn.cursor()
            
            # Total articles
            cursor.execute("SELECT COUNT(*) FROM articles")
            total_articles = cursor.fetchone()[0]
            
            # Articles by category
            cursor.execute('''
                SELECT medical_category, COUNT(*) as count 
                FROM articles 
                WHERE medical_category IS NOT NULL
                GROUP BY medical_category
                ORDER BY count DESC
            ''')
            categories = dict(cursor.fetchall())
            
            # Articles by type
            cursor.execute('''
                SELECT article_type, COUNT(*) as count 
                FROM articles 
                WHERE article_type IS NOT NULL
                GROUP BY article_type
                ORDER BY count DESC
            ''')
            types = dict(cursor.fetchall())
            
            # Unclassified articles
            cursor.execute('''
                SELECT COUNT(*) FROM articles 
                WHERE medical_category IS NULL OR article_type IS NULL
            ''')
            unclassified = cursor.fetchone()[0]
            
            return {
                'total_articles': total_articles,
                'unclassified_articles': unclassified,
                'articles_by_category': categories,
                'articles_by_type': types
            }
            
        except sqlite3.Error as e:
            logger.error(f"Error getting statistics: {e}")
            return {}
    
    def search_articles(self, query: str, category: str = None, 
                       article_type: str = None, limit: int = 100) -> List[Dict]:
        """Search articles by text query and filters."""
        try:
            cursor = self.conn.cursor()
            
            base_query = '''
                SELECT * FROM articles 
                WHERE (title LIKE ? OR abstract LIKE ? OR keywords LIKE ?)
            '''
            params = [f'%{query}%', f'%{query}%', f'%{query}%']
            
            if category:
                base_query += ' AND medical_category = ?'
                params.append(category)
            
            if article_type:
                base_query += ' AND article_type = ?'
                params.append(article_type)
            
            base_query += ' ORDER BY publication_date DESC LIMIT ?'
            params.append(limit)
            
            cursor.execute(base_query, params)
            
            columns = [desc[0] for desc in cursor.description]
            articles = []
            
            for row in cursor.fetchall():
                article = dict(zip(columns, row))
                articles.append(article)
            
            return articles
            
        except sqlite3.Error as e:
            logger.error(f"Error searching articles: {e}")
            return []
    
    def get_latest_created_at(self) -> Optional[str]:
        """Get the latest created_at timestamp from articles in the database."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT MAX(created_at) 
                FROM articles 
                WHERE created_at IS NOT NULL
            ''')
            result = cursor.fetchone()
            if result and result[0]:
                return result[0]
            return None
        except sqlite3.Error as e:
            logger.error(f"Error getting latest created_at: {e}")
            return None

def batch_insert_articles(articles: List[Dict]) -> int:
    """Insert multiple articles in batch with enhanced classification data."""
    inserted_count = 0
    
    with ArticleDatabase() as db:
        for article in articles:
            article_id = db.insert_article(article)
            if article_id:
                inserted_count += 1
                
                # Check if this article has enhanced classification data
                enhanced_fields = ['participants', 'is_relevant', 'reason', 
                                 'clinical_bottom_line', 'tags', 'ranking_score', 'ranking_breakdown',
                                 'neurology_penalty_points',
                                 'metabolic_penalty_points', 'screening_penalty_points', 'scores_penalty_points',
                                 'subanalysis_penalty_points', 'prognosis_penalty_points']
                
                if any(field in article for field in enhanced_fields):
                    # Store enhanced classification data
                    enhanced_data = {field: article.get(field) for field in enhanced_fields}
                    enhanced_data['medical_category'] = article.get('medical_category')
                    
                    success = db.update_enhanced_classification(article_id, enhanced_data)
                    if success:
                        logger.debug(f"Stored enhanced classification for article {article.get('pmid', 'unknown')}")
                    else:
                        logger.warning(f"Failed to store enhanced classification for article {article.get('pmid', 'unknown')}")
    
    logger.info(f"Inserted {inserted_count} out of {len(articles)} articles")
    return inserted_count

if __name__ == "__main__":
    # Test database operations
    with ArticleDatabase() as db:
        stats = db.get_statistics()
        print("Database Statistics:", stats)