# Backend Tests

This directory contains test scripts for the backend API and database functionality.

## Test Files

- **test_api.py** - Tests the medical articles API endpoints, including health checks, authentication, and article search functionality.

- **test_db.py** - Tests database connection and structure, explores the articles table, and verifies medical articles library integration.

- **test_single_reclassify.py** - Tests reclassifying a single article to verify database updates work correctly with the enhanced classification system.

## Running Tests

Make sure the backend server is running before executing API tests:

```bash
# Start the backend server
cd backend
python run.py

# In another terminal, run the tests
python tests/test_api.py
python tests/test_db.py
python tests/test_single_reclassify.py
```

## Documentation

- **FINAL_TEST.md** - Final testing documentation and procedures.

