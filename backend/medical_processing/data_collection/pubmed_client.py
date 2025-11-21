import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import time
import logging
from ..config import PUBMED_SEARCH_URL, PUBMED_FETCH_URL, ARTICLES_PER_BATCH, DAYS_TO_COLLECT, JOURNALS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PubMedClient:
    """Client for interacting with PubMed API (no API key required)."""
    
    def __init__(self, email: str = None):
        self.email = email
        self.base_params = {}
        # Email is optional but recommended for higher usage
        if email:
            self.base_params['tool'] = 'medical_articles_system'
            self.base_params['email'] = email
        self.ahead_of_print_filtered = 0  # Track filtered articles
        self.non_research_filtered = 0  # Track non-research publication types filtered
        self.no_abstract_filtered = 0  # Track articles without abstracts (non-case reports)
        self.title_filtered = 0  # Track articles filtered by title terms
        self.vaccine_dose_filtered = 0  # Track articles filtered by vaccine + dose/dosing combination
    
    def search_articles(self, journal_names: List[str], days_back: int = DAYS_TO_COLLECT) -> List[str]:
        """Search for article PMIDs from specified journals within the last N days."""
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Format dates for PubMed query
        date_range = f"{start_date.strftime('%Y/%m/%d')}:{end_date.strftime('%Y/%m/%d')}[pdat]"
        
        # Build journal query
        journal_query = " OR ".join([f'"{journal}"[journal]' for journal in journal_names])
        
        # Complete search query
        search_query = f"({journal_query}) AND {date_range}"
        
        params = {
            **self.base_params,
            'db': 'pubmed',
            'term': search_query,
            'retmax': ARTICLES_PER_BATCH * 10,  # Get more to ensure we have enough
            'retmode': 'xml'
        }
        
        logger.info(f"Searching PubMed with query: {search_query}")
        
        try:
            response = requests.get(PUBMED_SEARCH_URL, params=params, timeout=30)  # 30 second timeout
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.content)
            pmids = [id_elem.text for id_elem in root.findall('.//Id')]
            
            logger.info(f"Found {len(pmids)} articles")
            return pmids
            
        except requests.RequestException as e:
            logger.error(f"Error searching PubMed: {e}")
            return []
        except ET.ParseError as e:
            logger.error(f"Error parsing PubMed response: {e}")
            return []
    
    def search_articles_custom_date(self, journal_names: List[str], start_date: str, end_date: str) -> List[str]:
        """Search for article PMIDs from specified journals within a custom date range."""
        # Format dates for PubMed query (expects YYYY/MM/DD format)
        date_range = f"{start_date}:{end_date}[pdat]"
        
        # Build journal query
        journal_query = " OR ".join([f'"{journal}"[journal]' for journal in journal_names])
        
        # Complete search query
        search_query = f"({journal_query}) AND {date_range}"
        
        params = {
            **self.base_params,
            'db': 'pubmed',
            'term': search_query,
            'retmax': ARTICLES_PER_BATCH * 10,  # Get more to ensure we have enough
            'retmode': 'xml'
        }
        
        logger.info(f"Searching PubMed with custom date query: {search_query}")
        
        try:
            response = requests.get(PUBMED_SEARCH_URL, params=params, timeout=30)  # 30 second timeout
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.content)
            pmids = [id_elem.text for id_elem in root.findall('.//Id')]
            
            logger.info(f"Found {len(pmids)} articles for date range {start_date} to {end_date}")
            return pmids
            
        except requests.RequestException as e:
            logger.error(f"Error searching PubMed: {e}")
            return []
        except ET.ParseError as e:
            logger.error(f"Error parsing PubMed response: {e}")
            return []
    
    def fetch_article_details(self, pmids: List[str]) -> List[Dict]:
        """Fetch detailed article information for given PMIDs."""
        articles = []
        
        # Process in batches to avoid overwhelming the API
        for i in range(0, len(pmids), ARTICLES_PER_BATCH):
            batch_pmids = pmids[i:i + ARTICLES_PER_BATCH]
            batch_articles = self._fetch_batch(batch_pmids)
            articles.extend(batch_articles)
            
            # Be polite to NCBI servers
            time.sleep(0.5)
        
        return articles
    
    def _fetch_batch(self, pmids: List[str]) -> List[Dict]:
        """Fetch a batch of articles."""
        pmid_string = ",".join(pmids)
        
        params = {
            **self.base_params,
            'db': 'pubmed',
            'id': pmid_string,
            'retmode': 'xml',
            'rettype': 'abstract'
        }
        
        try:
            response = requests.get(PUBMED_FETCH_URL, params=params, timeout=30)  # 30 second timeout
            response.raise_for_status()
            
            return self._parse_articles_xml(response.content)
            
        except requests.RequestException as e:
            logger.error(f"Error fetching article batch: {e}")
            return []
    
    def _parse_articles_xml(self, xml_content: bytes) -> List[Dict]:
        """Parse article XML data into structured format."""
        articles = []
        
        try:
            root = ET.fromstring(xml_content)
            
            for article_elem in root.findall('.//PubmedArticle'):
                article_data = self._extract_article_data(article_elem)
                if article_data:
                    articles.append(article_data)
                    
        except ET.ParseError as e:
            logger.error(f"Error parsing articles XML: {e}")
        
        return articles
    
    def _extract_article_data(self, article_elem) -> Optional[Dict]:
        """Extract data from a single article XML element."""
        try:
            # Basic article info
            medline_citation = article_elem.find('.//MedlineCitation')
            pmid = medline_citation.find('.//PMID').text
            
            article = medline_citation.find('.//Article')
            title_elem = article.find('.//ArticleTitle')
            title = title_elem.text if title_elem is not None else ""
            
            # Abstract - handle both structured (multiple sections) and non-structured abstracts
            abstract_elements = article.findall('.//Abstract/AbstractText')
            abstract_parts = []
            
            if abstract_elements:
                for elem in abstract_elements:
                    label = elem.get('Label')
                    text = elem.text if elem.text else ""
                    
                    # Handle structured abstracts with labels (e.g., "Background", "Methods", "Results", "Conclusions")
                    if label:
                        abstract_parts.append(f"{label}: {text}")
                    else:
                        # Non-structured abstract - just add the text
                        abstract_parts.append(text)
                
                # Combine all abstract parts with double space for readability
                # This preserves structure while keeping it as a single string
                abstract = "  ".join(abstract_parts)
            else:
                abstract = ""
            
            # Filter out articles with specific terms in the title
            if title:
                title_lower = title.lower()
                filtered_terms = [
                    'obesity', 'gender', 'sex', 'rehabilitation', 'cells', 'stem cells', 
                    'progenitor cells', 'epidemiology', 'geography', 'microbiome', 
                    'biomarker', 'gene', 'genetic', 'technologies', 'artificial intelligence',
                    'behavioral', 'hidradenitis suppurativa', 'crispr', 'mice', 
                    'chromosome', 'pregnancy', 'polygenic'
                ]
                
                for term in filtered_terms:
                    if term in title_lower:
                        logger.info(f"Skipping article with '{term}' in title: PMID {pmid}")
                        self.title_filtered += 1
                        return None
                
                # Special filter: vaccine + dose/dosing combination
                if 'vaccine' in title_lower and ('dose' in title_lower or 'dosing' in title_lower):
                    logger.info(f"Skipping article with vaccine + dose/dosing in title: PMID {pmid}")
                    self.vaccine_dose_filtered += 1
                    return None
            
            # Check if article is "Online ahead of print" - only skip if it doesn't have an abstract
            pubmed_data = article_elem.find('.//PubmedData')
            if pubmed_data is not None:
                publication_status = pubmed_data.find('.//PublicationStatus')
                if publication_status is not None and publication_status.text == 'aheadofprint':
                    # Only filter out ahead-of-print articles that don't have abstracts
                    if not abstract or not abstract.strip():
                        logger.info(f"Skipping ahead of print article without abstract: PMID {pmid}")
                        self.ahead_of_print_filtered += 1
                        return None
                    else:
                        logger.info(f"Keeping ahead of print article with abstract: PMID {pmid}")
            
            # Journal
            journal_elem = article.find('.//Journal/Title')
            journal = journal_elem.text if journal_elem is not None else ""
            
            # Authors and affiliations
            authors_data = self._extract_authors(article)
            
            # Publication date
            pub_date = self._extract_publication_date(article)
            
            # DOI
            doi_elem = article.find('.//ELocationID[@EIdType="doi"]')
            doi = doi_elem.text if doi_elem is not None else ""
            
            # Keywords and MeSH terms
            keywords = self._extract_keywords(medline_citation)
            mesh_terms = self._extract_mesh_terms(medline_citation)
            
            # Publication type
            publication_type = self._extract_publication_type(article)
            
            # Filter out non-research publication types
            if publication_type:
                filtered_types = [
                    'editorial', 'letter', 'comment',
                    'news', 'biography', 'historical article', 
                    'interview', 'personal narrative', 'portrait',
                    'retraction', 'retraction of publication',
                    'corrected and republished article', 'republished article',
                    'duplicate publication', 'published erratum',
                    'video-audio media', 'audiovisual', 'webcast',
                    'consensus development conference', 'consensus development conference, nih',
                    'congress', 'conference proceedings', 'meeting abstract'
                ]
                pub_type_lower = publication_type.lower()
                if any(filtered_type in pub_type_lower for filtered_type in filtered_types):
                    logger.info(f"Skipping {publication_type} article: PMID {pmid}")
                    self.non_research_filtered += 1
                    return None
            
            # Filter non-case report articles without abstracts
            if publication_type:
                is_case_report = any(case_type in pub_type_lower for case_type in ['case report', 'case study', 'case series'])
                if not is_case_report and (not abstract or not abstract.strip()):
                    logger.info(f"Skipping non-case report article without abstract: PMID {pmid}")
                    self.no_abstract_filtered += 1
                    return None
            
            return {
                'pmid': pmid,
                'title': title,
                'abstract': abstract,
                'journal': journal,
                'authors': authors_data['authors_string'],
                'author_affiliations': authors_data['affiliations_string'],
                'publication_date': pub_date,
                'doi': doi,
                'url': f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                'keywords': keywords,
                'mesh_terms': mesh_terms,
                'publication_type': publication_type
            }
            
        except Exception as e:
            logger.error(f"Error extracting article data: {e}")
            return None
    
    def _extract_authors(self, article_elem) -> Dict[str, str]:
        """Extract authors and their affiliations."""
        authors = []
        affiliations = []
        
        author_list = article_elem.find('.//AuthorList')
        if author_list is not None:
            for author in author_list.findall('.//Author'):
                # Author name
                lastname = author.find('.//LastName')
                firstname = author.find('.//ForeName')
                
                if lastname is not None and firstname is not None:
                    full_name = f"{firstname.text} {lastname.text}"
                    authors.append(full_name)
                    
                    # Author affiliation
                    affiliation_elem = author.find('.//Affiliation')
                    if affiliation_elem is not None:
                        affiliations.append(f"{full_name}: {affiliation_elem.text}")
        
        return {
            'authors_string': "; ".join(authors),
            'affiliations_string': "; ".join(affiliations)
        }
    
    def _extract_publication_date(self, article_elem) -> Optional[str]:
        """Extract publication date."""
        pub_date = article_elem.find('.//PubDate')
        if pub_date is not None:
            year = pub_date.find('.//Year')
            month = pub_date.find('.//Month')
            day = pub_date.find('.//Day')
            
            if year is not None:
                date_str = year.text
                if month is not None:
                    # Convert month name to number if it's not already a digit
                    month_text = month.text
                    if month_text.isdigit():
                        date_str += f"-{month_text.zfill(2)}"
                    else:
                        # Convert month name to number
                        month_mapping = {
                            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                        }
                        month_num = month_mapping.get(month_text, '01')
                        date_str += f"-{month_num}"
                if day is not None:
                    date_str += f"-{day.text.zfill(2)}"
                return date_str
        
        return None
    
    def _extract_keywords(self, medline_citation) -> str:
        """Extract keywords from article."""
        keywords = []
        keyword_list = medline_citation.find('.//KeywordList')
        if keyword_list is not None:
            for keyword in keyword_list.findall('.//Keyword'):
                if keyword.text:
                    keywords.append(keyword.text)
        
        return "; ".join(keywords)
    
    def _extract_mesh_terms(self, medline_citation) -> str:
        """Extract MeSH terms from article."""
        mesh_terms = []
        mesh_heading_list = medline_citation.find('.//MeshHeadingList')
        if mesh_heading_list is not None:
            for mesh_heading in mesh_heading_list.findall('.//MeshHeading'):
                descriptor = mesh_heading.find('.//DescriptorName')
                if descriptor is not None and descriptor.text:
                    mesh_terms.append(descriptor.text)
        
        return "; ".join(mesh_terms)
    
    def _extract_publication_type(self, article_elem) -> str:
        """Extract publication type from article."""
        publication_types = []
        pub_type_list = article_elem.find('.//PublicationTypeList')
        if pub_type_list is not None:
            for pub_type in pub_type_list.findall('.//PublicationType'):
                if pub_type.text:
                    publication_types.append(pub_type.text)
        
        return "; ".join(publication_types)
    
    def get_filtering_stats(self) -> Dict[str, int]:
        """Get statistics about filtered articles."""
        return {
            'ahead_of_print_filtered': self.ahead_of_print_filtered,
            'non_research_filtered': self.non_research_filtered,
            'no_abstract_filtered': self.no_abstract_filtered,
            'title_filtered': self.title_filtered,
            'vaccine_dose_filtered': self.vaccine_dose_filtered
        }

