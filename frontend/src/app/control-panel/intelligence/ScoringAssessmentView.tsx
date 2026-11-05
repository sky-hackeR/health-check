"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  Scale,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  AdminCalculatorVersion,
  CalculatorEvaluationPreview,
  fetchAdminCalculatorVersions,
  previewAdminCalculatorEvaluation,
} from "@/lib/api";

type MaturityLevelDef = {
  name: string;
  range: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  description: string;
};

const MATURITY_LEVELS: MaturityLevelDef[] = [
  {
    name: "Emerging / Foundation",
    range: "0% – 39%",
    color: "from-rose-500 to-rose-600",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    borderColor: "border-rose-200",
    description:
      "Critical compliance and documentation gaps. HR processes are reactive and ad-hoc, exposing the business to significant statutory, financial, and operational vulnerability.",
  },
  {
    name: "Developing",
    range: "40% – 59%",
    color: "from-amber-500 to-amber-600",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    borderColor: "border-amber-200",
    description:
      "Core operational foundations exist but lack consistency and formalisation. Policies may be outdated or partially enforced, and key HR processes depend heavily on manual effort.",
  },
  {
    name: "Performing",
    range: "60% – 79%",
    color: "from-teal-500 to-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    borderColor: "border-emerald-200",
    description:
      "Structured, repeatable HR processes with reliable compliance monitoring. Management has strong visibility into people operations, and employee lifecycles are consistently supported.",
  },
  {
    name: "Leading",
    range: "80% – 100%",
    color: "from-[#0D5C58] to-[#10B981]",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-900",
    borderColor: "border-emerald-300",
    description:
      "Strategic, forward-looking people operations. HR directly enables business growth, talent retention, leadership development, and seamless compliance through automated workflows.",
  },
];

