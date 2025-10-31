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

Create a `.env` file with the following variables:

```
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=jwt-secret-string-change-in-production
DATABASE_URL=sqlite:///medical_articles.db
FLASK_ENV=development
FLASK_DEBUG=True
```

## Medical Articles Library

The backend integrates with your custom medical articles library located at:
`/Users/Ariel.Berger/Projects/medical_articles_lib`

This library provides:
- MedicalArticlesDB: Database operations for medical articles
- ArticleProcessor: Processing and analysis of medical articles
