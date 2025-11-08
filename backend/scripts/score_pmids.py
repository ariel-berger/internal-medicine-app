#!/usr/bin/env python3
"""
Score specific PMIDs: fetch article data from DB, run inclusion-based classification,
and print all scoring components.
Usage:
  python backend/scripts/score_pmids.py 41183339 41183330
"""

import os
import sys
import sqlite3
from typing import List, Dict

# Ensure backend modules are importable when running from project root or scripts
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Load .env from backend or project root if present
try:
    from dotenv import load_dotenv
    backend_env = os.path.join(BACKEND_DIR, '.env')
    project_root = os.path.dirname(BACKEND_DIR)
    root_env = os.path.join(project_root, '.env')
    if os.path.exists(backend_env):
        load_dotenv(backend_env)
    elif os.path.exists(root_env):
        load_dotenv(root_env)
except Exception:
    pass

from medical_processing.classification.classifier import MedicalArticleClassifier


def get_db_path() -> str:
    # Prefer backend DB; fallback to project root if needed
    backend_db = os.path.join(BACKEND_DIR, 'medical_articles.db')
    if os.path.exists(backend_db):
        return backend_db
    root_db = os.path.join(os.path.dirname(BACKEND_DIR), 'medical_articles.db')
    if os.path.exists(root_db):
        return root_db
    raise FileNotFoundError("medical_articles.db not found in backend or project root")


def fetch_articles_by_pmids(pmids: List[str]) -> List[Dict]:
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        placeholders = ','.join('?' for _ in pmids)
        cursor.execute(f"""
            SELECT pmid, title, abstract, journal, authors, author_affiliations,
                   publication_date, doi, url, medical_category, article_type,
                   keywords, mesh_terms, publication_type
            FROM articles
            WHERE pmid IN ({placeholders})
        """, pmids)
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


def print_scoring(pmid: str, classification: Dict) -> None:
    print("=" * 60)
    print(f"PMID: {pmid}")
    print(f"Relevant: {classification.get('is_relevant', False)}  Category: {classification.get('medical_category')}  Score: {classification.get('ranking_score', 0)}")
    rb = classification.get('ranking_breakdown', {}) or {}
    # Core components
    core_keys = [
        'focus_points', 'type_points', 'prevalence_points', 'hospitalization_points',
        'clinical_outcome_points', 'impact_factor_points', 'temporality_points'
    ]
    # Penalties (from breakdown if present, else top-level copies were added later in pipeline)
    penalty_keys = [
        'prevention_penalty_points', 'biologic_penalty_points', 'screening_penalty_points',
        'scores_penalty_points', 'subanalysis_penalty_points'
    ]
    for k in core_keys:
        print(f"{k}: {rb.get(k, 0)}")
    for k in penalty_keys:
        # prefer breakdown value; fall back to top-level
        print(f"{k}: {rb.get(k, classification.get(k, 0))}")
    # Additional rule-based penalties stored at top-level
    print(f"neurology_penalty_points: {classification.get('neurology_penalty_points', 0)}")


def main():
    if len(sys.argv) < 2:
        print("Provide at least one PMID, e.g.: python backend/scripts/score_pmids.py 41183339 41183330")
        sys.exit(1)
    pmids = sys.argv[1:]

    articles = fetch_articles_by_pmids(pmids)
    found_pmids = {a['pmid'] for a in articles}
    missing = [p for p in pmids if p not in found_pmids]
    if missing:
        print(f"Warning: PMIDs not found in DB: {', '.join(missing)}")

    classifier = MedicalArticleClassifier(model_provider=os.getenv('MODEL_PROVIDER', 'claude'))

    for article in articles:
        # Unified two-step: filter, then classify relevant ones only
        result = classifier.classify_article_enhanced(article)
        print_scoring(article['pmid'], result)


if __name__ == '__main__':
    main()


