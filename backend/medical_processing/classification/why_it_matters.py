"""
"Why it matters": a 1-2 sentence big picture for a relevant article, shown on its card in place of the clinical
bottom line. It says what the earlier evidence on the same question mostly showed and what this study adds.

The earlier studies come from the article's own reference list (Crossref has it within days of publication,
PubMed doesn't yet), or from a PubMed search when there is none. The AI picks up to 4 on the same question and
writes the line from their abstracts only. Every number and name in the line must appear in those abstracts.
Returns None whenever something is missing, and the card then keeps the clinical bottom line.
"""

import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

import requests

from medical_processing.config import PUBMED_BASE_URL

logger = logging.getLogger(__name__)

CROSSREF_URL = "https://api.crossref.org/works/"
MAX_EARLIER_STUDIES = 4
# Cited works that aren't studies of their own question, left out unless they are a systematic review or meta-analysis
NOT_STUDIES = {'Review', 'Practice Guideline', 'Guideline', 'Editorial', 'Comment', 'Letter', 'News',
               'Consensus Development Conference'}
SYSTEMATIC = {'Systematic Review', 'Meta-Analysis'}
# New articles of these kinds keep the bottom line: there is no study result to set against earlier evidence
SKIPPED_ARTICLE_TYPES = NOT_STUDIES | {'Case Reports'}
SEARCH_STUDY_TYPES = ('(randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] '
                      'OR clinical trial[pt] OR observational study[pt] OR cohort studies[mh])')

QUERY_PROMPT = """Write a PubMed search query that finds EARLIER studies on the same clinical question as this article: the same intervention (or the same drug class or procedure) in the same condition or patient group.

{article}

Rules:
- 2 or 3 concept groups joined by AND, each a few synonyms joined by OR, using [tiab] or [mh] tags.
- Do not add study-type or date filters; they are added automatically.
- Also give a broader query (drop the narrowest concept) in case the first finds nothing.

Output only JSON: {{"query": string, "broader_query": string}}"""

PICK_PROMPT = """A new article (below) needs a short big-picture line for internal medicine doctors, based on the most relevant earlier studies on the same clinical question.

NEW ARTICLE
{article}

CANDIDATE STUDIES ({source})
{candidates}

Pick up to 4 candidates that studied the same clinical question: the same condition or patient group, and the same kind of treatment, test or exposure. Any study design counts: randomized trials, meta-analyses, observational studies.
- Prefer the most recent and the most informative (large trials, meta-analyses).
- Leave out studies of mechanisms, epidemiology, methods or scores, background studies of other questions, and other reports of the same results as the new article.
- If fewer candidates are on the same question, pick only those. Picking none is fine.

Output only JSON: {{"picked": [numbers], "reason": "one short sentence"}}"""

WRITE_PROMPT = """Write a "Why it matters" line for this new article, for busy internal medicine doctors.

NEW ARTICLE
{article}

EARLIER STUDIES ON THE SAME QUESTION ({source})
{earlier}

Give the big picture in 1-2 sentences, at most 45 words: what the earlier evidence on this question mostly looked like (its designs and what it found), and what this study adds to it, with its main result in a few words.

Rules:
- Base it only on the abstracts above.
- Describe the earlier evidence as a whole, not study by study. No reference numbers.
- When an earlier study gives a different result for the new study's patient group (for example older or sicker patients), describe that result, not the overall one.
- Hedge every statement about the earlier evidence ("mostly", "predominantly", "largely"), because only some earlier studies are listed, and only say what most of them found. Never write "no study", "none" or "all".
- No hype or verdicts: no "first", "landmark", "practice-changing", "definitive", "confirms", "settles".
- Say what the study adds in concrete terms, for example randomized evidence where earlier data were mostly observational, a different patient group, longer follow-up, or a hard clinical outcome. Mention an important harm if the abstract reports one.
- If the new article is not a study with results of its own (for example a narrative review, guideline, editorial or single case report), or the earlier studies don't show what it adds, output null.

Output only JSON: {{"why_it_matters": string or null}}"""

RETRY_NOTE = """

Your previous answer was: {line}
It used numbers or names that are not written in the abstracts above: {terms}. Write it again using numbers and names exactly as the abstracts give them, and spell out any abbreviation the abstracts don't use."""


