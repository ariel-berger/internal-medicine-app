import React, { useState, useEffect, useMemo, useCallback } from "react";
import { User } from "@/api/entities";
import { localClient } from "@/api/localClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Mail, Loader, Send, SkipForward, FlaskConical, CheckCircle, AlertCircle, Shield, RotateCcw, ExternalLink } from "lucide-react";
import AddSubscribersCard from "@/components/notifications/AddSubscribersCard";

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const STATUS_LABELS = {
  sent: (d) => `Sent to ${d.recipients_count ?? 0} people`,
  skipped: () => "Skipped",
  expired: () => "Not sent (replaced by the next week's email)",
};

export default function WeeklyEmail() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null); // 'send' | 'test' | 'skip' | 'prepare'
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }
  const [confirm, setConfirm] = useState(null); // 'send' | 'skip'

  const load = useCallback(async () => {
    try {
      const result = await localClient.getWeeklyDigest();
      setData(result);
      setSelectedIds(result.suggested_ids || []);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Couldn't load this week's email." });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
        if (user.role === "admin") await load();
      } catch (e) {
        setCurrentUser(null);
      }
      setIsLoading(false);
    })();
  }, [load]);

  const digest = data?.digest;
  const articles = data?.articles || [];
  const maxArticles = data?.max_articles || 3;

  // Send in the list's order (key studies first, then by score), whatever order they were ticked in
  const orderedSelection = useMemo(
    () => articles.filter((a) => selectedIds.includes(a.id)).map((a) => a.id),
    [articles, selectedIds]
  );

  // While sending, check back every few seconds until it's done
  useEffect(() => {
    if (digest?.status !== "sending") return;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [digest, load]);

  useEffect(() => {
    if (!digest || digest.status !== "pending" || orderedSelection.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await localClient.previewWeeklyDigest(digest.id, orderedSelection);
        if (!cancelled) setPreview(result);
      } catch (e) {
        if (!cancelled) setPreview(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [digest, orderedSelection]);

  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const run = async (action, fn, successText, { reload = true } = {}) => {
    setBusy(action);
    setMessage(null);
    try {
      const result = await fn();
      if (successText) setMessage({ type: "success", text: successText(result) });
      if (reload) await load();
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const handleSend = () =>
    run("send", () => localClient.sendWeeklyDigest(digest.id, orderedSelection), (r) => `Sending to ${r.recipients_count} people. This takes about a minute.`);
  const handleTest = () =>
    run("test", () => localClient.sendWeeklyDigestTest(digest.id, orderedSelection), (r) => `Test email sent to ${r.sent_to}.`, { reload: false });
  const handleSkip = () => run("skip", () => localClient.skipWeeklyDigest(digest.id), () => "Skipped. Nothing was sent this week.");
  const handlePrepare = () => run("prepare", () => localClient.prepareWeeklyDigest());

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto text-slate-400 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-600">Only admins can approve the weekly email.</p>
      </div>
    );
  }

  const canChoose = digest?.status === "pending";
  const selectionFull = orderedSelection.length >= maxArticles;
  const isSuggestedSelection =
    orderedSelection.length === (data?.suggested_ids || []).length &&
    (data?.suggested_ids || []).every((id) => selectedIds.includes(id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Mail className="w-7 h-7 text-blue-600" />
          Weekly Email
        </h1>
        <p className="text-slate-600 mt-1">
          Every Saturday after the scan, this week's email waits here. Nothing reaches anyone until an admin presses Send.
        </p>
      </div>

      {message && (
        <Alert className={message.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          {message.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
          <AlertDescription className={message.type === "error" ? "text-red-800" : "text-green-800"}>{message.text}</AlertDescription>
        </Alert>
      )}

      {!digest && data?.this_week?.status === "sent" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              This week's email has been sent
            </CardTitle>
            <CardDescription>The next one will be prepared after Saturday's scan, and you'll get an email asking to approve it.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!digest && data?.this_week?.status !== "sent" && (
        <Card>
          <CardHeader>
            <CardTitle>{data?.this_week?.status === "skipped" ? "This week's email was skipped" : "No email waiting for approval"}</CardTitle>
            <CardDescription>
              After the Saturday scan, this week's email is prepared here and all admins get an email asking to approve it.
              If the scan didn't run, you can prepare it by hand from the articles added since Saturday.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handlePrepare} disabled={busy === "prepare"} variant="outline">
              {busy === "prepare" ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Prepare this week's email now
            </Button>
          </CardContent>
        </Card>
      )}

      {digest?.status === "sending" && (
        <Card>
          <CardContent className="py-8 flex items-center gap-3 text-slate-700">
            <Loader className="w-5 h-5 animate-spin text-blue-600" />
            Sending to {data.recipients_count} people… This page updates by itself.
          </CardContent>
        </Card>
      )}

      {canChoose && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg">This week's articles ({articles.length})</CardTitle>
              <CardDescription>
                Tick up to {maxArticles}. The suggested ones follow the dashboard order: key studies first, then by score.
                Case reports and articles hidden from the dashboard are left out.
              </CardDescription>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium text-slate-700">
                  {orderedSelection.length} of {maxArticles} selected
                </span>
                {!isSuggestedSelection && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(data.suggested_ids || [])}
                    className="text-sm text-blue-700 hover:underline underline-offset-4"
                  >
                    Back to suggested
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {articles.map((article) => {
                const checked = selectedIds.includes(article.id);
                const disabled = !checked && selectionFull;
                const suggested = (data.suggested_ids || []).includes(article.id);
                return (
                  <label
                    key={article.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      checked ? "border-blue-300 bg-blue-50/60" : "border-slate-200"
                    } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-slate-300"}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(article.id)}
                      className="mt-1"
                      aria-label={article.title}
                    />
                    <span className="w-9 shrink-0 text-center text-sm font-bold text-slate-700 bg-slate-100 rounded px-1 py-0.5">
                      {typeof article.ranking_score === "number" ? article.ranking_score : "–"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 leading-snug">{article.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{article.journal}</span>
                        {suggested && <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700">Suggested</span>}
                        {article.is_key_study && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Key study</span>}
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                          >
                            Open <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Send</CardTitle>
                <CardDescription>
                  Goes to <strong>{data.recipients_count} people</strong> (everyone on the list who hasn't unsubscribed).
                  Prepared {formatDate(digest.created_at)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {digest.send_error && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{digest.send_error}</p>
                )}
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={orderedSelection.length === 0 || !!busy}
                  onClick={() => setConfirm("send")}
                >
                  {busy === "send" ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send to {data.recipients_count} people
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" disabled={orderedSelection.length === 0 || !!busy} onClick={handleTest}>
                    {busy === "test" ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-2" />}
                    Send me a test
                  </Button>
                  <Button variant="outline" disabled={!!busy} onClick={() => setConfirm("skip")}>
                    <SkipForward className="w-4 h-4 mr-2" />
                    Skip this week
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Preview</CardTitle>
                <CardDescription>{preview ? `Subject: ${preview.subject}` : "Tick at least one article to see the email."}</CardDescription>
              </CardHeader>
              <CardContent>
                {preview && (
                  <iframe
                    title="Email preview"
                    srcDoc={preview.html}
                    sandbox="allow-same-origin"
                    className="w-full h-[560px] rounded-md border border-slate-200"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {data && (
        <AddSubscribersCard
          recipientsCount={data.recipients_count}
          onRecipientsCountChange={(count) => setData((prev) => ({ ...prev, recipients_count: count }))}
        />
      )}

      {data?.history?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Past weeks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.history.map((d) => (
              <div key={d.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900">{STATUS_LABELS[d.status]?.(d) || d.status}</span>
                  <span className="text-xs text-slate-500">
                    {formatDate(d.decided_at || d.created_at)}
                    {d.decided_by ? ` · ${d.decided_by}` : ""}
                  </span>
                </div>
                {d.articles?.length > 0 && (
                  <ol className="mt-1 list-decimal pl-5 text-sm text-slate-600 space-y-0.5">
                    {d.articles.map((a) => (
                      <li key={a.id}>
                        {a.title} <span className="text-slate-400">· {a.journal}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "send" ? `Send this email to ${data?.recipients_count} people now?` : "Skip this week's email?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "send"
                ? `It goes out right away with the ${orderedSelection.length} article${orderedSelection.length === 1 ? "" : "s"} you ticked. This can't be undone.`
                : "No one will get an email this week. Next Saturday's email will be prepared as usual."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "send" ? "bg-blue-600 hover:bg-blue-700" : ""}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "send") handleSend();
                else handleSkip();
              }}
            >
              {confirm === "send" ? "Send now" : "Skip this week"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
