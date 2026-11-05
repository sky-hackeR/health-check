"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  CheckCircle2,
  Code2,
  Filter,
  Mail,
  Scale,
  Sparkles,
  TrendingUp,
} from "lucide-react";

type Stage = {
  id: number;
  title: string;
  shortTitle: string;
  icon: typeof BrainCircuit;
  service: string;
  filePath: string;
  summary: string;
  detailedExplanation: string[];
  sampleInput: string;
  sampleOutput: string;
  keyRule: string;
};

const STAGES: Stage[] = [
  {
    id: 1,
    title: "Dynamic Question Capture & Condition Evaluation",
    shortTitle: "1. Capture & Conditions",
    icon: Filter,
    service: "ConditionEvaluator",
    filePath: "backend/src/assessments/condition-evaluator.ts",
    summary:
      "Evaluates user responses in real time to dynamically determine which subsequent questions are relevant.",
    detailedExplanation: [
      "As an organization answers assessment questions, the ConditionEvaluator applies boolean logic (EQUALS, NOT_EQUALS, IN, GREATER_THAN).",
      "Irrelevant branch questions remain dynamically hidden so respondents are never asked questions that do not apply to their company size or setup.",
      "Crucial Safety Guarantee: Unanswered or skipped questions are never treated as negative answers or deducted from the score.",
    ],
    sampleInput: JSON.stringify(
      {
        questionCode: "HC_DOCS_EXIST",
        selectedOptionValue: "NONE_WRITTEN",
        companySize: "15_EMPLOYEES",
      },
      null,
      2
    ),
    sampleOutput: JSON.stringify(
      {
        visibleQuestions: ["HC_DOCS_EXIST", "HC_DISCIPLINARY_ACTION"],
        hiddenQuestions: ["HC_ADVANCED_RETENTION_POLICY"],
        validAnswersCount: 2,
      },
      null,
      2
    ),
    keyRule: "Missing answers are never assumed to be non-compliant.",
  },
  {
    id: 2,
    title: "Category Normalization & Raw Score Aggregation",
    shortTitle: "2. Point Normalization",
    icon: Scale,
    service: "ScoringService",
    filePath: "backend/src/scoring/scoring.service.ts",
    summary:
      "Aggregates question points within each HR domain and calculates a clean 0% to 100% category percentage.",
    detailedExplanation: [
      "Every response option carries an explicit numerical score (e.g. 10 pts for compliant practice, 5 pts for partial, 0 pts for non-compliant).",
      "Earned points are summed for all visible, answered questions within a specific category.",
      "Points earned are divided by the category's maximum achievable points to yield an exact category percentage (0% – 100%).",
    ],
    sampleInput: JSON.stringify(
      {
        category: "Compliance & Risk",
        questionsAnswered: 4,
        pointsEarned: 35,
        maxPossiblePoints: 40,
      },
      null,
      2
    ),
    sampleOutput: JSON.stringify(
      {
        categoryCode: "COMPLIANCE",
        rawPoints: 35,
        maxPoints: 40,
        percentage: 87.5,
      },
      null,
      2
    ),
    keyRule: "Each category is standardized to 0-100% before weighting.",
  },
  {
    id: 3,
    title: "Weighted Index & Maturity Level Profiling",
    shortTitle: "3. Maturity Profiling",
    icon: TrendingUp,
    service: "ScoringService",
    filePath: "backend/src/scoring/scoring.service.ts",
    summary:
      "Multiplies category percentages by configured organizational weights to compute the Overall Health Check Index.",
    detailedExplanation: [
      "Configured category weights (e.g., Compliance 30%, People Ops 30%, Systems 20%, Culture 20%) always total exactly 100%.",
      "The sum of all weighted contributions generates the company's Overall Score (0% – 100%).",
      "The Overall Score is mapped deterministically to objective business maturity thresholds: Emerging / Foundation (<40%), Developing (40-59%), Performing (60-79%), or Leading (80-100%).",
    ],
    sampleInput: JSON.stringify(
      {
        categories: [
          { code: "COMPLIANCE", percentage: 87.5, weight: 30 },
          { code: "PEOPLE_OPS", percentage: 60.0, weight: 30 },
          { code: "SYSTEMS", percentage: 50.0, weight: 20 },
          { code: "CULTURE", percentage: 70.0, weight: 20 },
        ],
      },
      null,
      2
    ),
    sampleOutput: JSON.stringify(
      {
        overallScore: 68,
        normalizedIndex: 0.68,
        maturityLevel: "DEVELOPING",
        riskLevel: "MEDIUM",
        summaryStatus: "Structured foundation with compliance risks",
      },
      null,
      2
    ),
    keyRule: "Overall score is mathematically bounded between 0% and 100%.",
  },
  {
    id: 4,
    title: "Company Pain Point Detection & Traceability",
    shortTitle: "4. Pain Point Detection",
    icon: BrainCircuit,
    service: "AssessmentPainPoint & AssessmentsService",
    filePath: "backend/src/assessments/assessments.service.ts",
    summary:
      "Scans completed answers against published company pain-point triggers to detect specific operational risks.",
    detailedExplanation: [
      "Published pain-point definitions monitor specific question responses (e.g. question HC_DOCS_EXIST == NONE_WRITTEN).",
      "When a matching answer is submitted, an immutable AssessmentPainPoint finding is stored in the database.",
      "Full Traceability: The finding records the company ID, assessment ID, detected timestamp, and the exact answer that triggered it.",
    ],
    sampleInput: JSON.stringify(
      {
        assessmentId: "asmt-98214",
        submittedAnswer: { questionCode: "HC_DOCS_EXIST", optionValue: "NONE_WRITTEN" },
      },
      null,
      2
    ),
    sampleOutput: JSON.stringify(
      {
        triggeredPainPoint: {
          code: "PP_NO_WRITTEN_CONTRACTS",
          title: "Absence of Written Employment Documentation",
          priority: "CRITICAL",
          businessImpact: "Exposes organization to statutory fines and tribunal vulnerability.",
          suggestedSolution: "Issue standardized employment agreements across all staff.",
        },
      },
      null,
      2
    ),
    keyRule: "Pain points only fire on verified matching answers, never on missing data.",
  },
  {
    id: 5,
    title: "Actionable Recommendations & Outreach Drafts",
    shortTitle: "5. Recommendations & Outreach",
    icon: Mail,
    service: "RecommendationService & IntelligenceAdminService",
    filePath: "backend/src/recommendations/recommendation.service.ts",
    summary:
      "Generates strategic improvement steps and populates personalized outreach drafts for advisors.",
    detailedExplanation: [
      "The RecommendationService evaluates score thresholds and operational findings to deliver prioritized next steps.",
      "Cold email templates dynamically merge company name, contact name, overall score, and detected pain point bullet points.",
      "Strict Human Control: Emails are never sent automatically. Advisors review, personalize, and copy drafts to their preferred email software.",
    ],
    sampleInput: JSON.stringify(
      {
        templateId: "tpl-exec-followup",
        companyName: "Acme Logistics",
        score: 68,
        detectedPainPointsCount: 2,
      },
      null,
      2
    ),
    sampleOutput: JSON.stringify(
      {
        renderedSubject: "Insights from Acme Logistics's recent HR Health Check",
        renderedBody:
          "Hello Alex,\n\nI reviewed Acme Logistics's recent SME HR Health Check (Score: 68% - Developing Stage)...\n\nIdentified Focus Areas:\n• Absence of Written Employment Documentation\n• Manual Leave Tracking...",
        missingTokens: [],
      },
      null,
      2
    ),
    keyRule: "Automated drafts assist advisors; emails are never dispatched without human action.",
  },
];

