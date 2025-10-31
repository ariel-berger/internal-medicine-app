from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta
import os
from dotenv import load_dotenv
from pathlib import Path
from typing import Optional
from werkzeug.security import generate_password_hash, check_password_hash

# Load environment variables
# 1) Load root .env if present
load_dotenv()
# 2) Explicitly load backend/.env to avoid CWD issues
backend_env_path = Path(__file__).resolve().parent / '.env'
if backend_env_path.exists():
    load_dotenv(backend_env_path, override=False)

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-string-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Configure CORS - restrict origins in production
if os.getenv('FLASK_ENV') == 'production':
    frontend_url = os.getenv('FRONTEND_URL', '')
    if frontend_url:
        CORS(app, origins=[frontend_url])
    else:
        # If FRONTEND_URL not set, allow all (not ideal but won't break)
        CORS(app)
else:
    CORS(app)  # Allow all origins in development

# Import medical articles processing service
try:
    from medical_processing.service import medical_articles_service
    from medical_processing.database.schema import get_connection
    # Initialize the service
    medical_articles_service.initialize_database()
    medical_conn = get_connection()
    print("✅ Medical articles processing service initialized successfully")
except ImportError as e:
    print(f"Warning: Could not import medical articles processing service: {e}")
    medical_articles_service = None
    medical_conn = None

# Optional Google Auth imports
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except Exception:
    GOOGLE_AUTH_AVAILABLE = False

# Function to get medical articles database connection
def get_medical_connection():
    """Get connection to medical articles database"""
    import sqlite3
    import os
    db_path = os.path.join(os.path.dirname(__file__), 'medical_articles.db')
    if os.path.exists(db_path):
        return sqlite3.connect(db_path)
    return None

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    # optional role
    # role = db.Column(db.String(50), default='user')

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'fullName': self.full_name,
        }