def collect_recent_articles(email: str = None) -> Dict[str, any]:
    """Main function to collect recent articles from all configured journals."""
    client = PubMedClient(email=email)
    
    # Get journal names from config
    journal_names = list(JOURNALS.values())
    
    # Search for articles
    pmids = client.search_articles(journal_names)
    
    if not pmids:
        logger.warning("No articles found")
        return {
            'articles': [],
            'filtering_stats': client.get_filtering_stats()
        }
    
    # Fetch article details
    articles = client.fetch_article_details(pmids)
    
    # Get filtering statistics
    filtering_stats = client.get_filtering_stats()
    
    logger.info(f"Successfully collected {len(articles)} articles")
    if filtering_stats['ahead_of_print_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['ahead_of_print_filtered']} ahead-of-print articles")
    if filtering_stats['title_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['title_filtered']} articles with filtered terms in title")
    if filtering_stats['vaccine_dose_filtered'] > 0:
        logger.info(f"Filtered out {filtering_stats['vaccine_dose_filtered']} articles with vaccine + dose/dosing in title")
    
    return {
        'articles': articles,
        'filtering_stats': filtering_stats
    }

if __name__ == "__main__":
    # Test the collection
    result = collect_recent_articles()
    articles = result['articles']
    filtering_stats = result['filtering_stats']
    
    print(f"Collection Results:")
    print(f"- Articles collected: {len(articles)}")
    print(f"- Ahead of print filtered: {filtering_stats['ahead_of_print_filtered']}")
    print(f"- Title terms filtered: {filtering_stats['title_filtered']}")
    print(f"- Vaccine + dose/dosing filtered: {filtering_stats['vaccine_dose_filtered']}")
    print()
    
    for article in articles[:3]:  # Print first 3 articles
        print(f"Title: {article['title']}")
        print(f"Journal: {article['journal']}")
        print("---")