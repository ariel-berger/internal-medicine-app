import React from "react";

// How a ranking score was added up. Points and wording follow the scoring rules in
// backend/medical_processing/classification/classifier.py.
const SCORE_PARTS = [
  { key: "focus_points", label: "Focus", meaning: { 2: "treatment or intervention", 1: "diagnostic test or screening", 0: "other focus" } },
  { key: "type_points", label: "Study type", meaning: { 2: "randomized controlled trial", 1: "meta-analysis or systematic review", 0: "other study type" } },
  { key: "prevalence_points", label: "Disease prevalence", meaning: { 2: "very common (over 10%)", 1: "medium (1–10%)", 0: "not scored", "-1": "rare (under 1%)" } },
  { key: "hospitalization_points", label: "Acute or inpatient relevance", meaning: { 2: "acute or hospitalized setting", 0: "outpatient or chronic care" } },
  { key: "clinical_outcome_points", label: "Clinical primary outcome", meaning: { 1: "clinical events (death, symptoms, admissions…)", 0: "lab, imaging or surrogate outcome" } },
  { key: "impact_factor_points", label: "Journal impact factor", meaning: { 1: "above 10", 0: "10 or below, or unknown" } },
  { key: "temporality_points", label: "Temporality", meaning: {} },
];

// Penalties and older rules are only listed when they changed the score. The prevention and biologic
// penalties count toward the score but aren't saved separately (operations.py), so they appear as the
// gap between the saved parts and the saved score.
const ADJUSTMENTS = [
  { key: "screening_penalty_points", label: "Screening focus" },
  { key: "scores_penalty_points", label: "Clinical scores focus" },
  { key: "subanalysis_penalty_points", label: "Subanalysis of an earlier study" },
  { key: "neurology_penalty_points", label: "Published in Neurology" },
  { key: "metabolic_penalty_points", label: "Metabolic focus (older scoring rules)" },
  { key: "prognosis_penalty_points", label: "Prognosis focus (older scoring rules)" },
  { key: "guideline_bonus_points", label: "Guideline (older scoring rules)" },
];

const formatPoints = (value) => (value > 0 ? `+${value}` : `${value}`);

function Row({ label, value, meaning }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className={`w-8 shrink-0 text-right font-semibold ${value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-slate-400"}`}>
        {formatPoints(value)}
      </span>
      <span className="text-slate-800">
        {label}
        {meaning && <span className="text-slate-500">: {meaning}</span>}
      </span>
    </div>
  );
}

export default function ScoreBreakdown({ parts, score }) {
  if (!parts) return null;
  const value = (key) => (typeof parts[key] === "number" ? parts[key] : 0);
  const adjustments = ADJUSTMENTS.filter((p) => value(p.key) !== 0);
  const sum = [...SCORE_PARTS, ...ADJUSTMENTS].reduce((total, p) => total + value(p.key), 0);
  const gap = sum - score;
  const unsavedPenalty = gap > 0 && gap <= 2 ? -gap : 0;
  const total = sum + unsavedPenalty;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      {SCORE_PARTS.map((p) => (
        <Row key={p.key} label={p.label} value={value(p.key)} meaning={p.meaning[String(value(p.key))]} />
      ))}
      {(adjustments.length > 0 || unsavedPenalty !== 0) && (
        <div className="mt-1 border-t border-slate-200 pt-1">
          {adjustments.map((p) => (
            <Row key={p.key} label={p.label} value={value(p.key)} />
          ))}
          {unsavedPenalty !== 0 && (
            <Row label="Prevention or biologic-treatment penalty" value={unsavedPenalty} meaning="counted, but not saved separately" />
          )}
        </div>
      )}
      <div className="mt-1 border-t border-slate-200 pt-1 font-semibold text-slate-900">
        Total {score}
        {total !== score && (
          <span className="font-normal text-slate-500">
            {total < 0 && score === 0
              ? ` (the parts add up to ${total}, but scores can't go below 0)`
              : ` (the parts add up to ${total}; it was scored under an older version of the rules)`}
          </span>
        )}
      </div>
    </div>
  );
}
