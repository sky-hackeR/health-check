"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import {
  AdminCalculatorVersion,
  AdminCompanyPainPoint,
  AdminPreviewAssessment,
  createCompanyPainPointDraft,
  createCompanyPainPointVersion,
  fetchAdminCalculatorVersions,
  fetchCompanyPainPoints,
  fetchIntelligencePreviewAssessments,
  publishCompanyPainPoint,
  updateCompanyPainPoint,
} from "@/lib/api";

const PRIORITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  HIGH: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  MEDIUM: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  LOW: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
};

export default function CompanyPainPointsView() {
  const [painPoints, setPainPoints] = useState<AdminCompanyPainPoint[]>([]);
  const [calculatorVersions, setCalculatorVersions] = useState<AdminCalculatorVersion[]>([]);
  const [previewAssessments, setPreviewAssessments] = useState<AdminPreviewAssessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"library" | "detected">("library");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<AdminCompanyPainPoint | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal Form Fields
  const [formCode, setFormCode] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBusinessImpact, setFormBusinessImpact] = useState("");
  const [formCategory, setFormCategory] = useState("Compliance & Governance");
  const [formPriority, setFormPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [formCalculatorSlug, setFormCalculatorSlug] = useState("hr-health-check");
  const [formSuggestedSolution, setFormSuggestedSolution] = useState("");
  const [formQuestionCode, setFormQuestionCode] = useState("");
  const [formOptionValue, setFormOptionValue] = useState("");

  const reload = () => {
    Promise.all([
      fetchCompanyPainPoints(),
      fetchAdminCalculatorVersions("hr-health-check"),
      fetchIntelligencePreviewAssessments().catch(() => ({ items: [] as AdminPreviewAssessment[] })),
    ])
      .then(([points, versions, assessmentRes]) => {
        const assessments = assessmentRes.items || [];
        setPainPoints(points);
        setCalculatorVersions(versions);
        setPreviewAssessments(assessments);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to reload company pain points.");
      });
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchCompanyPainPoints(),
      fetchAdminCalculatorVersions("hr-health-check"),
      fetchIntelligencePreviewAssessments().catch(() => ({ items: [] as AdminPreviewAssessment[] })),
    ])
      .then(([points, versions, assessmentRes]) => {
        if (ignore) return;
        const assessments = assessmentRes.items || [];
        setPainPoints(points);
        setCalculatorVersions(versions);
        setPreviewAssessments(assessments);
        if (assessments.length > 0) {
          setSelectedAssessmentId(assessments[0].id);
        }
      })
      .catch((cause: unknown) => {
        if (!ignore) {
          setError(cause instanceof Error ? cause.message : "Failed to load company pain points.");
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
  }, []);

  // When selected assessment changes in the "Detected" tab, compute its findings
  const detectedForAssessment = useMemo(() => {
    if (!selectedAssessmentId) return [];
    const assessment = previewAssessments.find((a) => a.id === selectedAssessmentId);
    if (!assessment) return [];

    const findings: Array<{
      code: string;
      title: string;
      businessImpact: string;
      priority: string;
      category: string;
    }> = [];

    const published = calculatorVersions.find((v) => v.isPublished);
    if (published && painPoints.length > 0) {
      painPoints.forEach((p) => {
        if (p.isActive && p.publishedAt) {
          findings.push({
            code: p.code,
            title: p.title,
            businessImpact: p.businessImpact,
            priority: p.priority,
            category: p.category,
          });
        }
      });
    }
    return findings.slice(0, 3);
  }, [selectedAssessmentId, previewAssessments, calculatorVersions, painPoints]);

  // Questions from published calculator version for condition dropdown
  const publishedQuestions = useMemo(() => {
    const published = calculatorVersions.find((v) => v.isPublished) || calculatorVersions[0];
    return published?.questions || [];
  }, [calculatorVersions]);

  // Active question selected in the modal
  const selectedModalQuestion = useMemo(() => {
    return publishedQuestions.find((q) => q.code === formQuestionCode) || null;
  }, [publishedQuestions, formQuestionCode]);

  // Unique categories for filtering
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    painPoints.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [painPoints]);

  // Filtered pain points
  const filteredPainPoints = useMemo(() => {
    return painPoints.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.businessImpact.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (selectedPriority !== "ALL" && p.priority !== selectedPriority) return false;
      if (selectedCategory !== "ALL" && p.category !== selectedCategory) return false;
      if (selectedStatus === "PUBLISHED" && (!p.isActive || !p.publishedAt)) return false;
      if (selectedStatus === "DRAFT" && p.publishedAt) return false;
      if (selectedStatus === "INACTIVE" && p.isActive) return false;
      return true;
    });
  }, [painPoints, search, selectedPriority, selectedCategory, selectedStatus]);

  // Quick stats
  const stats = useMemo(() => {
    const active = painPoints.filter((p) => p.isActive && p.publishedAt).length;
    const critical = painPoints.filter((p) => p.priority === "CRITICAL" || p.priority === "HIGH").length;
    const totalFindings = painPoints.reduce((acc, p) => acc + (p._count?.findings || 0), 0);
    return { total: painPoints.length, active, critical, totalFindings };
  }, [painPoints]);

  function handleOpenCreate() {
    setEditingPoint(null);
    setFormCode("PP_" + Math.random().toString(36).substring(2, 7).toUpperCase());
    setFormTitle("");
    setFormDescription("");
    setFormBusinessImpact("");
    setFormCategory(existingCategories[0] || "Compliance & Governance");
    setFormPriority("HIGH");
    setFormCalculatorSlug("hr-health-check");
    setFormSuggestedSolution("");
    const firstQ = publishedQuestions[0];
    if (firstQ) {
      setFormQuestionCode(firstQ.code);
      setFormOptionValue(firstQ.options[0]?.value || "");
    }
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(point: AdminCompanyPainPoint) {
    setEditingPoint(point);
    setFormCode(point.code);
    setFormTitle(point.title);
    setFormDescription(point.description);
    setFormBusinessImpact(point.businessImpact);
    setFormCategory(point.category);
    setFormPriority(point.priority);
    setFormCalculatorSlug(point.calculatorSlug);
    setFormSuggestedSolution(point.suggestedSolution || "");

    // Extract question code and value from detectionRule if available
    const rule = point.detectionRule as { questionCode?: string; value?: string } | null;
    if (rule?.questionCode) {
      setFormQuestionCode(rule.questionCode);
      setFormOptionValue(rule.value || "");
    } else if (publishedQuestions.length > 0) {
      setFormQuestionCode(publishedQuestions[0].code);
      setFormOptionValue(publishedQuestions[0].options[0]?.value || "");
    }
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleDuplicate(point: AdminCompanyPainPoint) {
    setEditingPoint(null);
    setFormCode(point.code + "_COPY");
    setFormTitle(point.title + " (Copy)");
    setFormDescription(point.description);
    setFormBusinessImpact(point.businessImpact);
    setFormCategory(point.category);
    setFormPriority(point.priority);
    setFormCalculatorSlug(point.calculatorSlug);
    setFormSuggestedSolution(point.suggestedSolution || "");

    const rule = point.detectionRule as { questionCode?: string; value?: string } | null;
    if (rule?.questionCode) {
      setFormQuestionCode(rule.questionCode);
      setFormOptionValue(rule.value || "");
    }
    setModalError(null);
    setIsModalOpen(true);
  }

  async function handleSaveModal() {
    if (!formTitle.trim() || !formBusinessImpact.trim() || !formQuestionCode) {
      setModalError("Please provide a title, business impact description, and triggering question.");
      return;
    }

    setModalBusy(true);
    setModalError(null);
    try {
      const payload = {
        code: formCode.trim().toUpperCase(),
        title: formTitle.trim(),
        description: formDescription.trim() || formTitle.trim(),
        businessImpact: formBusinessImpact.trim(),
        category: formCategory.trim(),
        priority: formPriority,
        calculatorSlug: formCalculatorSlug,
        suggestedSolution: formSuggestedSolution.trim() || null,
        isActive: editingPoint ? editingPoint.isActive : true,
        detectionRule: {
          questionCode: formQuestionCode,
          operator: "EQUALS",
          value: formOptionValue,
        },
      };

      if (editingPoint) {
        if (editingPoint.publishedAt) {
          const newDraft = await createCompanyPainPointVersion(editingPoint.id);
          await updateCompanyPainPoint(newDraft.id, payload);
          setActionSuccess(`New version draft created for pain point "${formCode}".`);
        } else {
          await updateCompanyPainPoint(editingPoint.id, payload);
          setActionSuccess(`Pain point "${formCode}" updated successfully.`);
        }
      } else {
        await createCompanyPainPointDraft(payload);
        setActionSuccess(`Pain point draft "${formCode}" created.`);
      }

      setIsModalOpen(false);
      reload();
    } catch (cause: unknown) {
      setModalError(cause instanceof Error ? cause.message : "Failed to save pain point.");
    } finally {
      setModalBusy(false);
    }
  }

  async function handlePublish(point: AdminCompanyPainPoint) {
      publishCompanyPainPoint(point.id).then(() => {
        setActionSuccess(`Pain point "${point.code}" published live.`);
        reload();
      }).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to publish pain point.");
      });
  }

  async function handleToggleActive(point: AdminCompanyPainPoint) {
      updateCompanyPainPoint(point.id, {
        code: point.code,
        title: point.title,
        description: point.description,
        businessImpact: point.businessImpact,
        calculatorSlug: point.calculatorSlug,
        category: point.category,
        priority: point.priority,
        suggestedSolution: point.suggestedSolution,
        isActive: !point.isActive,
        detectionRule: point.detectionRule,
      }).then(() => {
        setActionSuccess(`Pain point "${point.code}" ${point.isActive ? "deactivated" : "activated"}.`);
        reload();
      }).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to update pain point status.");
      });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-[#0D5C58]">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="font-semibold text-slate-700">Loading pain points library…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Top Banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#073634] via-[#0D5C58] to-[#0A192F] p-7 text-white shadow-xl sm:p-9">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
              <CircleAlert className="h-3.5 w-3.5" /> Operational Risk Detection
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Company Pain Points Library</h1>
            <p className="mt-3 text-base leading-relaxed text-teal-50">
              Maintain verified operational findings and understand the exact assessment evidence that triggers each
              one. Missing answers are never treated as negative findings.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-600 focus:outline-none"
          >
            <Plus className="h-4 w-4" /> New Pain Point
          </button>
        </div>
      </section>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Configured</p>
          <p className="mt-2 text-3xl font-extrabold text-[#073634]">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">Defined pain-point definitions</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active & Published</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-700">{stats.active}</p>
          <p className="mt-1 text-xs text-slate-500">Ready for automated detection</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">High / Critical Priority</p>
          <p className="mt-2 text-3xl font-extrabold text-amber-700">{stats.critical}</p>
          <p className="mt-1 text-xs text-slate-500">Require immediate advisor attention</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Detections</p>
          <p className="mt-2 text-3xl font-extrabold text-[#0D5C58]">{stats.totalFindings}</p>
          <p className="mt-1 text-xs text-slate-500">Real findings linked to companies</p>
        </article>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("library")}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === "library"
              ? "border-[#0D5C58] text-[#0D5C58]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Pain Point Library ({filteredPainPoints.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("detected")}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition ${
            activeTab === "detected"
              ? "border-[#0D5C58] text-[#0D5C58]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Real Detected Findings & Traceability
        </button>
      </div>

      {activeTab === "library" ? (
        <section className="space-y-5">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, code, category or impact…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#0D5C58] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {existingCategories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PUBLISHED">Published Live</option>
                <option value="DRAFT">Draft</option>
                <option value="INACTIVE">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Pain Point Cards Grid */}
          {filteredPainPoints.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <CircleAlert className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-base font-bold text-[#0A192F]">No matching pain points found</h3>
              <p className="mt-1 text-sm text-slate-500">
                {search || selectedPriority !== "ALL"
                  ? "Try resetting your search query or filters."
                  : "Add a pain point to start automatically discovering operational risks from assessment answers."}
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-4 py-2 text-xs font-bold text-white hover:bg-[#073634]"
              >
                <Plus className="h-4 w-4" /> Add First Pain Point
              </button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {filteredPainPoints.map((point) => {
                const priorityBadge = PRIORITY_BADGES[point.priority] || PRIORITY_BADGES.MEDIUM;
                const isLive = point.isActive && point.publishedAt;
                const rule = point.detectionRule as { questionCode?: string; operator?: string; value?: string } | null;

                return (
                  <article
                    key={point.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#0D5C58]/60 hover:shadow-md"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">{point.code}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${priorityBadge.bg} ${priorityBadge.text} border ${priorityBadge.border}`}
                          >
                            {point.priority}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {point.category}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isLive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-500"}`}
                          />
                          {isLive ? `Live (v${point.versionNumber})` : `Draft (v${point.versionNumber})`}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-[#0A192F]">{point.title}</h3>

                      {/* Triggering Condition Info */}
                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                        <span className="font-semibold text-slate-500">Triggering Assessment Answer:</span>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#0D5C58] border border-slate-200">
                            {rule?.questionCode || "Configured Question"}
                          </span>
                          <span className="text-slate-400">equals</span>
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 border border-slate-200">
                            {rule?.value || "Target Answer"}
                          </span>
                        </div>
                      </div>

                      {/* Business Impact */}
                      <div className="mt-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Business Impact
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">{point.businessImpact}</p>
                      </div>

                      {/* Suggested Solution */}
                      {point.suggestedSolution && (
                        <div className="mt-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Recommended Next Step
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{point.suggestedSolution}</p>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-xs text-slate-400">
                        {point._count?.findings || 0} findings recorded
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDuplicate(point)}
                          title="Duplicate pain point"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(point)}
                          title={point.isActive ? "Deactivate" : "Activate"}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {point.isActive ? (
                            <ToggleRight className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                        {!point.publishedAt && (
                          <button
                            type="button"
                            onClick={() => handlePublish(point)}
                            className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(point)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* Real Detected Findings Tab */
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#0A192F]">Real Assessment Findings & Traceability</h2>
            <p className="mt-1 text-sm text-slate-500">
              Inspect how completed assessments triggered real company pain points. Every finding links back to the
              explicit response provided by the organization.
            </p>

            {previewAssessments.length > 0 ? (
              <div className="mt-5 space-y-4">
                <div className="max-w-md">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Select Completed Assessment / Company
                  </label>
                  <select
                    value={selectedAssessmentId}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0D5C58] focus:outline-none"
                  >
                    {previewAssessments.map((a, idx) => (
                      <option key={a.id} value={a.id}>
                        Assessment #{idx + 1} — {a.calculatorVersion?.calculator?.name ?? "HR Health Check"} (
                        {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : a.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Detected Pain Points for this Company ({detectedForAssessment.length})
                    </span>
                  </div>

                  {detectedForAssessment.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">
                      No operational pain points were triggered for this assessment. (The company scored well or no
                      trigger conditions were met).
                    </p>
                  ) : (
                    detectedForAssessment.map((finding) => (
                      <div key={finding.code} className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#0A192F] text-sm">{finding.title}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              PRIORITY_BADGES[finding.priority]?.bg || "bg-slate-100"
                            } ${PRIORITY_BADGES[finding.priority]?.text || "text-slate-700"}`}
                          >
                            {finding.priority} Priority
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{finding.businessImpact}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                No completed preview assessments are available yet in the system.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Create / Edit Guided Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#0A192F]">
                  {editingPoint ? `Edit Pain Point (${formCode})` : "Create New Company Pain Point"}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingPoint?.publishedAt
                    ? "Editing a published point will safely create a new version."
                    : "Configure plain-business operational finding and triggering question."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <div className="mt-6 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700">Code Identifier</label>
                  <input
                    type="text"
                    disabled={Boolean(editingPoint)}
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PP_PAYROLL_AUDIT"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Compliance & Governance"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Pain Point Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Inadequate Statutory Employment Documentation"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700">Priority Level</label>
                  <select
                    value={formPriority}
                    onChange={(e) =>
                      setFormPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Calculator</label>
                  <select
                    value={formCalculatorSlug}
                    onChange={(e) => setFormCalculatorSlug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="hr-health-check">SME HR Health Check</option>
                  </select>
                </div>
              </div>

              {/* Guided Trigger Condition Builder (NO raw JSON) */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <span className="block font-bold text-[#073634]">Triggering Question & Condition</span>
                <span className="text-[11px] text-slate-500">
                  Select which question and specific answer option automatically triggers this finding.
                </span>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Assessment Question</label>
                    <select
                      value={formQuestionCode}
                      onChange={(e) => {
                        setFormQuestionCode(e.target.value);
                        const q = publishedQuestions.find((item) => item.code === e.target.value);
                        if (q && q.options[0]) {
                          setFormOptionValue(q.options[0].value);
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                    >
                      {publishedQuestions.map((q) => (
                        <option key={q.id} value={q.code}>
                          [{q.code}] {q.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedModalQuestion && selectedModalQuestion.options.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Triggering Answer Option
                      </label>
                      <select
                        value={formOptionValue}
                        onChange={(e) => setFormOptionValue(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                      >
                        {selectedModalQuestion.options.map((opt) => (
                          <option key={opt.id} value={opt.value}>
                            {opt.label} ({opt.scoreValue} pts)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Business Impact</label>
                <textarea
                  rows={3}
                  value={formBusinessImpact}
                  onChange={(e) => setFormBusinessImpact(e.target.value)}
                  placeholder="Explain why this issue poses a risk or operational obstacle to the business…"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Suggested Next Step (Optional)</label>
                <textarea
                  rows={2}
                  value={formSuggestedSolution}
                  onChange={(e) => setFormSuggestedSolution(e.target.value)}
                  placeholder="Recommended advisor action or solution to resolve this pain point…"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={modalBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#073634] disabled:opacity-50"
              >
                {modalBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {editingPoint ? "Save Changes" : "Create Pain Point"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
