"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Eye, Plus, RefreshCw, Save, Send, AlertTriangle, Mail, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  AdminIntelligenceVersion,
  AdminPreviewAssessment,
  AdminRecommendationRule,
  AdminRecommendationTemplate,
  AdminScoreCategory,
  AdminScoringRule,
  createIntelligenceDraft,
  createIntelligenceRecommendationRule,
  createIntelligenceScoringRule,
  createIntelligenceTemplate,
  createIntelligenceTemplateDraft,
  deactivateIntelligenceTemplate,
  deleteIntelligenceRecommendationRule,
  deleteIntelligenceScoringRule,
  fetchIntelligencePreviewAssessments,
  fetchIntelligenceRecommendationRules,
  fetchIntelligenceScoringRules,
  fetchIntelligenceTemplates,
  fetchIntelligenceVersions,
  previewIntelligenceTemplate,
  previewIntelligenceVersion,
  AdminCompanyPainPoint,
  AdminColdEmailTemplate,
  AdminColdEmailPreview,
  fetchCompanyPainPoints,
  createCompanyPainPointDraft,
  createCompanyPainPointVersion,
  updateCompanyPainPoint,
  publishCompanyPainPoint,
  fetchColdEmailTemplates,
  createColdEmailTemplateDraft,
  createColdEmailTemplateVersion,
  updateColdEmailTemplate,
  publishColdEmailTemplate,
  archiveColdEmailTemplate,
  previewColdEmail,
  publishIntelligenceTemplate,
  publishIntelligenceVersion,
  updateIntelligenceCategory,
  updateIntelligenceRecommendationRule,
  updateIntelligenceScoringRule,
  updateIntelligenceTemplate,
} from "@/lib/api";
type Section = "scoring-rules" | "recommendations" | "templates" | "pain-points" | "cold-emails";
type PreviewResult = Awaited<ReturnType<typeof previewIntelligenceVersion>>;
type TemplatePreview = Awaited<ReturnType<typeof previewIntelligenceTemplate>>;
const priorities: AdminRecommendationTemplate["priority"][] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-goswift-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-goswift-navy disabled:cursor-not-allowed disabled:opacity-50";
export default function IntelligenceWorkspace({
  section,
}: {
  section: Section;
}) {
  const [versions, setVersions] = useState<AdminIntelligenceVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [scoringRules, setScoringRules] = useState<AdminScoringRule[]>([]);
  const [recommendationRules, setRecommendationRules] = useState<
    AdminRecommendationRule[]
  >([]);
  const [templates, setTemplates] = useState<AdminRecommendationTemplate[]>([]);
  const [painPoints, setPainPoints] = useState<AdminCompanyPainPoint[]>([]);
  const [coldEmailTemplates, setColdEmailTemplates] = useState<AdminColdEmailTemplate[]>([]);
  const [coldEmailPreview, setColdEmailPreview] = useState<AdminColdEmailPreview | null>(null);
  const [assessments, setAssessments] = useState<AdminPreviewAssessment[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [templatePreview, setTemplatePreview] =
    useState<TemplatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedVersion = versions.find(
    (version) => version.id === selectedVersionId,
  );
  const isDraft =
    selectedVersion !== undefined &&
    !selectedVersion.isPublished &&
    selectedVersion.publishedAt === null;
  const title =
    section === "scoring-rules"
      ? "Scoring Rules"
      : section === "recommendations"
        ? "Recommendations"
        : section === "templates"
          ? "Recommendation Templates"
          : section === "pain-points"
            ? "Company Pain Points"
            : "Cold Email Templates";
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        versionRows,
        scoringResponse,
        recommendationResponse,
        templateResponse,
        assessmentResponse,
        painPointRows,
        coldEmailResponse,
      ] = await Promise.all([
        fetchIntelligenceVersions(),
        section === "scoring-rules"
          ? fetchIntelligenceScoringRules({
              page,
              limit: 10,
              search: search || undefined,
              versionId: selectedVersionId || undefined,
            })
          : Promise.resolve({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
        section === "recommendations"
          ? fetchIntelligenceRecommendationRules({
              page,
              limit: 10,
              search: search || undefined,
              versionId: selectedVersionId || undefined,
            })
          : Promise.resolve({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
        section === "templates"
          ? fetchIntelligenceTemplates({
              page,
              limit: 10,
              search: search || undefined,
            })
          : Promise.resolve({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
        fetchIntelligencePreviewAssessments(),
        section === "pain-points"
          ? fetchCompanyPainPoints({ search: search || undefined })
          : Promise.resolve([]),
        section === "cold-emails"
          ? fetchColdEmailTemplates({ search: search || undefined, page, limit: 10 })
          : Promise.resolve({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
      ]);
      setVersions(versionRows);
      setScoringRules(scoringResponse.items);
      setRecommendationRules(recommendationResponse.items);
      setTemplates(templateResponse.items);
      setAssessments(assessmentResponse.items);
      setPainPoints(painPointRows);
      setColdEmailTemplates(coldEmailResponse.items);
      setTotalPages(
        section === "scoring-rules"
          ? scoringResponse.totalPages
          : section === "recommendations"
            ? recommendationResponse.totalPages
            : section === "templates"
              ? templateResponse.totalPages
              : section === "cold-emails"
                ? coldEmailResponse.totalPages
                : 1,
      );
      setSelectedVersionId((current) =>
        versionRows.some((version) => version.id === current)
          ? current
          : (versionRows.find(
              (version) => !version.isPublished && !version.publishedAt,
            )?.id ??
            versionRows.find((version) => version.isPublished)?.id ??
            versionRows[0]?.id ??
            ""),
      );
      setSelectedAssessmentId((current) =>
        assessmentResponse.items.some((assessment) => assessment.id === current)
          ? current
          : (assessmentResponse.items[0]?.id ?? ""),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Intelligence configuration could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, section, selectedVersionId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function perform(
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      setPreview(null);
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The requested change could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function makeDraft() {
    if (!selectedVersion || !selectedVersion.isPublished) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const draft = await createIntelligenceDraft(selectedVersion.id);
      setSelectedVersionId(draft.id);
      setPage(1);
      setNotice(
        "A draft configuration was created from the selected published version.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The calculator draft could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function publishVersion() {
    if (!selectedVersion || selectedVersion.isPublished) return;
    if (
      !window.confirm(
        `Publish calculator version ${selectedVersion.versionNumber}? New assessments will use this version.`,
      )
    ) {
      return;
    }
    await perform(
      () => publishIntelligenceVersion(selectedVersion.id),
      `Calculator version ${selectedVersion.versionNumber} was published.`,
    );
  }
  async function runPreview() {
    if (!selectedVersion || !selectedAssessmentId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setPreview(
        await previewIntelligenceVersion(
          selectedVersion.id,
          selectedAssessmentId,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The scoring engine could not preview this version.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visibleScoringRules = useMemo(
    () =>
      scoringRules.filter(
        (rule) => rule.calculatorVersion.id === selectedVersionId,
      ),
    [scoringRules, selectedVersionId],
  );
  const visibleRecommendationRules = useMemo(
    () =>
      recommendationRules.filter(
        (rule) => rule.calculatorVersion.id === selectedVersionId,
      ),
    [recommendationRules, selectedVersionId],
  );
  const titleText =
    section === "scoring-rules"
      ? "Manage genuine HR Health Check scoring configuration."
      : section === "recommendations"
        ? "Manage versioned recommendation rules evaluated by the existing engine."
        : section === "templates"
          ? "Manage reusable recommendation content and immutable published versions."
          : section === "pain-points"
            ? "Manage automated pain-point detection logic and versioned business impact rules."
            : "Manage personalized cold-email recommendation templates tailored to assessment findings.";
  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        subtitle={titleText}
        breadcrumbs={[
          { label: "Control panel", href: "/control-panel" },
          { label: "Intelligence" },
          { label: title },
        ]}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className={secondaryButtonClass}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />
      
      {/* Intelligence Section Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <Link
          href="/control-panel/intelligence/scoring-rules"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            section === "scoring-rules"
              ? "bg-goswift-primary text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Scoring Rules
        </Link>
        <Link
          href="/control-panel/intelligence/recommendations"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            section === "recommendations"
              ? "bg-goswift-primary text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Recommendations
        </Link>
        <Link
          href="/control-panel/intelligence/templates"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            section === "templates"
              ? "bg-goswift-primary text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Templates
        </Link>
        <Link
          href="/control-panel/intelligence/pain-points"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            section === "pain-points"
              ? "bg-goswift-primary text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Company Pain Points
        </Link>
        <Link
          href="/control-panel/intelligence/cold-emails"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            section === "cold-emails"
              ? "bg-goswift-primary text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Cold Email Templates
        </Link>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {!loading && totalPages > 1 && (
        <nav
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
          aria-label="Intelligence pagination"
        >
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {(section === "scoring-rules" || section === "recommendations") && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
              <label className="grid gap-1 text-sm font-medium">
                Configuration version
                <select
                  className={inputClass}
                  value={selectedVersionId}
                  onChange={(event) => {
                    setSelectedVersionId(event.target.value);
                    setPage(1);
                    setPreview(null);
                  }}
                  disabled={loading}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.calculator.name} · v{version.versionNumber} ·{" "}
                      {version.isPublished
                        ? "Published"
                        : version.publishedAt
                          ? "Historical"
                          : "Draft"}
                    </option>
                  ))}
                </select>
              </label>
              {selectedVersion && (
                <StatusBadge
                  status={
                    selectedVersion.isPublished
                      ? "ACTIVE"
                      : selectedVersion.publishedAt
                        ? "INACTIVE"
                        : "PENDING"
                  }
                  label={
                    selectedVersion.isPublished
                      ? "Published"
                      : selectedVersion.publishedAt
                        ? "Historical"
                        : "Draft"
                  }
                  size="md"
                />
              )}
              {selectedVersion?.isPublished ? (
                <button
                  type="button"
                  onClick={() => void makeDraft()}
                  className={buttonClass}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" /> Create draft
                </button>
              ) : isDraft ? (
                <button
                  type="button"
                  onClick={() => void publishVersion()}
                  className={buttonClass}
                  disabled={busy || !selectedVersion}
                >
                  <Send className="h-4 w-4" /> Publish version
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">
                Preview against a real completed assessment
                <select
                  className={inputClass}
                  value={selectedAssessmentId}
                  onChange={(event) =>
                    setSelectedAssessmentId(event.target.value)
                  }
                >
                  <option value="">Select a completed assessment</option>
                  {assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.calculatorVersion.calculator.name} ·{" "}
                      {assessment.id.slice(0, 8)} ·{" "}
                      {assessment.completedAt
                        ? new Date(assessment.completedAt).toLocaleString()
                        : "Completed"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void runPreview()}
                className={secondaryButtonClass}
                disabled={busy || !selectedAssessmentId || !selectedVersion}
              >
                <Eye className="h-4 w-4" /> Preview with engine
              </button>
            </div>
            {preview && <EnginePreview result={preview} />}
          </section>
          <label className="block max-w-lg text-sm font-medium">
            Search{" "}
            {section === "scoring-rules"
              ? "scoring rules"
              : "recommendation rules"}
            <input
              className={`mt-1 ${inputClass}`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search configured rules…"
            />
          </label>
        </>
      )}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading configuration from GoSwiftHR…
        </div>
      ) : section === "scoring-rules" ? (
        <ScoringRules
          categories={selectedVersion?.scoreCategories ?? []}
          rules={visibleScoringRules}
          versionId={selectedVersionId}
          isDraft={isDraft}
          busy={busy}
          perform={perform}
        />
      ) : section === "recommendations" ? (
        <RecommendationRules
          categories={selectedVersion?.scoreCategories ?? []}
          rules={visibleRecommendationRules}
          templates={templates.filter((template) => template.isPublished)}
          versionId={selectedVersionId}
          isDraft={isDraft}
          busy={busy}
          perform={perform}
        />
      ) : section === "pain-points" ? (
        <PainPoints
          painPoints={painPoints}
          busy={busy}
          perform={perform}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      ) : section === "cold-emails" ? (
        <ColdEmails
          templates={coldEmailTemplates}
          assessments={assessments}
          busy={busy}
          perform={perform}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          previewResult={coldEmailPreview}
          onPreviewResult={setColdEmailPreview}
        />
      ) : (
        <Templates
          templates={templates}
          busy={busy}
          perform={perform}
          onPreview={(value) => setTemplatePreview(value)}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      )}
      {templatePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-preview-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2
                id="template-preview-title"
                className="text-xl font-bold text-goswift-navy"
              >
                Template preview
              </h2>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setTemplatePreview(null)}
              >
                Close
              </button>
            </div>
            <p className="mt-4 font-semibold">{templatePreview.title}</p>
            <p className="mt-2 text-sm text-slate-700">
              {templatePreview.summary}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
              {templatePreview.actionPlan}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Supported placeholders: categoryName, score, riskLevel,
              maturityLevel, answeredQuestionsCount, visibleQuestionsCount
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Used:{" "}
              {templatePreview.placeholders.length
                ? templatePreview.placeholders.join(", ")
                : "none"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
function ScoringRules({
  categories,
  rules,
  versionId,
  isDraft,
  busy,
  perform,
}: {
  categories: AdminScoreCategory[];
  rules: AdminScoringRule[];
  versionId: string;
  isDraft: boolean;
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const saved = await perform(
      () =>
        createIntelligenceScoringRule(versionId, {
          name: String(data.get("name")),
          conditionExpression: String(data.get("conditionExpression")),
          multiplier: Number(data.get("multiplier")),
          scoreCategoryId: String(data.get("scoreCategoryId") || "") || null,
        }),
      "Scoring rule draft saved.",
    );
    if (saved) form.reset();
  }
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-goswift-navy">
          Scoring categories and weights
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Weights are applied by the backend scoring engine. Monetary
          calculators and payroll evidence semantics are not scored here.
        </p>
        {categories.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {categories.map((category) => (
              <CategoryWeight
                key={category.id}
                category={category}
                editable={isDraft}
                busy={busy}
                perform={perform}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No scoring categories are configured for this version.
          </p>
        )}
      </section>
      {isDraft && (
        <form
          onSubmit={(event) => void createRule(event)}
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
        >
          <h2 className="md:col-span-2 font-bold text-goswift-navy">
            Add scoring rule to draft
          </h2>
          <label className="grid gap-1 text-sm">
            Rule name
            <input
              name="name"
              required
              maxLength={200}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Category
            <select name="scoreCategoryId" className={inputClass}>
              <option value="">Overall</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            Condition expression
            <input
              name="conditionExpression"
              required
              placeholder={'SCORE < 40 or {"minScore": 0, "maxScore": 40}'}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Scoring multiplier
            <input
              name="multiplier"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue="1"
              className={inputClass}
            />
          </label>
          <div className="flex items-end">
            <button className={buttonClass} disabled={busy}>
              <Plus className="h-4 w-4" /> Add rule
            </button>
          </div>
        </form>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-goswift-navy">
            Scoring rules · {rules.length}
          </h2>
        </div>
        {rules.length ? (
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <ScoringRuleRow
                key={rule.id}
                rule={rule}
                categories={categories}
                editable={isDraft}
                busy={busy}
                perform={perform}
              />
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">
            No scoring rules match this version or search.
          </p>
        )}
      </section>
    </div>
  );
}
function CategoryWeight({
  category,
  editable,
  busy,
  perform,
}: {
  category: AdminScoreCategory;
  editable: boolean;
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [weight, setWeight] = useState(String(category.weight));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void perform(
          () =>
            updateIntelligenceCategory(category.id, { weight: Number(weight) }),
          `${category.name} weight updated.`,
        );
      }}
      className="flex items-end gap-3 rounded-lg bg-slate-50 p-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{category.name}</p>
        <p className="text-xs text-slate-500">{category.code}</p>
      </div>
      <label className="grid w-28 gap-1 text-xs">
        Weight
        <input
          disabled={!editable}
          type="number"
          min="0"
          step="0.01"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          className={inputClass}
        />
      </label>
      {editable && (
        <button
          className={secondaryButtonClass}
          disabled={busy}
          aria-label={`Save ${category.name} weight`}
        >
          <Save className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
function ScoringRuleRow({
  rule,
  categories,
  editable,
  busy,
  perform,
}: {
  rule: AdminScoringRule;
  categories: AdminScoreCategory[];
  editable: boolean;
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState(rule.name);
  const [condition, setCondition] = useState(rule.conditionExpression);
  const [multiplier, setMultiplier] = useState(String(rule.multiplier));
  const [categoryId, setCategoryId] = useState(rule.scoreCategory?.id ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void perform(
          () =>
            updateIntelligenceScoringRule(rule.id, {
              name,
              conditionExpression: condition,
              multiplier: Number(multiplier),
              scoreCategoryId: categoryId || null,
            }),
          `Scoring rule "${name}" updated.`,
        );
      }}
      className="grid gap-3 p-5 md:grid-cols-2"
    >
      <label className="grid gap-1 text-xs font-medium">
        Name
        <input
          disabled={!editable}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Category
        <select
          disabled={!editable}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
        >
          <option value="">Overall</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Condition
        <input
          disabled={!editable}
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Multiplier
        <input
          disabled={!editable}
          type="number"
          min="0"
          step="0.01"
          value={multiplier}
          onChange={(event) => setMultiplier(event.target.value)}
          className={inputClass}
        />
      </label>
      {editable && (
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className={secondaryButtonClass} disabled={busy}>
            <Save className="h-4 w-4" /> Save
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Remove scoring rule "${rule.name}" from this draft?`,
                )
              )
                void perform(
                  () => deleteIntelligenceScoringRule(rule.id),
                  "Scoring rule removed from the draft.",
                );
            }}
          >
            Remove from draft
          </button>
        </div>
      )}
    </form>
  );
}
function RecommendationRules({
  categories,
  rules,
  templates,
  versionId,
  isDraft,
  busy,
  perform,
}: {
  categories: AdminScoreCategory[];
  rules: AdminRecommendationRule[];
  templates: AdminRecommendationTemplate[];
  versionId: string;
  isDraft: boolean;
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const rawCondition = String(data.get("conditionJson") || "").trim();
    let conditionJson: Record<string, unknown> | null = null;
    if (rawCondition) {
      try {
        const parsed: unknown = JSON.parse(rawCondition);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Condition must be a JSON object.");
        conditionJson = parsed as Record<string, unknown>;
      } catch (cause) {
        window.alert(
          cause instanceof Error ? cause.message : "Condition JSON is invalid.",
        );
        return;
      }
    }
    const saved = await perform(
      () =>
        createIntelligenceRecommendationRule(versionId, {
          templateId: String(data.get("templateId")),
          scoreCategoryId: String(data.get("scoreCategoryId") || "") || null,
          minScore: String(data.get("minScore"))
            ? Number(data.get("minScore"))
            : null,
          maxScore: String(data.get("maxScore"))
            ? Number(data.get("maxScore"))
            : null,
          conditionJson,
        }),
      "Recommendation rule added to draft.",
    );
    if (saved) form.reset();
  }
  return (
    <div className="space-y-5">
      {isDraft && (
        <form
          onSubmit={(event) => void createRule(event)}
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
        >
          <h2 className="md:col-span-2 font-bold text-goswift-navy">
            Add recommendation rule to draft
          </h2>
          <label className="grid gap-1 text-sm">
            Published template
            <select name="templateId" required className={inputClass}>
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title} · v{template.versionNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Category
            <select name="scoreCategoryId" className={inputClass}>
              <option value="">Overall</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Minimum score (optional)
            <input
              name="minScore"
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Maximum score (optional)
            <input
              name="maxScore"
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            Question condition JSON (optional)
            <textarea
              name="conditionJson"
              rows={3}
              placeholder='{"questionCode":"Q_CODE","operator":"EQUALS","value":"yes"}'
              className={inputClass}
            />
          </label>
          <div className="md:col-span-2">
            <button
              className={buttonClass}
              disabled={busy || !templates.length}
            >
              <Plus className="h-4 w-4" /> Add recommendation rule
            </button>
            {!templates.length && (
              <p className="mt-2 text-xs text-amber-700">
                Publish a recommendation template before attaching it to a rule.
              </p>
            )}
          </div>
        </form>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-goswift-navy">
            Recommendation rules · {rules.length}
          </h2>
        </div>
        {rules.length ? (
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <RecommendationRuleRow
                key={rule.id}
                rule={rule}
                categories={categories}
                templates={templates}
                editable={isDraft}
                busy={busy}
                perform={perform}
              />
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">
            No recommendation rules match this version or search.
          </p>
        )}
      </section>
    </div>
  );
}
function RecommendationRuleRow({
  rule,
  categories,
  templates,
  editable,
  busy,
  perform,
}: {
  rule: AdminRecommendationRule;
  categories: AdminScoreCategory[];
  templates: AdminRecommendationTemplate[];
  editable: boolean;
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState(rule.templateId);
  const [categoryId, setCategoryId] = useState(rule.scoreCategoryId ?? "");
  const [minScore, setMinScore] = useState(
    rule.minScore === null ? "" : String(rule.minScore),
  );
  const [maxScore, setMaxScore] = useState(
    rule.maxScore === null ? "" : String(rule.maxScore),
  );
  const [conditionJson, setConditionJson] = useState(
    rule.conditionJson && typeof rule.conditionJson === "object"
      ? JSON.stringify(rule.conditionJson, null, 2)
      : "",
  );
  const [conditionError, setConditionError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        let parsedCondition: Record<string, unknown> | null = null;
        if (conditionJson.trim()) {
          try {
            const parsed: unknown = JSON.parse(conditionJson);
            if (
              !parsed ||
              typeof parsed !== "object" ||
              Array.isArray(parsed)
            ) {
              throw new Error("Condition must be a JSON object.");
            }
            parsedCondition = parsed as Record<string, unknown>;
          } catch (cause) {
            setConditionError(
              cause instanceof Error
                ? cause.message
                : "Condition JSON is invalid.",
            );
            return;
          }
        }
        setConditionError(null);
        void perform(
          () =>
            updateIntelligenceRecommendationRule(rule.id, {
              templateId,
              scoreCategoryId: categoryId || null,
              minScore: minScore === "" ? null : Number(minScore),
              maxScore: maxScore === "" ? null : Number(maxScore),
              conditionJson: parsedCondition,
            }),
          `Recommendation rule "${rule.template.title}" updated.`,
        );
      }}
      className="grid gap-3 p-5 md:grid-cols-2"
    >
      <label className="grid gap-1 text-xs font-medium">
        Template
        <select
          disabled={!editable}
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className={inputClass}
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title} · v{template.versionNumber}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Category
        <select
          disabled={!editable}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
        >
          <option value="">Overall</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Minimum score
        <input
          disabled={!editable}
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={minScore}
          onChange={(event) => setMinScore(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Maximum score
        <input
          disabled={!editable}
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={maxScore}
          onChange={(event) => setMaxScore(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium md:col-span-2">
        Question condition JSON
        <textarea
          disabled={!editable}
          rows={3}
          value={conditionJson}
          onChange={(event) => setConditionJson(event.target.value)}
          className={inputClass}
        />
      </label>
      {conditionError && (
        <p role="alert" className="text-xs text-rose-700 md:col-span-2">
          {conditionError}
        </p>
      )}
      <div className="flex items-center gap-2 md:col-span-2">
        <StatusBadge
          status={rule.calculatorVersion.isPublished ? "ACTIVE" : "PENDING"}
          label={`Version ${rule.calculatorVersion.versionNumber}${rule.calculatorVersion.isPublished ? " · Published" : " · Draft"}`}
        />
        <StatusBadge
          status={rule.template.priority}
          label={`Priority: ${rule.template.priority}`}
        />
        {editable && (
          <>
            <button className={secondaryButtonClass} disabled={busy}>
              <Save className="h-4 w-4" /> Save
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove recommendation rule for "${rule.template.title}" from this draft?`,
                  )
                )
                  void perform(
                    () => deleteIntelligenceRecommendationRule(rule.id),
                    "Recommendation rule removed from the draft.",
                  );
              }}
            >
              Remove from draft
            </button>
          </>
        )}
      </div>
    </form>
  );
}
function Templates({
  templates,
  busy,
  perform,
  onPreview,
  search,
  onSearchChange,
}: {
  templates: AdminRecommendationTemplate[];
  busy: boolean;
  perform: (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<boolean>;
  onPreview: (preview: TemplatePreview) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = templates.find((template) => template.id === selectedId);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [priority, setPriority] =
    useState<AdminRecommendationTemplate["priority"]>("MEDIUM");
  const [serviceLink, setServiceLink] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let createdTemplateId = "";
    const action = creating
      ? async () => {
          const created = await createIntelligenceTemplate({
            code,
            title,
            summary,
            actionPlan,
            priority,
            serviceLink: serviceLink || null,
          });
          createdTemplateId = created.id;
          return created;
        }
      : selected
        ? () =>
            updateIntelligenceTemplate(selected.id, {
              title,
              summary,
              actionPlan,
              priority,
              serviceLink: serviceLink || null,
            })
        : undefined;
    if (!action) return;
    const saved = await perform(
      action,
      creating ? "Template draft created." : "Template draft saved.",
    );
    if (saved) {
      if (createdTemplateId) setSelectedId(createdTemplateId);
      setCreating(false);
      setCode("");
    }
  }
  async function createTemplateDraft(template: AdminRecommendationTemplate) {
    const saved = await perform(async () => {
      const draft = await createIntelligenceTemplateDraft(template.id);
      setSelectedId(draft.id);
      setTitle(draft.title);
      setSummary(draft.summary);
      setActionPlan(draft.actionPlan);
      setPriority(draft.priority);
      setServiceLink(draft.serviceLink ?? "");
      return draft;
    }, "A new editable template version was created.");
    if (saved) setCreating(false);
  }
  async function preview() {
    if (!selected) return;
    try {
      setNotice(null);
      onPreview(await previewIntelligenceTemplate(selected.id));
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Template preview is unavailable.",
      );
    }
  }
  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-goswift-navy">Templates</h2>
            <button
              type="button"
              onClick={() => {
                setSelectedId("");
                setCreating(true);
                setTitle("");
                setSummary("");
                setActionPlan("");
                setCode("");
                setPriority("MEDIUM");
                setServiceLink("");
              }}
              className={buttonClass}
            >
              <Plus className="h-4 w-4" /> New template
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Search templates
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search title, code or content…"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="mt-3 max-h-[34rem] space-y-2 overflow-auto">
            {templates.length ? (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(template.id);
                    setCreating(false);
                    setTitle(template.title);
                    setSummary(template.summary);
                    setActionPlan(template.actionPlan);
                    setPriority(template.priority);
                    setServiceLink(template.serviceLink ?? "");
                  }}
                  className={`w-full rounded-lg border p-3 text-left ${selectedId === template.id ? "border-goswift-primary bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{template.title}</span>
                    <StatusBadge
                      status={
                        template.status === "PUBLISHED"
                          ? "ACTIVE"
                          : template.status === "DRAFT"
                            ? "PENDING"
                            : "INACTIVE"
                      }
                      label={`${template.status ?? (template.isPublished ? "PUBLISHED" : "DRAFT")} · v${template.versionNumber}`}
                    />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {template.summary}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Applicable categories:{" "}
                    {template.applicableCategories?.length
                      ? template.applicableCategories.join(", ")
                      : "Not associated with a rule"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {template.ruleCount ?? 0} linked rules ·{" "}
                    {template.generatedRecommendationCount ?? 0} generated
                    snapshots
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                No recommendation templates are present.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-goswift-navy">
              {creating
                ? "Create template draft"
                : selected
                  ? `${selected.code} · version ${selected.versionNumber}`
                  : "Select a template"}
            </h2>
            {selected && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void preview()}
                  className={secondaryButtonClass}
                >
                  <Eye className="h-4 w-4" /> Preview
                </button>
                {selected.isPublished || selected.status === "INACTIVE" ? (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={busy}
                    onClick={() => void createTemplateDraft(selected)}
                  >
                    Create draft
                  </button>
                ) : (
                  selected.status === "DRAFT" && (
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Publish template version ${selected.versionNumber}?`,
                          )
                        )
                          void perform(
                            () => publishIntelligenceTemplate(selected.id),
                            "Template version published.",
                          );
                      }}
                    >
                      <Send className="h-4 w-4" /> Publish
                    </button>
                  )
                )}
                {selected.isPublished && (selected.ruleCount ?? 0) === 0 && (
                  <button
                    type="button"
                    className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Deactivate ${selected.title}?`))
                        void perform(
                          () => deactivateIntelligenceTemplate(selected.id),
                          "Template deactivated.",
                        );
                    }}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            )}
          </div>
          {creating ||
          (selected && !selected.isPublished && selected.status === "DRAFT") ? (
            <form
              onSubmit={(event) => void saveTemplate(event)}
              className="mt-4 space-y-3"
            >
              {creating && (
                <label className="grid gap-1 text-sm">
                  Template code
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    className={inputClass}
                  />
                </label>
              )}
              <label className="grid gap-1 text-sm">
                Recommendation title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={300}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Summary
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  required
                  maxLength={4000}
                  rows={3}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Action plan
                <textarea
                  value={actionPlan}
                  onChange={(event) => setActionPlan(event.target.value)}
                  required
                  maxLength={8000}
                  rows={4}
                  className={inputClass}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Priority
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(
                        event.target
                          .value as AdminRecommendationTemplate["priority"],
                      )
                    }
                    className={inputClass}
                  >
                    {priorities.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Service link (optional)
                  <input
                    type="url"
                    value={serviceLink}
                    onChange={(event) => setServiceLink(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                Placeholders: {"{{categoryName}}"}, {"{{score}}"},{" "}
                {"{{riskLevel}}"}, {"{{maturityLevel}}"},{" "}
                {"{{answeredQuestionsCount}}"}, {"{{visibleQuestionsCount}}"}.
                Unsupported tokens are rejected by the backend.
              </p>
              <button className={buttonClass} disabled={busy}>
                <Save className="h-4 w-4" /> Save draft
              </button>
            </form>
          ) : selected ? (
            <div className="mt-5 space-y-4">
              <StatusBadge
                status={selected.isPublished ? "ACTIVE" : "INACTIVE"}
                label={
                  selected.isPublished
                    ? "Published and immutable"
                    : (selected.status ?? "Historical version")
                }
                size="md"
              />
              <p className="text-sm font-semibold">{selected.title}</p>
              <p className="text-sm text-slate-600">{selected.summary}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">
                {selected.actionPlan}
              </p>
              <p className="text-xs text-slate-500">
                Priority: {selected.priority} · {selected.ruleCount ?? 0} linked
                rule(s) · {selected.generatedRecommendationCount ?? 0} saved
                recommendation snapshot(s)
              </p>
              <p className="text-xs text-slate-500">
                Applicable categories:{" "}
                {selected.applicableCategories?.length
                  ? selected.applicableCategories.join(", ")
                  : "Not associated with a rule"}
              </p>
              <p className="text-xs text-slate-500">
                Published template versions are immutable. Changes create a new
                draft and do not rewrite generated recommendation snapshots.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Choose a template to inspect history, preview content or create a
              versioned draft.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
function EnginePreview({ result }: { result: PreviewResult }) {
  const score = result.scoringResult as {
    normalizedIndex?: number;
    maturityLevel?: string;
    riskLevel?: string;
    categoryScores?: Record<string, { percentage: number; riskLevel: string }>;
  };
  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <h3 className="font-semibold text-goswift-navy">
        Backend engine preview
      </h3>
      <p className="mt-1 text-sm">
        Overall score: {score.normalizedIndex ?? "—"} · Maturity:{" "}
        {score.maturityLevel ?? "—"} · Risk: {score.riskLevel ?? "—"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(score.categoryScores ?? {}).map(([category, value]) => (
          <StatusBadge
            key={category}
            status={value.riskLevel}
            label={`${category}: ${value.percentage}`}
          />
        ))}
      </div>
      <h4 className="mt-4 text-sm font-semibold">
        Triggered recommendations ({result.recommendations.length})
      </h4>
      {result.recommendations.length ? (
        <ul className="mt-2 space-y-2">
          {result.recommendations.map((recommendation, index) => (
            <li
              key={`${recommendation.title}-${index}`}
              className="rounded bg-white p-3 text-sm"
            >
              <p className="font-semibold">
                {recommendation.title} · {recommendation.priority}
              </p>
              <p className="mt-1 text-slate-600">{recommendation.summary}</p>
              <p className="mt-1 text-slate-600">{recommendation.actionPlan}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          No recommendations triggered for this assessment.
        </p>
      )}
    </div>
  );
}
// ==============================================================================
// COMPANY PAIN POINTS COMPONENT
// ==============================================================================
function PainPoints({
  painPoints,
  busy,
  perform,
  search,
  onSearchChange,
}: {
  painPoints: AdminCompanyPainPoint[];
  busy: boolean;
  perform: (action: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = painPoints.find((p) => p.id === selectedId);
  const [creating, setCreating] = useState(false);
  const [calculatorFilter, setCalculatorFilter] = useState("all");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [businessImpact, setBusinessImpact] = useState("");
  const [calculatorSlug, setCalculatorSlug] = useState("payroll-cost-calculator");
  const [category, setCategory] = useState("Payroll Compliance");
  const [priority, setPriority] = useState<AdminCompanyPainPoint["priority"]>("HIGH");
  const [suggestedSolution, setSuggestedSolution] = useState("");
  const [ruleQuestionCode, setRuleQuestionCode] = useState("PC_REGULAR_GROSS_PER_RUN");
  const [ruleOperator, setRuleOperator] = useState("GREATER_THAN");
  const [ruleValue, setRuleValue] = useState("100000");
  const filtered = useMemo(() => {
    return painPoints.filter((p) => {
      if (calculatorFilter !== "all" && p.calculatorSlug !== calculatorFilter) return false;
      return true;
    });
  }, [painPoints, calculatorFilter]);
  function startCreate() {
    setSelectedId("");
    setCreating(true);
    setCode("");
    setTitle("");
    setDescription("");
    setBusinessImpact("");
    setCalculatorSlug("payroll-cost-calculator");
    setCategory("Payroll Compliance");
    setPriority("HIGH");
    setSuggestedSolution("");
    setRuleQuestionCode("PC_REGULAR_GROSS_PER_RUN");
    setRuleOperator("GREATER_THAN");
    setRuleValue("100000");
  }
  function startEdit(p: AdminCompanyPainPoint) {
    setSelectedId(p.id);
    setCreating(false);
    setCode(p.code);
    setTitle(p.title);
    setDescription(p.description);
    setBusinessImpact(p.businessImpact);
    setCalculatorSlug(p.calculatorSlug);
    setCategory(p.category);
    setPriority(p.priority);
    setSuggestedSolution(p.suggestedSolution || "");
    const rule = p.detectionRule as {
      questionCode?: string;
      operator?: string;
      value?: string | number | boolean;
    } | null;
    if (rule && rule.questionCode) {
      setRuleQuestionCode(rule.questionCode);
      setRuleOperator(rule.operator || "EQUALS");
      setRuleValue(rule.value !== undefined ? String(rule.value) : "");
    }
  }
  async function savePainPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedVal = !isNaN(Number(ruleValue)) ? Number(ruleValue) : ruleValue;
    const detectionRule = {
      questionCode: ruleQuestionCode.trim(),
      operator: ruleOperator,
      value: parsedVal,
    };
    if (creating) {
      await perform(
        () =>
          createCompanyPainPointDraft({
            code: code.trim(),
            title: title.trim(),
            description: description.trim(),
            businessImpact: businessImpact.trim(),
            calculatorSlug,
            category: category.trim(),
            priority,
            suggestedSolution: suggestedSolution.trim() || null,
            isActive: true,
            detectionRule,
          }),
        "Company pain point draft created.",
      );
      setCreating(false);
    } else if (selected) {
      await perform(
        () =>
          updateCompanyPainPoint(selected.id, {
            code: selected.code,
            title: title.trim(),
            description: description.trim(),
            businessImpact: businessImpact.trim(),
            calculatorSlug: selected.calculatorSlug,
            category: category.trim(),
            priority,
            suggestedSolution: suggestedSolution.trim() || null,
            isActive: selected.isActive,
            detectionRule,
          }),
        "Company pain point draft updated.",
      );
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Left Column: Pain Points List */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-goswift-navy">Pain Points ({filtered.length})</h2>
            <p className="text-xs text-slate-500">Evaluated on assessment completion</p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className={buttonClass}
            disabled={busy}
          >
            <Plus className="h-4 w-4" /> New Pain Point
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="search"
            placeholder="Search code, title, category..."
            className={inputClass}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <select
            className={inputClass}
            value={calculatorFilter}
            onChange={(e) => setCalculatorFilter(e.target.value)}
          >
            <option value="all">All Calculators</option>
            <option value="payroll-cost-calculator">Payroll Cost Calculator</option>
            <option value="payroll-compliance-calculator">Payroll Compliance Calculator</option>
            <option value="hr-administrative-cost-calculator">HR Admin Cost Calculator</option>
            <option value="hr-health-check">SME HR Health Check</option>
          </select>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.length ? (
            filtered.map((point) => {
              const isSelected = point.id === selectedId;
              const isDraft = !point.publishedAt;
              return (
                <div
                  key={point.id}
                  onClick={() => startEdit(point)}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? "border-goswift-primary bg-goswift-primary/5"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {point.code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        v{point.versionNumber}
                      </span>
                      <StatusBadge status={isDraft ? "DRAFT" : "PUBLISHED"} />
                    </div>
                  </div>
                  <h3 className="mt-1 font-semibold text-sm text-goswift-navy">{point.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{point.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                      {point.category}
                    </span>
                    <span className="font-semibold text-amber-700">Priority: {point.priority}</span>
                    <span>Findings: {point._count?.findings ?? 0}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No pain points found.</p>
          )}
        </div>
      </section>
      {/* Right Column: Editor & Actions */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        {creating || selected ? (
          <form onSubmit={savePainPoint} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-goswift-navy">
                  {creating ? "New Pain Point Draft" : `Editing ${selected?.code} (v${selected?.versionNumber})`}
                </h3>
                <p className="text-xs text-slate-500">
                  {selected?.publishedAt ? "Published version (read-only; create a new version to edit)" : "Draft version"}
                </p>
              </div>
              {selected && selected.publishedAt && (
                <button
                  type="button"
                  onClick={() =>
                    perform(
                      () => createCompanyPainPointVersion(selected.id),
                      "Created new version draft from published pain point.",
                    )
                  }
                  className={secondaryButtonClass}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" /> Create New Version
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Code (e.g. TAX_RECONCILIATION_GAP)
                <input
                  type="text"
                  required
                  pattern="^[A-Z][A-Z0-9_]{1,63}$"
                  title="Uppercase letters, numbers, and underscores only"
                  className={inputClass}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={!creating}
                />
              </label>
              <label className="text-sm font-medium">
                Calculator
                <select
                  className={inputClass}
                  value={calculatorSlug}
                  onChange={(e) => setCalculatorSlug(e.target.value)}
                  disabled={!creating}
                >
                  <option value="payroll-cost-calculator">Payroll Cost Calculator</option>
                  <option value="payroll-compliance-calculator">Payroll Compliance Calculator</option>
                  <option value="hr-administrative-cost-calculator">HR Admin Cost Calculator</option>
                  <option value="hr-health-check">SME HR Health Check</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Title
              <input
                type="text"
                required
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={Boolean(selected?.publishedAt)}
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                required
                rows={2}
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={Boolean(selected?.publishedAt)}
              />
            </label>
            <label className="block text-sm font-medium">
              Business Impact
              <textarea
                required
                rows={2}
                className={inputClass}
                value={businessImpact}
                onChange={(e) => setBusinessImpact(e.target.value)}
                disabled={Boolean(selected?.publishedAt)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Category
                <input
                  type="text"
                  required
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={Boolean(selected?.publishedAt)}
                />
              </label>
              <label className="text-sm font-medium">
                Priority
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as AdminCompanyPainPoint["priority"])}
                  disabled={Boolean(selected?.publishedAt)}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Suggested Solution (optional)
              <textarea
                rows={2}
                className={inputClass}
                value={suggestedSolution}
                onChange={(e) => setSuggestedSolution(e.target.value)}
                disabled={Boolean(selected?.publishedAt)}
              />
            </label>
            {/* Detection Rule Builder */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-700">
                Detection Rule Logic
              </h4>
              <p className="text-xs text-slate-500">
                Triggered when user answer matches this condition during assessment.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium">
                  Question Code
                  <input
                    type="text"
                    required
                    className={inputClass}
                    value={ruleQuestionCode}
                    onChange={(e) => setRuleQuestionCode(e.target.value)}
                    disabled={Boolean(selected?.publishedAt)}
                  />
                </label>
                <label className="text-xs font-medium">
                  Operator
                  <select
                    className={inputClass}
                    value={ruleOperator}
                    onChange={(e) => setRuleOperator(e.target.value)}
                    disabled={Boolean(selected?.publishedAt)}
                  >
                    <option value="EQUALS">EQUALS</option>
                    <option value="NOT_EQUALS">NOT_EQUALS</option>
                    <option value="GREATER_THAN">GREATER_THAN</option>
                    <option value="GREATER_THAN_OR_EQUAL">GREATER_THAN_OR_EQUAL</option>
                    <option value="LESS_THAN">LESS_THAN</option>
                    <option value="LESS_THAN_OR_EQUAL">LESS_THAN_OR_EQUAL</option>
                    <option value="CONTAINS">CONTAINS</option>
                  </select>
                </label>
                <label className="text-xs font-medium">
                  Trigger Value
                  <input
                    type="text"
                    required
                    className={inputClass}
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                    disabled={Boolean(selected?.publishedAt)}
                  />
                </label>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
              {creating && (
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className={secondaryButtonClass}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
              {(!selected || !selected.publishedAt) && (
                <button type="submit" className={buttonClass} disabled={busy}>
                  <Save className="h-4 w-4" /> {creating ? "Create Draft" : "Save Changes"}
                </button>
              )}
              {selected && !selected.publishedAt && (
                <button
                  type="button"
                  onClick={() =>
                    perform(
                      () => publishCompanyPainPoint(selected.id),
                      `Published pain point ${selected.code} (v${selected.versionNumber}).`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  disabled={busy}
                >
                  <CheckCircle2 className="h-4 w-4" /> Publish Version
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="py-20 text-center text-slate-500">
            <AlertTriangle className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 font-semibold text-goswift-navy">Select or Create a Pain Point</h3>
            <p className="mt-1 text-sm text-slate-500">
              Choose a pain point from the left to view or edit, or click New Pain Point.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
// ==============================================================================
// COLD EMAIL TEMPLATES COMPONENT
// ==============================================================================
function ColdEmails({
  templates,
  assessments,
  busy,
  perform,
  search,
  onSearchChange,
  previewResult,
  onPreviewResult,
}: {
  templates: AdminColdEmailTemplate[];
  assessments: AdminPreviewAssessment[];
  busy: boolean;
  perform: (action: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
  search: string;
  onSearchChange: (value: string) => void;
  previewResult: AdminColdEmailPreview | null;
  onPreviewResult: (result: AdminColdEmailPreview | null) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = templates.find((t) => t.id === selectedId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [categories, setCategories] = useState("Payroll, Compliance");
  // Preview form state
  const [previewAssessmentId, setPreviewAssessmentId] = useState("");
  const senderName = "GoSwiftHR Specialist";
  const senderCompany = "GoSwiftHR";
  function startCreate() {
    setSelectedId("");
    setCreating(true);
    setName("");
    setSubject("Addressing {{painPoints}} at {{companyName}}");
    setBody("Dear {{recipientName}},\n\nBased on your recent {{calculatorName}} assessment, we identified key opportunities:\n{{painPoints}}\n\nRecommended immediate actions:\n{{recommendations}}\n\nBest regards,\n{{senderName}}\n{{senderCompany}}");
    setDescription("");
    setInternalNotes("");
    setCategories("Payroll, Compliance");
  }
  function startEdit(t: AdminColdEmailTemplate) {
    setSelectedId(t.id);
    setCreating(false);
    setName(t.name);
    setSubject(t.subject);
    setBody(t.body);
    setDescription(t.description || "");
    setInternalNotes(t.internalNotes || "");
    setCategories(t.applicablePainPointCategories.join(", "));
  }
  async function saveColdEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const catArray = categories.split(",").map((c) => c.trim()).filter(Boolean);
    if (creating) {
      await perform(
        () =>
          createColdEmailTemplateDraft({
            name: name.trim(),
            subject: subject.trim(),
            body: body.trim(),
            description: description.trim() || null,
            internalNotes: internalNotes.trim() || null,
            applicablePainPointCategories: catArray,
          }),
        "Cold email template draft created.",
      );
      setCreating(false);
    } else if (selected) {
      await perform(
        () =>
          updateColdEmailTemplate(selected.id, {
            name: name.trim(),
            subject: subject.trim(),
            body: body.trim(),
            description: description.trim() || null,
            internalNotes: internalNotes.trim() || null,
            applicablePainPointCategories: catArray,
          }),
        "Cold email template draft updated.",
      );
    }
  }
  async function handlePreview() {
    if (!selected || !previewAssessmentId) return;
    try {
      const res = await previewColdEmail(selected.id, previewAssessmentId, {
        senderName,
        senderCompany,
      });
      onPreviewResult(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate preview.");
    }
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* Left Column: Template List */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-goswift-navy">Templates ({templates.length})</h2>
              <p className="text-xs text-slate-500">Personalized outreach by detected pain points</p>
            </div>
            <button type="button" onClick={startCreate} className={buttonClass} disabled={busy}>
              <Plus className="h-4 w-4" /> New Template
            </button>
          </div>
          <input
            type="search"
            placeholder="Search template name, subject..."
            className={inputClass}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {templates.length ? (
              templates.map((t) => {
                const isSelected = t.id === selectedId;
                return (
                  <div
                    key={t.id}
                    onClick={() => startEdit(t)}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? "border-goswift-primary bg-goswift-primary/5"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-goswift-navy">{t.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          v{t.versionNumber}
                        </span>
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 font-mono truncate">{t.subject}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.applicablePainPointCategories.map((c) => (
                        <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No cold email templates found.</p>
            )}
          </div>
        </section>
        {/* Right Column: Editor & Preview Trigger */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          {creating || selected ? (
            <form onSubmit={saveColdEmail} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-bold text-goswift-navy">
                    {creating ? "New Template Draft" : `${selected?.name} (v${selected?.versionNumber})`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Status: <span className="font-semibold">{selected?.status ?? "DRAFT"}</span>
                  </p>
                </div>
                {selected && selected.status === "PUBLISHED" && (
                  <button
                    type="button"
                    onClick={() =>
                      perform(
                        () => createColdEmailTemplateVersion(selected.id),
                        "Created new draft version from published template.",
                      )
                    }
                    className={secondaryButtonClass}
                    disabled={busy}
                  >
                    <Plus className="h-4 w-4" /> Create New Version
                  </button>
                )}
              </div>
              <label className="block text-sm font-medium">
                Template Name
                <input
                  type="text"
                  required
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={selected?.status !== "DRAFT" && !creating}
                />
              </label>
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Subject Line
                  <input
                    type="text"
                    required
                    className={inputClass}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={selected?.status !== "DRAFT" && !creating}
                  />
                </label>
                <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                  <span className="font-medium">Supported variables:</span>
                  {["{{companyName}}", "{{recipientName}}", "{{score}}", "{{painPoints}}", "{{calculatorName}}"].map(
                    (token) => (
                      <code
                        key={token}
                        className="rounded bg-slate-100 px-1 py-0.5 text-slate-700 cursor-pointer hover:bg-slate-200"
                        onClick={() => {
                          if (selected?.status === "DRAFT" || creating) setSubject((s) => s + " " + token);
                        }}
                      >
                        {token}
                      </code>
                    ),
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Body (Markdown / Plain Text)
                  <textarea
                    required
                    rows={8}
                    className={inputClass}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={selected?.status !== "DRAFT" && !creating}
                  />
                </label>
                <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                  <span className="font-medium">Supported variables:</span>
                  {[
                    "{{companyName}}",
                    "{{recipientName}}",
                    "{{firstName}}",
                    "{{painPoints}}",
                    "{{recommendations}}",
                    "{{senderName}}",
                    "{{senderCompany}}",
                  ].map((token) => (
                    <code
                      key={token}
                      className="rounded bg-slate-100 px-1 py-0.5 text-slate-700 cursor-pointer hover:bg-slate-200"
                      onClick={() => {
                        if (selected?.status === "DRAFT" || creating) setBody((b) => b + "\n" + token);
                      }}
                    >
                      {token}
                    </code>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-medium">
                Applicable Pain Point Categories (comma separated)
                <input
                  type="text"
                  className={inputClass}
                  value={categories}
                  onChange={(e) => setCategories(e.target.value)}
                  disabled={selected?.status !== "DRAFT" && !creating}
                />
              </label>
              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  {selected && (
                    <div className="flex items-center gap-2">
                      <select
                        className={inputClass}
                        value={previewAssessmentId}
                        onChange={(e) => setPreviewAssessmentId(e.target.value)}
                      >
                        <option value="">Select Completed Assessment</option>
                        {assessments.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.calculatorVersion.calculator.name} · {a.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handlePreview}
                        className={secondaryButtonClass}
                        disabled={!previewAssessmentId || busy}
                      >
                        <Eye className="h-4 w-4" /> Live Preview
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {creating && (
                    <button type="button" onClick={() => setCreating(false)} className={secondaryButtonClass}>
                      Cancel
                    </button>
                  )}
                  {(!selected || selected.status === "DRAFT") && (
                    <button type="submit" className={buttonClass} disabled={busy}>
                      <Save className="h-4 w-4" /> {creating ? "Create Draft" : "Save Draft"}
                    </button>
                  )}
                  {selected && selected.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() =>
                        perform(
                          () => publishColdEmailTemplate(selected.id),
                          `Published template ${selected.name} (v${selected.versionNumber}).`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Publish Template
                    </button>
                  )}
                  {selected && selected.status === "PUBLISHED" && (
                    <button
                      type="button"
                      onClick={() =>
                        perform(
                          () => archiveColdEmailTemplate(selected.id),
                          `Archived template ${selected.name}.`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      disabled={busy}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </form>
          ) : (
            <div className="py-20 text-center text-slate-500">
              <Mail className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 font-semibold text-goswift-navy">Select or Create a Cold Email Template</h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose a template from the left or click New Template to begin authoring.
              </p>
            </div>
          )}
        </section>
      </div>
      {/* Live Preview Modal */}
      {previewResult && (
        <section className="rounded-xl border border-goswift-primary/30 bg-goswift-primary/5 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-goswift-primary/20 pb-3">
            <div>
              <h3 className="font-bold text-goswift-navy">Personalized Cold Email Preview</h3>
              <p className="text-xs text-slate-600">
                Personalized for {previewResult.context.companyName} ({previewResult.context.recipientName})
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPreviewResult(null)}
              className={secondaryButtonClass}
            >
              Close Preview
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 font-mono text-sm">
            <div>
              <span className="text-xs uppercase font-bold text-slate-400">Subject:</span>
              <p className="font-semibold text-goswift-navy">{previewResult.renderedSubject}</p>
            </div>
            <div className="border-t border-slate-100 pt-3 whitespace-pre-line text-slate-800">
              {previewResult.renderedBody}
            </div>
          </div>
          {previewResult.detectedPainPoints.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <h4 className="font-semibold text-xs text-amber-900 uppercase tracking-wider">
                Detected Pain Points Triggered in Assessment ({previewResult.detectedPainPoints.length})
              </h4>
              <ul className="text-xs text-amber-800 space-y-1">
                {previewResult.detectedPainPoints.map((p) => (
                  <li key={p.code}>
                    <span className="font-semibold">{p.title}</span> ({p.priority}): {p.businessImpact}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
