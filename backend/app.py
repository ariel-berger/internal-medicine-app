from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, verify_jwt_in_request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
import os
import json
import secrets
from dotenv import load_dotenv
from pathlib import Path
from typing import Optional
from werkzeug.security import generate_password_hash, check_password_hash
import threading
import logging
import sys
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz
from utils.mailer import send_emails
from utils.weekly_digest_email import build_digest_email, build_approval_email

# Configure logging to show all logs in terminal
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Output to terminal
    ]
)

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
# Use persistent disk path if available (Render paid tier)
persistent_data_path = os.getenv('PERSISTENT_DATA_PATH')
if persistent_data_path:
    # Use persistent disk for database - ensure absolute path
    db_path = os.path.abspath(os.path.join(persistent_data_path, 'app.db'))
    # Ensure the directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', f'sqlite:///{db_path}')
else:
    # Default to relative path (ephemeral on free tier)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Configure CORS - allow frontend origins
frontend_urls = []

# Add Vercel frontend URL (default if FRONTEND_URL not set)
vercel_frontend = os.getenv('FRONTEND_URL', '').strip()
if not vercel_frontend:
    vercel_frontend = 'https://internal-medicine-app.vercel.app'
if vercel_frontend:
    frontend_urls.append(vercel_frontend)

# Add any additional frontend URLs from environment
additional_urls = os.getenv('FRONTEND_URLS', '').strip()
if additional_urls:
    frontend_urls.extend([url.strip() for url in additional_urls.split(',') if url.strip()])

# Always allow localhost for development
frontend_urls.extend([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
])

# Remove duplicates while preserving order
seen = set()
frontend_urls = [url for url in frontend_urls if url and url not in seen and not seen.add(url)]

# Configure CORS with explicit settings for preflight requests
CORS(app, 
     origins=frontend_urls if frontend_urls else ['*'],  # Allow all if no URLs specified
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
     expose_headers=['Content-Type', 'Authorization'],
     max_age=3600)  # Cache preflight for 1 hour

# (moved db.create_all to the end of the file, after models are defined)

# Admin allowlist (comma-separated emails). If not set, falls back to single ADMIN_EMAIL
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.getenv('ADMIN_EMAILS', os.getenv('ADMIN_EMAIL', '')).split(',')
    if e and e.strip()
}

# Senior allowlist (comma-separated emails)
SENIOR_EMAILS = {
    e.strip().lower()
    for e in os.getenv('SENIOR_EMAILS', '').split(',')
    if e and e.strip()
}

def is_admin_email(email: str) -> bool:
    return bool(email) and email.strip().lower() in ADMIN_EMAILS

def is_senior_email(email: str) -> bool:
    return bool(email) and email.strip().lower() in SENIOR_EMAILS

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
    # Use persistent disk path if available (Render paid tier)
    persistent_data_path = os.getenv('PERSISTENT_DATA_PATH')
    if persistent_data_path:
        # Ensure absolute path and directory exists
        db_path = os.path.abspath(os.path.join(persistent_data_path, 'medical_articles.db'))
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
    else:
        # Default to relative path (ephemeral on free tier)
        db_path = os.path.join(os.path.dirname(__file__), 'medical_articles.db')
    
    # Always return a connection (will create DB if it doesn't exist)
    return sqlite3.connect(db_path)

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    # optional role
    role = db.Column(db.String(50), default='user')

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'fullName': self.full_name,
            'role': self.role,
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

class KeyArticle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, unique=True, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

class UserStudyStatus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    study_id = db.Column(db.Integer, db.ForeignKey('study.id'), nullable=True)  # Nullable for medical articles
    article_id = db.Column(db.Integer, nullable=True)  # For medical articles
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(50), nullable=False)  # 'read', 'want_to_read', 'favorite', etc.
    created_by = db.Column(db.String(200), nullable=False)
    created_date = db.Column(db.DateTime, default=db.func.current_timestamp())
    
    def to_dict(self):
        return {
            'id': self.id,
            'study_id': self.study_id,
            'article_id': self.article_id,
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
    # Optional article_id for medical articles (not a foreign key in this DB)
    article_id = db.Column(db.Integer, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'study_id': self.study_id,
            'user_id': self.user_id,
            'content': self.content,
            'created_by': self.created_by,
            'created_date': self.created_date.isoformat() if self.created_date else None,
            'article_id': self.article_id
        }

class ArticleComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_by = db.Column(db.String(200), nullable=False)
    created_date = db.Column(db.DateTime, default=db.func.current_timestamp())

    def to_dict(self):
        return {
            'id': self.id,
            'article_id': self.article_id,
            'user_id': self.user_id,
            'content': self.content,
            'created_by': self.created_by,
            'created_date': self.created_date.isoformat() if self.created_date else None
        }

class UserLoginHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    login_timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())

class ArticleInteraction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    article_id = db.Column(db.Integer, nullable=False)
    interaction_type = db.Column(db.String(50), nullable=False) # 'pubmed_click', 'doi_click'
    timestamp = db.Column(db.DateTime, default=db.func.current_timestamp())

class EmailPreference(db.Model):
    # Users without a row get the weekly email (everyone is subscribed by default)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    weekly_digest = db.Column(db.Boolean, default=True, nullable=False)
    unsubscribe_token = db.Column(db.String(64), unique=True, nullable=False)
    updated_at = db.Column(db.DateTime, default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())