export default function HowIntelligenceWorksView() {
  const [activeStageId, setActiveStageId] = useState<number>(1);
  const activeStage = STAGES.find((s) => s.id === activeStageId) || STAGES[0];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#073634] via-[#0D5C58] to-[#0A192F] p-7 text-white shadow-xl sm:p-9">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
            <Sparkles className="h-3.5 w-3.5" /> Verified Architectural Pipeline
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How GoSwiftHR Intelligence Works</h1>
          <p className="mt-3 text-base leading-relaxed text-teal-50">
            Follow the real path from an assessment answer to an objective business evaluation, verified company pain
            points, and actionable advisor conversation drafts.
          </p>
        </div>
      </section>

      {/* Visual Workflow Stepper / Pipeline */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-[#0A192F]">End-to-End Evaluation Pipeline</h2>
        <p className="mt-1 text-sm text-slate-500">
          Click any stage in the flow below to inspect its calculation rules, verified backend services, and live
          payload transformations.
        </p>

        {/* Pipeline Bar */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            const isSelected = stage.id === activeStageId;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? "border-[#0D5C58] bg-teal-50/50 shadow-md ring-2 ring-[#0D5C58]/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    isSelected ? "bg-[#0D5C58] text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="mt-3 text-xs font-bold text-[#0A192F]">{stage.shortTitle}</span>
                <span className="mt-1 text-[11px] leading-tight text-slate-500 line-clamp-2">{stage.summary}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Stage Deep Dive */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Stage Explanation & Rules */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-[#0D5C58]">
                <activeStage.icon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#0D5C58]">
                  Stage {activeStage.id} of 5
                </span>
                <h3 className="text-xl font-bold text-[#0A192F]">{activeStage.title}</h3>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {activeStage.detailedExplanation.map((para) => (
                <div key={para} className="flex items-start gap-3 text-xs leading-relaxed text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]" />
                  <span>{para}</span>
                </div>
              ))}
            </div>

            {/* Core Integrity Rule */}
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#073634]">Core Integrity Rule</span>
              <p className="mt-1 text-xs font-semibold text-emerald-950">{activeStage.keyRule}</p>
            </div>

            {/* Backend Service Reference */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Connected Backend Service
              </span>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-[#0D5C58]" />
                  <span className="font-bold text-[#0A192F]">{activeStage.service}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">{activeStage.filePath}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Verified Data Payload Inspector */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Stage {activeStage.id} Transformation Inspector
              </span>
              <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-[#0D5C58]">Live Format</span>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <span className="text-[11px] font-bold text-slate-600">Sample Verified Input</span>
                <pre className="mt-1.5 max-h-48 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-emerald-300">
                  {activeStage.sampleInput}
                </pre>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-600">Generated Evaluation Output</span>
                <pre className="mt-1.5 max-h-48 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-teal-200">
                  {activeStage.sampleOutput}
                </pre>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={activeStageId === 1}
                  onClick={() => setActiveStageId((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30"
                >
                  &larr; Previous Stage
                </button>
                <button
                  type="button"
                  disabled={activeStageId === STAGES.length}
                  onClick={() => setActiveStageId((prev) => Math.min(STAGES.length, prev + 1))}
                  className="rounded-lg bg-[#0D5C58] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#073634] disabled:opacity-30"
                >
                  Next Stage &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Navigation to other areas */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h3 className="font-bold text-[#0A192F]">Explore Intelligence Capabilities</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Link
            href="/control-panel/intelligence/scoring-rules"
            className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#0D5C58] hover:shadow-sm"
          >
            <h4 className="font-bold text-[#0A192F] text-sm group-hover:text-[#0D5C58]">Scoring & Assessment &rarr;</h4>
            <p className="mt-1 text-xs text-slate-500">View real question scores, category weights, and safe simulator.</p>
          </Link>
          <Link
            href="/control-panel/intelligence/pain-points"
            className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#0D5C58] hover:shadow-sm"
          >
            <h4 className="font-bold text-[#0A192F] text-sm group-hover:text-[#0D5C58]">Company Pain Points &rarr;</h4>
            <p className="mt-1 text-xs text-slate-500">Inspect verified operational triggers and company findings.</p>
          </Link>
          <Link
            href="/control-panel/intelligence/cold-emails"
            className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#0D5C58] hover:shadow-sm"
          >
            <h4 className="font-bold text-[#0A192F] text-sm group-hover:text-[#0D5C58]">Email Templates &rarr;</h4>
            <p className="mt-1 text-xs text-slate-500">Draft outreach personalized with assessment evidence.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
