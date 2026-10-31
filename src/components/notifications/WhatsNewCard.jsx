import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

const SAVE_LABELS = { saving: "Saving…", saved: "Saved", error: "Couldn't save. Your text is still here; try again." };

// The editable "What's new" section of the weekly email, pre-filled with suggested updates.
export default function WhatsNewCard({ value, suggested, onChange, saveState }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          What's new on the dashboard
        </CardTitle>
        <CardDescription>
          Shown below the articles. One update per line; start with a short title and a colon to make it bold. Leave it
          empty to leave the section out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="No new updates were suggested this week. Add any here, or leave it empty."
          aria-label="What's new on the dashboard"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={saveState === "error" ? "text-red-600" : "text-slate-500"}>{SAVE_LABELS[saveState] || ""}</span>
          {suggested && value !== suggested && (
            <button
              type="button"
              onClick={() => onChange(suggested)}
              className="text-blue-700 hover:underline underline-offset-4"
            >
              Back to suggestions
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