class Study(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    authors = db.Column(db.Text)
    journal = db.Column(db.String(200))
    year = db.Column(db.Integer)
    specialty = db.Column(db.String(100))
    abstract = db.Column(db.Text)
    doi = db.Column(db.String(100))
    impact_factor = db.Column(db.Float)
    is_major_journal = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'authors': self.authors,
            'journal': self.journal,
            'year': self.year,
            'specialty': self.specialty,
            'abstract': self.abstract,
            'doi': self.doi,
            'impact_factor': self.impact_factor,
            'is_major_journal': self.is_major_journal,
            'user_id': self.user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class UserStudyStatus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    study_id = db.Column(db.Integer, db.ForeignKey('study.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(50), nullable=False)  # 'read', 'to_read', 'favorite', etc.
    created_by = db.Column(db.String(200), nullable=False)
    created_date = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    def to_dict(self):
        return {
            'id': self.id,
            'study_id': self.study_id,
            'user_id': self.user_id,
            'status': self.status,
            'created_by': self.created_by,
            'created_date': self.created_date.isoformat() if self.created_date else None
        }

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    study_id = db.Column(db.Integer, db.ForeignKey('study.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_by = db.Column(db.String(200), nullable=False)
    created_date = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    def to_dict(self):
        return {
            'id': self.id,
            'study_id': self.study_id,
            'user_id': self.user_id,
            'content': self.content,
            'created_by': self.created_by,
            'created_date': self.created_date.isoformat() if self.created_date else None
        }

# Routes
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'medical_processing_available': medical_articles_service is not None,
        'components': {
            'processing_service': medical_articles_service is not None,
            'database_connection': medical_conn is not None,
            'pubmed_client': medical_articles_service.pubmed_client is not None if medical_articles_service else False
        }
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    """User registration"""
    data = request.get_json()
    
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400
    
    # Check if user already exists
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'User already exists'}), 400
    
    # Create new user with hashed password
    user = User(
        email=data['email'],
        password_hash=generate_password_hash(data['password']),
        full_name=data.get('fullName', '')
    )
    
    db.session.add(user)
    db.session.commit()
    
    # Create access token with string identity
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'message': 'User created successfully',
        'token': access_token,
        'user': {
            'id': user.id,
            'email': user.email,
            'fullName': user.full_name
        }
    })

@app.route('/api/auth/google', methods=['POST'])
def google_login():
    """Login/Register using Google ID token."""
    if not GOOGLE_AUTH_AVAILABLE:
        return jsonify({'error': 'Google auth not available on server'}), 503

    data = request.get_json() or {}
    token = data.get('idToken') or data.get('credential')
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    if not token:
        return jsonify({'error': 'Missing idToken'}), 400
    if not client_id:
        return jsonify({'error': 'Server missing GOOGLE_CLIENT_ID'}), 500

    try:
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=client_id,
        )
        email = idinfo.get('email')
        full_name = idinfo.get('name') or ''
        if not email:
            return jsonify({'error': 'Google token invalid: no email'}), 401

        user: Optional[User] = User.query.filter_by(email=email).first()
        if not user:
            user = User(email=email, password_hash='google-oauth', full_name=full_name)
            db.session.add(user)
            db.session.commit()

        access_token = create_access_token(identity=str(user.id))
        return jsonify({
            'message': 'Login successful',
            'token': access_token,
            'user': user.to_dict(),
        })
    except Exception as e:
        return jsonify({'error': f'Google verification failed: {str(e)}'}), 401

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login"""
    data = request.get_json()
    
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400
    
    user = User.query.filter_by(email=data['email']).first()
    
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'message': 'Login successful',
        'token': access_token,
        'user': {
            'id': user.id,
            'email': user.email,
            'fullName': user.full_name
        }
    })

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'id': user.id,
        'email': user.email,
        'fullName': user.full_name
    })

@app.route('/api/studies', methods=['GET'])
@jwt_required()
def get_studies():
    """Get all studies for the current user with impact factors from journal_impact_scores table"""
    user_id = get_jwt_identity()
    
    try:
        # Get studies with impact factors from journal_impact_scores table
        conn = get_medical_connection()
        if not conn:
            # Fallback to original query if medical database not available
            studies = Study.query.filter_by(user_id=int(user_id)).all()
            return jsonify([study.to_dict() for study in studies])
        cursor = conn.cursor()
        
        # Query to get studies with impact factors
        query = """
            SELECT s.id, s.title, s.authors, s.journal, s.year, s.specialty, 
                   s.abstract, s.doi, s.impact_factor, s.is_major_journal, 
                   s.created_at, jis.impact_factor as journal_impact_factor
            FROM study s
            LEFT JOIN journal_impact_scores jis ON LOWER(TRIM(s.journal)) = LOWER(TRIM(jis.journal_name))
            WHERE s.user_id = ?
            ORDER BY s.created_at DESC
        """
        
        cursor.execute(query, (int(user_id),))
        studies_data = cursor.fetchall()
        
        # Format results
        studies = []
        for study in studies_data:
            # Use journal impact factor if available, otherwise use stored impact factor
            impact_factor = study[11] if study[11] is not None else study[8]
            
            studies.append({
                'id': study[0],
                'title': study[1],
                'authors': study[2],
                'journal': study[3],
                'year': study[4],
                'specialty': study[5],
                'abstract': study[6],
                'doi': study[7],
                'impact_factor': impact_factor,
                'is_major_journal': study[9] or (impact_factor and impact_factor >= 25),
                'createdAt': study[10].isoformat() if study[10] else None
            })
        
        conn.close()
        return jsonify(studies)
        
    except Exception as e:
        # Fallback to original query if there's an error
        print(f"Error getting studies with impact factors: {e}")
        studies = Study.query.filter_by(user_id=int(user_id)).all()
        return jsonify([study.to_dict() for study in studies])

@app.route('/api/studies', methods=['POST'])
@jwt_required()
def create_study():
    """Create a new study"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Get impact factor from journal_impact_scores table if journal is provided
    impact_factor = data.get('impact_factor')
    is_major_journal = data.get('is_major_journal', False)
    
    if data.get('journal') and not impact_factor:
        try:
            conn = get_medical_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT impact_factor FROM journal_impact_scores 
                    WHERE LOWER(TRIM(journal_name)) = LOWER(TRIM(?))
                """, (data.get('journal'),))
                result = cursor.fetchone()
                if result:
                    impact_factor = result[0]
                    is_major_journal = impact_factor >= 25
                conn.close()
        except Exception as e:
            print(f"Error getting impact factor: {e}")
    
    study = Study(
        title=data.get('title', ''),
        authors=data.get('authors', ''),
        journal=data.get('journal', ''),
        year=data.get('year'),
        specialty=data.get('specialty', ''),
        abstract=data.get('abstract', ''),
        doi=data.get('doi', ''),
        impact_factor=impact_factor,
        is_major_journal=is_major_journal,
        user_id=int(user_id)
    )
    
    db.session.add(study)
    db.session.commit()
    
    return jsonify({
        'id': study.id,
        'title': study.title,
        'authors': study.authors,
        'journal': study.journal,
        'year': study.year,
        'specialty': study.specialty,
        'abstract': study.abstract,
        'doi': study.doi,
        'impact_factor': study.impact_factor,
        'is_major_journal': study.is_major_journal,
        'createdAt': study.created_at.isoformat()
    }), 201

@app.route('/api/studies/<int:study_id>', methods=['PUT'])
@jwt_required()
def update_study(study_id):
    """Update a study"""
    user_id = get_jwt_identity()
    study = Study.query.filter_by(id=study_id, user_id=int(user_id)).first()
    
    if not study:
        return jsonify({'error': 'Study not found'}), 404
    
    data = request.get_json()
    
    study.title = data.get('title', study.title)
    study.authors = data.get('authors', study.authors)
    study.journal = data.get('journal', study.journal)
    study.year = data.get('year', study.year)
    study.specialty = data.get('specialty', study.specialty)
    study.abstract = data.get('abstract', study.abstract)
    study.doi = data.get('doi', study.doi)
    study.impact_factor = data.get('impact_factor', study.impact_factor)
    study.is_major_journal = data.get('is_major_journal', study.is_major_journal)
    
    # Update impact factor from journal_impact_scores if journal changed
    if data.get('journal') and data.get('journal') != study.journal:
        try:
            conn = get_medical_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT impact_factor FROM journal_impact_scores 
                    WHERE LOWER(TRIM(journal_name)) = LOWER(TRIM(?))
                """, (data.get('journal'),))
                result = cursor.fetchone()
                if result:
                    study.impact_factor = result[0]
                    study.is_major_journal = result[0] >= 25
                conn.close()
        except Exception as e:
            print(f"Error getting impact factor: {e}")
    
    db.session.commit()
    
    return jsonify({
        'id': study.id,
        'title': study.title,
        'authors': study.authors,
        'journal': study.journal,
        'year': study.year,
        'specialty': study.specialty,
        'abstract': study.abstract,
        'doi': study.doi,
        'impact_factor': study.impact_factor,
        'is_major_journal': study.is_major_journal,
        'createdAt': study.created_at.isoformat()
    })

