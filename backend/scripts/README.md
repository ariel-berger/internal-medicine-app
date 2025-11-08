# Utility Scripts

This directory contains utility scripts for working with the medical articles database and the AI classification pipeline.

## Environment

The classifiers support Anthropic Claude or Google Gemini. Provide one of the following in `.env` (either in `backend/.env` or project root `.env`):

```
ANTHROPIC_API_KEY=...
# or
GOOGLE_API_KEY=...
```

## Scripts

- `scripts/score_pmids.py` – Classify and print detailed scoring for specific PMIDs.
- `scripts/export_relevant_articles_weekly.py` – Export relevant articles from the last 14 days to CSV.
- `scripts/process_weekly_articles.py` – Orchestrate weekly collection and classification.

Related processing entry points (under `medical_processing/`):

- `medical_processing/fetch_and_classify_by_date.py` – Fetch and classify articles for a date range.
- `medical_processing/fetch_and_classify_weekly.py` – Convenience wrapper for the last 7 days.

## Usage Examples

```bash
# From repository root
cd backend

# Score specific PMIDs (prints full ranking breakdown)
python scripts/score_pmids.py 41183339 41183330

# Export relevant articles from the last 2 weeks to CSV
python scripts/export_relevant_articles_weekly.py

# Weekly pipeline (last 7 days)
python medical_processing/fetch_and_classify_weekly.py
```

### Windows (PowerShell) examples

```powershell
# From repository root
cd backend

# Activate venv (created at repo root as .venv)
.\..\.venv\Scripts\Activate.ps1

# Recommended for proper unicode output
$env:PYTHONIOENCODING = 'utf-8'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Score specific PMIDs
& "..\.venv\Scripts\python.exe" scripts\score_pmids.py 41183339 41183330

# Export relevant articles from the last 2 weeks
& "..\.venv\Scripts\python.exe" scripts\export_relevant_articles_weekly.py

# Weekly pipeline (last 7 days)
& "..\.venv\Scripts\python.exe" medical_processing\fetch_and_classify_weekly.py
```

## Classification Flow (Unified)

The pipeline uses one unified flow:
- `filter_article(...)` – Inclusion-based relevance filtering
- `classify_article_enhanced(...)` – Full scoring and summary for relevant items

Deprecated duplicates have been removed. Use the unified methods only.