def why_it_matters(classifier, article: Dict) -> Optional[Dict]:
    """The "Why it matters" line and the earlier studies it is based on, or None when there isn't a reliable one.
    Never raises, so a failure here can't stop an article from being saved."""
    try:
        return _why_it_matters(classifier, article)
    except Exception as e:
        logger.error(f"Why it matters for {article.get('pmid')} failed: {e}")
        return None


def _why_it_matters(classifier, article: Dict) -> Optional[Dict]:
    types = set(filter(None, (t.strip() for t in (article.get('publication_type') or '').split(';'))))
    if not article.get('abstract') or (types & SKIPPED_ARTICLE_TYPES and not types & SYSTEMATIC):
        return None

    block = (f"Title: {article.get('title', '')}\nJournal: {article.get('journal', '')}\n"
             f"Published: {article.get('publication_date', '')}\nAbstract: {article['abstract']}")
    before = (article.get('publication_date') or '9999').replace('-', '/')

    candidates, source = _cited_studies(article, before), "from the new article's own reference list"
    if not candidates:
        candidates = _searched_studies(classifier, block, article.get('pmid'), before)
        source = "from a PubMed search; the article's reference list was not available"
    if not candidates:
        return None

    listing = '\n'.join(f"[{i}] {c['year']} · {c['journal']} · {c['design'] or 'study'} · {c['title']}"
                        for i, c in enumerate(candidates, 1))
    picked = _ask(classifier, PICK_PROMPT.format(article=block, source=source, candidates=listing), 'picked').get('picked') or []
    chosen = [candidates[i - 1] for i in picked if isinstance(i, int) and 0 < i <= len(candidates)][:MAX_EARLIER_STUDIES]
    abstracts = _abstracts([c['pmid'] for c in chosen]) if chosen else {}
    chosen = sorted(({**c, 'abstract': abstracts[c['pmid']]} for c in chosen if abstracts.get(c['pmid'])),
                    key=lambda c: c['year'], reverse=True)
    if not chosen:
        return None

    earlier = '\n\n'.join(f"- {c['year']}, {c['journal']}, {c['design'] or 'study'}: {c['title']}\n  Abstract: {c['abstract']}"
                          for c in chosen)
    prompt = WRITE_PROMPT.format(article=block, source=source, earlier=earlier)
    sources = [article.get('title', ''), article['abstract']] + [c['title'] + ' ' + c['abstract'] for c in chosen]
    line = _ask(classifier, prompt, 'why_it_matters').get('why_it_matters')
    unsupported = _unsupported_terms(line, sources)
    if unsupported:
        logger.info(f"Why it matters for {article.get('pmid')}: rewriting, not in the abstracts: {unsupported}")
        line = _ask(classifier, prompt + RETRY_NOTE.format(line=line, terms=', '.join(unsupported)),
                    'why_it_matters').get('why_it_matters')
        unsupported = _unsupported_terms(line, sources)
    if not isinstance(line, str) or not line.strip() or unsupported:
        if unsupported:
            logger.warning(f"Why it matters for {article.get('pmid')} dropped, not in the abstracts: {unsupported}")
        return None

    return {
        'why_it_matters': line.strip(),
        'why_it_matters_sources': [{k: c[k] for k in ('pmid', 'year', 'journal', 'design', 'title')} for c in chosen],
    }


def _ask(classifier, prompt: str, required_key: str) -> Dict:
    text = classifier._call_api(prompt)
    start = text.find('{')
    if start == -1:
        return {}
    try:
        return classifier._final_json_answer(text[start:], required_key)
    except ValueError:
        logger.warning(f"Unreadable answer for {required_key}: {text[:200]}")
        return {}


def _eutils(endpoint: str, **data) -> requests.Response:
    # PubMed allows 3 requests a second without an API key, and sometimes fails for a moment (502, 429)
    for wait in (0.4, 2, 5):
        time.sleep(wait)
        response = requests.post(PUBMED_BASE_URL + endpoint, data={'db': 'pubmed', **data}, timeout=60)
        if response.status_code not in (429, 500, 502, 503, 504):
            break
    response.raise_for_status()
    return response


