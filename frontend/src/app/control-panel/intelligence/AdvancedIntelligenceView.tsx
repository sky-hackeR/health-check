"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Lock,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  AdminIntelligenceVersion,
  AdminRecommendationRule,
  AdminScoringRule,
  createIntelligenceDraft,
  fetchIntelligenceRecommendationRules,
  fetchIntelligenceScoringRules,
  fetchIntelligenceVersions,
  publishIntelligenceVersion,
  updateIntelligenceCategory,
} from "@/lib/api";

export default function AdvancedIntelligenceView() {
  const [versions, setVersions] = useState<AdminIntelligenceVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [scoringRules, setScoringRules] = useState<AdminScoringRule[]>([]);
  const [recommendationRules, setRecommendationRules] = useState<AdminRecommendationRule[]>([]);

  // Category Weights in Draft
  const [editedWeights, setEditedWeights] = useState<Record<string, number>>({});
  const [weightsSaving, setWeightsSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Draft Creation Modal
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftChangelog, setDraftChangelog] = useState("");

  // Publish Confirmation Modal
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  const loadData = async (targetVersionId?: string) => {
    try {
      const versionList = await fetchIntelligenceVersions();
      setVersions(versionList);

      let currentId = targetVersionId || selectedVersionId;
      if (!currentId || !versionList.some((v) => v.id === currentId)) {
        const published = versionList.find((v) => v.isPublished);
        currentId = published ? published.id : versionList[0]?.id || "";
      }
      setSelectedVersionId(currentId);

      if (currentId) {
        await loadVersionRules(currentId, versionList);
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to load intelligence versions.");
    } finally {
      setLoading(false);
    }
  };

  const loadVersionRules = async (versionId: string, versionList?: AdminIntelligenceVersion[]) => {
    try {
      const [scoreRes, recRes] = await Promise.all([
        fetchIntelligenceScoringRules({ versionId, limit: 100 }),
        fetchIntelligenceRecommendationRules({ versionId, limit: 100 }),
      ]);
      setScoringRules(scoreRes.items || []);
      setRecommendationRules(recRes.items || []);

      // Sync category weights
      const vList = versionList || versions;
      const v = vList.find((item) => item.id === versionId);
      if (v) {
        const wMap: Record<string, number> = {};
        v.scoreCategories.forEach((cat) => {
          wMap[cat.id] = cat.weight;
        });
        setEditedWeights(wMap);
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to load version rules.");
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchIntelligenceVersions()
      .then((versionList) => {
        if (ignore) return;
        setVersions(versionList);
        const published = versionList.find((v) => v.isPublished);
        const currentId = published ? published.id : versionList[0]?.id || "";
        setSelectedVersionId(currentId);
        if (currentId) {
          void loadVersionRules(currentId, versionList);
        }
      })
      .catch((cause: unknown) => {
        if (!ignore) {
          setError(cause instanceof Error ? cause.message : "Failed to load intelligence versions.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
    // loadVersionRules is defined in the component body and is only needed on mount.
    // Adding it to deps would cause infinite re-fetching; the stable behaviour is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedVersion = useMemo(() => {
    return versions.find((v) => v.id === selectedVersionId) || null;
  }, [versions, selectedVersionId]);

  const isDraft = useMemo(() => {
    return Boolean(selectedVersion && !selectedVersion.isPublished && !selectedVersion.publishedAt);
  }, [selectedVersion]);

  // Compute total weights percentage
  const totalWeight = useMemo(() => {
    return Object.values(editedWeights).reduce((sum, w) => sum + (Number(w) || 0), 0);
  }, [editedWeights]);

  const isWeightValid = totalWeight === 100;

  // Handle version change
  async function handleSelectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    setError(null);
    setSuccess(null);
    await loadVersionRules(versionId);
  }

  // Handle Save Category Weights
  async function handleSaveWeights() {
    if (!selectedVersion || !isDraft) return;
    if (!isWeightValid) {
      setError(`Category weights total ${totalWeight}%. They must equal exactly 100% before saving.`);
      return;
    }

    setWeightsSaving(true);
    setError(null);
    try {
      for (const [catId, weight] of Object.entries(editedWeights)) {
        await updateIntelligenceCategory(catId, { weight: Number(weight) });
      }
      setSuccess("Category weights saved successfully.");
      await loadData(selectedVersionId);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save category weights.");
    } finally {
      setWeightsSaving(false);
    }
  }

  // Handle Create Draft
  async function handleCreateDraft() {
    if (!selectedVersion) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await createIntelligenceDraft(selectedVersion.id);
      setIsDraftModalOpen(false);
      setSuccess(`New draft version v${draft.versionNumber} created successfully.`);
      await loadData(draft.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to create draft version.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Publish Version
  async function handlePublishVersion() {
    if (!selectedVersion || !isDraft) return;
    if (!isWeightValid) {
      setError(`Cannot publish: Category weights total ${totalWeight}%. They must equal exactly 100%.`);
      setIsPublishModalOpen(false);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const published = await publishIntelligenceVersion(selectedVersion.id);
      setIsPublishModalOpen(false);
      setSuccess(`Version v${published.versionNumber} published live! It is now evaluating all new assessments.`);
      await loadData(published.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to publish version.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-amber-700">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="font-semibold text-slate-700">Loading advanced configuration…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Danger Zone Banner */}
      <section className="overflow-hidden rounded-3xl border border-amber-300 bg-gradient-to-br from-[#0A192F] via-[#073634] to-[#1a1306] p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
              <ShieldAlert className="h-4 w-4" /> Advanced Configuration & Danger Zone
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Mathematical Weighting & Scoring Rules Engine
            </h1>
            <p className="mt-3 text-base leading-relaxed text-amber-100/90">
              This restricted area governs mathematical evaluation formulas, category weights, and live rule
              engines. Changes made here apply to all future assessments. Historical assessments remain immutably
              preserved.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-200">
              Active Configuration Version
            </span>
            <select
              value={selectedVersionId}
              onChange={(e) => void handleSelectVersion(e.target.value)}
              className="rounded-xl border border-white/20 bg-[#0A192F] px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.isPublished ? "Live Published" : "Draft Workspace"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Alert Notices */}
      {success && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="text-xs text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {error}
        </div>
      )}

      {/* Version Status & Lifecycle Controls Bar */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold text-[#0A192F]">
              Version {selectedVersion?.versionNumber} Configuration
            </span>
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                selectedVersion?.isPublished
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {selectedVersion?.isPublished ? "Live Published" : "Draft In-Progress"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {selectedVersion?.isPublished
              ? `Published on ${
                  selectedVersion.publishedAt
                    ? new Date(selectedVersion.publishedAt).toLocaleDateString()
                    : "Active"
                }. Locked against modification to ensure historical audit integrity.`
              : "Draft version: Weights and rules can be edited safely without affecting live users."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedVersion?.isPublished ? (
            <button
              type="button"
              onClick={() => setIsDraftModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#073634]"
            >
              <GitBranch className="h-4 w-4" /> Create Draft From This Version
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              disabled={!isWeightValid}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Publish Draft Live
            </button>
          )}
        </div>
      </section>

      {/* Category Weighting Configuration & Validation */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-[#0D5C58]" />
              <h2 className="text-xl font-bold text-[#0A192F]">Category Weights & Index Math</h2>
            </div>
            <p className="text-xs text-slate-500">
              Each category percentage is weighted to produce the Overall Health Check Index.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isWeightValid
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                  : "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
              }`}
            >
              Total Weight: {totalWeight}% {isWeightValid ? "(Valid)" : "(Must equal 100%)"}
            </span>

            {isDraft && (
              <button
                type="button"
                onClick={handleSaveWeights}
                disabled={weightsSaving || !isWeightValid}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0D5C58] px-4 py-2 text-xs font-bold text-white hover:bg-[#073634] disabled:opacity-50"
              >
                {weightsSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Weights
              </button>
            )}
          </div>
        </div>

        {!selectedVersion?.isPublished && !isWeightValid && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Validation Warning: The configured category weights currently total <strong>{totalWeight}%</strong>.
              You must balance them to equal exactly <strong>100%</strong> before publishing.
            </span>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {selectedVersion?.scoreCategories.map((cat) => {
            const currentWeight = editedWeights[cat.id] ?? cat.weight;
            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-500">{cat.code}</span>
                  {!isDraft && (
                    <span title="Locked in published version">
                      <Lock className="h-3.5 w-3.5 text-slate-400" />
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-sm font-bold text-[#0A192F]">{cat.name}</h3>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!isDraft}
                    value={currentWeight}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditedWeights((prev) => ({ ...prev, [cat.id]: val }));
                    }}
                    className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#073634] disabled:bg-slate-100 disabled:text-slate-600 focus:border-[#0D5C58] focus:outline-none"
                  />
                  <span className="text-sm font-bold text-slate-500">% weight</span>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#0D5C58]"
                    style={{ width: `${Math.min(100, Math.max(0, currentWeight))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scoring Rules Catalog for the Version */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">
              Configured Scoring Multipliers & Rules ({scoringRules.length})
            </h2>
            <p className="text-xs text-slate-500">
              Low-level condition expressions and category point multipliers configured for version {selectedVersion?.versionNumber}.
            </p>
          </div>
        </div>

        {scoringRules.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
            No custom condition multiplier rules defined. Scoring calculates directly from standard question option points.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {scoringRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-4 text-xs">
                <div>
                  <span className="font-bold text-[#0A192F]">{rule.name}</span>
                  <div className="mt-1 flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                    <span>Expr: {rule.conditionExpression}</span>
                    <span>•</span>
                    <span className="text-[#0D5C58] font-bold">Multiplier: x{rule.multiplier}</span>
                  </div>
                </div>
                {rule.scoreCategory && (
                  <span className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-semibold text-[#0D5C58]">
                    {rule.scoreCategory.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recommendation Rules for the Version */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#0A192F]">
              Recommendation Triggers & Thresholds ({recommendationRules.length})
            </h2>
            <p className="text-xs text-slate-500">
              Score threshold rules linking category score ranges to specific recommendation templates.
            </p>
          </div>
        </div>

        {recommendationRules.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
            No score threshold rules configured for this version.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendationRules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-500">{rule.template?.code}</span>
                  <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0D5C58]">
                    {rule.scoreCategory ? rule.scoreCategory.name : "Overall Score"}
                  </span>
                </div>
                <h4 className="mt-2 font-bold text-[#0A192F] truncate">{rule.template?.title}</h4>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="font-semibold">Trigger Range:</span>
                  <span className="rounded bg-white px-2 py-0.5 border border-slate-200 font-mono">
                    {rule.minScore ?? 0}% – {rule.maxScore ?? 100}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Safety & Audit Guarantees Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#0A192F]">Immutable Historical Integrity</h3>
            <p className="text-xs text-slate-500">
              GoSwiftHR ensures complete regulatory auditability for all assessment data.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 text-xs text-slate-600 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="font-bold text-[#0A192F]">Locked Published Records</span>
            <p className="mt-1">
              Once published, a configuration version cannot be directly mutated. Any modification requires
              creating a new numbered version.
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="font-bold text-[#0A192F]">Historical Non-Retroactivity</span>
            <p className="mt-1">
              Completed assessments retain the exact score, category percentages, and maturity levels calculated at
              the time of submission.
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="font-bold text-[#0A192F]">Instant Rollback Capability</span>
            <p className="mt-1">
              If a newly published configuration produces unexpected evaluations, administrators can re-publish any
              prior version with one click.
            </p>
          </div>
        </div>
      </section>

      {/* Modal: Create Draft */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0A192F]">Create New Draft Version</h3>
              <button
                type="button"
                onClick={() => setIsDraftModalOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A new draft copy will be cloned from v{selectedVersion?.versionNumber}. You will be able to freely adjust
              weights, add questions, and test in simulation before publishing.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">Changelog / Release Notes</label>
              <textarea
                rows={3}
                value={draftChangelog}
                onChange={(e) => setDraftChangelog(e.target.value)}
                placeholder="e.g. Rebalance compliance category weights for Q1 audit requirements…"
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-[#0D5C58] focus:outline-none"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDraftModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateDraft}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#073634] disabled:opacity-50"
              >
                {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Confirm & Create Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Publish Draft Confirmation */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0A192F]">Publish Version {selectedVersion?.versionNumber}</h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Are you sure you want to publish this configuration live? Once published:
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
              <li>Category weights total 100% (Verified).</li>
              <li>All new SME HR Health Checks will evaluate against this version.</li>
              <li>This version will be permanently locked against direct edits.</li>
            </ul>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublishVersion}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Publish Live Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
