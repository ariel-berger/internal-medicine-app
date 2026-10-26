// Journal impact factors (2024), copied from the journal_impact_scores table in
// backend/medical_articles.db. Keys are journal names as PubMed reports them, lowercased.
const JOURNAL_IMPACT_FACTORS = {
  'the new england journal of medicine': 176.079,
  'lancet (london, england)': 168.9,
  'jama': 120.7,
  'bmj (clinical research ed.)': 105.7,
  'annals of internal medicine': 51.1,
  'journal of clinical oncology : official journal of the american society of clinical oncology': 50.717,
  'european heart journal': 39.3,
  'circulation': 37.8,
  'american journal of respiratory and critical care medicine': 30.528,
  'annals of the rheumatic diseases': 27.4,
  'gut': 24.5,
  'journal of the american college of cardiology': 24.0,
  'blood': 20.3,
  'kidney international': 19.6,
  'diabetes care': 16.2,
  'arthritis & rheumatology (hoboken, n.j.)': 15.7,
  'hepatology (baltimore, md.)': 15.3,
  'journal of the american society of nephrology : jasn': 13.6,
  'neurology': 12.3,
  'clinical infectious diseases : an official publication of the infectious diseases society of america': 11.8,
  'annals of neurology': 11.2,
  'chest': 9.6,
  'hypertension (dallas, tex. : 1979)': 8.3,
  'the journal of infectious diseases': 6.4,
  'the journal of clinical endocrinology and metabolism': 5.8,
  'journal of general internal medicine': 5.7,
};

// Same cutoff the backend uses for a study's is_major_journal flag
export const MAJOR_JOURNAL_MIN_IMPACT_FACTOR = 25;

export function getJournalImpactFactor(journal) {
  if (!journal) return null;
  return JOURNAL_IMPACT_FACTORS[journal.toLowerCase().trim()] ?? null;
}

export function isMajorJournal(journal) {
  const impactFactor = getJournalImpactFactor(journal);
  return impactFactor !== null && impactFactor >= MAJOR_JOURNAL_MIN_IMPACT_FACTOR;
}
