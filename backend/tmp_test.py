from medical_processing.classification.classifier import MedicalArticleClassifier

classifier = MedicalArticleClassifier(model_provider='claude')

sample = {
    'title': 'Randomized trial of antibiotics in severe sepsis',
    'abstract': 'A multicenter RCT evaluated early broad-spectrum antibiotics in adults with septic shock...',
    'mesh_terms': 'Sepsis; Anti-Bacterial Agents; Intensive Care Units',
    'publication_type': 'Randomized Controlled Trial',
    'journal': 'N Engl J Med'
}

result = classifier.classify_relevant_article(sample)
print('HAS_MED_CATEGORY=', 'medical_category' in result, result.get('medical_category'))
print('RANK_KEYS=', sorted(list(result.get('ranking_breakdown', {}).keys())))
