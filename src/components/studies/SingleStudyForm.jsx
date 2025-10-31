
import React, { useState, useEffect } from "react";
import { Study } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Save, BookOpen, Plus, AlertCircle, ChevronDown, RotateCcw, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InvokeLLM } from "@/api/integrations";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const SPECIALTIES = [
  "Cardiology", "Nephrology", "Endocrinology", "Pulmonology",
  "Gastroenterology", "Rheumatology", "Infectious_Disease",
  "Hematology", "Critical_Care", "General_Internal_Medicine", "Neurology"
];

const STUDY_TYPES = ["RCT", "Observational", "Review", "Meta-analysis", "Case-Control", "Cohort", "Case Report"];

const isMajorJournal = (journalName) => {
  if (!journalName) return false;
  const journal = journalName.toLowerCase().trim();

  if (journal.includes('nejm') || journal.includes('new england journal')) return true;
  if (journal.includes('jama')) return true;
  if (journal.includes('lancet')) return true;
  if (journal.includes('bmj')) return true;
  if (journal.includes('annals of internal medicine')) return true;
  if (journal.includes('circulation')) return true;
  if (journal.includes('nature')) return true;

  return false;
};

const initialFormData = {
  title: "",
  journal: "",
  url: "",
  impact_factor: "",
  is_major_journal: false,
  study_type: "",
  specialties: [],
  country: "",
  sample_size: "",
  number_of_trials: "",
  summary: "",
  key_findings: "",
  publication_date: "",
  clinical_relevance: "High",
  is_pediatric: false
};

