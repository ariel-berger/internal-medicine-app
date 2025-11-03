import sqlite3
from datetime import datetime
from ..config import DATABASE_PATH

def create_database():
    """Create the database and tables for storing articles."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Articles table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pmid TEXT UNIQUE,
            title TEXT NOT NULL,
            abstract TEXT,
            journal TEXT,
            authors TEXT,
            author_affiliations TEXT,
            publication_date DATE,
            doi TEXT,
            url TEXT,
            medical_category TEXT,
            article_type TEXT,
            keywords TEXT,
            mesh_terms TEXT,
            publication_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Journal impact scores table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS journal_impact_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_name TEXT UNIQUE NOT NULL,
            journal_abbreviation TEXT,
            impact_factor REAL,
            h_index INTEGER,
            sjr_score REAL,
            eigenfactor_score REAL,
            article_influence_score REAL,
            year INTEGER,
            source TEXT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
    ''')
    
    
    # Enhanced classification results table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS enhanced_classifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER UNIQUE,
            participants INTEGER,
            is_relevant BOOLEAN,
            reason TEXT,
            medical_category TEXT,
            article_type TEXT,
            clinical_bottom_line TEXT,
            tags TEXT,  -- JSON array as text
            ranking_score INTEGER DEFAULT 0,
            focus_points INTEGER DEFAULT 0,
            type_points INTEGER DEFAULT 0,
            prevalence_points INTEGER DEFAULT 0,
            hospitalization_points INTEGER DEFAULT 0,
            clinical_outcome_points INTEGER DEFAULT 0,
            impact_factor_points INTEGER DEFAULT 0,
            temporality_points INTEGER DEFAULT 0,
            neurology_penalty_points INTEGER DEFAULT 0,
            prevention_penalty_points INTEGER DEFAULT 0,
            biologic_penalty_points INTEGER DEFAULT 0,
            screening_penalty_points INTEGER DEFAULT 0,
            scores_penalty_points INTEGER DEFAULT 0,
            subanalysis_penalty_points INTEGER DEFAULT 0,
            classifier_version TEXT DEFAULT 'v3.0',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (article_id) REFERENCES articles (id)
        )
    ''')
    
    conn.commit()
    conn.close()

def migrate_database():
    """Migrate existing database to remove disease_prevalence and practice_changing_potential columns."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the columns exist in the enhanced_classifications table
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_remove = ['disease_prevalence', 'practice_changing_potential']
        columns_exist = [col for col in columns_to_remove if col in columns]
        
        if columns_exist:
            print(f"Found columns to remove: {columns_exist}")
            
            # Create a new table without the unwanted columns
            cursor.execute('''
                CREATE TABLE enhanced_classifications_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER UNIQUE,
                    participants INTEGER,
                    is_relevant BOOLEAN,
                    reason TEXT,
                    medical_category TEXT,
                    article_type TEXT,
                    clinical_bottom_line TEXT,
                    tags TEXT,
                    ranking_score INTEGER DEFAULT 0,
                    focus_points INTEGER DEFAULT 0,
                    type_points INTEGER DEFAULT 0,
                    prevalence_points INTEGER DEFAULT 0,
                    hospitalization_points INTEGER DEFAULT 0,
                    impact_factor_points INTEGER DEFAULT 0,
                    guidelines_points INTEGER DEFAULT 0,
                    neurology_penalty_points INTEGER DEFAULT 0,
                    classifier_version TEXT DEFAULT 'v3.0',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (article_id) REFERENCES articles (id)
                )
            ''')
            
            # Copy data from old table to new table (excluding the removed columns)
            cursor.execute('''
                INSERT INTO enhanced_classifications_new 
                (id, article_id, participants, is_relevant, reason, medical_category, 
                 clinical_bottom_line, tags, ranking_score, focus_points, 
                 type_points, prevalence_points, hospitalization_points, impact_factor_points, 
                 guidelines_points, neurology_penalty_points, classifier_version, created_at, updated_at)
                SELECT id, article_id, participants, is_relevant, rejection_reason, medical_category,
                       clinical_bottom_line, tags, ranking_score, focus_points,
                       type_points, prevalence_points, hospitalization_points, impact_factor_points,
                       0, 0, classifier_version, created_at, updated_at
                FROM enhanced_classifications
            ''')
            
            # Drop the old table and rename the new one
            cursor.execute('DROP TABLE enhanced_classifications')
            cursor.execute('ALTER TABLE enhanced_classifications_new RENAME TO enhanced_classifications')
            
            conn.commit()
            print("✅ Successfully migrated database - removed disease_prevalence and practice_changing_potential columns")
        else:
            print("✅ No migration needed - columns don't exist")
            
    except sqlite3.Error as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