class WeeklyDigest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    week_key = db.Column(db.String(10), unique=True, nullable=False)  # date of the Saturday scan it covers, e.g. '2026-10-24': one email per scan
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending, sending, sent, skipped, expired
    created_at = db.Column(db.DateTime, nullable=False)  # UTC
    articles_json = db.Column(db.Text)  # the articles that were sent: [{id, title, journal}]
    decided_by = db.Column(db.String(120))
    decided_at = db.Column(db.DateTime)
    recipients_count = db.Column(db.Integer)
    send_error = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'week_key': self.week_key,
            'status': self.status,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'articles': json.loads(self.articles_json) if self.articles_json else [],
            'decided_by': self.decided_by,
            'decided_at': self.decided_at.isoformat() + 'Z' if self.decided_at else None,
            'recipients_count': self.recipients_count,
            'send_error': self.send_error,
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
    try:
        # Handle JSON parsing errors, especially for Safari
        try:
            data = request.get_json() or {}
        except Exception as json_error:
            print(f"JSON parsing error in /api/auth/register: {json_error}")
            return jsonify({'error': 'Invalid request format. Please try again.'}), 400
        
        if not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Check if user already exists
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'User already exists'}), 400
        
        # Create new user with hashed password
        email = data['email']
        if is_admin_email(email):
            role = 'admin'
        elif is_senior_email(email):
            role = 'senior'
        else:
            role = 'user'
        
        user = User(
            email=email,
            password_hash=generate_password_hash(data['password']),
            full_name=data.get('fullName', ''),
            role=role
        )
        db.session.add(user)
        db.session.commit()
        
        # Record login
        try:
            login_record = UserLoginHistory(user_id=user.id)
            db.session.add(login_record)
            db.session.commit()
        except Exception as e:
            print(f"Failed to record login history: {e}")
        
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
    except Exception as e:
        # Log server-side and return sanitized error
        print(f"/api/auth/register failed: {e}")
        db.session.rollback()
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/google', methods=['POST'])
def google_login():
    """Login/Register using Google ID token."""
    if not GOOGLE_AUTH_AVAILABLE:
        print("Google auth not available - libraries not installed")
        return jsonify({'error': 'Google auth not available on server. Please install google-auth library.'}), 503

    # Handle JSON parsing errors, especially for Safari
    try:
        data = request.get_json() or {}
    except Exception as json_error:
        print(f"JSON parsing error in /api/auth/google: {json_error}")
        return jsonify({'error': 'Invalid request format. Please try again.'}), 400
    
    token = data.get('idToken') or data.get('credential')
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    if not token:
        return jsonify({'error': 'Missing Google authentication token. Please try signing in again.'}), 400
    if not client_id:
        print("GOOGLE_CLIENT_ID environment variable is not set")
        return jsonify({'error': 'Server missing GOOGLE_CLIENT_ID environment variable'}), 500

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
            if is_admin_email(email):
                role = 'admin'
            elif is_senior_email(email):
                role = 'senior'
            else:
                role = 'user'
            
            user = User(
                email=email,
                password_hash='google-oauth',
                full_name=full_name,
                role=role,
            )
            db.session.add(user)
            db.session.commit()
        else:
            # Sync role with allowlist policy
            if is_admin_email(email):
                desired_role = 'admin'
            elif is_senior_email(email):
                desired_role = 'senior'
            else:
                desired_role = 'user'
            
            if user.role != desired_role:
                user.role = desired_role
                db.session.commit()

        access_token = create_access_token(identity=str(user.id))
        
        # Record login
        try:
            login_record = UserLoginHistory(user_id=user.id)
            db.session.add(login_record)
            db.session.commit()
        except Exception as e:
            print(f"Failed to record login history: {e}")

        return jsonify({
            'message': 'Login successful',
            'token': access_token,
            'user': user.to_dict(),
        })
    except Exception as e:
        print(f"/api/auth/google failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Google verification failed: {str(e)}'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login"""
    try:
        # Handle JSON parsing errors, especially for Safari
        try:
            data = request.get_json() or {}
        except Exception as json_error:
            print(f"JSON parsing error in /api/auth/login: {json_error}")
            return jsonify({'error': 'Invalid request format. Please try again.'}), 400
        
        if not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Email and password are required'}), 400
        
        user = User.query.filter_by(email=data['email']).first()
        if not user or not check_password_hash(user.password_hash, data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        # Optionally sync role with allowlist on login
        if is_admin_email(user.email):
            desired_role = 'admin'
        elif is_senior_email(user.email):
            desired_role = 'senior'
        else:
            desired_role = 'user'
        
        if user.role != desired_role:
            user.role = desired_role
            db.session.commit()
        
        access_token = create_access_token(identity=str(user.id))

        # Record login
        try:
            login_record = UserLoginHistory(user_id=user.id)
            db.session.add(login_record)
            db.session.commit()
        except Exception as e:
            print(f"Failed to record login history: {e}")

        return jsonify({
            'message': 'Login successful',
            'token': access_token,
            'user': {
                'id': user.id,
                'email': user.email,
                'fullName': user.full_name
            }
        })
    except Exception as e:
        print(f"/api/auth/login failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Login failed: {str(e)}'}), 500

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
        'fullName': user.full_name,
        'role': user.role,
    })

@app.route('/api/studies', methods=['GET'])
@jwt_required()
def get_studies():
    """Get all studies for the current user with impact factors from journal_impact_scores table"""
    user_id = get_jwt_identity()
    
    try:
        # Get studies from Flask database and enrich with impact factors from medical database
        studies = Study.query.filter_by(user_id=int(user_id)).all()
        
        # Try to get impact factors from journal_impact_scores if medical database is available
        conn = get_medical_connection()
        if conn:
            try:
                cursor = conn.cursor()
                journal_impact_map = {}
                
                # Get impact factors for all unique journals
                unique_journals = list(set([s.journal for s in studies if s.journal]))
                if unique_journals:
                    placeholders = ','.join(['?' for _ in unique_journals])
                    cursor.execute(f"""
                        SELECT journal_name, impact_factor 
                        FROM journal_impact_scores 
                        WHERE journal_name IN ({placeholders})
                    """, unique_journals)
                    for row in cursor.fetchall():
                        journal_impact_map[row[0].lower().strip()] = row[1]
                
                conn.close()
                
                # Enrich studies with journal impact factors
                result = []
                for study in studies:
                    study_dict = study.to_dict()
                    journal_key = study.journal.lower().strip() if study.journal else None
                    if journal_key and journal_key in journal_impact_map:
                        journal_impact = journal_impact_map[journal_key]
                        study_dict['impact_factor'] = journal_impact if journal_impact else study.impact_factor
                        study_dict['is_major_journal'] = study.is_major_journal or (journal_impact and journal_impact >= 25)
                    result.append(study_dict)
                
                return jsonify(result)
            except Exception as e:
                print(f"Error enriching studies with impact factors: {e}")
                conn.close()
        
        # Fallback: return studies without enrichment
        return jsonify([study.to_dict() for study in studies])
        
    except Exception as e:
        # Fallback to original query if there's an error
        print(f"Error getting studies: {e}")
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
        created_since_days = request.args.get('created_since_days', type=int)

        # Build ORDER BY clause
        if sort_by == 'ranking_score':
            order_clause = 'ORDER BY ec.ranking_score DESC, a.publication_date DESC'
        elif sort_by == 'publication_date':
            order_clause = 'ORDER BY a.publication_date DESC, ec.ranking_score DESC'
        elif sort_by == 'title':
            order_clause = 'ORDER BY a.title ASC'
        else:
            order_clause = 'ORDER BY ec.ranking_score DESC, a.publication_date DESC'

        # Check if we should exclude hidden articles (for dashboard)
        exclude_hidden = request.args.get('exclude_hidden', 'false').lower() == 'true'
        hidden_clause = 'AND (ec.hidden_from_dashboard IS NULL OR ec.hidden_from_dashboard = 0)' if exclude_hidden else ''

        # Restrict to articles added in the last N days (applied before LIMIT, so
        # recently-added articles aren't crowded out of the ranking cutoff by
        # older, higher-scoring articles accumulated over time)
        date_params = []
        date_clause = ''
        if created_since_days is not None and created_since_days > 0:
            since = datetime.utcnow() - timedelta(days=created_since_days)
            date_clause = 'AND a.created_at >= ?'
            date_params = [since.strftime('%Y-%m-%d %H:%M:%S')]

        # Get relevant articles with enhanced classification data
        query = f"""
            SELECT a.id, a.pmid, a.title, a.abstract, a.journal, a.authors,
                   a.publication_date, a.doi, a.url, a.medical_category, a.article_type, a.publication_type,
                   ec.ranking_score, ec.clinical_bottom_line, ec.tags, ec.participants,
                   ec.focus_points, ec.type_points, ec.prevalence_points,
                   ec.hospitalization_points, ec.impact_factor_points,
                   COALESCE(ec.hidden_from_dashboard, 0) as hidden_from_dashboard,
                   a.created_at
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1 {hidden_clause} {date_clause}
            {order_clause}
            LIMIT ? OFFSET ?
        """

        cursor.execute(query, (*date_params, limit, offset))
        articles = cursor.fetchall()

        # Get total count of relevant articles (respecting hidden and date filters)
        count_query = f"""
            SELECT COUNT(*)
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1 {hidden_clause} {date_clause}
        """
        cursor.execute(count_query, tuple(date_params))
        total_count = cursor.fetchone()[0]
        
        # Gather IDs to check key flags
        article_ids = [row[0] for row in articles]
        key_ids = set()
        if article_ids:
            try:
                key_records = KeyArticle.query.filter(KeyArticle.article_id.in_(article_ids)).all()
                key_ids = {r.article_id for r in key_records}
            except Exception as e:
                print(f"Warning: failed to load key article flags: {e}")

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
                'publication_type': article[11],
                'ranking_score': article[12],
                'clinical_bottom_line': article[13],
                'tags': article[14],
                'participants': article[15],
                'focus_points': article[16],
                'type_points': article[17],
                'prevalence_points': article[18],
                'hospitalization_points': article[19],
                'impact_factor_points': article[20],
                'is_key_study': article[0] in key_ids,
                'hidden_from_dashboard': bool(article[21]) if len(article) > 21 else False,
                'created_at': article[22] if len(article) > 22 else None
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

@app.route('/api/medical-articles/<int:article_id>/key', methods=['PUT'])
@jwt_required()
def set_article_key_flag(article_id: int):
    """Admin or Senior: set or clear key study flag for a medical article"""
    current_user_id = int(get_jwt_identity())
    current_user = User.query.get(current_user_id)
    if not current_user or current_user.role not in ['admin', 'senior']:
        return jsonify({'error': 'Admin or Senior access required'}), 403

    data = request.get_json() or {}
    is_key = bool(data.get('is_key_study'))

    try:
        record = KeyArticle.query.filter_by(article_id=article_id).first()
        if is_key:
            if not record:
                record = KeyArticle(article_id=article_id, created_by=current_user_id)
                db.session.add(record)
        else:
            if record:
                db.session.delete(record)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update key flag: {e}'}), 500

    return jsonify({'article_id': article_id, 'is_key_study': is_key})

@app.route('/api/medical-articles/<int:article_id>/hide-dashboard', methods=['PUT'])
@jwt_required()
def set_article_hidden_from_dashboard(article_id: int):
    """Admin or Senior: set or clear hidden_from_dashboard flag for a medical article"""
    current_user_id = int(get_jwt_identity())
    current_user = User.query.get(current_user_id)
    if not current_user or current_user.role not in ['admin', 'senior']:
        return jsonify({'error': 'Admin or Senior access required'}), 403

    data = request.get_json() or {}
    is_hidden = bool(data.get('hidden_from_dashboard'))

    if not medical_conn:
        return jsonify({'error': 'Medical articles database not available'}), 503
    
    try:
        conn = get_medical_connection()
        if not conn:
            return jsonify({'error': 'Medical articles database not available'}), 503
        cursor = conn.cursor()
        
        # Update the hidden_from_dashboard flag
        cursor.execute('''
            UPDATE enhanced_classifications
            SET hidden_from_dashboard = ?, updated_at = CURRENT_TIMESTAMP
            WHERE article_id = ?
        ''', (1 if is_hidden else 0, article_id))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Article not found or no classification record'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'article_id': article_id, 'hidden_from_dashboard': is_hidden})
        
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        return jsonify({'error': f'Failed to update hidden flag: {str(e)}'}), 500

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
        created_since_days = request.args.get('created_since_days', type=int)
        
        # Build query
        query = UserStudyStatus.query
        if created_by:
            query = query.filter_by(created_by=created_by)
        if created_since_days is not None and created_since_days > 0:
            since = datetime.utcnow() - timedelta(days=created_since_days)
            query = query.filter(UserStudyStatus.created_date >= since)
        
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
        article_id = data.get('article_id')
        status = data.get('status')
        
        # Either study_id or article_id must be provided
        if (not study_id and not article_id) or not status:
            return jsonify({'error': 'Either study_id or article_id, and status are required'}), 400

        record = UserStudyStatus(
            study_id=study_id,
            article_id=article_id,
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

# Article discussion comments
MAX_ARTICLE_COMMENT_LENGTH = 5000

def _article_comment_to_dict(comment, author_name, current_user):
    """Serialize an article comment for the current viewer"""
    return {
        'id': comment.id,
        'article_id': comment.article_id,
        'user_id': comment.user_id,
        'author_name': author_name or comment.created_by,
        'content': comment.content,
        # Stored in UTC; mark it so browsers convert to local time
        'created_date': comment.created_date.isoformat() + 'Z' if comment.created_date else None,
        'can_delete': comment.user_id == current_user.id or current_user.role == 'admin',
    }

@app.route('/api/medical-articles/<int:article_id>/comments', methods=['GET'])
@jwt_required()
def get_article_comments(article_id: int):
    """Get all comments on a medical article, oldest first"""
    current_user = User.query.get(int(get_jwt_identity()))
    if not current_user:
        return jsonify({'error': 'User not found'}), 404
    try:
        rows = (
            db.session.query(ArticleComment, User.full_name)
            .outerjoin(User, User.id == ArticleComment.user_id)
            .filter(ArticleComment.article_id == article_id)
            .order_by(ArticleComment.created_date.asc(), ArticleComment.id.asc())
            .all()
        )
        return jsonify([_article_comment_to_dict(c, name, current_user) for c, name in rows])
    except Exception as e:
        return jsonify({'error': f'Failed to get comments: {str(e)}'}), 500

@app.route('/api/medical-articles/<int:article_id>/comments', methods=['POST'])
@jwt_required()
def create_article_comment(article_id: int):
    """Add a comment to a medical article"""
    current_user = User.query.get(int(get_jwt_identity()))
    if not current_user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'Comment cannot be empty'}), 400
    if len(content) > MAX_ARTICLE_COMMENT_LENGTH:
        return jsonify({'error': f'Comment is too long (max {MAX_ARTICLE_COMMENT_LENGTH} characters)'}), 400

    try:
        comment = ArticleComment(
            article_id=article_id,
            user_id=current_user.id,
            content=content,
            created_by=current_user.email,
            created_date=datetime.utcnow(),
        )
        db.session.add(comment)
        db.session.commit()
        return jsonify(_article_comment_to_dict(comment, current_user.full_name, current_user)), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to add comment: {str(e)}'}), 500