@app.route('/api/studies/<int:study_id>', methods=['DELETE'])
@jwt_required()
def delete_study(study_id):
    """Delete a study"""
    user_id = get_jwt_identity()
    study = Study.query.filter_by(id=study_id, user_id=int(user_id)).first()
    
    if not study:
        return jsonify({'error': 'Study not found'}), 404
    
    db.session.delete(study)
    db.session.commit()
    
    return jsonify({'message': 'Study deleted successfully'})

# Medical articles library integration endpoints
@app.route('/api/medical-articles/process', methods=['POST'])
@jwt_required()
def process_article():
    """Process an article using the medical articles library"""
    if not article_classifier:
        return jsonify({'error': 'Medical articles library not available'}), 503
    
    data = request.get_json()
    # Add your medical articles library processing logic here
    # This is a placeholder - implement based on your library's API
    
    return jsonify({'message': 'Article processed successfully'})

@app.route('/api/medical-articles/search', methods=['GET'])
@jwt_required()
def search_articles():
    """Search articles using the medical articles library"""
    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    query = request.args.get('q', '')
    limit = int(request.args.get('limit', 20))
    offset = int(request.args.get('offset', 0))
    
    try:
        # Create a new connection for this request to avoid threading issues
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        if query:
            # Search by title, abstract, or authors
            search_query = """
                SELECT id, title, authors, journal, publication_date, abstract, 
                       pmid, clinical_relevance_score, medical_category, article_type
                FROM articles 
                WHERE title LIKE ? OR abstract LIKE ? OR authors LIKE ?
                ORDER BY clinical_relevance_score DESC, publication_date DESC
                LIMIT ? OFFSET ?
            """
            search_term = f'%{query}%'
            cursor.execute(search_query, (search_term, search_term, search_term, limit, offset))
        else:
            # Get recent articles
            recent_query = """
                SELECT id, title, authors, journal, publication_date, abstract, 
                       pmid, clinical_relevance_score, medical_category, article_type
                FROM articles 
                ORDER BY publication_date DESC, clinical_relevance_score DESC
                LIMIT ? OFFSET ?
            """
            cursor.execute(recent_query, (limit, offset))
        
        articles = cursor.fetchall()
        
        # Format results
        results = []
        for article in articles:
            results.append({
                'id': article[0],
                'title': article[1],
                'authors': article[2],
                'journal': article[3],
                'publication_date': article[4],
                'abstract': article[5],
                'pmid': article[6],
                'clinical_relevance_score': article[7],
                'medical_category': article[8],
                'article_type': article[9]
            })
        
        return jsonify({
            'articles': results,
            'query': query,
            'total': len(results),
            'limit': limit,
            'offset': offset
        })
        
    except Exception as e:
        return jsonify({'error': f'Search failed: {str(e)}'}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/medical-articles/collect', methods=['POST'])
@jwt_required()
def collect_articles():
    """Collect recent articles using PubMed client"""
    if not pubmed_client:
        return jsonify({'error': 'PubMed client not available'}), 503
    
    data = request.get_json()
    # Add your PubMed collection logic here
    # This is a placeholder - implement based on your library's API
    
    return jsonify({'message': 'Articles collection started'})

@app.route('/api/medical-articles/classify', methods=['POST'])
@jwt_required()
def classify_articles():
    """Classify articles using the medical article classifier"""
    if not article_classifier:
        return jsonify({'error': 'Article classifier not available'}), 503
    
    data = request.get_json()
    # Add your classification logic here
    # This is a placeholder - implement based on your library's API
    
    return jsonify({'message': 'Articles classified successfully'})

@app.route('/api/medical-articles/stats', methods=['GET'])
@jwt_required()
def get_article_stats():
    """Get statistics about the medical articles database"""
    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    try:
        # Create a new connection for this request to avoid threading issues
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        # Get total count
        cursor.execute("SELECT COUNT(*) FROM articles")
        total_articles = cursor.fetchone()[0]
        
        # Get count by category
        cursor.execute("SELECT medical_category, COUNT(*) FROM articles GROUP BY medical_category")
        category_counts = dict(cursor.fetchall())
        
        # Get count by article type
        cursor.execute("SELECT article_type, COUNT(*) FROM articles GROUP BY article_type")
        type_counts = dict(cursor.fetchall())
        
        # Get average relevance score
        cursor.execute("SELECT AVG(clinical_relevance_score) FROM articles WHERE clinical_relevance_score IS NOT NULL")
        avg_score = cursor.fetchone()[0] or 0
        
        stats = {
            'total_articles': total_articles,
            'category_counts': category_counts,
            'type_counts': type_counts,
            'average_relevance_score': round(avg_score, 2)
        }
        
        return jsonify(stats)
        
    except Exception as e:
        return jsonify({'error': f'Failed to get statistics: {str(e)}'}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/medical-articles/<int:article_id>', methods=['GET'])
@jwt_required()
def get_article(article_id):
    """Get a specific article by ID"""
    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    try:
        # Use the medical articles library to get article
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, pmid, title, abstract, journal, authors, author_affiliations,
                   publication_date, doi, url, medical_category, article_type, 
                   keywords, mesh_terms, publication_type, created_at, updated_at
            FROM articles 
            WHERE id = ?
        """, (article_id,))
        
        article = cursor.fetchone()
        
        if not article:
            conn.close()
            return jsonify({'error': 'Article not found'}), 404
        
        result = {
            'id': article[0],
            'pmid': article[1],
            'title': article[2],
            'abstract': article[3],
            'journal': article[4],
            'authors': article[5],
            'author_affiliations': article[6],
            'publication_date': article[7],
            'doi': article[8],
            'url': article[9],
            'medical_category': article[10],
            'article_type': article[11],
            'keywords': article[12],
            'mesh_terms': article[13],
            'publication_type': article[14],
            'created_at': article[15],
            'updated_at': article[16]
        }
        
        conn.close()
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'Failed to get article: {str(e)}'}), 500

@app.route('/api/medical-articles/relevant', methods=['GET'])
@jwt_required()
def get_relevant_articles():
    """Get all relevant articles (where is_relevant = True)"""
    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    try:
        # Create a new connection for this request to avoid threading issues
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        # Get query parameters
        limit = int(request.args.get('limit', 50))  # Increased default limit for All Studies page
        offset = int(request.args.get('offset', 0))
        sort_by = request.args.get('sort', 'ranking_score')  # ranking_score, publication_date, title
        
        # Build ORDER BY clause
        if sort_by == 'ranking_score':
            order_clause = 'ORDER BY ec.ranking_score DESC, a.publication_date DESC'
        elif sort_by == 'publication_date':
            order_clause = 'ORDER BY a.publication_date DESC, ec.ranking_score DESC'
        elif sort_by == 'title':
            order_clause = 'ORDER BY a.title ASC'
        else:
            order_clause = 'ORDER BY ec.ranking_score DESC, a.publication_date DESC'
        
        # Get relevant articles with enhanced classification data
        query = f"""
            SELECT a.id, a.pmid, a.title, a.abstract, a.journal, a.authors, 
                   a.publication_date, a.doi, a.url, a.medical_category, a.article_type,
                   ec.ranking_score, ec.clinical_bottom_line, ec.tags, ec.participants,
                   ec.focus_points, ec.type_points, ec.prevalence_points, 
                   ec.hospitalization_points, ec.impact_factor_points
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1
            {order_clause}
            LIMIT ? OFFSET ?
        """
        
        cursor.execute(query, (limit, offset))
        articles = cursor.fetchall()
        
        # Get total count of relevant articles
        cursor.execute("SELECT COUNT(*) FROM enhanced_classifications WHERE is_relevant = 1")
        total_count = cursor.fetchone()[0]
        
        # Format results
        results = []
        for article in articles:
            results.append({
                'id': article[0],
                'pmid': article[1],
                'title': article[2],
                'abstract': article[3],
                'journal': article[4],
                'authors': article[5],
                'publication_date': article[6],
                'doi': article[7],
                'url': article[8],
                'medical_category': article[9],
                'article_type': article[10],
                'ranking_score': article[11],
                'clinical_bottom_line': article[12],
                'tags': article[13],
                'participants': article[14],
                'focus_points': article[15],
                'type_points': article[16],
                'prevalence_points': article[17],
                'hospitalization_points': article[18],
                'impact_factor_points': article[19]
            })
        
        return jsonify({
            'results': results,
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'sort_by': sort_by
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to get relevant articles: {str(e)}'}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/medical-articles/relevant/stats', methods=['GET'])
@jwt_required()
def get_relevant_articles_stats():
    """Get statistics about relevant articles"""
    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    try:
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        # Get basic statistics
        cursor.execute("SELECT COUNT(*) FROM enhanced_classifications WHERE is_relevant = 1")
        total_relevant = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM articles")
        total_articles = cursor.fetchone()[0]
        
        # Get relevant articles by journal
        cursor.execute("""
            SELECT a.journal, COUNT(*) as count 
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1 AND a.journal IS NOT NULL
            GROUP BY a.journal 
            ORDER BY count DESC 
            LIMIT 10
        """)
        top_journals = [{'journal': row[0], 'count': row[1]} for row in cursor.fetchall()]
        
        # Get relevant articles by medical category
        cursor.execute("""
            SELECT a.medical_category, COUNT(*) as count 
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1 AND a.medical_category IS NOT NULL
            GROUP BY a.medical_category 
            ORDER BY count DESC
        """)
        articles_by_category = [{'category': row[0], 'count': row[1]} for row in cursor.fetchall()]
        
        # Get ranking score distribution
        cursor.execute("""
            SELECT ec.ranking_score, COUNT(*) as count
            FROM enhanced_classifications ec
            WHERE ec.is_relevant = 1
            GROUP BY ec.ranking_score
            ORDER BY ec.ranking_score DESC
        """)
        score_distribution = [{'score': row[0], 'count': row[1]} for row in cursor.fetchall()]
        
        # Get average ranking score
        cursor.execute("SELECT AVG(ranking_score) FROM enhanced_classifications WHERE is_relevant = 1")
        avg_score = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'total_relevant_articles': total_relevant,
            'total_articles': total_articles,
            'relevance_percentage': round((total_relevant / total_articles) * 100, 2) if total_articles > 0 else 0,
            'top_journals': top_journals,
            'articles_by_category': articles_by_category,
            'score_distribution': score_distribution,
            'average_ranking_score': round(avg_score, 2) if avg_score else 0
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to get relevant articles statistics: {str(e)}'}), 500

@app.route('/api/user-study-status', methods=['GET'])
@jwt_required()
def get_user_study_status():
    """Get user study status records"""
    try:
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Get query parameters
        created_by = request.args.get('created_by')
        sort = request.args.get('sort', '-created_date')
        
        # Build query
        query = UserStudyStatus.query
        if created_by:
            query = query.filter_by(created_by=created_by)
        
        # Apply sorting
        if sort.startswith('-'):
            field = sort[1:]
            if hasattr(UserStudyStatus, field):
                query = query.order_by(getattr(UserStudyStatus, field).desc())
        else:
            if hasattr(UserStudyStatus, sort):
                query = query.order_by(getattr(UserStudyStatus, sort))
        
        statuses = query.all()
        return jsonify([status.to_dict() for status in statuses])
        
    except Exception as e:
        return jsonify({'error': f'Failed to get user study status: {str(e)}'}), 500

@app.route('/api/user-study-status', methods=['POST'])
@jwt_required()
def create_user_study_status():
    """Create a user study status record"""
    try:
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json() or {}
        study_id = data.get('study_id')
        status = data.get('status')
        if not study_id or not status:
            return jsonify({'error': 'study_id and status are required'}), 400

        record = UserStudyStatus(
            study_id=study_id,
            user_id=current_user_id,
            status=status,
            created_by=user.email,
        )
        db.session.add(record)
        db.session.commit()
        return jsonify(record.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create status: {str(e)}'}), 500

@app.route('/api/user-study-status/<int:record_id>', methods=['PUT'])
@jwt_required()
def update_user_study_status(record_id):
    """Update a user study status record"""
    try:
        current_user_id = int(get_jwt_identity())
        record: Optional[UserStudyStatus] = UserStudyStatus.query.get(record_id)
        if not record or record.user_id != current_user_id:
            return jsonify({'error': 'Status not found'}), 404

        data = request.get_json() or {}
        if 'status' in data and data['status']:
            record.status = data['status']
        db.session.commit()
        return jsonify(record.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update status: {str(e)}'}), 500

@app.route('/api/user-study-status/<int:record_id>', methods=['DELETE'])
@jwt_required()
def delete_user_study_status(record_id):
    """Delete a user study status record"""
    try:
        current_user_id = int(get_jwt_identity())
        record: Optional[UserStudyStatus] = UserStudyStatus.query.get(record_id)
        if not record or record.user_id != current_user_id:
            return jsonify({'error': 'Status not found'}), 404
        db.session.delete(record)
        db.session.commit()
        return jsonify({'message': 'Deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete status: {str(e)}'}), 500

@app.route('/api/comments', methods=['GET'])
@jwt_required()
def get_comments():
    """Get comments"""
    try:
        sort = request.args.get('sort', '-created_date')
        
        # Build query
        query = Comment.query
        
        # Apply sorting
        if sort.startswith('-'):
            field = sort[1:]
            if hasattr(Comment, field):
                query = query.order_by(getattr(Comment, field).desc())
        else:
            if hasattr(Comment, sort):
                query = query.order_by(getattr(Comment, sort))
        
        comments = query.all()
        return jsonify([comment.to_dict() for comment in comments])
        
    except Exception as e:
        return jsonify({'error': f'Failed to get comments: {str(e)}'}), 500

@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    """Get all users (admin only)"""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)
        if not current_user or current_user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        users = User.query.all()
        return jsonify([user.to_dict() for user in users])
        
    except Exception as e:
        return jsonify({'error': f'Failed to get users: {str(e)}'}), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)