def add_rule_based_scoring_columns():
    """Add new rule-based scoring columns to existing enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the new columns already exist
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_add = ['guidelines_points', 'neurology_penalty_points']
        missing_columns = [col for col in columns_to_add if col not in columns]
        
        if missing_columns:
            print(f"Adding missing columns: {missing_columns}")
            
            for column in missing_columns:
                if column == 'guidelines_points':
                    cursor.execute('ALTER TABLE enhanced_classifications ADD COLUMN guidelines_points INTEGER DEFAULT 0')
                elif column == 'neurology_penalty_points':
                    cursor.execute('ALTER TABLE enhanced_classifications ADD COLUMN neurology_penalty_points INTEGER DEFAULT 0')
            
            conn.commit()
            print("✅ Successfully added rule-based scoring columns")
        else:
            print("✅ Rule-based scoring columns already exist")
            
    except sqlite3.Error as e:
        print(f"❌ Error adding rule-based scoring columns: {e}")
        conn.rollback()
    finally:
        conn.close()

def add_new_penalty_scoring_columns():
    """Add new penalty and bonus scoring columns to existing enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the new columns already exist
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_add = [
            'clinical_outcome_points',
            'guideline_bonus_points',
            'metabolic_penalty_points',
            'screening_penalty_points',
            'scores_penalty_points',
            'subanalysis_penalty_points',
            'prognosis_penalty_points'
        ]
        missing_columns = [col for col in columns_to_add if col not in columns]
        
        if missing_columns:
            print(f"Adding missing columns: {missing_columns}")
            
            for column in missing_columns:
                cursor.execute(f'ALTER TABLE enhanced_classifications ADD COLUMN {column} INTEGER DEFAULT 0')
            
            conn.commit()
            print("✅ Successfully added new penalty and bonus scoring columns")
        else:
            print("✅ New penalty and bonus scoring columns already exist")
            
    except sqlite3.Error as e:
        print(f"❌ Error adding new penalty and bonus scoring columns: {e}")
        conn.rollback()
    finally:
        conn.close()

