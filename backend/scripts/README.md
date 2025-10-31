# Utility Scripts

This directory contains utility scripts for managing the medical articles database and processing.

## Scripts

- **reclassify_relevant_articles.py** - Reclassifies and re-scores relevant articles with complete abstracts using Claude Sonnet 4.5. This script updates existing article classifications in the database.

## Usage

```bash
# Reclassify all relevant articles
cd backend
python scripts/reclassify_relevant_articles.py
```

## Processing Scripts

The main article collection and classification scripts are located in `medical_processing/`:

- `medical_processing/fetch_and_classify_by_date.py` - Fetch and classify articles from a date range
- `medical_processing/fetch_and_classify_weekly.py` - Convenience wrapper for weekly article fetching