def _summaries(pmids: List[str], exclude_pmid: Optional[str], before: str) -> List[Dict]:
    """Studies among `pmids` published before `before`, newest first, minus guidelines, narrative reviews and letters."""
    if not pmids:
        return []
    found = _eutils('esummary.fcgi', id=','.join(pmids), retmode='json').json().get('result', {})
    studies = []
    for pmid in pmids:
        summary = found.get(pmid) or {}
        types = set(summary.get('pubtype', []))
        if (not summary or pmid == exclude_pmid or summary.get('sortpubdate', '9999') >= before
                or (types & NOT_STUDIES and not types & SYSTEMATIC)):
            continue
        studies.append({'pmid': pmid, 'year': summary['sortpubdate'][:4], 'journal': summary.get('source', ''),
                        'title': summary.get('title', ''),
                        # PubMed's study-type labels, without the generic and funding ones
                        'design': ', '.join(t for t in summary.get('pubtype', [])
                                            if t != 'Journal Article' and not t.startswith('Research Support'))})
    return sorted(studies, key=lambda s: s['year'], reverse=True)


def _cited_studies(article: Dict, before: str) -> List[Dict]:
    """Studies in the article's reference list that PubMed has."""
    if not article.get('doi'):
        return []
    try:
        response = requests.get(CROSSREF_URL + article['doi'], timeout=30,
                                headers={'User-Agent': 'internal-medicine-app (article summaries)'})
        if not response.ok:
            return []
        dois = [ref['DOI'] for ref in response.json()['message'].get('reference', []) if ref.get('DOI')]
        if not dois:
            return []
        ids = _eutils('esearch.fcgi', term=' OR '.join(f'"{doi}"[doi]' for doi in dois), retmax=500,
                      retmode='json').json()['esearchresult']['idlist']
        return _summaries(ids, article.get('pmid'), before)
    except (requests.RequestException, ValueError, KeyError) as e:
        logger.warning(f"Reference list for {article.get('pmid')} not read: {e}")
        return []


def _searched_studies(classifier, block: str, exclude_pmid: Optional[str], before: str) -> List[Dict]:
    """Earlier studies on the same question from a PubMed search the AI writes, when there is no reference list."""
    queries = _ask(classifier, QUERY_PROMPT.format(article=block), 'query')
    for query in (queries.get('query'), queries.get('broader_query')):
        if not isinstance(query, str) or not query.strip():
            continue
        try:
            ids = _eutils('esearch.fcgi', term=f"({query}) AND {SEARCH_STUDY_TYPES} AND 1900/01/01:{before}[pdat]",
                          retmax=20, sort='relevance', retmode='json').json()['esearchresult']['idlist']
            studies = _summaries(ids, exclude_pmid, before)
        except (requests.RequestException, ValueError, KeyError) as e:
            logger.warning(f"PubMed search for earlier studies failed: {e}")
            return []
        if len(studies) >= 2:
            return studies
    return []


def _abstracts(pmids: List[str]) -> Dict[str, str]:
    try:
        root = ET.fromstring(_eutils('efetch.fcgi', id=','.join(pmids), retmode='xml').content)
    except (requests.RequestException, ET.ParseError) as e:
        logger.warning(f"Abstracts of earlier studies not read: {e}")
        return {}
    return {a.findtext('.//PMID'): ' '.join(''.join(t.itertext()) for t in a.findall('.//Abstract/AbstractText')).strip()
            for a in root.findall('.//PubmedArticle')}


def _normalize(text: str) -> str:
    # Journals write decimals and thousands differently (Lancet: 8·3 and 110 933)
    text = (text or '').replace('·', '.').replace('−', '-')
    return re.sub(r'(?<=\d)[,\s](?=\d{3}\b)', '', text)


def _unsupported_terms(line, sources: List[str]) -> List[str]:
    """Numbers and names (words with 2 or more capitals, like trial names) in `line` that no source contains."""
    if not isinstance(line, str):
        return []
    text = _normalize(' '.join(sources))
    lowered = text.lower()
    numbers = set(re.findall(r'\d+(?:\.\d+)?', _normalize(line)))
    missing = [n for n in numbers if not re.search(r'(?<![\d.])' + re.escape(n) + r'(?!\d|\.\d)', text)]
    names = {part for word in re.findall(r'\b[A-Z][\w-]*[A-Z][\w-]*', line) for part in word.split('-')
             if sum(ch.isupper() for ch in part) >= 2}
    missing += [name for name in names if name.lower() not in lowered]
    return sorted(missing)