@app.route('/api/article-comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_article_comment(comment_id: int):
    """Delete a comment: its author or an admin"""
    current_user = User.query.get(int(get_jwt_identity()))
    if not current_user:
        return jsonify({'error': 'User not found'}), 404

    comment: Optional[ArticleComment] = ArticleComment.query.get(comment_id)
    if not comment:
        return jsonify({'error': 'Comment not found'}), 404
    if comment.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'error': 'You can only delete your own comments'}), 403

    try:
        db.session.delete(comment)
        db.session.commit()
        return jsonify({'message': 'Deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete comment: {str(e)}'}), 500

@app.route('/api/article-comments/counts', methods=['GET'])
@jwt_required()
def get_article_comment_counts():
    """Number of comments per article, as {article_id: count}"""
    try:
        rows = (
            db.session.query(ArticleComment.article_id, db.func.count(ArticleComment.id))
            .group_by(ArticleComment.article_id)
            .all()
        )
        return jsonify({str(article_id): count for article_id, count in rows})
    except Exception as e:
        return jsonify({'error': f'Failed to get comment counts: {str(e)}'}), 500

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

@app.route('/api/admin/users/promote', methods=['POST'])
@jwt_required()
def promote_user_to_admin():
    """Promote a user to admin (admin only). Body: { email }"""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)
        if not current_user or current_user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        data = request.get_json() or {}
        email = data.get('email')
        if not email:
            return jsonify({'error': 'email is required'}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        user.role = 'admin'
        db.session.commit()
        return jsonify({'message': 'User promoted', 'user': user.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to promote: {str(e)}'}), 500

@app.route('/api/admin/users/demote', methods=['POST'])
@jwt_required()
def demote_user_from_admin():
    """Demote an admin back to user (admin only). Body: { email }"""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)
        if not current_user or current_user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        data = request.get_json() or {}
        email = data.get('email')
        if not email:
            return jsonify({'error': 'email is required'}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        user.role = 'user'
        db.session.commit()
        return jsonify({'message': 'User demoted', 'user': user.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to demote: {str(e)}'}), 500

def _verify_cron_token():
    """Verify cron token from request header or query param."""
    cron_token = os.getenv('CRON_SECRET_TOKEN')
    if not cron_token:
        return False
    
    # Check header first (X-Cron-Token), then query param
    header_token = request.headers.get('X-Cron-Token')
    query_token = request.args.get('token')
    
    return header_token == cron_token or query_token == cron_token

@app.route('/api/admin/articles/fetch-weekly', methods=['POST'])
def fetch_weekly_articles():
    """
    Fetch and classify articles from the last 7 days.
    Can be accessed by:
    - Admin users with JWT token (for manual triggering)
    - External cron services with CRON_SECRET_TOKEN (for automated scheduling)
    """
    # Check authentication: either admin JWT or cron token
    is_admin = False
    is_cron = _verify_cron_token()
    
    # Try JWT auth if cron token not present
    if not is_cron:
        try:
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            current_user = User.query.get(int(user_id))
            is_admin = current_user and current_user.role == 'admin'
        except Exception:
            # JWT auth failed or not provided
            pass
    
    if not is_admin and not is_cron:
        return jsonify({'error': 'Admin access or valid cron token required'}), 403
    
    if not medical_articles_service:
        return jsonify({'error': 'Medical articles processing service not available'}), 503
    
    # Get optional parameters
    data = request.get_json() or {}
    email = data.get('email') or os.getenv('PUBMED_EMAIL')
    model_provider = data.get('model', 'claude')
    
    # Run processing in background thread to avoid timeouts
    def process_articles():
        try:
            logger = logging.getLogger(__name__)
            logger.info("Starting weekly article processing (background thread)")
            result = medical_articles_service.process_weekly_articles(
                email=email,
                model_provider=model_provider
            )
            if result.get('success'):
                logger.info(f"Weekly processing completed: {result.get('articles_stored', 0)} articles stored")
            else:
                logger.error(f"Weekly processing failed: {result.get('error', 'Unknown error')}")
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Error in background weekly processing: {e}")
    
    # Start background thread
    thread = threading.Thread(target=process_articles, daemon=True)
    thread.start()
    
    return jsonify({
        'message': 'Weekly article processing started in background',
        'status': 'processing',
        'note': 'Processing articles from the last 7 days. This may take several minutes.'
    }), 202

@app.route('/api/admin/articles/fetch-from-last-update', methods=['POST'])
def fetch_articles_from_last_update():
    """
    Fetch and classify articles from the last update date to today.
    Can be accessed by:
    - Admin users with JWT token (for manual triggering)
    - External cron services with CRON_SECRET_TOKEN (for automated scheduling)
    """
    # Check authentication: either admin JWT or cron token
    is_admin = False
    is_cron = _verify_cron_token()
    
    # Try JWT auth if cron token not present
    if not is_cron:
        try:
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            current_user = User.query.get(int(user_id))
            is_admin = current_user and current_user.role == 'admin'
        except Exception:
            # JWT auth failed or not provided
            pass
    
    if not is_admin and not is_cron:
        return jsonify({'error': 'Admin access or valid cron token required'}), 403
    
    if not medical_articles_service:
        return jsonify({'error': 'Medical articles processing service not available'}), 503
    
    # Get optional parameters
    data = request.get_json() or {}
    email = data.get('email') or os.getenv('PUBMED_EMAIL')
    model_provider = data.get('model', 'claude')
    
    # Run processing in background thread to avoid timeouts
    def process_articles():
        try:
            logger = logging.getLogger(__name__)
            logger.info("Starting article processing from last update (background thread)")
            result = medical_articles_service.process_articles_from_last_update(
                email=email,
                model_provider=model_provider
            )
            if result.get('success'):
                logger.info(f"Processing from last update completed: {result.get('articles_stored', 0)} articles stored")
            else:
                logger.error(f"Processing from last update failed: {result.get('error', 'Unknown error')}")
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Error in background processing from last update: {e}")
    
    # Start background thread
    thread = threading.Thread(target=process_articles, daemon=True)
    thread.start()
    
    return jsonify({
        'message': 'Article processing from last update started in background',
        'status': 'processing',
        'note': 'Processing articles from the last update date to today. This may take several minutes.'
    }), 202

@app.route('/api/admin/articles/fetch-by-date', methods=['POST'])
@jwt_required()
def fetch_articles_by_date():
    """
    Fetch and classify articles from a specified date range.
    Admin-only endpoint that accepts start_date and end_date in YYYY/MM/DD format.
    """
    current_user_id = int(get_jwt_identity())
    current_user = User.query.get(current_user_id)
    if not current_user or current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
    
    if not medical_articles_service:
        return jsonify({'error': 'Medical articles processing service not available'}), 503
    
    # Get date range and optional parameters
    data = request.get_json() or {}
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date are required (format: YYYY/MM/DD)'}), 400
    
    # Validate date format
    try:
        from datetime import datetime
        datetime.strptime(start_date, '%Y/%m/%d')
        datetime.strptime(end_date, '%Y/%m/%d')
    except ValueError:
        return jsonify({'error': 'Invalid date format. Please use YYYY/MM/DD format (e.g., 2025/01/01)'}), 400
    
    # Validate date range
    start_dt = datetime.strptime(start_date, '%Y/%m/%d')
    end_dt = datetime.strptime(end_date, '%Y/%m/%d')
    
    if start_dt > end_dt:
        return jsonify({'error': 'Start date must be before or equal to end date'}), 400
    
    if (end_dt - start_dt).days > 365:
        return jsonify({'error': 'Date range cannot exceed 365 days'}), 400
    
    email = data.get('email') or os.getenv('PUBMED_EMAIL')
    model_provider = data.get('model', 'claude')
    admin_email = current_user.email  # Get admin email for summary notification
    
    # Run processing in background thread to avoid timeouts
    def process_articles():
        try:
            logger = logging.getLogger(__name__)
            # Print to stdout for immediate visibility in terminal
            print(f"\n{'='*60}")
            print(f"🚀 Starting article processing for date range {start_date} to {end_date}")
            print(f"{'='*60}\n")
            logger.info(f"Starting article processing for date range {start_date} to {end_date} (background thread)")
            
            result = medical_articles_service.process_articles_by_date_range(
                start_date=start_date,
                end_date=end_date,
                email=email,
                model_provider=model_provider
            )
            
            if result.get('success'):
                print(f"\n✅ Processing completed!")
                print(f"   - Articles collected: {result.get('articles_collected', 0)}")
                print(f"   - Articles classified: {result.get('articles_classified', 0)}")
                print(f"   - Articles stored: {result.get('articles_stored', 0)}")
                print(f"{'='*60}\n")
                logger.info(f"Date range processing completed: {result.get('articles_stored', 0)} articles stored")
            else:
                error_msg = result.get('error', 'Unknown error')
                print(f"\n❌ Processing failed: {error_msg}\n")
                logger.error(f"Date range processing failed: {error_msg}")
            
            # Send summary email to admin
            try:
                from utils.email_sender import send_summary_email
                subject = f"PubMed Article Processing Complete: {start_date} to {end_date}"
                send_summary_email(
                    to_email=admin_email,
                    subject=subject,
                    summary_data=result,
                    start_date=start_date,
                    end_date=end_date
                )
            except ImportError:
                logger.warning("Email sender module not found. Skipping email notification.")
            except Exception as email_error:
                logger.error(f"Failed to send summary email: {email_error}", exc_info=True)
                
        except Exception as e:
            logger = logging.getLogger(__name__)
            print(f"\n❌ Error in background date range processing: {e}\n")
            logger.error(f"Error in background date range processing: {e}", exc_info=True)
            
            # Try to send error notification email
            try:
                from utils.email_sender import send_summary_email
                error_result = {
                    'success': False,
                    'error': str(e)
                }
                subject = f"PubMed Article Processing Failed: {start_date} to {end_date}"
                send_summary_email(
                    to_email=admin_email,
                    subject=subject,
                    summary_data=error_result,
                    start_date=start_date,
                    end_date=end_date
                )
            except Exception:
                pass  # Don't fail if email sending fails
    
    # Start background thread
    thread = threading.Thread(target=process_articles, daemon=True)
    thread.start()
    
    return jsonify({
        'message': f'Article processing started in background for date range {start_date} to {end_date}',
        'status': 'processing',
        'start_date': start_date,
        'end_date': end_date,
        'note': 'Processing articles from the specified date range. This may take several minutes.'
    }), 202

@app.route('/api/admin/articles/add-single', methods=['POST'])
@jwt_required()
def add_single_article():
    """Add a single article by PubMed URL or ID, force relevant, classify, save, and mark as key study."""
    current_user_id = int(get_jwt_identity())
    current_user = User.query.get(current_user_id)
    if not current_user or current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403

    data = request.get_json() or {}
    url_or_id = data.get('url')
    
    if not url_or_id:
        return jsonify({'error': 'URL or PMID is required'}), 400
        
    if not medical_articles_service:
        return jsonify({'error': 'Service not available'}), 503
        
    # Process article
    result = medical_articles_service.process_single_article(url_or_id)
    
    if not result.get('success'):
        return jsonify({'error': result.get('error', 'Unknown error')}), 400
        
    article = result['article']
    article_id = None
    
    # Get the ID of the inserted article from medical db
    try:
        conn = get_medical_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM articles WHERE pmid = ?", (article['pmid'],))
        row = cursor.fetchone()
        if row:
            article_id = row[0]
        conn.close()
    except Exception as e:
        return jsonify({'error': f'Database error: {e}'}), 500
        
    if not article_id:
         return jsonify({'error': 'Failed to retrieve saved article ID'}), 500
         
    # Mark as key study
    try:
        # Check if already key study
        key_record = KeyArticle.query.filter_by(article_id=article_id).first()
        if not key_record:
            key_record = KeyArticle(article_id=article_id, created_by=current_user_id)
            db.session.add(key_record)
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Don't fail the whole request if key study marking fails, but log it
        print(f"Failed to mark as key study: {e}")
        
    return jsonify({
        'message': 'Article added successfully',
        'article': article
    })

@app.route('/api/medical-articles/<int:article_id>/track-click', methods=['POST'])
@jwt_required()
def track_article_click(article_id):
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json() or {}
        interaction_type = data.get('type', 'unknown_click')
        
        interaction = ArticleInteraction(
            user_id=user_id,
            article_id=article_id,
            interaction_type=interaction_type
        )
        db.session.add(interaction)
        db.session.commit()
        return jsonify({'status': 'recorded'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/system-stats', methods=['GET'])
@jwt_required()
def get_admin_system_stats():
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user or user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        from datetime import datetime
        # Calculate date for last 7 days
        seven_days_ago = datetime.now() - timedelta(days=7)
        
        # 1. Users defined by login (distinct users)
        # Total
        total_distinct_users = db.session.query(db.func.count(db.distinct(UserLoginHistory.user_id))).scalar()
        # Last 7 days
        recent_distinct_users = db.session.query(db.func.count(db.distinct(UserLoginHistory.user_id)))\
            .filter(UserLoginHistory.login_timestamp >= seven_days_ago).scalar()
            
        # 2. Logins (not distinct)
        total_logins = UserLoginHistory.query.count()
        recent_logins = UserLoginHistory.query.filter(UserLoginHistory.login_timestamp >= seven_days_ago).count()
        
        # 3. Articles added (from medical_articles.db)
        conn = get_medical_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM articles")
        total_articles = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM articles WHERE created_at >= date('now', '-7 days')")
        recent_articles = cursor.fetchone()[0]
        
        conn.close()
        
        # 4. Articles marked as read (UserStudyStatus)
        total_read = UserStudyStatus.query.filter_by(status='read').count()
        recent_read = UserStudyStatus.query.filter_by(status='read').filter(UserStudyStatus.created_date >= seven_days_ago).count()
        
        # 5. Article clicks
        total_clicks = ArticleInteraction.query.count()
        recent_clicks = ArticleInteraction.query.filter(ArticleInteraction.timestamp >= seven_days_ago).count()
        
        return jsonify({
            'total': {
                'distinct_users': total_distinct_users or 0,
                'logins': total_logins or 0,
                'articles_added': total_articles or 0,
                'articles_read': total_read or 0,
                'article_clicks': total_clicks or 0
            },
            'last_7_days': {
                'distinct_users': recent_distinct_users or 0,
                'logins': recent_logins or 0,
                'articles_added': recent_articles or 0,
                'articles_read': recent_read or 0,
                'article_clicks': recent_clicks or 0
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ---- Weekly "top 3" email ----

APP_URL = vercel_frontend.rstrip('/')
BACKEND_URL = os.getenv('BACKEND_URL', 'https://medicaldash-backend.onrender.com').rstrip('/')
DIGEST_MAX_ARTICLES = 3
BERLIN = pytz.timezone('Europe/Berlin')

def _current_week_key():
    """The Saturday scan the email belongs to: the most recent Saturday from 12:00 Berlin time, e.g. '2026-10-24'."""
    shifted = datetime.now(BERLIN) - timedelta(hours=12)
    return (shifted.date() - timedelta(days=(shifted.weekday() - 5) % 7)).isoformat()

def _week_start_utc(week_key):
    """This week's articles are those added since the start of the scan's Saturday (Berlin time)."""
    saturday = BERLIN.localize(datetime.strptime(week_key, '%Y-%m-%d'))
    return saturday.astimezone(pytz.utc).replace(tzinfo=None)

def _get_email_preference(user_id):
    pref = EmailPreference.query.filter_by(user_id=user_id).first()
    if not pref:
        pref = EmailPreference(user_id=user_id, weekly_digest=True, unsubscribe_token=secrets.token_urlsafe(24))
        db.session.add(pref)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            pref = EmailPreference.query.filter_by(user_id=user_id).first()
    return pref

def _digest_recipient_users():
    """Every user who hasn't unsubscribed from the weekly email."""
    opted_out = {p.user_id for p in EmailPreference.query.filter_by(weekly_digest=False).all()}
    return [u for u in User.query.order_by(User.id).all() if u.id not in opted_out]

def _week_articles(since):
    """Articles added since `since`, in dashboard order (key studies first, then by score).
    Same filters as the dashboard: relevant, not hidden, no case reports."""
    conn = get_medical_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.title, a.journal, a.article_type, a.publication_type,
                   ec.ranking_score, a.pmid, a.url
            FROM articles a
            JOIN enhanced_classifications ec ON a.id = ec.article_id
            WHERE ec.is_relevant = 1
              AND (ec.hidden_from_dashboard IS NULL OR ec.hidden_from_dashboard = 0)
              AND a.created_at >= ?
            ORDER BY ec.ranking_score DESC, a.publication_date DESC
        """, (since.strftime('%Y-%m-%d %H:%M:%S'),))
        rows = cursor.fetchall()
    finally:
        conn.close()

    ids = [row[0] for row in rows]
    key_ids = {r.article_id for r in KeyArticle.query.filter(KeyArticle.article_id.in_(ids)).all()} if ids else set()
    articles = []
    for article_id, title, journal, article_type, publication_type, score, pmid, url in rows:
        if 'case report' in (article_type or publication_type or '').lower():
            continue
        articles.append({
            'id': article_id,
            'title': title,
            'journal': journal,
            'ranking_score': score,
            'is_key_study': article_id in key_ids,
            'url': url or (f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None),
        })
    # Stable sort: keeps score order within key and non-key groups
    articles.sort(key=lambda a: not a['is_key_study'])
    return articles

def _digest_week_articles(digest):
    return _week_articles(_week_start_utc(digest.week_key))

def _chosen_digest_articles(digest, article_ids):
    """Validate the admin's chosen articles against this week's list. Returns (articles, error)."""
    if not isinstance(article_ids, list) or not 1 <= len(article_ids) <= DIGEST_MAX_ARTICLES:
        return None, f'Choose between 1 and {DIGEST_MAX_ARTICLES} articles.'
    try:
        ids = [int(i) for i in article_ids]
    except (TypeError, ValueError):
        return None, 'Invalid article list.'
    week = {a['id']: a for a in _digest_week_articles(digest)}
    if len(set(ids)) != len(ids) or any(i not in week for i in ids):
        return None, "Some of the chosen articles aren't in this week's list anymore. Reload the page and try again."
    return [week[i] for i in ids], None

def _digest_email_for(user, articles):
    pref = _get_email_preference(user.id)
    email = build_digest_email(
        articles,
        recipient_email=user.email,
        dashboard_url=f"{APP_URL}/Dashboard",
        unsubscribe_url=f"{APP_URL}/unsubscribe?token={pref.unsubscribe_token}",
    )
    email['to'] = user.email
    # Lets mail apps (Gmail, Apple Mail) show their own one-click "Unsubscribe" button
    email['headers'] = {
        'List-Unsubscribe': f"<{BACKEND_URL}/api/email/unsubscribe?token={pref.unsubscribe_token}>",
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
    return email

def prepare_weekly_digest(notify_admins=True):
    """
    Create this week's email as 'pending' and, if notify_admins, email the admins asking them to approve it.
    Nothing reaches users until an admin approves on the Weekly Email page. Returns (digest or None, message).
    """
    now = datetime.utcnow()
    week_key = _current_week_key()

    digest = WeeklyDigest.query.filter_by(week_key=week_key).first()
    if digest and digest.status in ('sent', 'sending'):
        return digest, "This week's email has already been sent."
    if digest and digest.status == 'pending' and now - digest.created_at < timedelta(hours=3):
        # Prepared moments ago (each server worker runs the Saturday job)
        return digest, "This week's email is already waiting for approval."

    articles = _week_articles(_week_start_utc(week_key))
    if not articles:
        return None, "No new articles since Saturday's scan, so there's nothing to send."

    if digest:
        # Re-open a skipped email, or re-send the approval request for an older pending one
        digest.status = 'pending'
        digest.created_at = now
        digest.decided_by = None
        digest.decided_at = None
        digest.send_error = None
    else:
        digest = WeeklyDigest(week_key=week_key, status='pending', created_at=now)
        db.session.add(digest)
    # Only the newest scan's email can be approved
    WeeklyDigest.query.filter(WeeklyDigest.status == 'pending', WeeklyDigest.week_key != week_key)\
        .update({'status': 'expired', 'decided_at': now}, synchronize_session=False)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return WeeklyDigest.query.filter_by(week_key=week_key).first(), "This week's email is already waiting for approval."

    if notify_admins and ADMIN_EMAILS:
        email = build_approval_email(
            suggested=articles[:DIGEST_MAX_ARTICLES],
            all_articles=articles,
            recipients_count=len(_digest_recipient_users()),
            review_url=f"{APP_URL}/WeeklyEmail",
        )
        send_emails([{**email, 'to': admin_email} for admin_email in sorted(ADMIN_EMAILS)])
    return digest, None

def _deliver_weekly_digest(digest_id, articles):
    """Send the approved email to every subscriber (runs in a background thread)."""
    with app.app_context():
        task_logger = logging.getLogger(__name__)
        digest = WeeklyDigest.query.get(digest_id)
        try:
            messages = [_digest_email_for(user, articles) for user in _digest_recipient_users()]
            sent = send_emails(messages)
        except Exception as e:
            task_logger.error(f"Weekly email failed: {e}", exc_info=True)
            sent, messages = 0, []
        if sent:
            digest.status = 'sent'
            digest.recipients_count = sent
            if sent < len(messages):
                digest.send_error = f"Sent to {sent} of {len(messages)} users; the rest failed."
        else:
            # Nothing went out: let an admin try again
            digest.status = 'pending'
            digest.send_error = "Sending failed, so nothing was sent. Try again, or ask Ariel to check the email settings."
        db.session.commit()
        task_logger.info(f"Weekly email {digest.week_key}: sent to {sent} user(s)")

def _current_admin():
    user = User.query.get(int(get_jwt_identity()))
    return user if user and user.role == 'admin' else None

@app.route('/api/email-preferences', methods=['GET'])
@jwt_required()
def get_email_preferences():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    pref = EmailPreference.query.filter_by(user_id=user.id).first()
    return jsonify({'email': user.email, 'weekly_digest': pref.weekly_digest if pref else True})

@app.route('/api/email-preferences', methods=['PUT'])
@jwt_required()
def update_email_preferences():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    data = request.get_json() or {}
    pref = _get_email_preference(user.id)
    pref.weekly_digest = bool(data.get('weekly_digest'))
    db.session.commit()
    return jsonify({'email': user.email, 'weekly_digest': pref.weekly_digest})

def _preference_from_token():
    token = request.args.get('token') or (request.get_json(silent=True) or {}).get('token')
    return EmailPreference.query.filter_by(unsubscribe_token=token).first() if token else None

@app.route('/api/email/unsubscribe', methods=['GET'])
def get_unsubscribe_info():
    """For the unsubscribe page: whose link this is and whether they're subscribed. No login needed."""
    pref = _preference_from_token()
    if not pref:
        return jsonify({'error': 'This link is no longer valid.'}), 404
    user = User.query.get(pref.user_id)
    return jsonify({'email': user.email if user else None, 'weekly_digest': pref.weekly_digest})

@app.route('/api/email/unsubscribe', methods=['POST'])
def unsubscribe_with_token():
    """Turn the weekly email off ({"subscribe": true} turns it back on). Also serves mail apps' one-click unsubscribe."""
    pref = _preference_from_token()
    if not pref:
        return jsonify({'error': 'This link is no longer valid.'}), 404
    data = request.get_json(silent=True) or {}
    pref.weekly_digest = bool(data.get('subscribe', False))
    db.session.commit()
    return jsonify({'weekly_digest': pref.weekly_digest})

@app.route('/api/admin/weekly-digest', methods=['GET'])
@jwt_required()
def get_weekly_digest():
    if not _current_admin():
        return jsonify({'error': 'Admin access required'}), 403
    try:
        digest = WeeklyDigest.query.filter(WeeklyDigest.status.in_(['pending', 'sending']))\
            .order_by(WeeklyDigest.created_at.desc()).first()
        articles = _digest_week_articles(digest) if digest else []
        history = WeeklyDigest.query.filter(WeeklyDigest.status.in_(['sent', 'skipped', 'expired']))\
            .order_by(WeeklyDigest.created_at.desc()).limit(8).all()
        this_week = WeeklyDigest.query.filter_by(week_key=_current_week_key()).first()
        return jsonify({
            'digest': digest.to_dict() if digest else None,
            'this_week': this_week.to_dict() if this_week else None,
            'articles': articles,
            'suggested_ids': [a['id'] for a in articles[:DIGEST_MAX_ARTICLES]],
            'max_articles': DIGEST_MAX_ARTICLES,
            'recipients_count': len(_digest_recipient_users()),
            'history': [d.to_dict() for d in history],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/weekly-digest/prepare', methods=['POST'])
@jwt_required()
def prepare_weekly_digest_now():
    """Prepare this week's email by hand (e.g. if the Saturday job didn't run). Doesn't email the admins."""
    if not _current_admin():
        return jsonify({'error': 'Admin access required'}), 403
    digest, message = prepare_weekly_digest(notify_admins=False)
    if not digest or digest.status != 'pending':
        return jsonify({'error': message}), 409
    return jsonify({'digest': digest.to_dict(), 'message': message})

@app.route('/api/admin/weekly-digest/<int:digest_id>/preview', methods=['POST'])
@jwt_required()
def preview_weekly_digest(digest_id):
    admin = _current_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    digest = WeeklyDigest.query.get_or_404(digest_id)
    articles, error = _chosen_digest_articles(digest, (request.get_json() or {}).get('article_ids'))
    if error:
        return jsonify({'error': error}), 400
    email = build_digest_email(articles, admin.email, f"{APP_URL}/Dashboard", '#')
    return jsonify({'subject': email['subject'], 'html': email['html']})

@app.route('/api/admin/weekly-digest/<int:digest_id>/test', methods=['POST'])
@jwt_required()
def send_weekly_digest_test(digest_id):
    """Send the email, exactly as users will get it, to the admin who clicked."""
    admin = _current_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    digest = WeeklyDigest.query.get_or_404(digest_id)
    articles, error = _chosen_digest_articles(digest, (request.get_json() or {}).get('article_ids'))
    if error:
        return jsonify({'error': error}), 400
    email = _digest_email_for(admin, articles)
    email['subject'] = f"[Test] {email['subject']}"
    if not send_emails([email]):
        return jsonify({'error': "Couldn't send the test email. Ask Ariel to check the email settings."}), 500
    return jsonify({'sent_to': admin.email})

@app.route('/api/admin/weekly-digest/<int:digest_id>/send', methods=['POST'])
@jwt_required()
def send_weekly_digest(digest_id):
    admin = _current_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    digest = WeeklyDigest.query.get_or_404(digest_id)
    if digest.status != 'pending':
        return jsonify({'error': f'This email was already {digest.status}.'}), 409
    articles, error = _chosen_digest_articles(digest, (request.get_json() or {}).get('article_ids'))
    if error:
        return jsonify({'error': error}), 400

    # Claim it in one step so a double click or a second admin can't send it twice
    claimed = WeeklyDigest.query.filter_by(id=digest_id, status='pending').update({
        'status': 'sending',
        'decided_by': admin.email,
        'decided_at': datetime.utcnow(),
        'articles_json': json.dumps([{'id': a['id'], 'title': a['title'], 'journal': a['journal']} for a in articles]),
        'send_error': None,
    }, synchronize_session=False)
    db.session.commit()
    if not claimed:
        return jsonify({'error': 'This email is already being sent.'}), 409

    threading.Thread(target=_deliver_weekly_digest, args=(digest_id, articles), daemon=True).start()
    return jsonify({'status': 'sending', 'recipients_count': len(_digest_recipient_users())}), 202

@app.route('/api/admin/weekly-digest/<int:digest_id>/skip', methods=['POST'])
@jwt_required()
def skip_weekly_digest(digest_id):
    admin = _current_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    skipped = WeeklyDigest.query.filter_by(id=digest_id, status='pending').update({
        'status': 'skipped',
        'decided_by': admin.email,
        'decided_at': datetime.utcnow(),
    }, synchronize_session=False)
    db.session.commit()
    if not skipped:
        return jsonify({'error': 'This email is no longer waiting for approval.'}), 409
    return jsonify({'status': 'skipped'})

# Ensure database tables exist at import time for production servers (gunicorn)
try:
    with app.app_context():
        db.create_all()
        # Ensure role column (SQLite) and optional auto-admin promotion
        try:
            db.session.execute("ALTER TABLE user ADD COLUMN role VARCHAR(50) DEFAULT 'user'")
            db.session.commit()
        except Exception:
            db.session.rollback()
        # Migrate UserStudyStatus to support article_id
        try:
            # Check if article_id column exists using text() for PRAGMA
            result = db.session.execute(text("PRAGMA table_info(user_study_status)"))
            columns = [row[1] for row in result]
            if 'article_id' not in columns:
                # SQLite allows adding nullable columns
                db.session.execute(text("ALTER TABLE user_study_status ADD COLUMN article_id INTEGER"))
                db.session.commit()
                print("Added article_id column to user_study_status table")
            else:
                print("article_id column already exists in user_study_status table")
            # Make study_id nullable if it's not already (SQLite limitation - can't modify constraints easily)
            # This will be handled by create_all() on new tables
        except Exception as e:
            db.session.rollback()
            print(f"Warning: UserStudyStatus migration failed: {e}")
        # Sync admin roles
        if ADMIN_EMAILS:
            for admin_email in ADMIN_EMAILS:
                u = User.query.filter_by(email=admin_email).first()
                if u and u.role != 'admin':
                    u.role = 'admin'
                    db.session.commit()
        
        # Sync senior roles
        if SENIOR_EMAILS:
            for senior_email in SENIOR_EMAILS:
                u = User.query.filter_by(email=senior_email).first()
                if u and u.role != 'senior':
                    u.role = 'senior'
                    db.session.commit()
except Exception as e:
    print(f"Warning: database initialization failed at import time: {e}")

# Setup scheduled task for automatic article fetching
def scheduled_fetch_articles():
    """Scheduled task to fetch articles from last update date."""
    task_logger = logging.getLogger(__name__)
    
    if not medical_articles_service:
        task_logger.warning("Medical articles service not available for scheduled task")
        return
    
    try:
        task_logger.info("="*60)
        task_logger.info("STARTING SCHEDULED ARTICLE FETCH (Every Saturday 12:00 GMT+2)")
        task_logger.info("="*60)
        
        # Get optional parameters from environment
        email = os.getenv('PUBMED_EMAIL')
        model_provider = os.getenv('MODEL_PROVIDER', 'claude')
        
        # Process articles from last update
        result = medical_articles_service.process_articles_from_last_update(
            email=email,
            model_provider=model_provider
        )
        
        # Get date range from result (for email notification)
        start_date = result.get('start_date', 'N/A')
        end_date = result.get('end_date', 'N/A')
        
        if result.get('success'):
            task_logger.info("="*60)
            task_logger.info("SCHEDULED ARTICLE FETCH COMPLETED SUCCESSFULLY")
            task_logger.info(f"Articles collected: {result.get('articles_collected', 0)}")
            task_logger.info(f"Articles classified: {result.get('articles_classified', 0)}")
            task_logger.info(f"Articles stored: {result.get('articles_stored', 0)}")
            task_logger.info("="*60)
            
            # Send summary email to all admins
            if ADMIN_EMAILS:
                try:
                    from utils.email_sender import send_summary_email
                    subject = f"📅 Scheduled Article Processing Complete: {start_date} to {end_date}"
                    
                    # Send email to each admin
                    emails_sent = 0
                    for admin_email in ADMIN_EMAILS:
                        try:
                            success = send_summary_email(
                                to_email=admin_email,
                                subject=subject,
                                summary_data=result,
                                start_date=start_date,
                                end_date=end_date
                            )
                            if success:
                                emails_sent += 1
                                task_logger.info(f"✅ Summary email sent to {admin_email}")
                            else:
                                task_logger.warning(f"⚠️ Failed to send email to {admin_email}")
                        except Exception as email_error:
                            task_logger.error(f"Error sending email to {admin_email}: {email_error}", exc_info=True)
                    
                    if emails_sent > 0:
                        task_logger.info(f"📧 Summary emails sent to {emails_sent}/{len(ADMIN_EMAILS)} admin(s)")
                    else:
                        task_logger.warning("⚠️ No summary emails were sent successfully")
                except ImportError:
                    task_logger.warning("Email sender module not found. Skipping email notification.")
                except Exception as email_error:
                    task_logger.error(f"Failed to send summary emails: {email_error}", exc_info=True)
            else:
                task_logger.warning("No admin emails configured. Skipping email notification.")

            # Prepare the weekly "top 3" email; it waits for an admin to approve it
            try:
                with app.app_context():
                    _, message = prepare_weekly_digest()
                task_logger.info(f"📬 Weekly email: {message or 'waiting for admin approval'}")
            except Exception as digest_error:
                task_logger.error(f"Failed to prepare weekly email: {digest_error}", exc_info=True)
        else:
            task_logger.error(f"Scheduled article fetch failed: {result.get('error', 'Unknown error')}")
            
            # Send error notification email to all admins
            if ADMIN_EMAILS:
                try:
                    from utils.email_sender import send_summary_email
                    subject = f"❌ Scheduled Article Processing Failed: {start_date} to {end_date}"
                    
                    # Send error email to each admin
                    for admin_email in ADMIN_EMAILS:
                        try:
                            send_summary_email(
                                to_email=admin_email,
                                subject=subject,
                                summary_data=result,
                                start_date=start_date,
                                end_date=end_date
                            )
                            task_logger.info(f"Error notification email sent to {admin_email}")
                        except Exception as email_error:
                            task_logger.error(f"Error sending error notification to {admin_email}: {email_error}")
                except Exception:
                    pass  # Don't fail if email sending fails
            
    except Exception as e:
        task_logger.error(f"Error in scheduled article fetch: {e}", exc_info=True)
        
        # Try to send error notification email to all admins
        if ADMIN_EMAILS:
            try:
                from utils.email_sender import send_summary_email
                error_result = {
                    'success': False,
                    'error': str(e)
                }
                subject = "❌ Scheduled Article Processing Error"
                
                for admin_email in ADMIN_EMAILS:
                    try:
                        send_summary_email(
                            to_email=admin_email,
                            subject=subject,
                            summary_data=error_result,
                            start_date='N/A',
                            end_date='N/A'
                        )
                    except Exception:
                        pass  # Don't fail if email sending fails
            except Exception:
                pass  # Don't fail if email sending fails

# Initialize scheduler
scheduler = BackgroundScheduler(timezone=pytz.timezone('Europe/Berlin'))  # GMT+2 (CEST) / GMT+1 (CET)
# Schedule task to run every Saturday at 12:00 (GMT+2)
scheduler.add_job(
    func=scheduled_fetch_articles,
    trigger=CronTrigger(day_of_week='sat', hour=12, minute=0),
    id='weekly_article_fetch',
    name='Weekly Article Fetch - Saturday 12:00 GMT+2',
    replace_existing=True
)

# Start scheduler
try:
    scheduler.start()
    logging.info("✅ Scheduler started successfully")
    logging.info("📅 Scheduled task: Every Saturday at 12:00 GMT+2 (Europe/Berlin timezone)")
except Exception as e:
    logging.error(f"Failed to start scheduler: {e}")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)
