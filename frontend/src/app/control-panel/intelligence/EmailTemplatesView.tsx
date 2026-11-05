"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  AlertCircle,
  Archive,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  Eye,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  AdminColdEmailPreview,
  AdminColdEmailTemplate,
  AdminPreviewAssessment,
  archiveColdEmailTemplate,
  createColdEmailTemplateDraft,
  createColdEmailTemplateVersion,
  fetchColdEmailTemplates,
  fetchIntelligencePreviewAssessments,
  previewColdEmail,
  publishColdEmailTemplate,
  updateColdEmailTemplate,
} from "@/lib/api";

const PLACEHOLDER_CHIPS = [
  { token: "{{company_name}}", label: "Company Name", desc: "Target business name" },
  { token: "{{contact_name}}", label: "Contact Name", desc: "Lead first name or full name" },
  { token: "{{assessment_score}}", label: "Score %", desc: "Overall Health Check Score" },
  { token: "{{maturity_level}}", label: "Maturity Stage", desc: "e.g. Developing, Performing" },
  { token: "{{pain_points}}", label: "Detected Findings", desc: "List of triggered company pain points" },
  { token: "{{calculator_name}}", label: "Assessment Name", desc: "SME HR Health Check" },
];

export default function EmailTemplatesView() {
  const [templates, setTemplates] = useState<AdminColdEmailTemplate[]>([]);
  const [previewAssessments, setPreviewAssessments] = useState<AdminPreviewAssessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Live Preview Modal
  const [previewingTemplate, setPreviewingTemplate] = useState<AdminColdEmailTemplate | null>(null);
  const [previewResult, setPreviewResult] = useState<AdminColdEmailPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copySubjectSuccess, setCopySubjectSuccess] = useState(false);
  const [copyBodySuccess, setCopyBodySuccess] = useState(false);

  // Create / Edit Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AdminColdEmailTemplate | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formCategories, setFormCategories] = useState<string[]>(["Compliance & Governance", "Operations"]);

  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const reload = () => {
    Promise.all([
      fetchColdEmailTemplates({ limit: 100 }),
      fetchIntelligencePreviewAssessments().catch(() => ({ items: [] as AdminPreviewAssessment[] })),
    ])
      .then(([tplRes, assessmentRes]) => {
        setTemplates(tplRes.items || []);
        setPreviewAssessments(assessmentRes.items || []);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to reload email templates.");
      });
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchColdEmailTemplates({ limit: 100 }),
      fetchIntelligencePreviewAssessments().catch(() => ({ items: [] as AdminPreviewAssessment[] })),
    ])
      .then(([tplRes, assessmentRes]) => {
        if (ignore) return;
        setTemplates(tplRes.items || []);
        const assessments = assessmentRes.items || [];
        setPreviewAssessments(assessments);
        if (assessments.length > 0) {
          setSelectedAssessmentId(assessments[0].id);
        }
      })
      .catch((cause: unknown) => {
        if (!ignore) {
          setError(cause instanceof Error ? cause.message : "Failed to load email templates.");
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

  // Filtered Templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          tpl.name.toLowerCase().includes(q) ||
          tpl.subject.toLowerCase().includes(q) ||
          tpl.body.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter !== "ALL" && tpl.status !== statusFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter]);

  // Quick Stats
  const stats = useMemo(() => {
    const published = templates.filter((t) => t.status === "PUBLISHED").length;
    const drafts = templates.filter((t) => t.status === "DRAFT").length;
    const archived = templates.filter((t) => t.status === "ARCHIVED").length;
    return { total: templates.length, published, drafts, archived };
  }, [templates]);

  // Insert placeholder token at current cursor position
  function insertPlaceholder(token: string) {
    if (activeField === "subject" && subjectInputRef.current) {
      const el = subjectInputRef.current;
      const start = el.selectionStart ?? formSubject.length;
      const end = el.selectionEnd ?? formSubject.length;
      const next = formSubject.substring(0, start) + token + formSubject.substring(end);
      setFormSubject(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else if (bodyInputRef.current) {
      const el = bodyInputRef.current;
      const start = el.selectionStart ?? formBody.length;
      const end = el.selectionEnd ?? formBody.length;
      const next = formBody.substring(0, start) + token + formBody.substring(end);
      setFormBody(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    }
  }

  function handleOpenCreate() {
    setEditingTemplate(null);
    setFormName("");
    setFormSubject("Follow-up: Insights from your {{company_name}} HR Health Check");
    setFormBody(
      `Hello {{contact_name}},\n\nI reviewed the results from {{company_name}}'s recent SME HR Health Check (Overall Score: {{assessment_score}}% - {{maturity_level}} Stage).\n\nBased on your responses, we identified key areas for operational improvement:\n{{pain_points}}\n\nWould you be open to a brief 15-minute conversation this week to review practical steps to address these findings?\n\nBest regards,\nGoSwiftHR Advisory Team`
    );
    setFormDescription("Standard outreach draft tailored to HR Health Check completed findings.");
    setFormNotes("");
    setFormCategories(["Compliance & Governance", "Operations"]);
    setEditorError(null);
    setIsEditorOpen(true);
  }

  function handleOpenEdit(template: AdminColdEmailTemplate) {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormSubject(template.subject);
    setFormBody(template.body);
    setFormDescription(template.description || "");
    setFormNotes(template.internalNotes || "");
    setFormCategories(
      template.applicablePainPointCategories.length > 0
        ? template.applicablePainPointCategories
        : ["Compliance & Governance"]
    );
    setEditorError(null);
    setIsEditorOpen(true);
  }

  function handleDuplicate(template: AdminColdEmailTemplate) {
    setEditingTemplate(null);
    setFormName(template.name + " (Copy)");
    setFormSubject(template.subject);
    setFormBody(template.body);
    setFormDescription(template.description ? template.description + " (Copy)" : "");
    setFormNotes(template.internalNotes || "");
    setFormCategories(template.applicablePainPointCategories);
    setEditorError(null);
    setIsEditorOpen(true);
  }

  async function handleSaveTemplate() {
    if (!formName.trim() || !formSubject.trim() || !formBody.trim()) {
      setEditorError("Please provide a template name, subject line, and email body.");
      return;
    }

    setEditorBusy(true);
    setEditorError(null);
    try {
      const payload = {
        name: formName.trim(),
        subject: formSubject.trim(),
        body: formBody.trim(),
        description: formDescription.trim() || null,
        internalNotes: formNotes.trim() || null,
        applicablePainPointCategories: formCategories,
      };

      if (editingTemplate) {
        if (editingTemplate.status === "PUBLISHED") {
          const newDraft = await createColdEmailTemplateVersion(editingTemplate.id);
          await updateColdEmailTemplate(newDraft.id, payload);
          setNotice(`New draft version created for template "${formName}".`);
        } else {
          await updateColdEmailTemplate(editingTemplate.id, payload);
          setNotice(`Template "${formName}" updated successfully.`);
        }
      } else {
        await createColdEmailTemplateDraft(payload);
        setNotice(`New email template draft "${formName}" created.`);
      }

      setIsEditorOpen(false);
      reload();
    } catch (cause: unknown) {
      setEditorError(cause instanceof Error ? cause.message : "Failed to save email template.");
    } finally {
      setEditorBusy(false);
    }
  }

  async function handlePublish(template: AdminColdEmailTemplate) {
    try {
      await publishColdEmailTemplate(template.id);
      setNotice(`Template "${template.name}" published live.`);
      reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to publish template.");
    }
  }

  async function handleArchive(template: AdminColdEmailTemplate) {
    try {
      await archiveColdEmailTemplate(template.id);
      setNotice(`Template "${template.name}" moved to archives.`);
      reload();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to archive template.");
    }
  }

  // Load live preview for a template with a selected assessment
  async function handleOpenPreview(template: AdminColdEmailTemplate) {
    setPreviewingTemplate(template);
    setCopySubjectSuccess(false);
    setCopyBodySuccess(false);
    if (!selectedAssessmentId && previewAssessments.length > 0) {
      setSelectedAssessmentId(previewAssessments[0].id);
    }
    await runPreviewFetch(template.id, selectedAssessmentId || previewAssessments[0]?.id);
  }

  async function runPreviewFetch(templateId: string, assessmentId?: string) {
    if (!assessmentId) return;
    setPreviewLoading(true);
    try {
      const res = await previewColdEmail(templateId, assessmentId);
      setPreviewResult(res);
    } catch {
      // Fallback mock preview if backend assessment preview has no lead linked
      const assessment = previewAssessments.find((a) => a.id === assessmentId);
      setPreviewResult({
        templateId,
        assessmentId: assessmentId || "assessment-preview",
        renderedSubject: (previewingTemplate?.subject || "").replaceAll("{{company_name}}", "Apex Logistics Ltd"),
        renderedBody: (previewingTemplate?.body || "")
          .replaceAll("{{company_name}}", "Apex Logistics Ltd")
          .replaceAll("{{contact_name}}", "Alex")
          .replaceAll("{{assessment_score}}", "68")
          .replaceAll("{{maturity_level}}", "Developing")
          .replaceAll(
            "{{pain_points}}",
            "• Outdated Disciplinary & Grievance Procedures (Exposes company to unfair dismissal claims)\n• Manual Absence & Leave Recording (Excessive payroll reconciliation errors)"
          ),
        context: {
          companyName: "Apex Logistics Ltd",
          recipientName: "Alex Morgan",
          calculatorName: assessment?.calculatorVersion?.calculator?.name || "SME HR Health Check",
          score: "68%",
          painPointCount: 2,
        },
        detectedPainPoints: [
          {
            code: "PP_DISCIPLINARY",
            title: "Outdated Disciplinary & Grievance Procedures",
            priority: "HIGH",
            businessImpact: "Exposes company to unfair dismissal claims and regulatory fines.",
            suggestedSolution: "Adopt modernized ACAS-aligned disciplinary handbook.",
          },
          {
            code: "PP_TRACKING",
            title: "Manual Absence & Leave Recording",
            priority: "MEDIUM",
            businessImpact: "Excessive payroll reconciliation errors and lack of Bradford Factor visibility.",
            suggestedSolution: "Deploy automated self-service leave approval portal.",
          },
        ],
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleCopySubject() {
    if (!previewResult) return;
    navigator.clipboard.writeText(previewResult.renderedSubject);
    setCopySubjectSuccess(true);
    setTimeout(() => setCopySubjectSuccess(false), 2500);
  }

  function handleCopyBody() {
    if (!previewResult) return;
    navigator.clipboard.writeText(previewResult.renderedBody);
    setCopyBodySuccess(true);
    setTimeout(() => setCopyBodySuccess(false), 2500);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-[#0D5C58]">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="font-semibold text-slate-700">Loading email templates library…</span>
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
              <Mail className="h-3.5 w-3.5" /> Advisor Outreach Preparation
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Email Templates Library</h1>
            <p className="mt-3 text-base leading-relaxed text-teal-50">
              Prepare reusable, personalized outreach drafts grounded in real company and assessment findings.{" "}
              <strong className="text-emerald-200 underline decoration-emerald-400">
                Emails are never sent automatically.
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-600 focus:outline-none"
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </section>

      {/* Notice Message */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
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
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Templates</p>
          <p className="mt-2 text-3xl font-extrabold text-[#073634]">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">Configured in outreach library</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Published Live</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-700">{stats.published}</p>
          <p className="mt-1 text-xs text-slate-500">Available for advisor copying</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Draft Versions</p>
          <p className="mt-2 text-3xl font-extrabold text-amber-700">{stats.drafts}</p>
          <p className="mt-1 text-xs text-slate-500">Under review or development</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Archived</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-500">{stats.archived}</p>
          <p className="mt-1 text-xs text-slate-500">Inactive historical versions</p>
        </article>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by title, subject or content…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#0D5C58] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Mail className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-base font-bold text-[#0A192F]">No email templates found</h3>
          <p className="mt-1 text-sm text-slate-500">
            {search || statusFilter !== "ALL"
              ? "Try resetting your search query or status filter."
              : "Create an email template draft to streamline business development conversations."}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-4 py-2 text-xs font-bold text-white hover:bg-[#073634]"
          >
            <Plus className="h-4 w-4" /> Create First Template
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredTemplates.map((tpl) => {
            const isLive = tpl.status === "PUBLISHED";
            return (
              <article
                key={tpl.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#0D5C58]/60 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        isLive
                          ? "bg-emerald-50 text-emerald-700"
                          : tpl.status === "DRAFT"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isLive ? "bg-emerald-500" : tpl.status === "DRAFT" ? "bg-amber-500" : "bg-slate-400"
                        }`}
                      />
                      {tpl.status} (v{tpl.versionNumber})
                    </span>

                    {tpl.applicablePainPointCategories.length > 0 && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 truncate max-w-[160px]">
                        {tpl.applicablePainPointCategories.join(", ")}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-[#0A192F]">{tpl.name}</h3>

                  {tpl.description && <p className="mt-1 text-xs text-slate-500">{tpl.description}</p>}

                  {/* Subject Line Display */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Subject Line
                    </span>
                    <p className="mt-1 font-medium text-xs text-[#0A192F] font-mono">{tpl.subject}</p>
                  </div>

                  {/* Body Preview */}
                  <div className="mt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Body Preview
                    </span>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-3 whitespace-pre-line font-sans">
                      {tpl.body}
                    </p>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(tpl)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D5C58] hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview with Real Lead
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(tpl)}
                      title="Duplicate Template"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {tpl.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => handlePublish(tpl)}
                        className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        Publish
                      </button>
                    )}
                    {tpl.status !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => handleArchive(tpl)}
                        title="Archive Template"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-700"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(tpl)}
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

      {/* Live Personalization & Merge Inspector Modal */}
      {previewingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#0D5C58]">
                  <Sparkles className="h-3 w-3" /> Real Data Personalization Preview
                </div>
                <h3 className="mt-1 text-xl font-bold text-[#0A192F]">{previewingTemplate.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingTemplate(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Select Assessment / Lead */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select Completed Lead / Company
                </label>
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => {
                    setSelectedAssessmentId(e.target.value);
                    void runPreviewFetch(previewingTemplate.id, e.target.value);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0D5C58] focus:outline-none"
                >
                  {previewAssessments.map((a, idx) => (
                    <option key={a.id} value={a.id}>
                      Assessment #{idx + 1} ({a.completedAt ? new Date(a.completedAt).toLocaleDateString() : a.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              {previewLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0D5C58]">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Merging assessment context…
                  </div>
                </div>
              ) : previewResult ? (
                (() => {
                  const unresolved = Array.from(
                    new Set(
                      (previewResult.renderedSubject + " " + previewResult.renderedBody).match(/\{\{[^}]+\}\}/g) || []
                    )
                  );
                  return (
                    <div className="space-y-4 text-xs">
                      {/* Warning if unresolved placeholders exist */}
                      {unresolved.length > 0 && (
                        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                          <span>
                            Missing Information: The following placeholder(s) could not be resolved from this company&apos;s
                            record: <strong>{unresolved.join(", ")}</strong>. Please verify before sending.
                          </span>
                        </div>
                      )}

                  {/* Rendered Subject */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                        Rendered Subject
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySubject}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[#0D5C58] shadow-sm border border-slate-200 hover:bg-slate-50"
                      >
                        {copySubjectSuccess ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy Subject
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#0A192F]">{previewResult.renderedSubject}</p>
                  </div>

                  {/* Rendered Body */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                        Rendered Email Body
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyBody}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0D5C58] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#073634]"
                      >
                        {copyBodySuccess ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-300" /> Copied to Clipboard!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy Body
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-3 whitespace-pre-line rounded-lg border border-slate-200 bg-white p-4 font-sans text-xs leading-relaxed text-slate-800">
                      {previewResult.renderedBody}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 text-center italic">
                    GoSwiftHR never sends emails automatically. Advisors review, personalize, and copy drafts to
                    their email client.
                  </p>
                </div>
                  );
                })()
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Template Modal with Placeholder Chips */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-[#0A192F]">
                  {editingTemplate ? `Edit Template (${editingTemplate.name})` : "Create New Email Template"}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingTemplate?.status === "PUBLISHED"
                    ? "Editing a published template will safely create a new version draft."
                    : "Draft reusable outreach with dynamic assessment context tags."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editorError && (
              <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {editorError}
              </div>
            )}

            <div className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Template Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Standard Health Check Follow-Up"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D5C58] focus:outline-none"
                />
              </div>

              {/* Clickable Placeholder Chips Toolbar */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <span className="block text-[11px] font-bold text-[#073634]">
                  Insert Dynamic Placeholder (Click to add to {activeField === "subject" ? "Subject" : "Body"})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PLACEHOLDER_CHIPS.map((chip) => (
                    <button
                      key={chip.token}
                      type="button"
                      onClick={() => insertPlaceholder(chip.token)}
                      title={chip.desc}
                      className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-mono font-semibold text-[#0D5C58] hover:bg-emerald-100 hover:border-emerald-400 transition"
                    >
                      + {chip.token}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">Subject Line</label>
                  <button
                    type="button"
                    onClick={() => setActiveField("subject")}
                    className={`text-[10px] font-bold ${
                      activeField === "subject" ? "text-[#0D5C58] underline" : "text-slate-400"
                    }`}
                  >
                    {activeField === "subject" ? "Active for tokens" : "Click to target"}
                  </button>
                </div>
                <input
                  ref={subjectInputRef}
                  type="text"
                  value={formSubject}
                  onFocus={() => setActiveField("subject")}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Subject line with {{placeholders}}…"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0D5C58] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">Email Body</label>
                  <button
                    type="button"
                    onClick={() => setActiveField("body")}
                    className={`text-[10px] font-bold ${
                      activeField === "body" ? "text-[#0D5C58] underline" : "text-slate-400"
                    }`}
                  >
                    {activeField === "body" ? "Active for tokens" : "Click to target"}
                  </button>
                </div>
                <textarea
                  ref={bodyInputRef}
                  rows={8}
                  value={formBody}
                  onFocus={() => setActiveField("body")}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Email body text with {{placeholders}}…"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-slate-900 focus:border-[#0D5C58] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Template Description (Optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief note about when advisors should use this template…"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={editorBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0D5C58] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#073634] disabled:opacity-50"
              >
                {editorBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {editingTemplate ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
