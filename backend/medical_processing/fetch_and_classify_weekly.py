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
    
    # Set up command line arguments for the date-based script
    sys.argv = ['fetch_and_classify_by_date.py', start_date_str, end_date_str, '--model', 'claude']
    
    # Call the main function from the date-based script
    date_main()

if __name__ == "__main__":
    main()


