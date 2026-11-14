import React, { useState } from "react";
import { localClient } from "@/api/localClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, Lightbulb, Loader2, Send } from "lucide-react";

const MAX_LENGTH = 5000;

export default function SuggestionBox() {
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null); // { anonymous }
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError(null);
    try {
      await localClient.sendSuggestion(content.trim(), anonymous);
      setSent({ anonymous });
      setContent("");
      setAnonymous(false);
    } catch (err) {
      setError(err.message || "Couldn't send your suggestion. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="professional-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Lightbulb className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Suggestion Box</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              An idea for the app, something that bugs you, or a topic you'd like covered? Write it here and it goes
              straight to Gil.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="mt-6 space-y-4">
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800">
                Thank you! Your suggestion was sent{sent.anonymous ? " anonymously" : ""}.
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => setSent(null)}>
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suggestion">Your suggestion</Label>
              <Textarea
                id="suggestion"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_LENGTH}
                rows={6}
                placeholder="It would be great if…"
                disabled={sending}
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="anonymous"
                checked={anonymous}
                onCheckedChange={(checked) => setAnonymous(checked === true)}
                disabled={sending}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="anonymous" className="cursor-pointer">Send anonymously</Label>
                <p className="mt-0.5 text-xs text-slate-500">
                  {anonymous
                    ? "Your name and email won't be saved or shared, so Gil won't be able to reply."
                    : "Gil will see your name and can reply by email."}
                </p>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={sending || !content.trim()}
              className="bg-slate-800 text-white hover:bg-slate-900"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send suggestion
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
