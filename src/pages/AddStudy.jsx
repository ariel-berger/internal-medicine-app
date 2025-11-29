import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MedicalArticle } from "@/api/medicalArticles";
import { Badge } from "@/components/ui/badge";

export default function AddStudy() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const article = await MedicalArticle.addSingle(url);
      setResult(article);
    } catch (err) {
      setError(err.message || "Failed to add study. Please check the URL/ID and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Add Study</h1>
            <p className="text-slate-600 mt-1">Add a new study from PubMed by URL or ID</p>
          </div>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle>Import from PubMed</CardTitle>
            <CardDescription>
              Enter a PubMed URL or ID to fetch, classify, and add the study to the database.
              The study will be automatically marked as a key study.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={loading || !url.trim()}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Fetch & Add
                      </>
                    )}
                  </Button>
                </div>
                
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </form>
            ) : (
              <div className="space-y-6">
                <Alert className="bg-emerald-50 border-emerald-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-emerald-800 font-medium">Study Added Successfully</AlertTitle>
                  <AlertDescription className="text-emerald-700">
                    The article has been classified, saved, and marked as a key study.
                  </AlertDescription>
                </Alert>

                <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                        <h3 className="text-lg font-semibold text-slate-900 leading-tight">{result.title}</h3>
                        <Badge variant={result.ranking_score >= 8 ? "default" : "secondary"}>
                            Score: {result.ranking_score}
                        </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                        {result.journal && <span className="font-medium text-slate-700">{result.journal}</span>}
                        <span>•</span>
                        {result.publication_date && <span>{result.publication_date}</span>}
                        <span>•</span>
                        <a 
                            href={`https://pubmed.ncbi.nlm.nih.gov/${result.pmid}/`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            PMID: {result.pmid}
                        </a>
                    </div>
                  </div>

                  {result.clinical_bottom_line && (
                    <div className="bg-blue-50 p-4 rounded-md">
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">Clinical Bottom Line</h4>
                        <p className="text-sm text-blue-800">{result.clinical_bottom_line}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Abstract</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        {result.abstract || "No abstract available."}
                    </p>
                  </div>
                  
                  {result.tags && result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                        {result.tags.map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button onClick={handleReset} variant="outline">
                    Add Another
                  </Button>
                  <Button onClick={() => navigate(createPageUrl("Dashboard"))}>
                    Go to Dashboard
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
