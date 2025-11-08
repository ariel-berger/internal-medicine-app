#!/usr/bin/env python3
"""
Process and store last week's medical articles (collect + classify + store).
"""

import os
import sys
from datetime import datetime

# Ensure backend is importable when running from scripts folder or project root
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Ensure environment variables are loaded from the nearest .env file
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv())
except Exception:
    pass

from medical_processing.service import medical_articles_service  # type: ignore


def main():
    email = os.getenv("PUBMED_EMAIL")
    # Auto-pick model provider if not explicitly set
    model = os.getenv("MODEL_PROVIDER")
    if not model:
        if os.getenv("ANTHROPIC_API_KEY"):
            model = "claude"
        elif os.getenv("GOOGLE_API_KEY"):
            model = "gemini"
        else:
            model = "claude"  # default, will error clearly if key missing

    print("=" * 60)
    print("WEEKLY ARTICLE PROCESSING (collect + classify + store)")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat(timespec='seconds')}")
    print(f"Model provider: {model}")
    if email:
        print(f"PubMed email: {email}")

    # Initialize/migrate DB just in case
    try:
        medical_articles_service.initialize_database()
    except Exception:
        pass

    result = medical_articles_service.process_weekly_articles(email=email, model_provider=model)

    print("\nResult:")
    print(result)

    if result.get("success"):
        print("\n✅ Weekly processing completed successfully")
        print(f"Collected: {result.get('articles_collected', 0)}")
        print(f"Classified: {result.get('articles_classified', 0)}")
        print(f"Stored: {result.get('articles_stored', 0)}")
    else:
        print("\n❌ Weekly processing failed")
        print(result.get("error", "Unknown error"))


if __name__ == "__main__":
    main()
