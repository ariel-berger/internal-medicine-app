import React, { useEffect, useState } from "react";
import { localClient } from "@/api/localClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Lightbulb, Loader2, RotateCcw } from "lucide-react";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function SuggestionRow({ suggestion, onToggle, busy }) {
  return (
    <li className={`rounded-lg border p-4 ${suggestion.done ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${suggestion.done ? "text-slate-500" : "text-slate-900"}`}>
        {suggestion.content}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {suggestion.author_email ? (
            <>
              {suggestion.author_name || suggestion.author_email} ·{" "}
              <a href={`mailto:${suggestion.author_email}`} className="text-blue-700 hover:underline">
                {suggestion.author_email}
              </a>
            </>
          ) : (
            "Anonymous"
          )}
          {" · "}
          {formatDate(suggestion.created_at)}
        </p>
        <Button size="sm" variant="outline" onClick={() => onToggle(suggestion)} disabled={busy}>
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : suggestion.done ? (
            <RotateCcw className="w-4 h-4 mr-1.5" />
          ) : (
            <Check className="w-4 h-4 mr-1.5" />
          )}
          {suggestion.done ? "Reopen" : "Mark as done"}
        </Button>
      </div>
    </li>
  );
}

export default function SuggestionsCard() {
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    localClient
      .getSuggestions()
      .then(setSuggestions)
      .catch((err) => setError(err.message || "Couldn't load suggestions."));
  }, []);

  const handleToggle = async (suggestion) => {
    setBusyId(suggestion.id);
    setError(null);
    try {
      const updated = await localClient.setSuggestionDone(suggestion.id, !suggestion.done);
      setSuggestions((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err.message || "Couldn't update the suggestion. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const open = (suggestions || []).filter((s) => !s.done);
  const done = (suggestions || []).filter((s) => s.done);

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-600" />
          Suggestion Box
          {open.length > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{open.length} new</Badge>}
        </CardTitle>
        <CardDescription>
          What colleagues sent from the Suggestion Box page. Each one is also emailed to you when it arrives.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {suggestions === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {suggestions !== null && open.length === 0 && (
          <p className="text-sm text-slate-500">No open suggestions right now.</p>
        )}
        {open.length > 0 && (
          <ul className="space-y-3">
            {open.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} onToggle={handleToggle} busy={busyId === s.id} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {showDone ? "Hide" : "Show"} {done.length} done
            </button>
            {showDone && (
              <ul className="space-y-3">
                {done.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} onToggle={handleToggle} busy={busyId === s.id} />
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
