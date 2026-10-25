import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Activity,
  BookOpen,
  FileText,
  Library,
  Plus,
  Clock,
  Search,
  Filter,
  BarChart3,
  Mail,
  MessageCircle,
} from "lucide-react";

// Mirrors JOURNALS in backend/medical_processing/config.py; update both together.
const JOURNALS = [
  "NEJM", "JAMA", "Annals of Internal Medicine", "BMJ", "Lancet", "JGIM",
  "Circulation", "European Heart Journal", "JACC", "Hypertension",
  "AJRCCM", "Chest", "Kidney International", "JASN",
  "Gastroenterology", "Gut", "Hepatology",
  "Clinical Infectious Diseases", "Journal of Infectious Diseases",
  "JCEM", "Neurology", "Annals of Neurology",
  "Annals of the Rheumatic Diseases", "Arthritis & Rheumatology", "Blood",
];

const STEPS = [
  {
    icon: Search,
    title: "Scan",
    text: `Every Saturday, new articles from ${JOURNALS.length} leading general medicine and specialty journals are collected from PubMed.`,
  },
  {
    icon: Filter,
    title: "Filter",
    text: "AI reads each title and abstract and keeps only what matters to internal medicine doctors, leaving out things like pediatric and basic science papers.",
  },
  {
    icon: BarChart3,
    title: "Score",
    text: "Each relevant article gets a relevance score (study design, how common the disease is, relevance to hospitalized patients, clinical outcomes, journal impact) and a short clinical bottom line.",
  },
];

const PAGES = [
  {
    icon: Activity,
    title: "Dashboard",
    page: "Dashboard",
    text: "The top articles from the past two weeks: key studies first, then by score. Trending Studies shows what colleagues have been saving to their libraries.",
  },
  {
    icon: BookOpen,
    title: "All Studies",
    page: "AllStudies",
    text: "The full collection, with search, filters by specialty and date, and sorting.",
  },
  {
    icon: FileText,
    title: "Case Reports",
    page: "CaseReports",
    text: "Case reports from the same journals, kept separate so they don't crowd the dashboard.",
  },
  {
    icon: Library,
    title: "My Library",
    page: "MyLibrary",
    text: "Your personal reading list: articles you've marked as Want to Read or Read.",
  },
  {
    icon: Plus,
    title: "Add Study",
    page: "AddStudy",
    text: "Add any article from PubMed by pasting its link or ID.",
  },
];

function SectionTitle({ children }) {
  return <h2 className="text-xl font-bold text-slate-900 mb-4">{children}</h2>;
}

export default function About() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="rounded-xl border border-blue-100 bg-blue-50/50 px-6 py-6 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">About Internal Nerds</h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-600">
          The most relevant new internal medicine literature, picked out for you, for those free five minutes in a busy working day.
        </p>
      </section>

      <section>
        <SectionTitle>Why it exists</SectionTitle>
        <div className="professional-card p-6 flex gap-4">
          <Clock className="w-6 h-6 text-blue-700 shrink-0 mt-0.5" />
          <p className="text-slate-700 leading-relaxed">
            Keeping up with the journals takes time a working internist rarely has. Internal Nerds does the
            scanning for you, so when you do get those free five minutes, you can spend them reading the
            article most worth your time instead of searching for it.
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>How it works</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="professional-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <step.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900">
                  {i + 1}. {step.title}
                </h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          The highest-scoring articles appear on the dashboard. Senior colleagues can also mark an article as
          a <span className="font-medium text-slate-800">Key Study</span>, which puts it at the top.
        </p>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Journals scanned</p>
          <div className="flex flex-wrap gap-2">
            {JOURNALS.map((journal) => (
              <span key={journal} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                {journal}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>What's on the site</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {PAGES.map((p) => (
            <Link key={p.title} to={createPageUrl(p.page)} className="professional-card p-5 flex gap-4">
              <p.icon className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{p.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Who made it</SectionTitle>
        <div className="professional-card p-6 space-y-5">
          <p className="text-slate-700 leading-relaxed">
            Internal Nerds is a private project by <span className="font-semibold text-slate-900">Gil Ben Noon, MD</span>,
            an internal medicine resident, made for colleagues to use. It's a work in progress, and your
            feedback is much appreciated.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:gil.bnoon@gmail.com"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 transition-colors"
            >
              <Mail className="w-4 h-4" />
              gil.bnoon@gmail.com
            </a>
            <a
              href="https://wa.me/972543361973"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              WhatsApp +972 54-336-1973
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
