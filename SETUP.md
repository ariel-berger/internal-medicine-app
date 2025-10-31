# Medical Dashboard Setup Guide

This guide will help you set up the Medical Dashboard with both the React frontend and Python backend.

## Prerequisites

- Node.js (v18 or higher)
- Python 3.8 or higher
- pip (Python package manager)

## Backend Setup (Python Flask)

### 1. Install Python Dependencies

```bash
# Install the medical articles library and other dependencies
pip install -r requirements.txt
```

### 2. Initialize Database

```bash
# Initialize the database tables
npm run backend:init
# OR
cd backend && python run.py init-db
```

### 3. Start Backend Server

```bash
# Start the Python Flask backend
npm run backend
# OR
cd backend && python run.py
```

The backend will be available at: `http://localhost:5001`

## Frontend Setup (React)

### 1. Install Node Dependencies

```bash
npm install
```

### 2. Start Frontend Development Server

```bash
# Start the React frontend
npm run dev
```

The frontend will be available at: `http://localhost:5173`

## Running Both Together

### Option 1: Use the Combined Script

```bash
# Start both frontend and backend simultaneously
npm run dev:full
```

### Option 2: Run Separately

Terminal 1 (Backend):
```bash
npm run backend
```

Terminal 2 (Frontend):
```bash
npm run dev
```

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
- `POST /api/medical-articles/process` - Process an article
- `GET /api/medical-articles/search` - Search articles
- `POST /api/medical-articles/collect` - Collect recent articles
- `POST /api/medical-articles/classify` - Classify articles

### Health Check
- `GET /api/health` - Health check endpoint

## Testing the Setup

### 1. Test Backend Health

```bash
curl http://localhost:5001/api/health
```

Expected response:
```json
{
    "status": "healthy",
    "medical_lib_available": true,
    "components": {
        "database": true,
        "classifier": true,
        "pubmed_client": true
    }
}
```

### 2. Test User Registration

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass","fullName":"Test User"}'
```

### 3. Test Frontend Connection

1. Open `http://localhost:5173` in your browser
2. Try to register/login
3. Check browser developer tools for any API errors

## Medical Articles Library Integration

The backend integrates with your custom medical articles library located at:
`/Users/Ariel.Berger/Projects/medical_articles_lib`

This library provides:
- **ArticleDatabase**: Database operations for medical articles
- **MedicalArticleClassifier**: AI-powered article classification
- **PubMedClient**: PubMed API integration for article collection

## Troubleshooting

### Port 5000 Already in Use
If you get an error about port 5000 being in use (common on macOS due to AirPlay):
- The backend is configured to use port 5001 instead
- Make sure your frontend is configured to connect to `http://localhost:5001/api`

### Medical Articles Library Not Found
If you see warnings about the medical articles library:
1. Ensure the library is installed: `pip install -e /Users/Ariel.Berger/Projects/medical_articles_lib`
2. Check that the library path is correct in your environment

### Database Issues
If you encounter database errors:
1. Delete the existing database file: `rm medical_articles.db`
2. Reinitialize: `npm run backend:init`

## Development Workflow

1. **Backend Development**: Make changes to files in the `backend/` directory
2. **Frontend Development**: Make changes to files in the `src/` directory
3. **API Integration**: Update both frontend API calls and backend endpoints as needed
4. **Testing**: Use the health check endpoint and test user registration to verify connectivity

## Environment Variables

Create a `.env` file in the backend directory with:

```env
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=jwt-secret-string-change-in-production
DATABASE_URL=sqlite:///medical_articles.db
FLASK_ENV=development
FLASK_DEBUG=True
```
