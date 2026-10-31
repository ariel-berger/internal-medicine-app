import React, { useState, useEffect, useCallback, useMemo } from "react";
import { User } from "@/api/entities";
import { localClient } from "@/api/localClient";
import { MedicalArticle } from "@/api/medicalArticles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SlidersHorizontal, Loader, Shield, ExternalLink, PlusCircle, Undo2, Eye, EyeOff, CheckCircle, AlertCircle,
  Search, ArrowDownCircle,
} from "lucide-react";

const PAGE_SIZE = 50;

// created_at comes from the server as UTC "YYYY-MM-DD HH:MM:SS"
const parseUtc = (value) => (value ? new Date(value.replace(" ", "T") + "Z") : null);

const formatDate = (value) => {
  const date = parseUtc(value);
  return date && !isNaN(date) ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
};

const monthKey = (value) => (value ? value.slice(0, 7) : "");

const monthLabel = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const matchesSearch = (article, term) => {
  if (!term) return true;
  const t = term.toLowerCase();
  return [article.title, article.journal, article.medical_category, article.reason].some((v) => v && v.toLowerCase().includes(t));
};

function ArticleRow({ article, action }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
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

// One tab: month filter, the filtered list a page at a time, and "Show more"
function ArticleList({ articles, description, emptyText, searchTerm, month, onMonthChange, latestScanStart, renderAction }) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => setVisible(PAGE_SIZE), [searchTerm, month]);

  const months = useMemo(
    () => Array.from(new Set(articles.map((a) => monthKey(a.created_at)).filter(Boolean))).sort().reverse(),
    [articles]
  );

  const filtered = useMemo(
    () =>
      articles.filter((a) => {
        if (month === "latest" && !(latestScanStart && a.created_at >= latestScanStart)) return false;
        if (month !== "all" && month !== "latest" && monthKey(a.created_at) !== month) return false;
        return matchesSearch(a, searchTerm);
      }),
    [articles, month, latestScanStart, searchTerm]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 max-w-2xl">{description}</p>
        <Select value={month} onValueChange={onMonthChange}>
          <SelectTrigger className="w-48 bg-white" aria-label="Added in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {latestScanStart && <SelectItem value="latest">Latest scan</SelectItem>}
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                Added in {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">{searchTerm || month !== "all" ? "Nothing here matches your search or month." : emptyText}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Showing {Math.min(visible, filtered.length)} of {filtered.length}
          </p>
          {filtered.slice(0, visible).map((article) => (
            <ArticleRow key={article.id} article={article} action={renderAction(article)} />
          ))}
          {filtered.length > visible && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                <ArrowDownCircle className="w-4 h-4 mr-2" />
                Show more ({filtered.length - visible} left)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Admin page for content decisions: articles that scored too low, ones included anyway, and hidden ones.
export default function ScanManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);
  const [tab, setTab] = useState("low");
  const [searchTerm, setSearchTerm] = useState("");
  // "Didn't get in" opens on the latest scan, like the Saturday email that links here
  const [months, setMonths] = useState({ low: "latest", included: "all", hidden: "all" });

  const load = useCallback(async () => {
    try {
      setData(await localClient.getScanReview());
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Couldn't load the lists." });
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

  const act = async (articleId, fn, successText) => {
    setBusyId(articleId);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: "success", text: successText });
      await load();
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Something went wrong. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const includeButton = (included) => (article) => (
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
  const listProps = (key) => ({
    searchTerm,
    month: months[key],
    onMonthChange: (value) => setMonths((prev) => ({ ...prev, [key]: value })),
  });

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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search title, journal, specialty or reason..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 professional-card"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="sticky top-0 z-10 -mx-1 bg-slate-50/95 px-1 py-2 backdrop-blur-sm">
          <TabsList className="grid w-full grid-cols-3 md:w-[36rem]">
            <TabsTrigger value="low" className="flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-slate-600" />
              <span className="truncate">Didn't get in ({data?.low_scored?.length ?? 0})</span>
            </TabsTrigger>
            <TabsTrigger value="included" className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span className="truncate">Included ({data?.included?.length ?? 0})</span>
            </TabsTrigger>
            <TabsTrigger value="hidden" className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-red-500" />
              <span className="truncate">Hidden ({data?.hidden?.length ?? 0})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="low" className="mt-4">
          <ArticleList
            {...listProps("low")}
            articles={data?.low_scored || []}
            latestScanStart={data?.latest_scan_start}
            description={`Passed the relevance check but scored ${cutoff} or lower, so not in All Studies. If one deserves a place, include it anyway; its score stays the same.`}
            emptyText={`Nothing scored ${cutoff} or lower yet.`}
            renderAction={includeButton(false)}
          />
        </TabsContent>
        <TabsContent value="included" className="mt-4">
          <ArticleList
            {...listProps("included")}
            articles={data?.included || []}
            description="Low-scored articles an admin put into All Studies anyway."
            emptyText="None yet."
            renderAction={includeButton(true)}
          />
        </TabsContent>
        <TabsContent value="hidden" className="mt-4">
          <ArticleList
            {...listProps("hidden")}
            articles={data?.hidden || []}
            description="Hidden with the minus button on an article card. They're also left out of All Studies and the weekly email."
            emptyText="No hidden articles."
            renderAction={unhideButton}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