export default function SingleStudyForm({ onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractSuccess, setExtractSuccess] = useState(false);
  const [studyUrl, setStudyUrl] = useState('');
  // Removed studyDoi state
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [pediatricWarning, setPediatricWarning] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const isMajor = isMajorJournal(formData.journal) || (formData.impact_factor && parseFloat(formData.impact_factor) >= 25);
    if (isMajor !== formData.is_major_journal) {
      handleInputChange('is_major_journal', isMajor);
    }
  }, [formData.journal, formData.impact_factor, formData.is_major_journal]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSpecialtyChange = (specialty) => {
    setFormData(prev => {
      const newSpecialties = new Set(prev.specialties);
      if (newSpecialties.has(specialty)) {
        newSpecialties.delete(specialty);
      } else {
        newSpecialties.add(specialty);
      }
      return { ...prev, specialties: Array.from(newSpecialties) };
    });
  };

  const checkForDuplicate = async (title) => {
    if (!title || !title.trim()) return false;
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const existingStudies = await Study.filter({ title: title.trim() });
      return existingStudies.length > 0;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setDuplicateWarning('');
    setSubmitSuccess(false);

    try {
      if (formData.title) {
        const isDuplicate = await checkForDuplicate(formData.title);
        if (isDuplicate) {
          setDuplicateWarning('A study with this exact title already exists on the dashboard.');
          setIsSubmitting(false);
          return;
        }
      }

      const isMajor = isMajorJournal(formData.journal) || (formData.impact_factor && parseFloat(formData.impact_factor) >= 25);

      await Study.create({
        ...formData,
        is_major_journal: !!isMajor,
        impact_factor: formData.impact_factor ? parseFloat(formData.impact_factor) : null,
        sample_size: formData.sample_size ? parseInt(formData.sample_size, 10) : null,
        number_of_trials: formData.number_of_trials ? parseInt(formData.number_of_trials, 10) : null
      });
      
      setSubmitSuccess(true);
      setFormData(initialFormData);
      setStudyUrl('');
      // Removed setStudyDoi('');
      setExtractError('');
      setDuplicateWarning('');
      setExtractSuccess(false);
      setPediatricWarning(false);
      
      setTimeout(() => setSubmitSuccess(false), 5000);
      
    } catch (error) {
      console.error("Error creating study:", error);
      setExtractError(`Failed to save study: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtract = async (source, value) => {
    if (!value.trim()) {
      setExtractError(`Please enter a valid URL`); // Updated message
      return;
    }

    setIsExtracting(true);
    setExtractError('');
    setDuplicateWarning('');
    setExtractSuccess(false);
    setPediatricWarning(false);

    // Removed DOI handling - only URL now
    const promptContext = `Analyze the medical study at this URL: ${value}`;

    try {      
      const result = await InvokeLLM({
        prompt: `${promptContext}

**Instructions:**
1.  Extract the fields below.
2.  Crucially, also extract the **full, unmodified text of the study's abstract**.
3.  If a field's information is not present in the text, return \`null\`.

**Fields to Extract:**
- **original_abstract_text**: The complete, raw text of the abstract. This is mandatory.
- **title**: The full title.
- **journal**: The journal name.
- **publication_date**: YYYY-MM-DD.
- **study_type**: Choose from: ${STUDY_TYPES.join(', ')}.
- **specialties**: Choose from: ${SPECIALTIES.join(', ')}.
- **country**: Country of research.
- **sample_size**: Number of participants.
- **summary**: A concise summary of the abstract. **Crucially, if the primary endpoint is stated, it MUST be included in this summary.**
- **key_findings**: The main conclusion.
- **is_pediatric**: true if study is on children.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            original_abstract_text: { type: "string" },
            title: { type: "string" },
            journal: { type: "string" },
            publication_date: { type: "string", nullable: true },
            study_type: { "type": "string", "enum": STUDY_TYPES },
            specialties: { "type": "array", "items": { "type": "string", "enum": SPECIALTIES } },
            country: { type: "string", nullable: true },
            sample_size: { type: "number", nullable: true },
            summary: { type: "string", nullable: true },
            key_findings: { type: "string", nullable: true },
            is_pediatric: { type: "boolean" },
          },
          required: ["original_abstract_text", "title", "journal"]
        }
      });

      if (!result.title) {
        setExtractError(`Could not extract study information. Please try a different URL or fill manually.`);
        setIsExtracting(false);
        return;
      }
      
      // Check for duplicates
      if (result.title && result.title.trim()) {
        const isDuplicate = await checkForDuplicate(result.title);
        if (isDuplicate) {
          setDuplicateWarning('A study with this title already exists. You can still proceed if intentional.');
        }
      }

      // Check for pediatric study
      if (result.is_pediatric) {
        setPediatricWarning(true);
      }

      let finalSummary = result.summary;

      // --- STEP 2: VERIFY THE SUMMARY ---
      if (result.summary && result.original_abstract_text) {
        try {
          const verificationResult = await InvokeLLM({
            prompt: `You are a meticulous fact-checker. Compare the 'generated_summary' against the 'original_abstract'. Your task is to produce a 'corrected_summary' that contains ONLY information explicitly stated in the 'original_abstract'.

**ACTION:**
- Read the generated summary sentence by sentence.
- For each sentence, verify if the claim is directly supported by a sentence in the original abstract.
- **REMOVE any sentences, phrases, or claims (e.g., specific adverse effects, numbers, or procedures) that are NOT directly stated in the original abstract.**
- The output should be a clean, fact-checked summary. If the generated summary is entirely fabricated, return an empty string.

**Original Abstract:**
---
${result.original_abstract_text}
---

**Generated Summary to Verify:**
---
${result.summary}
---`,
            response_json_schema: {
              type: "object",
              properties: {
                corrected_summary: {
                  type: "string",
                  description: "The verified and corrected summary containing only information from the original abstract."
                }
              },
              required: ["corrected_summary"]
            }
          });
          if (verificationResult.corrected_summary !== undefined && verificationResult.corrected_summary !== null) {
            finalSummary = verificationResult.corrected_summary;
          } else if (result.original_abstract_text) {
              console.warn('Summary verification did not return a valid corrected_summary. Using original abstract as summary.');
              finalSummary = result.original_abstract_text; // Fallback
          } else {
              finalSummary = ''; // No abstract, no summary
          }
        } catch (verificationError) {
          console.error('Summary verification failed, using original abstract as summary.', verificationError);
          finalSummary = result.original_abstract_text; // Fallback to be safe
        }
      } else if (!result.summary && result.original_abstract_text) {
          // If no summary was initially generated but we have the abstract, use abstract as summary.
          finalSummary = result.original_abstract_text;
      }


      setFormData(prev => ({
        ...prev,
        title: result.title || '',
        journal: result.journal || '',
        url: value, // Removed DOI conditional, now always uses the passed value
        study_type: result.study_type || '',
        specialties: result.specialties || [],
        sample_size: result.sample_size ? result.sample_size.toString() : '',
        country: result.country || '',
        summary: finalSummary || '', // Use the verified summary
        key_findings: result.key_findings || '',
        publication_date: result.publication_date || '',
        is_pediatric: result.is_pediatric || false
      }));

      setExtractSuccess(true);
      setTimeout(() => setExtractSuccess(false), 5000);

    } catch (error) {
      console.error('Extraction error:', error);
      setExtractError(`Extraction failed: ${error.message || 'Please try again or fill manually'}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleClearForm = () => {
    setFormData(initialFormData);
    setStudyUrl('');
    // Removed setStudyDoi('');
    setExtractError('');
    setDuplicateWarning('');
    setExtractSuccess(false);
    setSubmitSuccess(false);
    setPediatricWarning(false);
  };

  return (
    <div className="space-y-6">
      {/* Removed submitSuccess alert from here */}

      <Card className="professional-card">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Plus className="w-5 h-5 text-slate-600" />
            Quick Import
            {/* Moved extractSuccess alert */}
          </CardTitle>
          <CardDescription className="pt-2">
            Use a URL from PubMed for best results. Direct journal website links may not work due to paywalls.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="study-url" className="text-sm font-semibold text-slate-700">
                Study URL
              </Label>
              <Input
                id="study-url"
                type="url"
                value={studyUrl}
                onChange={(e) => setStudyUrl(e.target.value)}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                className="mt-2"
              />
               <Button
                onClick={() => handleExtract('URL', studyUrl)}
                disabled={isExtracting || !studyUrl.trim()}
                className="w-full sm:w-auto mt-2"
                variant="outline"
              >
                {isExtracting ? 'Extracting...' : 'Auto-fill from URL'}
              </Button>
              
              {/* Success message right under the button */}
              {extractSuccess && (
                <div className="flex items-center gap-2 mt-2 text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Form filled successfully!</span>
                </div>
              )}
            </div>
            {/* Removed the "Or" separator */}
            {/* Removed the Study DOI input field and its button */}

            {extractError && (
              <Alert variant="destructive"> {/* Removed mt-4 */}
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{extractError}</AlertDescription>
              </Alert>
            )}

            {pediatricWarning && (
              <Alert className="bg-orange-50 border-orange-200"> {/* Removed mt-4 */}
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-700">
                  <strong>Pediatric Study Detected:</strong> This study focuses on pediatric/children populations. 
                  Please verify this is appropriate for your clinical practice before adding.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="professional-card">
        <CardHeader className="border-b border-slate-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="w-5 h-5 text-slate-600" />
              Study Information
            </CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearForm}>
            <RotateCcw className="w-3 h-3 mr-2" />
            Clear Form
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="title" className="text-sm font-semibold text-slate-700">Study Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter the complete study title"
                  className="mt-2"
                  required
                />
                {duplicateWarning && (
                  <Alert className="mt-2 bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                      {duplicateWarning}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div>
                <Label htmlFor="journal" className="text-sm font-semibold text-slate-700">Journal</Label>
                <Input
                  id="journal"
                  value={formData.journal}
                  onChange={(e) => handleInputChange('journal', e.target.value)}
                  placeholder="e.g., New England Journal of Medicine"
                  className="mt-2"
                  required
                />
              </div>

              <div>
                <Label htmlFor="publication_date" className="text-sm font-semibold text-slate-700">Publication Date</Label>
                <Input
                  id="publication_date"
                  type="date"
                  value={formData.publication_date}
                  onChange={(e) => handleInputChange('publication_date', e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="impact_factor" className="text-sm font-semibold text-slate-700">Impact Factor</Label>
                <Input
                  id="impact_factor"
                  type="number"
                  step="0.01"
                  value={formData.impact_factor}
                  onChange={(e) => handleInputChange('impact_factor', e.target.value)}
                  placeholder="e.g., 79.26"
                  className="mt-2"
                />
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <Switch
                  id="is_major_journal"
                  checked={formData.is_major_journal}
                  onCheckedChange={(checked) => handleInputChange('is_major_journal', checked)}
                />
                <Label htmlFor="is_major_journal" className="text-sm font-semibold text-slate-700">Major Journal</Label>
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <Switch
                  id="is_pediatric"
                  checked={formData.is_pediatric}
                  onCheckedChange={(checked) => handleInputChange('is_pediatric', checked)}
                />
                <Label htmlFor="is_pediatric" className="text-sm font-semibold text-slate-700">Pediatric Study</Label>
              </div>


              <div>
                <Label htmlFor="study_type" className="text-sm font-semibold text-slate-700">Study Type</Label>
                <Select
                  value={formData.study_type}
                  onValueChange={(value) => handleInputChange('study_type', value)}
                >
                  <SelectTrigger id="study_type" className="mt-2">
                    <SelectValue placeholder="Select study type" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDY_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="specialties" className="text-sm font-semibold text-slate-700">Specialty</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between mt-2">
                      <span>{formData.specialties.length > 0 ? `${formData.specialties.length} selected` : 'Select specialties'}</span>
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <div className="space-y-1 p-2 max-h-60 overflow-y-auto">
                      {SPECIALTIES.map(spec => (
                        <div key={spec} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-md">
                           <Checkbox
                            id={`spec-${spec}`}
                            checked={formData.specialties.includes(spec)}
                            onCheckedChange={() => handleSpecialtyChange(spec)}
                          />
                          <label
                            htmlFor={`spec-${spec}`}
                            className="text-sm font-medium leading-none flex-1 cursor-pointer"
                          >
                            {spec.replace(/_/g, ' ')}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label htmlFor="sample_size" className="text-sm font-semibold text-slate-700">Total Participants</Label>
                <Input
                  id="sample_size"
                  type="number"
                  value={formData.sample_size}
                  onChange={(e) => handleInputChange('sample_size', e.target.value)}
                  placeholder="e.g., 4675"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="number_of_trials" className="text-sm font-semibold text-slate-700">Number of Trials (for reviews)</Label>
                <Input
                  id="number_of_trials"
                  type="number"
                  value={formData.number_of_trials}
                  onChange={(e) => handleInputChange('number_of_trials', e.target.value)}
                  placeholder="e.g., 19"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="country" className="text-sm font-semibold text-slate-700">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => handleInputChange('country', e.target.value)}
                  placeholder="e.g., USA"
                  className="mt-2"
                />
              </div>

              {/* Primary Endpoint field removed as per requirements - LLM should include it in the summary */}

              <div className="md:col-span-2">
                <Label htmlFor="summary" className="text-sm font-semibold text-slate-700">Summary</Label>
                <Textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleInputChange('summary', e.target.value)}
                  placeholder="Provide a comprehensive summary including patient population, intervention, and key results."
                  className="mt-2 min-h-[100px]"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="key_findings" className="text-sm font-semibold text-slate-700">Key Findings & Clinical Relevance</Label>
                <Textarea
                  id="key_findings"
                  value={formData.key_findings}
                  onChange={(e) => handleInputChange('key_findings', e.target.value)}
                  placeholder="Highlight the most important clinical findings and their significance."
                  className="mt-2 min-h-[100px]"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="clinical_relevance" className="text-sm font-semibold text-slate-700">Overall Clinical Relevance</Label>
                <Select
                  value={formData.clinical_relevance}
                  onValueChange={(value) => handleInputChange('clinical_relevance', value)}
                >
                  <SelectTrigger id="clinical_relevance" className="mt-2">
                    <SelectValue placeholder="Select relevance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="url" className="text-sm font-semibold text-slate-700">Study URL (if not imported)</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => handleInputChange('url', e.target.value)}
                  placeholder="https://example.com/study-link"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-slate-800 text-white hover:bg-slate-900"
              >
                {isSubmitting ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Add Study
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Success message at the bottom of the form */}
          {submitSuccess && (
            <Alert className="mt-6 bg-emerald-50 border-emerald-200">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800">
                Study added successfully to the dashboard! You can add another study or return to view your studies.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
