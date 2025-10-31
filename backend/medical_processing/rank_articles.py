#!/usr/bin/env python3
"""
Script to rank relevant articles from the CSV file using the new ranking system.
"""

import csv
import json
from classification.classifier import MedicalArticleClassifier
from datetime import datetime

def extract_relevant_articles(csv_file):
    """Extract articles marked as relevant from the CSV file."""
    relevant_articles = []
    
    with open(csv_file, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            # Check if article is marked as relevant
            if row.get('is_relevant', '').lower() == 'true':
                relevant_articles.append(row)
    
    return relevant_articles

def calculate_ranking_score(article):
    """Calculate ranking score based on the ranking criteria."""
    
    # Initialize scores
    focus_points = 0
    type_points = 0
    prevalence_points = 0
    hospitalization_points = 0
    impact_factor_points = 0
    
    # 1. Focus of Paper (0-2 points)
    title = article.get('title', '').lower()
    abstract = article.get('clinical_bottom_line', '').lower()
    content = f"{title} {abstract}"
    
    # Check for intervention studies (treatments, medications, procedures)
    intervention_keywords = ['treatment', 'therapy', 'medication', 'drug', 'intervention', 'procedure', 'surgery', 'trial', 'randomized', 'rct']
    if any(keyword in content for keyword in intervention_keywords):
        focus_points = 2
    # Check for diagnostic tests
    elif any(keyword in content for keyword in ['diagnostic', 'diagnosis', 'test', 'screening', 'biomarker', 'imaging']):
        focus_points = 1
    
    # 2. Type of Paper (0-2 points)
    publication_type = article.get('publication_type', '').lower()
    if 'randomized controlled trial' in publication_type or 'rct' in publication_type:
        type_points = 2
    elif 'meta-analysis' in publication_type or 'systematic review' in publication_type:
        type_points = 1
    
    # 3. Disease Prevalence (0-2 points) - now calculated from content analysis
    # Check for common diseases that indicate high prevalence
    high_prevalence_keywords = ['hypertension', 'diabetes', 'heart failure', 'copd', 'pneumonia', 'sepsis', 'stroke', 'myocardial infarction', 'atrial fibrillation']
    medium_prevalence_keywords = ['pancreatitis', 'dka', 'asthma', 'chronic kidney disease', 'liver disease']
    
    if any(keyword in content for keyword in high_prevalence_keywords):
        prevalence_points = 2
    elif any(keyword in content for keyword in medium_prevalence_keywords):
        prevalence_points = 1
    
    # 4. Hospitalization Relevance (0-1 point)
    # Check if content suggests hospitalization relevance
    hospitalization_keywords = ['hospitalization', 'hospital', 'inpatient', 'acute', 'critical', 'icu', 'emergency', 'admission']
    if any(keyword in content for keyword in hospitalization_keywords):
        hospitalization_points = 1
    
    # 5. Impact Factor (0-1 point)
    journal = article.get('journal', '').lower()
    high_impact_journals = ['new england journal of medicine', 'nejm', 'lancet', 'jama', 'circulation', 'european heart journal']
    if any(high_journal in journal for high_journal in high_impact_journals):
        impact_factor_points = 1
    
    # Calculate total score
    total_score = focus_points + type_points + prevalence_points + hospitalization_points + impact_factor_points
    
    return {
        'ranking_score': total_score,
        'ranking_breakdown': {
            'focus_points': focus_points,
            'type_points': type_points,
            'prevalence_points': prevalence_points,
            'hospitalization_points': hospitalization_points,
            'impact_factor_points': impact_factor_points
        }
    }

def rank_articles(articles):
    """Rank articles by their calculated scores."""
    ranked_articles = []
    
    for article in articles:
        ranking_data = calculate_ranking_score(article)
        article_with_ranking = {**article, **ranking_data}
        ranked_articles.append(article_with_ranking)
    
    # Sort by ranking score (descending)
    ranked_articles.sort(key=lambda x: x['ranking_score'], reverse=True)
    
    return ranked_articles

def export_to_csv(ranked_articles, output_file):
    """Export ranked articles to CSV file."""
    
    # Define fieldnames including ranking fields
    fieldnames = [
        'pmid', 'title', 'journal', 'authors', 'publication_date', 'doi', 'url',
        'medical_category', 'is_relevant', 'reason', 'participants',
        'clinical_bottom_line', 'tags', 'keywords', 'mesh_terms', 'publication_type',
        'ranking_score', 'focus_points', 'type_points', 'prevalence_points',
        'hospitalization_points', 'impact_factor_points'
    ]
    
    with open(output_file, 'w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        
        for article in ranked_articles:
            # Prepare row data
            row_data = {
                'pmid': article.get('pmid', ''),
                'title': article.get('title', ''),
                'journal': article.get('journal', ''),
                'authors': article.get('authors', ''),
                'publication_date': article.get('publication_date', ''),
                'doi': article.get('doi', ''),
                'url': article.get('url', ''),
                'medical_category': article.get('medical_category', ''),
                'is_relevant': article.get('is_relevant', ''),
                'reason': article.get('reason', ''),
                'participants': article.get('participants', ''),
                'clinical_bottom_line': article.get('clinical_bottom_line', ''),
                'tags': article.get('tags', ''),
                'keywords': article.get('keywords', ''),
                'mesh_terms': article.get('mesh_terms', ''),
                'publication_type': article.get('publication_type', ''),
                'ranking_score': article.get('ranking_score', 0),
                'focus_points': article.get('ranking_breakdown', {}).get('focus_points', 0),
                'type_points': article.get('ranking_breakdown', {}).get('type_points', 0),
                'prevalence_points': article.get('ranking_breakdown', {}).get('prevalence_points', 0),
                'hospitalization_points': article.get('ranking_breakdown', {}).get('hospitalization_points', 0),
                'impact_factor_points': article.get('ranking_breakdown', {}).get('impact_factor_points', 0)
            }
            writer.writerow(row_data)

def main():
    """Main function to process and rank articles."""
    
    input_file = 'classified_articles_20250911_222035.csv'
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f'ranked_articles_{timestamp}.csv'
    
    print("=" * 80)
    print("RANKING RELEVANT ARTICLES")
    print("=" * 80)
    
    # Extract relevant articles
    print("1. Extracting relevant articles...")
    relevant_articles = extract_relevant_articles(input_file)
    print(f"   Found {len(relevant_articles)} relevant articles")
    
    if not relevant_articles:
        print("No relevant articles found!")
        return
    
    # Rank articles
    print("2. Calculating ranking scores...")
    ranked_articles = rank_articles(relevant_articles)
    
    # Display top 10 articles
    print("\n3. TOP 10 RANKED ARTICLES:")
    print("-" * 80)
    for i, article in enumerate(ranked_articles[:10], 1):
        breakdown = article.get('ranking_breakdown', {})
        print(f"{i:2d}. Score: {article['ranking_score']}/10 - {article['title'][:60]}...")
        print(f"    Journal: {article['journal']}")
        print(f"    Breakdown: Focus({breakdown.get('focus_points', 0)}) + Type({breakdown.get('type_points', 0)}) + Prevalence({breakdown.get('prevalence_points', 0)}) + Hospital({breakdown.get('hospitalization_points', 0)}) + Impact({breakdown.get('impact_factor_points', 0)})")
        print()
    
    # Export to CSV
    print("4. Exporting to CSV...")
    export_to_csv(ranked_articles, output_file)
    print(f"   ✅ Exported {len(ranked_articles)} ranked articles to {output_file}")
    
    # Summary statistics
    print("\n5. RANKING SUMMARY:")
    print("-" * 40)
    score_distribution = {}
    for article in ranked_articles:
        score = article['ranking_score']
        score_distribution[score] = score_distribution.get(score, 0) + 1
    
    for score in sorted(score_distribution.keys(), reverse=True):
        count = score_distribution[score]
        print(f"   Score {score}/10: {count} articles")
    
    print(f"\n✅ Ranking complete! Results saved to {output_file}")

if __name__ == "__main__":
    main()