def remove_guideline_scoring_columns():
    """Remove guideline scoring columns from enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the columns exist in the enhanced_classifications table
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_remove = ['guideline_bonus_points', 'guidelines_points']
        columns_exist = [col for col in columns_to_remove if col in columns]
        
        if columns_exist:
            print(f"Found guideline scoring columns to remove: {columns_exist}")
            
            # Create a new table without the guideline scoring columns
            cursor.execute('''
                CREATE TABLE enhanced_classifications_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER UNIQUE,
                    participants INTEGER,
                    is_relevant BOOLEAN,
                    reason TEXT,
                    medical_category TEXT,
                    article_type TEXT,
                    clinical_bottom_line TEXT,
                    tags TEXT,
                    ranking_score INTEGER DEFAULT 0,
                    focus_points INTEGER DEFAULT 0,
                    type_points INTEGER DEFAULT 0,
                    prevalence_points INTEGER DEFAULT 0,
                    hospitalization_points INTEGER DEFAULT 0,
                    clinical_outcome_points INTEGER DEFAULT 0,
                    impact_factor_points INTEGER DEFAULT 0,
                    neurology_penalty_points INTEGER DEFAULT 0,
                    metabolic_penalty_points INTEGER DEFAULT 0,
                    screening_penalty_points INTEGER DEFAULT 0,
                    scores_penalty_points INTEGER DEFAULT 0,
                    subanalysis_penalty_points INTEGER DEFAULT 0,
                    prognosis_penalty_points INTEGER DEFAULT 0,
                    classifier_version TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Copy data from old table to new table (excluding the removed columns)
            cursor.execute('''
                INSERT INTO enhanced_classifications_new 
                (id, article_id, participants, is_relevant, reason, medical_category, 
                 article_type, clinical_bottom_line, tags, ranking_score, focus_points, 
                 type_points, prevalence_points, hospitalization_points, clinical_outcome_points,
                 impact_factor_points, neurology_penalty_points, metabolic_penalty_points,
                 screening_penalty_points, scores_penalty_points, subanalysis_penalty_points,
                 prognosis_penalty_points, classifier_version, created_at, updated_at)
                SELECT id, article_id, participants, is_relevant, reason, medical_category,
                       article_type, clinical_bottom_line, tags, ranking_score, focus_points,
                       type_points, prevalence_points, hospitalization_points, clinical_outcome_points,
                       impact_factor_points, neurology_penalty_points, metabolic_penalty_points,
                       screening_penalty_points, scores_penalty_points, subanalysis_penalty_points,
                       prognosis_penalty_points, classifier_version, created_at, updated_at
                FROM enhanced_classifications
            ''')
            
            # Drop the old table and rename the new one
            cursor.execute('DROP TABLE enhanced_classifications')
            cursor.execute('ALTER TABLE enhanced_classifications_new RENAME TO enhanced_classifications')
            
            conn.commit()
            print("✅ Successfully migrated database - removed guideline scoring columns")
        else:
            print("✅ No migration needed - guideline scoring columns don't exist")
            
    except sqlite3.Error as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

def rename_rejection_reason_to_reason():
    """Rename rejection_reason column to reason in enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the column rejection_reason exists
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = {column[1]: column for column in cursor.fetchall()}
        
        if 'rejection_reason' in columns and 'reason' not in columns:
            print("Renaming 'rejection_reason' to 'reason'...")
            
            # SQLite doesn't support ALTER COLUMN RENAME directly
            # We need to create a new table and copy data
            
            # Get all existing columns except the one we're renaming
            existing_cols = list(columns.keys())
            
            # Create new table with 'reason' instead of 'rejection_reason'
            cursor.execute('''
                CREATE TABLE enhanced_classifications_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER UNIQUE,
                    participants INTEGER,
                    is_relevant BOOLEAN,
                    reason TEXT,
                    medical_category TEXT,
                    article_type TEXT,
                    clinical_bottom_line TEXT,
                    tags TEXT,
                    ranking_score INTEGER DEFAULT 0,
                    focus_points INTEGER DEFAULT 0,
                    type_points INTEGER DEFAULT 0,
                    prevalence_points INTEGER DEFAULT 0,
                    hospitalization_points INTEGER DEFAULT 0,
                    clinical_outcome_points INTEGER DEFAULT 0,
                    impact_factor_points INTEGER DEFAULT 0,
                    guidelines_points INTEGER DEFAULT 0,
                    guideline_bonus_points INTEGER DEFAULT 0,
                    neurology_penalty_points INTEGER DEFAULT 0,
                    metabolic_penalty_points INTEGER DEFAULT 0,
                    screening_penalty_points INTEGER DEFAULT 0,
                    scores_penalty_points INTEGER DEFAULT 0,
                    subanalysis_penalty_points INTEGER DEFAULT 0,
                    prognosis_penalty_points INTEGER DEFAULT 0,
                    classifier_version TEXT DEFAULT 'v3.0',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (article_id) REFERENCES articles (id)
                )
            ''')
            
            # Copy data from old table to new table
            cursor.execute('''
                INSERT INTO enhanced_classifications_new 
                SELECT id, article_id, participants, is_relevant, rejection_reason, 
                       medical_category, article_type, clinical_bottom_line, tags, 
                       ranking_score, focus_points, type_points, prevalence_points, 
                       hospitalization_points, clinical_outcome_points, impact_factor_points, 
                       guidelines_points, guideline_bonus_points, neurology_penalty_points,
                       metabolic_penalty_points, screening_penalty_points, scores_penalty_points,
                       subanalysis_penalty_points, prognosis_penalty_points,
                       classifier_version, created_at, updated_at
                FROM enhanced_classifications
            ''')
            
            # Drop the old table and rename the new one
            cursor.execute('DROP TABLE enhanced_classifications')
            cursor.execute('ALTER TABLE enhanced_classifications_new RENAME TO enhanced_classifications')
            
            conn.commit()
            print("✅ Successfully renamed 'rejection_reason' to 'reason'")
        elif 'reason' in columns:
            print("✅ Column already renamed to 'reason'")
        else:
            print("⚠️ Neither 'rejection_reason' nor 'reason' column found")
            
    except sqlite3.Error as e:
        print(f"❌ Error renaming column: {e}")
        conn.rollback()
    finally:
        conn.close()

