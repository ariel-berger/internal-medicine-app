import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader, UserPlus, Users } from "lucide-react";
import { localClient } from "@/api/localClient";

// Admins can add addresses but only ever see totals: who has unsubscribed stays private.
export default function AddSubscribersCard({ recipientsCount, onRecipientsCountChange }) {
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    setIsSaving(true);
    setError("");
    setResult(null);
    try {
      const response = await localClient.addWeeklyEmailSubscribers(text);
      setResult(response);
      onRecipientsCountChange(response.recipients_count);
      if (response.added + response.already_on_list > 0 && response.invalid.length === 0) setText("");
    } catch (e) {
      setError(e.message || "Couldn't add the addresses. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-600" />
          Who gets the weekly email
        </CardTitle>
        <CardDescription>
          <strong>{recipientsCount ?? "…"} people</strong>: everyone who has logged in, plus addresses added here, minus
          anyone who unsubscribed. Who has unsubscribed is private, so it isn't shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="add-subscribers" className="text-sm font-medium text-slate-900">
          Add email addresses
        </label>
        <Textarea
          id="add-subscribers"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="One per line or separated by commas. You can paste straight from an email."
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleAdd} disabled={!text.trim() || isSaving} variant="outline">
            {isSaving ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Add to the list
          </Button>
          <span className="text-xs text-slate-500">
            They get the same one-click unsubscribe link. Anyone who already unsubscribed stays unsubscribed.
          </span>
        </div>

        {result && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 space-y-1">
            <p>
              {result.added === 0 && result.already_on_list === 0
                ? "No email addresses found in what you pasted."
                : `Added ${result.added} new address${result.added === 1 ? "" : "es"}.` +
                  (result.already_on_list ? ` ${result.already_on_list} ${result.already_on_list === 1 ? "was" : "were"} already on the list.` : "")}
            </p>
            {result.invalid.length > 0 && (
              <p className="text-amber-800">
                Skipped because they don't look like email addresses: {result.invalid.join(", ")}
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