export default function ScoringAssessmentView() {
  const [versions, setVersions] = useState<AdminCalculatorVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulation state
  const [simulationAnswers, setSimulationAnswers] = useState<Record<string, string>>({});
  const [simulationResult, setSimulationResult] = useState<CalculatorEvaluationPreview | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminCalculatorVersions("hr-health-check")
      .then((data) => {
        setVersions(data);
        const published = data.find((v) => v.isPublished) || data[0];
        if (published) {
          setSelectedVersionId(published.id);
        }
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load health check configuration.");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeVersion = useMemo(() => {
    return versions.find((v) => v.id === selectedVersionId) || null;
  }, [versions, selectedVersionId]);

  const questions = useMemo(() => {
    if (!activeVersion) return [];
    return activeVersion.questions.filter((q) => q.isActive);
  }, [activeVersion]);

  const categories = useMemo(() => {
    return activeVersion?.scoreCategories || [];
  }, [activeVersion]);

  const filteredQuestions = useMemo(() => {
    if (selectedCategoryId === "ALL") return questions;
    return questions.filter((q) => q.scoreCategoryId === selectedCategoryId);
  }, [questions, selectedCategoryId]);

  // Handle simulation execution
  async function handleRunSimulation() {
    if (!activeVersion) return;
    setSimulating(true);
    setSimError(null);
    try {
      type SimulationAnswerItem = { questionId: string; selectedOptionId?: string; numericValue?: number };
      const answers: SimulationAnswerItem[] = questions.flatMap<SimulationAnswerItem>((q) => {
        const val = simulationAnswers[q.id] || q.options[0]?.id;
        if (!val) return [];
        return [{ questionId: q.id, selectedOptionId: val }];
      });

      const res = await previewAdminCalculatorEvaluation("hr-health-check", {
        versionId: activeVersion.id,
        answers,
      });
      setSimulationResult(res);
    } catch (cause: unknown) {
      setSimError(cause instanceof Error ? cause.message : "Simulation execution failed.");
    } finally {
      setSimulating(false);
    }
  }

  function handleResetSimulation() {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      if (q.options && q.options.length > 0) {
        initial[q.id] = q.options[0].id;
      }
    }
    setSimulationAnswers(initial);
    setSimulationResult(null);
    setSimError(null);
  }

  // Parse simulated result typed values safely
  const evaluatedMetrics = useMemo(() => {
    if (!simulationResult || !simulationResult.result) return null;
    const r = simulationResult.result as {
      overallScore?: number;
      normalizedIndex?: number;
      maturityLevel?: string;
      riskLevel?: string;
      categoryScores?: Array<{
        categoryId: string;
        categoryCode?: string;
        categoryName?: string;
        rawScore?: number;
        maxScore?: number;
        percentage?: number;
        weight?: number;
        contribution?: number;
      }>;
    };
    return r;
  }, [simulationResult]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-[#0D5C58]">
          <Activity className="h-6 w-6 animate-spin" />
          <span className="font-semibold text-slate-700">Loading scoring rules & configuration…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#073634] via-[#0D5C58] to-[#0A192F] p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" /> Assessment Evaluation Engine
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              SME HR Health Check Scoring & Assessment
            </h1>
            <p className="mt-3 text-base leading-relaxed text-teal-50">
              GoSwiftHR evaluates organizational people health across verified categories using structured
              question scoring, configured weights, and objective maturity thresholds.
            </p>
          </div>
          {versions.length > 1 && (
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
              <label className="block text-xs font-medium uppercase tracking-wider text-teal-100">
                Assessment Version
              </label>
              <select
                value={selectedVersionId}
                onChange={(e) => {
                  setSelectedVersionId(e.target.value);
                  setSimulationResult(null);
                }}
                className="mt-1.5 w-full rounded-lg border border-white/20 bg-[#073634] px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#0A192F] text-white">
                    v{v.versionNumber} {v.isPublished ? "(Published Live)" : "(Draft)"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* How Scoring Works Explanation */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0D5C58]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">How SME HR Health Check Scoring Works</h2>
            <p className="text-sm text-slate-500">
              Clear, transparent mathematical weighting with zero black-box scoring.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0D5C58] text-sm font-bold text-white">
              1
            </div>
            <h3 className="mt-3 font-bold text-[#0A192F]">Question Point Allocation</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each response option carries an explicit numerical score (e.g. 10 pts for compliant practice, 5 pts
              for partial, 0 pts for non-compliant). Unanswered or hidden questions never penalize the score.
            </p>
          </article>

          <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0D5C58] text-sm font-bold text-white">
              2
            </div>
            <h3 className="mt-3 font-bold text-[#0A192F]">Category Normalization</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Points earned within each category are divided by the category&apos;s maximum possible points to yield a
              standardized 0% to 100% category percentage.
            </p>
          </article>

          <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0D5C58] text-sm font-bold text-white">
              3
            </div>
            <h3 className="mt-3 font-bold text-[#0A192F]">Weighted Overall Index</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each category percentage is multiplied by its configured organizational weight. The sum produces the
              Overall Health Check Index, mapped directly to an objective Maturity Level.
            </p>
          </article>
        </div>
      </section>

      {/* Configured Categories and Weights */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">HR Health Check Categories & Weights</h2>
            <p className="text-sm text-slate-500">
              Configured domain weightings totaling 100% in published version {activeVersion?.versionNumber}.
            </p>
          </div>
          <Link
            href="/control-panel/intelligence/advanced"
            className="text-sm font-semibold text-[#0D5C58] hover:underline"
          >
            Adjust weights in Advanced Settings &rarr;
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => {
            const count = questions.filter((q) => q.scoreCategoryId === cat.id).length;
            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#0D5C58]"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                    {cat.code}
                  </span>
                  <span className="text-2xl font-black text-[#073634]">{cat.weight}%</span>
                </div>
                <h3 className="mt-3 font-bold text-[#0A192F]">{cat.name}</h3>
                <p className="mt-2 text-xs text-slate-500">
                  {count} {count === 1 ? "question" : "questions"} contributing to this category score.
                </p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#0D5C58]"
                    style={{ width: `${Math.min(100, Math.max(5, cat.weight))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Maturity Levels Thresholds */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#0D5C58]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">Maturity Levels & Thresholds</h2>
            <p className="text-sm text-slate-500">
              Clear business definitions assigned based on the overall weighted score.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {MATURITY_LEVELS.map((level) => (
            <article
              key={level.name}
              className={`flex flex-col justify-between rounded-xl border ${level.borderColor} bg-white p-5 shadow-sm`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${level.badgeBg} ${level.badgeText}`}>
                    {level.range}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-[#0A192F]">{level.name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">{level.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Benchmark Classification
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Safe Live Assessment Simulator */}
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/20 p-6 shadow-md sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Play className="h-3.5 w-3.5" /> Interactive Evaluation Sandbox
            </div>
            <h2 className="mt-2 text-2xl font-bold text-[#0A192F]">Safe Assessment Simulator</h2>
            <p className="text-sm text-slate-600">
              Test how questions and answer combinations evaluate through the real backend calculation engine.
              No leads, assessments, or audit logs are saved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetSimulation}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={simulating || questions.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#073634] focus:outline-none disabled:opacity-50"
            >
              {simulating ? (
                <>
                  <Activity className="h-4 w-4 animate-spin" /> Evaluating…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" /> Run Safe Simulation
                </>
              )}
            </button>
          </div>
        </div>

        {simError && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {simError}
          </div>
        )}

        {/* Simulation Output Area */}
        {evaluatedMetrics && (
          <div className="mt-6 rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Simulation Result
                </span>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-4xl font-extrabold text-[#073634]">
                    {evaluatedMetrics.overallScore ?? 0}%
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    {evaluatedMetrics.maturityLevel?.replaceAll("_", " ") ?? "EVALUATED"}
                  </span>
                  {evaluatedMetrics.riskLevel && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Risk: {evaluatedMetrics.riskLevel}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Simulated on published HR Health Check engine using actual category weights.
                </p>
              </div>

              {/* Category Contribution Bars */}
              {evaluatedMetrics.categoryScores && evaluatedMetrics.categoryScores.length > 0 && (
                <div className="grid flex-1 max-w-xl gap-3 sm:grid-cols-2">
                  {evaluatedMetrics.categoryScores.map((cat) => (
                    <div key={cat.categoryId || cat.categoryName} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[140px]">
                          {cat.categoryName || cat.categoryCode}
                        </span>
                        <span className="font-bold text-[#0D5C58]">
                          {cat.percentage ?? Math.round(cat.rawScore ?? 0)}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-[#0D5C58]"
                          style={{ width: `${Math.min(100, Math.max(0, cat.percentage ?? 0))}%` }}
                        />
                      </div>
                      <span className="mt-1 block text-[10px] text-slate-400">
                        Weight: {cat.weight ?? "—"}% | Contributed: {cat.contribution ?? "—"} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Simulated Recommendations */}
            {simulationResult?.recommendations && simulationResult.recommendations.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h4 className="text-sm font-bold text-[#0A192F]">
                  Triggered Recommendations ({simulationResult.recommendations.length}):
                </h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {simulationResult.recommendations.map((rec) => (
                    <div key={rec.title} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#0A192F] truncate">{rec.title}</span>
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0D5C58]">
                          {rec.priority}
                        </span>
                      </div>
                      <p className="mt-1.5 text-slate-600 line-clamp-2">{rec.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Question Selector List for Simulation */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#0A192F]">Simulator Question Inputs</h3>
            <span className="text-xs text-slate-500">
              Select answers below, then click &ldquo;Run Safe Simulation&rdquo; above.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {questions.map((q) => {
              const currentVal = simulationAnswers[q.id] || q.options[0]?.id || "";
              const cat = categories.find((c) => c.id === q.scoreCategoryId);
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#0D5C58]/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600">
                      {q.code}
                    </span>
                    {cat && (
                      <span className="text-[10px] font-semibold text-[#0D5C58] truncate max-w-[120px]">
                        {cat.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#0A192F] line-clamp-2">{q.title}</p>

                  <select
                    value={currentVal}
                    onChange={(e) => {
                      setSimulationAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                    }}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0D5C58] focus:bg-white focus:outline-none"
                  >
                    {q.options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} ({opt.scoreValue} pts)
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Question & Scoring Rules Catalog */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">Question & Answer Scoring Catalog</h2>
            <p className="text-sm text-slate-500">
              Inspect all configured questions and the exact score points assigned to each possible answer.
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategoryId("ALL")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategoryId === "ALL"
                  ? "bg-[#0D5C58] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All Categories ({questions.length})
            </button>
            {categories.map((c) => {
              const count = questions.filter((q) => q.scoreCategoryId === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    selectedCategoryId === c.id
                      ? "bg-[#0D5C58] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 divide-y divide-slate-100">
          {filteredQuestions.map((q) => {
            const isExpanded = expandedQuestionId === q.id;
            const cat = categories.find((c) => c.id === q.scoreCategoryId);
            return (
              <div key={q.id} className="py-4">
                <div
                  onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                  className="flex cursor-pointer items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">{q.code}</span>
                      {cat && (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-[#0D5C58]">
                          {cat.name} ({cat.weight}% category weight)
                        </span>
                      )}
                      {q.isRequired && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#0A192F]">{q.title}</p>
                    {q.helpText && <p className="text-xs text-slate-500">{q.helpText}</p>}
                  </div>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Configured Answer Options & Point Allocation
                    </span>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                        >
                          <span className="font-medium text-slate-800">{opt.label}</span>
                          <span
                            className={`rounded px-2 py-0.5 font-bold ${
                              opt.scoreValue > 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            +{opt.scoreValue} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
