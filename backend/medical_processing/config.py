# Configuration file for the medical articles system

# Database configuration
DATABASE_PATH = "medical_articles.db"

# Journal configuration - using PubMed abbreviated names
JOURNALS = {
    "NEJM": "N Engl J Med",
    "JAMA": "JAMA",
    "Annals": "Ann Intern Med",
    "BMJ": "BMJ",
    "Lancet": "Lancet",
    "JGIM": "J Gen Intern Med",
    "Circulation": "Circulation",
    "EHJ": "Eur Heart J",
    "JACC": "J Am Coll Cardiol",
    "Hypertension": "Hypertension",
    "AJRCCM": "Am J Respir Crit Care Med",
    "Chest": "Chest",
    "Kidney International": "Kidney Int",
    "JASN": "J Am Soc Nephrol",
    "Gastroenterology": "Gastroenterology",
    "Gut": "Gut",
    "Hepatology": "Hepatology",
    "CID": "Clin Infect Dis",
    "JID": "J Infect Dis",
    # "Diabetes Care": "Diabetes Care",
    "JCEM": "J Clin Endocrinol Metab",
    "Neurology": "Neurology",
    "Ann Neurol": "Ann Neurol",
    "ARD": "Ann Rheum Dis",
    "Arthritis Rheumatol": "Arthritis Rheumatol",
    # "JCO": "J Clin Oncol",
    "Blood": "Blood"
}

# Medical field categories
MEDICAL_CATEGORIES = [
    "Cardiology",
    "Pulmonology", 
    "Gastroenterology",
    "Nephrology",
    "Neurology",
    "Endocrinology",
    "Hematology",
    "Oncology",
    "Immunology",
    "Infectious diseases",
    "Diabetes",
    "Lipidology",
    "Nutrition",
    "Geriatrics",
    "Psychiatry",
    "Pediatrics",
    "General medicine",
    "Rheumatology",
    "Other"
]

# Article type categories
ARTICLE_TYPES = [
    "Review",
    "Guideline",
    "RCT",
    "Meta-analysis",
    "Case report",
    "Observational study",
    "Editorial",
    "Case series",
    "Letter",
    "Retrospective study",
    "Systematic review",
    "Other"
]

# PubMed API configuration
PUBMED_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
PUBMED_SEARCH_URL = f"{PUBMED_BASE_URL}esearch.fcgi"
PUBMED_FETCH_URL = f"{PUBMED_BASE_URL}efetch.fcgi"

# Collection settings
ARTICLES_PER_BATCH = 100
DAYS_TO_COLLECT = 7  # Collect articles from last 7 days