# Medical Dashboard

A modern medical dashboard built with React frontend and Python Flask backend, featuring a clean and intuitive interface for managing medical studies and research data with AI-powered article processing.

## Features

- **Study Management**: Add, view, and manage medical studies
- **User Authentication**: Secure login and user management
- **AI Integration**: Medical article classification and processing
- **PubMed Integration**: Automated article collection from PubMed
- **Comments System**: Discuss studies with colleagues
- **Reading Status**: Track which studies you've read, bookmarked, or dismissed
- **Admin Dashboard**: Administrative tools for managing users and content

## Tech Stack

### Frontend
- **Framework**: React 18, Vite, TypeScript
- **UI Components**: Radix UI, Tailwind CSS
- **Routing**: React Router
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts
- **Icons**: Lucide React

### Backend
- **Framework**: Python Flask
- **Database**: SQLAlchemy with SQLite
- **Authentication**: JWT tokens
- **AI Integration**: Custom medical articles library
- **API**: RESTful API with CORS support

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- Python 3.8 or higher
- pip (Python package manager)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install Node.js dependencies
   npm install
   
   # Install Python dependencies
   pip install -r requirements.txt
   ```

3. Initialize the database:
   ```bash
   npm run backend:init
   ```

4. Start both frontend and backend:
   ```bash
   npm run dev:full
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser


## Available Scripts

### Frontend
- `npm run dev` - Start frontend development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Backend
- `npm run backend` - Start Python Flask backend
- `npm run backend:init` - Initialize database
- `npm run dev:full` - Start both frontend and backend

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

### Medical Articles Library
- `POST /api/medical-articles/process` - Process an article
- `GET /api/medical-articles/search` - Search articles
- `POST /api/medical-articles/collect` - Collect recent articles
- `POST /api/medical-articles/classify` - Classify articles

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components
│   ├── api/                # API client
│   └── ...
├── backend/                # Python Flask backend
│   ├── app.py              # Main Flask application
│   ├── run.py              # Server runner
│   ├── medical_processing/ # Medical articles processing module
│   │   ├── classification/ # AI classification system
│   │   ├── data_collection/# PubMed integration
│   │   └── database/       # Database operations
│   ├── scripts/            # Utility scripts
│   ├── tests/              # Test scripts
│   └── README.md           # Backend documentation
├── requirements.txt        # Python dependencies
├── SETUP.md               # Detailed setup guide
└── DEPLOYMENT.md          # Deployment guide
```

## Medical Articles Processing

The backend includes an internal processing module providing:
- **ArticleDatabase** (SQLite operations)
- **MedicalArticleClassifier** (unified inclusion-based filtering and scoring)
- **PubMedClient** (PubMed collection)

Unified classification flow:
- `filter_article(...)` → `classify_article_enhanced(...)`

## Documentation

- [Setup Guide](SETUP.md) - Detailed setup instructions
- [Backend Documentation](backend/README.md) - Backend-specific documentation
- [Scripts Guide](backend/scripts/README.md) - How to run scoring/export/weekly scripts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.