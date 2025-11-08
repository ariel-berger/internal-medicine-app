#!/usr/bin/env python3
"""
Convenience script to fetch articles from the last 7 days using the date-based fetcher.
This is a wrapper around fetch_and_classify_by_date.py for backward compatibility.
"""

import sys
import os
from datetime import datetime, timedelta

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from either backend/.env or project_root/.env
try:
    from dotenv import load_dotenv
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(current_dir)
    project_root = os.path.dirname(backend_dir)
    # Try backend first, then project root
    loaded = False
    for env_path in [os.path.join(backend_dir, '.env'), os.path.join(project_root, '.env')]:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False)
            loaded = True
    # Fallback to default search if neither found
    if not loaded:
        from dotenv import find_dotenv
        env_file = find_dotenv()
        if env_file:
            load_dotenv(env_file, override=False)
except Exception:
    pass

# Import the main date-based script
from fetch_and_classify_by_date import main as date_main

def main():
    """Main function to fetch and classify articles from the last 7 days."""
    # Calculate date range for the last 7 days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    # Format dates for the date-based script
    start_date_str = start_date.strftime('%Y/%m/%d')
    end_date_str = end_date.strftime('%Y/%m/%d')
    
    print("="*60)
    print("WEEKLY ARTICLE FETCH AND CLASSIFICATION")
    print("="*60)
    print(f"📅 Fetching articles from the last 7 days: {start_date_str} to {end_date_str}")
    print("="*60)
    
    # Decide model based on available API keys unless MODEL_PROVIDER is explicitly set
    model = os.getenv('MODEL_PROVIDER')
    if not model:
        if os.getenv('ANTHROPIC_API_KEY'):
            model = 'claude'
        elif os.getenv('GOOGLE_API_KEY'):
            model = 'gemini'
        else:
            model = 'claude'  # default; will error clearly if key missing

    # Set up command line arguments for the date-based script
    sys.argv = ['fetch_and_classify_by_date.py', start_date_str, end_date_str, '--model', model]
    
    # Call the main function from the date-based script
    date_main()

if __name__ == "__main__":
    main()