def add_temporality_points_column():
    """Add temporality_points column to existing enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the new column already exists
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'temporality_points' not in columns:
            print("Adding temporality_points column...")
            cursor.execute('ALTER TABLE enhanced_classifications ADD COLUMN temporality_points INTEGER DEFAULT 0')
            conn.commit()
            print("✅ Successfully added temporality_points column")
        else:
            print("✅ temporality_points column already exists")
            
    except sqlite3.Error as e:
        print(f"❌ Error adding temporality_points column: {e}")
        conn.rollback()
    finally:
        conn.close()

def migrate_penalty_scoring_columns():
    """Add new penalty scoring columns: prevention_penalty_points and biologic_penalty_points."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the new columns already exist
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_add = ['prevention_penalty_points', 'biologic_penalty_points']
        missing_columns = [col for col in columns_to_add if col not in columns]
        
        if missing_columns:
            print(f"Adding missing penalty scoring columns: {missing_columns}")
            
            for column in missing_columns:
                cursor.execute(f'ALTER TABLE enhanced_classifications ADD COLUMN {column} INTEGER DEFAULT 0')
            
            conn.commit()
            print("✅ Successfully added new penalty scoring columns")
        else:
            print("✅ New penalty scoring columns already exist")
            
    except sqlite3.Error as e:
        print(f"❌ Error adding new penalty scoring columns: {e}")
        conn.rollback()
    finally:
        conn.close()

def add_hidden_from_dashboard_column():
    """Add hidden_from_dashboard column to enhanced_classifications table."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if the new column already exists
        cursor.execute("PRAGMA table_info(enhanced_classifications)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'hidden_from_dashboard' not in columns:
            print("Adding hidden_from_dashboard column...")
            cursor.execute('ALTER TABLE enhanced_classifications ADD COLUMN hidden_from_dashboard BOOLEAN DEFAULT 0')
            conn.commit()
            print("✅ Successfully added hidden_from_dashboard column")
        else:
            print("✅ hidden_from_dashboard column already exists")
            
    except sqlite3.Error as e:
        print(f"❌ Error adding hidden_from_dashboard column: {e}")
        conn.rollback()
    finally:
        conn.close()

def get_connection():
    """Get database connection."""
    import os
    # Use absolute path - same approach as app.py
    # DATABASE_PATH is relative, so resolve it relative to the backend directory
    if os.path.isabs(DATABASE_PATH):
        db_path = DATABASE_PATH
    else:
        # Resolve relative to backend directory (where medical_articles.db actually is)
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        db_path = os.path.join(backend_dir, DATABASE_PATH)
    return sqlite3.connect(db_path)

if __name__ == "__main__":
    create_database()
    migrate_database()
    add_rule_based_scoring_columns()
    add_new_penalty_scoring_columns()
    rename_rejection_reason_to_reason()
    remove_guideline_scoring_columns()
    add_temporality_points_column()
    migrate_penalty_scoring_columns()
    add_hidden_from_dashboard_column()
    print("Database created and migrated successfully!")