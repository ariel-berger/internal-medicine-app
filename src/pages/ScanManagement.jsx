import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/api/entities";
import { localClient } from "@/api/localClient";
import { MedicalArticle } from "@/api/medicalArticles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, Loader, Shield, ExternalLink, PlusCircle, Undo2, Eye, CheckCircle, AlertCircle } from "lucide-react";

const PERIODS = [
  { weeks: 1, label: "Latest scan" },
  { weeks: 4, label: "Last 4 weeks" },
  { weeks: 12, label: "Last 12 weeks" },
];

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return isNaN(date) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

function ArticleRow({ article, action }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3">
      <span className="w-9 shrink-0 text-center text-sm font-bold text-slate-700 bg-slate-100 rounded px-1 py-0.5">
        {typeof article.ranking_score === "number" ? article.ranking_score : "–"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900 leading-snug">{article.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{article.journal}</span>
          {article.medical_category && <span>· {article.medical_category}</span>}
          {article.created_at && <span>· added {formatDate(article.created_at)}</span>}
          {article.url && (
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-700 hover:underline">
              PubMed <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {article.reason && <div className="mt-1 text-xs italic text-slate-500">{article.reason}</div>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="text-sm text-slate-500 py-2">{children}</p>;
}

// Admin page for content decisions: articles that scored too low, ones included anyway, and hidden ones.
export default function ScanManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [weeks, setWeeks] = useState(1);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async (period) => {
    try {
      setData(await localClient.getScanReview(period));
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Couldn't load the lists." });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
        if (user.role === "admin") await load(weeks);
      } catch (e) {
        setCurrentUser(null);
      }
      setIsLoading(false);
    })();
    // Only on first load; period changes reload below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePeriod = async (value) => {
    const period = Number(value);
    setWeeks(period);
    await load(period);
  };

  const act = async (articleId, fn, successText) => {
    setBusyId(articleId);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: "success", text: successText });
      await load(weeks);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Something went wrong. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const includeButton = (article, included) => (
    <Button
      variant="outline"
      size="sm"
      disabled={busyId === article.id}
      onClick={() =>
        act(
          article.id,
          () => localClient.setArticleIncluded(article.id, !included),
          included ? "Undone: it's out of All Studies again." : "Included: it's now in All Studies and can be picked for the weekly email."
        )
      }
    >
      {busyId === article.id ? <Loader className="w-4 h-4 mr-1 animate-spin" /> : included ? <Undo2 className="w-4 h-4 mr-1" /> : <PlusCircle className="w-4 h-4 mr-1" />}
      {included ? "Undo" : "Include anyway"}
    </Button>
  );

  const unhideButton = (article) => (
    <Button
      variant="outline"
      size="sm"
      disabled={busyId === article.id}
      onClick={() =>
        act(article.id, () => MedicalArticle.setHiddenFromDashboard(article.id, false), "Unhidden: it's back on the dashboard and in All Studies.")
      }
    >
      {busyId === article.id ? <Loader className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
      Unhide
    </Button>
  );

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
        <p className="text-slate-600">Only admins can manage scans and scores.</p>
      </div>
    );
  }

  const cutoff = data?.low_score_cutoff ?? 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
          <SlidersHorizontal className="w-7 h-7 text-slate-600" />
          Scan &amp; Score Management
        </h1>
        <p className="text-slate-600 mt-1">
          Articles that didn't get in, and articles hidden from the dashboard. Changes here apply to the dashboard and All
          Studies for everyone.
        </p>
      </div>

      {message && (
        <Alert className={message.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          {message.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
          <AlertDescription className={message.type === "error" ? "text-red-800" : "text-green-800"}>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Didn't get in: scored {cutoff} or lower ({data?.low_scored?.length ?? 0})</CardTitle>
              <CardDescription className="mt-1">
                These passed the relevance check but scored too low for All Studies. If one deserves a place, include it
                anyway. Its score stays the same.
              </CardDescription>
            </div>
            <Select value={String(weeks)} onValueChange={changePeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.weeks} value={String(p.weeks)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.low_scored?.length ? (
            data.low_scored.map((article) => <ArticleRow key={article.id} article={article} action={includeButton(article, false)} />)
          ) : (
            <EmptyNote>Nothing scored {cutoff} or lower in this period.</EmptyNote>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Included anyway ({data?.included?.length ?? 0})</CardTitle>
          <CardDescription>Low-scored articles an admin put into All Studies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.included?.length ? (
            data.included.map((article) => <ArticleRow key={article.id} article={article} action={includeButton(article, true)} />)
          ) : (
            <EmptyNote>None yet.</EmptyNote>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hidden from the dashboard ({data?.hidden?.length ?? 0})</CardTitle>
          <CardDescription>Hidden with the minus button on an article card. They're also left out of All Studies and the weekly email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.hidden?.length ? (
            data.hidden.map((article) => <ArticleRow key={article.id} article={article} action={unhideButton(article)} />)
          ) : (
            <EmptyNote>No hidden articles.</EmptyNote>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
