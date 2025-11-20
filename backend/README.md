# Medical Dashboard Backend

This is the Python Flask backend for the Medical Dashboard application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Initialize the database:
```bash
cd backend
python run.py init-db
```

4. Run the development server:
```bash
python run.py
```

The server will start on `http://localhost:5000`


## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

### Studies
- `GET /api/studies` - Get all studies for current user
- `POST /api/studies` - Create a new study
- `PUT /api/studies/:id` - Update a study
- `DELETE /api/studies/:id` - Delete a study

### Medical Articles Library Integration
- `POST /api/medical-articles/process` - Process an article using the medical articles library
- `GET /api/medical-articles/search` - Search articles using the medical articles library

### Health Check
- `GET /api/health` - Health check endpoint

## Environment Variables

Create a `.env` file with the following variables (add at least one provider key):

```
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=jwt-secret-string-change-in-production
DATABASE_URL=sqlite:///medical_articles.db
FLASK_ENV=development
FLASK_DEBUG=True

# LLM providers (one is sufficient)
ANTHROPIC_API_KEY=your-anthropic-key
# or
GOOGLE_API_KEY=your-google-key
```

## Medical Articles Processing

The backend includes a built-in processing module at `backend/medical_processing/`:

- `classification/classifier.py` – Unified filtering and classification:
  - `filter_article(...)` – inclusion-based relevance filtering
  - `classify_article_enhanced(...)` – full scoring breakdown and summary
- `database/` – SQLite schema and operations
- `fetch_and_classify_by_date.py` / `fetch_and_classify_weekly.py` – collection + classification entry points

Classification uses Claude or Gemini automatically based on the available API key.
