import logging
from typing import Dict, List
import json
import os
import time
from dotenv import load_dotenv
from medical_processing.config import MEDICAL_CATEGORIES
import anthropic
import google.generativeai as genai

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MedicalArticleClassifier:
    """Classifier for medical articles using Claude or Gemini API."""
    
    def __init__(self, model_provider: str = "claude"):
        """
        Initialize the classifier with specified model provider.
        
        Args:
            model_provider: Either "claude" or "gemini" (default: "claude" for Claude Sonnet 4.5)
        """
        self.medical_categories = MEDICAL_CATEGORIES
        self.model_provider = model_provider.lower()
        
        if self.model_provider == "claude":
            self._init_claude()
        elif self.model_provider == "gemini":
            self._init_gemini()
        else:
            raise ValueError("model_provider must be either 'claude' or 'gemini'")
    
    def _init_claude(self):
        """Initialize Claude client."""
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-sonnet-4-5-20250929"  # Latest and most advanced model
        logger.info("Initialized Claude classifier")
    
    def _init_gemini(self):
        """Initialize Gemini client."""
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-pro')
        logger.info("Initialized Gemini classifier")
    
    
    def create_inclusion_based_filtering_prompt(self, title: str, abstract: str, 
                              mesh_terms: str, publication_type: str, journal_name: str = None) -> str:
        """Create an inclusion-focused prompt for filtering articles for relevance."""
        
        # Handle journal info display
        journal_display = journal_name if journal_name else "Not specified"
        
        prompt = f"""
You are an expert AI medical research analyst. Your task is to determine if a PubMed article is relevant for a dashboard for internal medicine doctors in Israel.
Analyze the provided article information and determine relevance. Your final output must be only the JSON object, with no introductory or concluding text.

**Input:**
Title: {title}
Abstract: {abstract}
MeSH Terms: {mesh_terms}
Publication Type: {publication_type}
Journal: {journal_display}

**Output Schema (JSON):**
{{
    "is_relevant": "boolean",
    "reason": "string"
}}

IMPORTANT: The "reason" field must ALWAYS be filled with a brief explanation:
- If is_relevant is TRUE: Provide the reason for INCLUSION (e.g., "RCT on sepsis treatment", "Guidelines for heart failure management")
- If is_relevant is FALSE: Provide the reason for REJECTION (e.g., "Pediatric focus", "Basic science focus")

FILTERING LOGIC
Evaluate the article step by step. Default to "is_relevant": false and set to true only if inclusion criteria are met and no rejection criteria apply.

STEP 1: IMMEDIATE REJECTIONS (Apply First)
Reject immediately if the article has any of the following:
- Surgical focus (not perioperative medicine) → "Surgical focus"
- Obstetric focus → "Obstetric focus"
- Pediatric focus → "Pediatric focus"
- Environmental medicine focus → "Environmental medicine focus"
- Psychiatric/behavioral health focus → "Psychiatric focus"
- Ethics, policy, Medicare, healthcare administration focus → "Ethics/Policy focus"
- Basic science focus: molecular mechanisms, cellular biology, animal studies, in vitro or preclinical research without clear clinical applications. Pay special attention to excessive mention of "cells", "molecular", "transcriptional", "pathways", "immunology", "receptors", "cytokine", "enzyme" → "Basic science focus"
- Specific oncologic treatments including immunotherapy or hematologic malignancy treatments → "Specific oncologic treatment"
- Biomarkers and risk factors for cardiovascular mortality and morbidity → "Biomarker/risk factor study"
- Organ transplant or bone marrow transplant patients → "Transplant focus"
- Lifestyle interventions (diet, nutrition, exercise, weight-loss programs) → "Lifestyle intervention focus"
- Studies on care bundles → "Care bundle study"
- Commentary of existing guidelines → "Guideline commentary"
- Studies that are based mostly on a cohort from low-resource and third world countries → "Low resource country"

STEP 1.5: PROCEDURE CHECK
If the article discusses a procedure, surgical intervention, catheterization, or device-based therapy (e.g., endoscopy, stent, catheter, ablation, valve, biopsy, bronchoscopy, intubation, dialysis, endoscopic ultrasound, etc.):
- Evaluate it only under STEP 2 rule 7 (Procedures for treatment)
- Do NOT include it under rule 1 (RCTs) or rule 5 (Reviews), even if it is an RCT or a review.

STEP 2: INCLUSION CRITERIA (Check if at least one applies)
Include ONLY if the article is about internal medicine diseases AND matches at least one of these study types:
1. *RCTs on interventions:*
   - New medications or new indications for existing medications → "RCT on [disease/intervention]"
   - Non-pharmacologic interventions (NOT lifestyle interventions) → "RCT on [intervention]"
   
2. *Systematic reviews on common OR life-threatening internal medicine diseases in hospitalized patients *
   - Focus on how to manage a disease → "Systematic review on [disease] management"
   - Examples: review on TTP, review on managing Pulmonary Embolism  
  - NOT reviews of rare disease that are not life threatening 

3. * Meta-analyses:*
   - Clinical management questions on practice-changing subjects → "Meta-analysis on [topic]"
   
4. *Diagnostic tool efficacy:*
   - studies that examine application of diagnostic tools in management of inpatients with acute diseases → "Diagnostic study on [tool] for [acute disease]"
   - Examples: utility of lab tests to arrive at specific diagnosis, sensitivity/specificity of imaging or labs for acute diseases
   - NOT screening tests, NOT diagnostic studies for chronic diseases NOT ability of test to predict outcome

5. *Vaccine utility papers:*
   - Specific for patients with internal medicine conditions (e.g., heart failure, COPD patients) → "Vaccine efficacy in [condition] patients"
   - NOT general public vaccination studies
   
6. *Reviews and case reports:*
   - Frequently encountered internal medicine diseases that require hospitalization → "Review of [disease]" or "Case report on [disease]"
   
7. *Procedures for treatment:*
   - Indications, complications, post-procedure medical care → "Procedure study on [procedure] for [disease]"
   - Comparison with medical care of specialist procedures → "Comparative study: [procedure] vs medical management"
   - NOT technical details (device design, technical use, how-to preform a procedure, different materials used during a procedure)
   - Example: Include PCI vs. medical care for ACS, exclude different stent types, exclude different materials used during a procedure
   
8. *Neurologic diseases (LIMITED):*
   - ONLY cardiovascular disease (stroke, carotid disease) or infectious neurologic diseases → "Neurologic study on [stroke/carotid/infectious disease]"
- ONLY studies with a large number of participants – above 1,000 
   - Reject all other neurology topics → "Non-cardiovascular/non-infectious neurology"
   
9. *Infectious diseases (LIMITED):*
   - ONLY diseases requiring hospitalization and not rare → "Infectious disease study on [sepsis/pneumonia/UTI/etc]"
   - Examples: sepsis, pneumonia, UTI, SBP
   - Reject rare infections (e.g., rare fungal infections) → "Rare infectious disease"

If none of the above inclusion criteria apply:
Reason: "Does not match inclusion criteria for internal medicine dashboard"

STEP 3: FINAL VALIDATION
If inclusion criteria are met, verify it's truly an internal medicine disease. 
Else, reject with reason: "internal medicine disease"

*Example Outputs:*

For INCLUDED article:
{{
    "is_relevant": true,
    "reason": "RCT on antibiotic therapy for septic shock"
}}

For REJECTED article:
{{
    "is_relevant": false,
    "reason": "Pediatric focus"
}}
"""
        return prompt

    def create_classification_prompt(self, title: str, abstract: str, 
                                   mesh_terms: str, publication_type: str, journal_name: str = None) -> str:
        """Create a prompt for Claude to classify, rank, and summarize relevant articles."""
        
        categories_list = "\n".join([f"- {cat}" for cat in self.medical_categories])
        
        # Handle journal info display
        journal_display = journal_name if journal_name else "Not specified"
        
        prompt = f"""
You are an expert AI medical research analyst. Your task is to classify, rank, and summarize a PubMed article that has already been determined to be relevant for a dashboard for internal medicine doctors in Israel.

Analyze the provided article information and extract key information in a structured JSON format. Your final output must be only the JSON object, with no introductory or concluding text.

**Input:**
Title: {title}
Abstract: {abstract}
MeSH Terms: {mesh_terms}
Publication Type: {publication_type}
Journal: {journal_display}

*Output Schema (JSON):*
{{
    "participants": "number | null",
    "medical_category": "string ({categories_list})",
    "clinical_bottom_line": "string (A 1-2 sentence summary for a busy clinician.)",
    "tags": ["string"],
    "ranking_score": "number (0-11)",
    "ranking_breakdown": {{
        "focus_points": "number (0-2)",
        "type_points": "number (0-2)", 
        "prevalence_points": "number (-1 to 2)",
        "hospitalization_points": "number (0-2)",
        "clinical_outcome_points": "number (0-1)",
        "impact_factor_points": "number (0-1)",
        "temporality_points": "number (-1 to 1)",
        "prevention_penalty_points": "number (0 or -1)",
        "biologic_penalty_points": "number (0 or -1)",
        "screening_penalty_points": "number (0 or -2)",
        "scores_penalty_points": "number (0 or -2)",
        "subanalysis_penalty_points": "number (0 or -1)"
    }}
}}

*Analysis Instructions:*
**Step 1: Medical Category Classification**
Classify the article into the most relevant medical field category for an internal medicine ward based on the provided text.

**Step 2: Ranking System**
Calculate ranking_score (from -8 points to 11 points) based on the following criteria:

*Focus of Paper (0-2 points):*
- 2 points: Intervention studies (treatments, medications, procedures)
- 1 point: Diagnostic tests, screening, or diagnostic procedures
- 0 points: Other focus areas

*Type of Paper (0-2 points):*
- 2 points: Randomized Controlled Trial (RCT)
- 1 point: Meta-analysis or systematic review
- 0 points: Other study types

*Disease Prevalence (-1 or 1 or 2 points):*
- 2 points: Very common disease (>10% of population, >1,000 per 100,000 people per year)
  Examples: hypertension, diabetes, heart failure, COPD, pneumonia, sepsis
- 1 point: Medium common disease (1-10% of population, 100-1,000 per 100,000 people per year)
  Examples: stroke, myocardial infarction, pancreatitis, DKA, atrial fibrillation
- -1 points: Rare diseases (<1% of population, <100 per 100,000 people per year)

*Hospitalization Relevance (0 or 2 points):*
- 2 points: The study is clearly relevant to acute (sudden onset, short duration, requires immediate treatment) or hospitalized settings, identified either by containing key terms (acute, exacerbation, hospitalized, inpatient, ward, severe, failure, crisis, admitted, in-hospital, emergent, urgent, emergenc, fulminant) or by describing inpatient/ICU/ward management.
 Examples: acute myocardial infarction, acute stroke, sepsis, acute kidney injury, acute pancreatitis
- 0 points: The study does not include these key terms or it explicitly relates to ambulatory or outpatient care(long-term, persistent, ongoing management).
  Examples: diabetes, hypertension, heart failure, COPD, chronic kidney disease

*Clinical Outcome (0-1 point):*
- 1 point: Studies with a clinical outcome as the primary outcome (clinical events such as death, symptoms, quality of life, exacerbations, hospitalizations)
- 0 points: Studies with non-clinical primary outcome (lab parameters, imaging studies, biomarkers, surrogate endpoints)

*Impact Factor (0-1 point):*
- 1 point: Journal impact factor > 10 (high-impact journals like NEJM, Lancet, JAMA, etc.)
- 0 points: Journal impact factor ≤ 10 or unknown

*Size of cohort (0-1 point)*
- 1 point: the study cohort is equal or above 500 participants 
- 0 points: the study cohort is less than 500 participants

*Prevention/Prophylaxis Penalty (0 or -1 points):*
- -1 point: Primary focus on prevention or prophylaxis of disease
- 0 points: Not primarily focused on prevention/prophylaxis

*Biologic Treatments Penalty (0 or -1 points):*
- -1 point: Primary focus on biologic treatments (e.g., monoclonal antibodies, biologics)
- 0 points: Not primarily focused on biologic treatments

*Screening Tests Penalty (0 or -2 points):*
- -2 points: Primary focus on screening tests or screening programs
- 0 points: Not focused on screening

*Clinical Scores Penalty (0 or -2 points):*
- -2 points: Primary focus on clinical scores, risk scores, or scoring systems
- 0 points: Not focused on scores

*Subanalysis Penalty (0 or -1 point):*
- -1 point: Article is a subanalysis or secondary analysis of a previous study
- 0 points: Not a subanalysis

*Total Score Calculation:*
ranking_score = focus_points + type_points + prevalence_points + hospitalization_points + clinical_outcome_points + impact_factor_points + temporality_points + prevention_penalty_points + biologic_penalty_points + screening_penalty_points + scores_penalty_points + subanalysis_penalty_points

**Step 3: Summary and Tagging**
* clinical_bottom_line: Write a 2-3 sentence, evidence-based summary for a busy doctor. Base this ONLY on conclusions explicitly stated in the abstract. Include: (1) Study design and key participant characteristics, (2) Main outcome measured, (3) Key findings/conclusions from the abstract. Do NOT extrapolate, infer, or add clinical recommendations not explicitly stated in the abstract. If important inclusion/exclusion criteria are mentioned, include them briefly.
* tags: Generate an array of relevant tags. Include "practice-changing", "guideline", or "popular-article" if applicable based on your analysis.
* participants: Analyze the provided abstract and other text to find the number of participants in the study. If this information is not mentioned in the text, use null.

*Example Output:*
{{
    "participants": 1250,
    "medical_category": "Cardiology",
    "clinical_bottom_line": "This randomized controlled trial of 1,250 patients with acute coronary syndrome compared early statin initiation (within 24 hours) versus delayed initiation (after 7 days). The primary outcome was 30-day mortality, which was 8.2% in the early group versus 10.9% in the delayed group (p=0.03). The study concluded that early statin therapy significantly reduced 30-day mortality in ACS patients.",
    "tags": ["practice-changing", "cardiology", "statins", "acute-coronary-syndrome"],
    "ranking_score": 8,
    "ranking_breakdown": {{
        "focus_points": 2,
        "type_points": 2,
        "prevalence_points": 2,
        "hospitalization_points": 2,
        "clinical_outcome_points": 1,
        "impact_factor_points": 1,
        "temporality_points": 1,
        "prevention_penalty_points": 0,
        "biologic_penalty_points": 0,
        "screening_penalty_points": 0,
        "scores_penalty_points": 0,
        "subanalysis_penalty_points": 0
    }}
}}
"""

        return prompt
    
    def parse_filtering_response(self, response: str) -> Dict:
        """Parse Claude's filtering response and return relevance data."""
        try:
            # Clean the response - remove any markdown formatting
            response = response.strip()
            if response.startswith('```'):
                response = response.split('\n', 1)[1]
            if response.endswith('```'):
                response = response.rsplit('\n', 1)[0]
            # If any preface exists before the first JSON brace, trim to first '{'
            first_brace = response.find('{')
            if first_brace > 0:
                response = response[first_brace:]
            
            # Handle truncated JSON responses
            if not response.endswith('}'):
                # Try to find the last complete field and truncate there
                last_complete_brace = response.rfind('}')
                if last_complete_brace > 0:
                    response = response[:last_complete_brace + 1]
                else:
                    # If no complete JSON, try to add missing closing braces
                    open_braces = response.count('{')
                    close_braces = response.count('}')
                    missing_braces = open_braces - close_braces
                    if missing_braces > 0:
                        response += '}' * missing_braces
            
            # Parse JSON
            result = json.loads(response)

            # Coerce field types
            if 'is_relevant' in result and isinstance(result['is_relevant'], str):
                lower_val = result['is_relevant'].strip().lower()
                result['is_relevant'] = lower_val in {'true', 'yes', 'y', '1'}
            
            # Validate required fields
            required_fields = ['is_relevant']
            for field in required_fields:
                if field not in result:
                    logger.error(f"Missing required field: {field}")
                    return self._get_default_filtering_response()
            
            # Ensure optional fields have default values
            reason = result.get('reason', None)
            if reason is not None and not isinstance(reason, str):
                try:
                    result['reason'] = str(reason)
                except Exception:
                    result['reason'] = None
            else:
                result.setdefault('reason', None)
            
            return result
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"Error parsing filtering response: {e}")
            logger.error(f"Response was: {response}")
            return self._get_default_filtering_response()
    
    def _get_default_filtering_response(self) -> Dict:
        """Get default filtering response structure for error cases."""
        return {
            'is_relevant': False,
            'reason': 'API error or content filtering'
        }

    def parse_enhanced_response(self, response: str) -> Dict:
        """Parse Claude's enhanced JSON response and return full structured data."""
        try:
            # Clean the response - remove any markdown formatting
            response = response.strip()
            if response.startswith('```'):
                response = response.split('\n', 1)[1]
            if response.endswith('```'):
                response = response.rsplit('\n', 1)[0]
            # If any preface exists before the first JSON brace, trim to first '{'
            first_brace = response.find('{')
            if first_brace > 0:
                response = response[first_brace:]
            
            # Handle truncated JSON responses
            if not response.endswith('}'):
                # Try to find the last complete field and truncate there
                last_complete_brace = response.rfind('}')
                if last_complete_brace > 0:
                    response = response[:last_complete_brace + 1]
                else:
                    # If no complete JSON, try to add missing closing braces
                    open_braces = response.count('{')
                    close_braces = response.count('}')
                    missing_braces = open_braces - close_braces
                    if missing_braces > 0:
                        response += '}' * missing_braces
            
            # Parse JSON
            result = json.loads(response)
            
            # Validate required fields - medical_category is optional but preferred
            # If missing, default to 'Other' instead of failing
            if 'medical_category' not in result:
                logger.warning("medical_category not in response, defaulting to 'Other'")
                result['medical_category'] = 'Other'
            
            # Validate categories
            if result.get('medical_category') not in self.medical_categories:
                result['medical_category'] = 'Other'
            
            # Ensure optional fields have default values
            # participants: coerce to int if numeric string, else None
            participants_val = result.get('participants', None)
            if participants_val is None:
                result['participants'] = None
            else:
                if isinstance(participants_val, (int, float)):
                    try:
                        result['participants'] = int(participants_val)
                    except Exception:
                        result['participants'] = None
                elif isinstance(participants_val, str):
                    p_str = participants_val.strip().replace(',', '')
                    if p_str.isdigit():
                        result['participants'] = int(p_str)
                    else:
                        try:
                            result['participants'] = int(float(p_str))
                        except Exception:
                            result['participants'] = None
                else:
                    result['participants'] = None

            result.setdefault('reason', None)
            cbl = result.get('clinical_bottom_line', '')
            result['clinical_bottom_line'] = cbl if isinstance(cbl, str) else ''

            tags_val = result.get('tags', [])
            if isinstance(tags_val, list):
                result['tags'] = [str(t).strip() for t in tags_val]
            elif isinstance(tags_val, str):
                # split comma-separated
                result['tags'] = [t.strip() for t in tags_val.split(',') if t.strip()]
            else:
                result['tags'] = []
            
            # Ensure ranking fields have default values
            # ranking_score and ranking_breakdown
            # Ensure breakdown exists with all keys and numeric values
            default_breakdown = {
                'focus_points': 0,
                'type_points': 0,
                'prevalence_points': 0,
                'hospitalization_points': 0,
                'clinical_outcome_points': 0,
                'impact_factor_points': 0,
                'temporality_points': 0,
                'prevention_penalty_points': 0,
                'biologic_penalty_points': 0,
                'screening_penalty_points': 0,
                'scores_penalty_points': 0,
                'subanalysis_penalty_points': 0
            }
            breakdown = result.get('ranking_breakdown', {})
            breakdown = breakdown if isinstance(breakdown, dict) else {}

            def _to_int(val):
                if isinstance(val, (int, float)):
                    try:
                        return int(val)
                    except Exception:
                        return 0
                if isinstance(val, str):
                    s = val.strip()
                    try:
                        return int(float(s))
                    except Exception:
                        return 0
                return 0

            sanitized_breakdown = {}
            for key, default_val in default_breakdown.items():
                sanitized_breakdown[key] = _to_int(breakdown.get(key, default_val))
            result['ranking_breakdown'] = sanitized_breakdown

            # ranking_score numeric
            rscore = result.get('ranking_score', 0)
            result['ranking_score'] = _to_int(rscore)
            
            return result
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"Error parsing enhanced Claude response: {e}")
            logger.error(f"Response was: {response}")
            return self._get_default_enhanced_response()
    
    def _get_default_enhanced_response(self) -> Dict:
        """Get default response structure for error cases."""
        return {
            'participants': None,
            'is_relevant': False,
            'reason': 'API error or content filtering',
            'medical_category': 'Other',
            'clinical_bottom_line': '',
            'tags': [],
            'ranking_score': 0,
            'ranking_breakdown': {
                'focus_points': 0,
                'type_points': 0,
                'prevalence_points': 0,
                'hospitalization_points': 0,
                'clinical_outcome_points': 0,
                'impact_factor_points': 0,
                'temporality_points': 0,
                'prevention_penalty_points': 0,
                'biologic_penalty_points': 0,
                'screening_penalty_points': 0,
                'scores_penalty_points': 0,
                'subanalysis_penalty_points': 0
            },
            'neurology_penalty_points': 0,
            'prevention_penalty_points': 0,
            'biologic_penalty_points': 0,
            'screening_penalty_points': 0,
            'scores_penalty_points': 0,
            'subanalysis_penalty_points': 0
        }
    
    def _calculate_rule_based_scores(self, article_data: Dict) -> Dict:
        """Calculate rule-based scoring points for relevant articles only."""
        title = article_data.get('title', '').lower()
        journal_name = article_data.get('journal', '').lower()
        
        neurology_penalty_points = 0
        
        # Rule 1: -2 points if the study is from the journal "Neurology"
        if journal_name == 'neurology':
            neurology_penalty_points = -2
            logger.info(f"Neurology penalty applied: {journal_name}")
        
        return {
            'neurology_penalty_points': neurology_penalty_points
        }
    
    def filter_article(self, article_data: Dict) -> Dict:
        """Filter a single article for relevance using Claude."""
        title = article_data.get('title', '')
        abstract = article_data.get('abstract', '')
        mesh_terms = article_data.get('mesh_terms', '')
        publication_type = article_data.get('publication_type', '')
        journal_name = article_data.get('journal', '')
        
        # Skip empty articles
        if not title and not abstract:
            return self._get_default_filtering_response()
        
        prompt = self.create_inclusion_based_filtering_prompt(title, abstract, mesh_terms, 
        publication_type, journal_name)
        
        logger.info(f"Filtering: {title[:50]}... (Journal: {journal_name})")
        
        try:
            # Call API directly
            response = self._call_api(prompt)
            
            return self.parse_filtering_response(response)
            
        except Exception as e:
            logger.error(f"Error calling {self.model_provider} API for filtering: {e}")
            # Return default response for error cases
            if "safety filters" in str(e) or "recitation filters" in str(e):
                logger.warning("Using fallback filtering response due to content filtering")
            return self._get_default_filtering_response()
    
    
    
    def classify_relevant_article(self, article_data: Dict) -> Dict:
        """Classify, rank, and summarize a relevant article using the specified model provider."""
        title = article_data.get('title', '')
        abstract = article_data.get('abstract', '')
        mesh_terms = article_data.get('mesh_terms', '')
        publication_type = article_data.get('publication_type', '')
        journal_name = article_data.get('journal', '')
        
        # Skip empty articles
        if not title and not abstract:
            return self._get_default_enhanced_response()
        
        prompt = self.create_classification_prompt(title, abstract, mesh_terms, 
                                                 publication_type, journal_name)
        
        logger.info(f"Classifying relevant article: {title[:50]}... (Journal: {journal_name})")
        
        
        try:
            # Call API directly
            response = self._call_api(prompt)
            
            return self.parse_enhanced_response(response)
            
        except Exception as e:
            logger.error(f"Error calling {self.model_provider} API for classification: {e}")
            # Return default response for error cases
            if "safety filters" in str(e) or "recitation filters" in str(e):
                logger.warning("Using fallback classification response due to content filtering")
            return self._get_default_enhanced_response()

    def classify_article_enhanced(self, article_data: Dict) -> Dict:
        """Classify a single article using the specified model provider with two-step approach."""
        # Step 1: Filter for relevance
        filtering_result = self.filter_article(article_data)
        
        # If not relevant, return with filtering results and default values
        if not filtering_result.get('is_relevant', False):
            result = self._get_default_enhanced_response()
            result.update(filtering_result)
            return result
        
        # Step 2: If relevant, perform full classification
        classification_result = self.classify_relevant_article(article_data)
        
        # Step 3: Apply rule-based scoring for relevant articles (title-based, journal-based)
        rule_based_scores = self._calculate_rule_based_scores(article_data)
        
        # Combine filtering, classification, and rule-based results
        result = classification_result.copy()
        result.update(filtering_result)
        
        # Extract AI-generated penalty/bonus points from ranking_breakdown
        ranking_breakdown = result.get('ranking_breakdown', {})
        
        # Extract all penalty and bonus points (both AI-generated and rule-based)
        prevention_penalty_points = ranking_breakdown.get('prevention_penalty_points', 0)
        biologic_penalty_points = ranking_breakdown.get('biologic_penalty_points', 0)
        screening_penalty_points = ranking_breakdown.get('screening_penalty_points', 0)
        scores_penalty_points = ranking_breakdown.get('scores_penalty_points', 0)
        subanalysis_penalty_points = ranking_breakdown.get('subanalysis_penalty_points', 0)
        
        # Add rule-based scores (title/journal based)
        neurology_penalty_points = rule_based_scores.get('neurology_penalty_points', 0)
        
        # Store all individual penalty/bonus scores at top level for database
        result['prevention_penalty_points'] = prevention_penalty_points
        result['biologic_penalty_points'] = biologic_penalty_points
        result['screening_penalty_points'] = screening_penalty_points
        result['scores_penalty_points'] = scores_penalty_points
        result['subanalysis_penalty_points'] = subanalysis_penalty_points
        result['neurology_penalty_points'] = neurology_penalty_points
        
        # Calculate total score (note: penalty points are already negative in the breakdown)
        # The AI should return these as negative values, but we'll ensure they are
        base_score = (ranking_breakdown.get('focus_points', 0) + 
                     ranking_breakdown.get('type_points', 0) + 
                     ranking_breakdown.get('prevalence_points', 0) + 
                     ranking_breakdown.get('hospitalization_points', 0) + 
                     ranking_breakdown.get('clinical_outcome_points', 0) + 
                     ranking_breakdown.get('impact_factor_points', 0) + 
                     ranking_breakdown.get('temporality_points', 0))
        
        total_score = (base_score + 
                      prevention_penalty_points + 
                      biologic_penalty_points + 
                      screening_penalty_points + 
                      scores_penalty_points + 
                      subanalysis_penalty_points +
                      neurology_penalty_points)
        
        result['ranking_score'] = max(0, total_score)  # Ensure score doesn't go below 0
        
        logger.info(f"Ranking breakdown: base={base_score}, "
                   f"prevention={prevention_penalty_points}, biologic={biologic_penalty_points}, "
                   f"screening={screening_penalty_points}, scores={scores_penalty_points}, "
                   f"subanalysis={subanalysis_penalty_points}, "
                   f"neurology={neurology_penalty_points}, total={result['ranking_score']}")
        
        return result
    
    
    
    def _call_api(self, prompt: str) -> str:
        """Call the appropriate API (Claude or Gemini) with the given prompt."""
        try:
            if self.model_provider == "claude":
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=2500,
                    temperature=0.01,  # Low temperature for consistent classification
                    messages=[{"role": "user", "content": prompt}],
                    timeout=60.0  # 60 second timeout to prevent hanging
                )
                return response.content[0].text
            elif self.model_provider == "gemini":
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.01,  # Low temperature for consistent classification
                        max_output_tokens=2500,  # Increased by 25% from 2000 to handle longer responses
                    )
                )
                # Handle Gemini API response properly
                if response.candidates and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    if candidate.finish_reason == 1:  # STOP - successful completion
                        if candidate.content and candidate.content.parts:
                            return candidate.content.parts[0].text
                        else:
                            raise Exception("No content in Gemini response")
                    elif candidate.finish_reason == 2:  # MAX_TOKENS - response was truncated
                        if candidate.content and candidate.content.parts:
                            return candidate.content.parts[0].text
                        else:
                            raise Exception("No content in truncated Gemini response")
                    elif candidate.finish_reason == 3:  # SAFETY - content was blocked by safety filters
                        logger.warning("Gemini response blocked by safety filters, using fallback")
                        raise Exception("Content blocked by safety filters")
                    elif candidate.finish_reason == 4:  # RECITATION - content was blocked by recitation filters
                        logger.warning("Gemini response blocked by recitation filters, using fallback")
                        raise Exception("Content blocked by recitation filters")
                    else:
                        raise Exception(f"Gemini API error: finish_reason={candidate.finish_reason}")
                else:
                    raise Exception("No candidates in Gemini response")
        except Exception as e:
            logger.error(f"Error calling {self.model_provider} API: {e}")
            raise
    

