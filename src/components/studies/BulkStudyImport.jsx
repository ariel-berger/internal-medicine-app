
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader, CheckCircle, AlertCircle, ExternalLink, RotateCcw, Baby } from "lucide-react";
import { InvokeLLM } from "@/api/integrations";
import { Study } from "@/api/entities";

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

export default function BulkStudyImport({ onSuccess }) {
  const [urls, setUrls] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedStudies, setProcessedStudies] = useState([]);
  const [selectedStudies, setSelectedStudies] = useState(new Set()); // Initialize with new Set() directly
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  const handleExtractFromUrls = async () => {
    const urlList = urls.split('\n').map(url => url.trim()).filter(url => url.length > 0);
    
    if (urlList.length === 0) {
      setErrors(['Please enter at least one URL']);
      return;
    }

    setIsProcessing(true);
    setProcessedStudies([]);
    setSelectedStudies(new Set());
    setErrors([]);
    setProgress(0);

    const results = [];
    const processingErrors = [];

    for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i];
      setProgress(Math.round(((i + 1) / urlList.length) * 100));

      try {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // --- STEP 1: EXTRACT DATA AND ORIGINAL ABSTRACT ---
        const result = await InvokeLLM({
          prompt: `You are a data extractor. Analyze the study at this URL: ${url}

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
              study_type: { type: "string", enum: STUDY_TYPES },
              specialties: { type: "array", items: { type: "string", enum: SPECIALTIES } },
              country: { type: "string", nullable: true },
              sample_size: { type: "number", nullable: true },
              summary: { type: "string", nullable: true },
              key_findings: { type: "string", nullable: true },
              is_pediatric: { type: "boolean" },
            },
            required: ["original_abstract_text", "title", "journal"]
          }
        });

        if (result.title && result.journal) {
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
              if (verificationResult.corrected_summary) {
                finalSummary = verificationResult.corrected_summary;
              }
            } catch (verificationError) {
              console.error('Summary verification failed, using original abstract as summary.', verificationError);
              finalSummary = result.original_abstract_text; // Fallback to be safe
            }
          } else if (!result.summary && result.original_abstract_text) {
              finalSummary = result.original_abstract_text;
          }

          results.push({
            ...result,
            summary: finalSummary, // Use the verified summary
            url: url,
            is_major_journal: isMajorJournal(result.journal),
            clinical_relevance: "High"
          });
        } else {
          processingErrors.push(`${url}: Failed to extract key study information (title or journal missing).`);
        }
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        processingErrors.push(`${url}: An unexpected error occurred during processing.`);
      }
    }

    setProcessedStudies(results);
    
    const autoSelectIndices = results
      .map((study, index) => ({ study, index }))
      .filter(({ study }) => !study.is_pediatric)
      .map(({ index }) => index);
    
    setSelectedStudies(new Set(autoSelectIndices));
    setErrors(processingErrors);
    setIsProcessing(false);
  };
  
  const handleToggleStudy = (index) => {
    setSelectedStudies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSubmitSelected = async () => {
    const studiesToAdd = processedStudies
      .filter((_, index) => selectedStudies.has(index))
      .map(study => ({
        title: study.title,
        journal: study.journal,
        url: study.url,
        is_major_journal: study.is_major_journal,
        study_type: study.study_type,
        specialties: study.specialties,
        country: study.country || null, // Ensure null if LLM returns null
        sample_size: study.sample_size,
        summary: study.summary,
        key_findings: study.key_findings,
        publication_date: study.publication_date || null, // Ensure null if LLM returns null
        clinical_relevance: study.clinical_relevance
      }));

    if (studiesToAdd.length === 0) {
      setErrors(['No studies selected to add.']);
      return;
    }

    setIsSubmitting(true);
    setErrors([]);
    try {
      await Study.bulkCreate(studiesToAdd);
      onSuccess();
    } catch (error) {
      setErrors([`Failed to save studies: ${error.message}`]);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleReset = () => {
    setUrls('');
    setIsProcessing(false);
    setProcessedStudies([]);
    setSelectedStudies(new Set());
    setProgress(0);
    setIsSubmitting(false);
    setErrors([]);
  };

  const pediatricCount = processedStudies.filter(study => study.is_pediatric).length;

  return (
    <div className="space-y-6">
      <Card className="medical-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Bulk Import from URLs
          </CardTitle>
          <CardDescription>
            Paste multiple PubMed or journal URLs (one per line) to extract and import studies automatically.
            Pediatric studies will be automatically unchecked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="urls" className="text-sm font-semibold text-slate-700">
              Study URLs (one per line)
            </Label>
            <Textarea
              id="urls"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={`https://pubmed.ncbi.nlm.nih.gov/12345678
https://pubmed.ncbi.nlm.nih.gov/87654321
https://www.nejm.org/doi/full/10.1056/example`}
              rows={6}
              className="mt-2 font-mono text-sm"
              disabled={isProcessing}
            />
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Processing Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {errors.map((error, i) => (
                    <li key={i} className="text-xs">{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {pediatricCount > 0 && processedStudies.length > 0 && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Auto-filtering Applied</AlertTitle>
              <AlertDescription className="text-blue-700">
                {pediatricCount} pediatric studies were automatically unchecked. You can manually select them if needed.
              </AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">Processing URLs... ({progress}%)</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}
          
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleExtractFromUrls}
              disabled={isProcessing || !urls.trim()}
              className="w-full sm:w-auto"
            >
              {isProcessing ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Extract Studies from URLs
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isProcessing}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Over
            </Button>
          </div>
        </CardContent>
      </Card>

      {processedStudies.length > 0 && (
        <Card className="medical-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Review Extracted Studies</CardTitle>
              <CardDescription>
                Select the studies you want to add to your dashboard. Pediatric studies are unchecked by default.
              </CardDescription>
            </div>
            <Button
              onClick={handleSubmitSelected}
              disabled={isSubmitting || selectedStudies.size === 0}
              className="medical-gradient text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Add {selectedStudies.size} Selected
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {processedStudies.map((study, index) => (
              <div key={index} className={`border rounded-lg p-4 ${
                study.is_pediatric ? 'border-orange-200 bg-orange-50' : 'border-slate-200'
              }`}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedStudies.has(index)}
                    onCheckedChange={() => handleToggleStudy(index)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {study.is_pediatric && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                          <Baby className="w-3 h-3 mr-1" />
                          Pediatric Study
                        </Badge>
                      )}
                      {study.is_major_journal && (
                        <Badge className="bg-amber-100 text-amber-800">Major Journal</Badge>
                      )}
                      {study.specialties?.map(spec => (
                        <Badge key={spec} variant="outline">{spec.replace(/_/g, ' ')}</Badge>
                      ))}
                      <Badge variant="secondary">{study.study_type}</Badge>
                      {study.sample_size && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {study.sample_size.toLocaleString()} participants
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-semibold text-slate-900">{study.title}</h4>
                    <div className="text-sm text-slate-600 flex items-center gap-4">
                      <span className="font-medium">{study.journal}</span>
                      <a
                        href={study.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Source
                      </a>
                    </div>
                    <p className="text-sm text-slate-700">{study.summary}</p>
                    {/* mechanism_of_action is now part of summary based on new prompt rules */}
                    {study.is_pediatric && (
                      <p className="text-xs text-orange-600 font-medium">
                        This study focuses on pediatric/children populations and was automatically unchecked.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