def classify_articles_batch(articles: List[Dict], model_provider: str = "claude") -> List[Dict]:
    """Classify a batch of articles using inclusion-based filtering (default: Claude Sonnet 4.5)."""
    classifier = MedicalArticleClassifier(model_provider=model_provider)
    classified_articles = []
    
    for i, article in enumerate(articles):
        try:
            logger.info(f"Processing article {i+1}/{len(articles)}: {article.get('pmid', 'unknown')}")
            
            # Use unified two-step classification (filter then classify)
            result = classifier.classify_article_enhanced(article)
            
            article_copy = article.copy()
            article_copy.update(result)
            
            classified_articles.append(article_copy)
            
            # Rate limiting - be respectful to Claude API
            # Two API calls per article, so we need to be more conservative
            time.sleep(1)  # Increased rate limiting for two-step approach
            
        except Exception as e:
            logger.error(f"Error processing article {article.get('pmid', 'unknown')}: {e}")
            # Add unclassified version with default values
            article_copy = article.copy()
            article_copy.update(classifier._get_default_enhanced_response())
            classified_articles.append(article_copy)
    
    logger.info(f"Processed {len(classified_articles)} articles using {model_provider} with inclusion-based filtering")
    return classified_articles



if __name__ == "__main__":
    # Test inclusion-based classification with Claude Sonnet 4.5
    test_article = {
        'title': 'Randomized controlled trial of statins in cardiovascular disease',
        'abstract': 'This study investigated the effects of statin therapy on cardiac outcomes...',
        'mesh_terms': 'Cardiovascular Diseases, Hydroxymethylglutaryl-CoA Reductase Inhibitors',
        'publication_type': 'Journal Article; Randomized Controlled Trial',
        'journal': 'New England Journal of Medicine'
    }
    
    print(f"{'='*60}")
    print(f"TESTING CLAUDE SONNET 4.5 CLASSIFIER WITH INCLUSION-BASED FILTERING")
    print(f"{'='*60}")
    
    try:
        classifier = MedicalArticleClassifier()  # Default is now Claude Sonnet 4.5
        
        # Test filtering step
        print(f"\n=== Testing Claude Filtering Step ===")
        filtering_result = classifier.filter_article(test_article)
        print(f"Filtering result: {filtering_result}")
        
        # Test full inclusion-based classification
        print(f"\n=== Testing Claude Full Classification ===")
        result = classifier.classify_article_enhanced(test_article)
        print(f"Full classification result: {result}")
        
        # Test with irrelevant article
        print(f"\n=== Testing Claude with Irrelevant Article ===")
        irrelevant_article = {
            'title': 'Pediatric vaccination schedules in developing countries',
            'abstract': 'This study examines vaccination protocols for children under 5...',
            'mesh_terms': 'Child, Preschool, Vaccination',
            'publication_type': 'Journal Article',
            'journal': 'Pediatric Journal'
        }
        
        irrelevant_result = classifier.classify_article_enhanced(irrelevant_article)
        print(f"Irrelevant article result: {irrelevant_result}")
        
    except Exception as e:
        print(f"Error testing Claude: {e}")
        print(f"Make sure ANTHROPIC_API_KEY is set in your .env file")

