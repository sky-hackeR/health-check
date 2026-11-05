'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  ClipboardList,
} from 'lucide-react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { CalculatorConfigurationWorkspace } from '@/components/admin/CalculatorConfigurationWorkspace';
import {
  AdminFollowUp,
  AdminCompany,
  AdminCompanyDetail,
  AdminAssessmentDetail,
  AdminAssessmentItem,
  AdminAssessmentsResponse,
  AdminLeadDetail,
  AdminWalkthrough,
  AdminAssignee,
  CalculatorSubmission,
  CalculatorWorkspaceResponse,
  CalculatorSubmissionsResponse,
  DashboardResponse,
  RecentLeadItem,
  addLeadActivity,
  assignAdminLead,
  createLeadFollowUp,
  createLeadWalkthrough,
  fetchAdminAssignees,
  fetchAdminAssessment,
  fetchAdminAssessments,
  fetchAdminFollowUps,
  fetchAdminCompanies,
  fetchAdminCompany,
  fetchAdminWalkthroughs,
  fetchCalculatorSubmissions,
  fetchCalculatorWorkspace,
  fetchDashboardData,
  fetchLeadDetail,
  fetchLeadsData,
  qualifyAdminLead,
  transitionLead,
  updateAdminCalculatorSettings,
  updateAdminFollowUp,
  updateAdminWalkthrough,
} from '@/lib/api';

function friendlyTitle(pathname: string): string {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) || 'control-panel';
  return lastSegment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
        <span>{message}</span>
      </div>
      <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline">
        Try again
      </button>
    </div>
  );
}

function LeadDirectory({ qualifiedOnly = false }: { qualifiedOnly?: boolean }) {
  const [leads, setLeads] = useState<RecentLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('');
  const [calculatorSlug, setCalculatorSlug] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<'table' | 'pipeline'>('pipeline');
  const [pipelinePages, setPipelinePages] = useState<Record<string, number>>({});
  const [pipeline, setPipeline] = useState<Record<string, { items: RecentLeadItem[]; total: number; totalPages: number }>>({});
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageLead, setStageLead] = useState<RecentLeadItem | null>(null);
  const [nextStage, setNextStage] = useState('');
  const [stageNotes, setStageNotes] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageNotice, setStageNotice] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState(false);

  function openStageDialog(lead: RecentLeadItem) {
    setStageLead(lead);
    setNextStage(lead.status);
    setStageNotes('');
    setStageError(null);
    setStageNotice(null);
  }

  async function saveLeadStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stageLead || !nextStage || nextStage === stageLead.status) return;
    setStageBusy(true);
    setStageError(null);
    try {
      await transitionLead(stageLead.id, nextStage, stageNotes.trim() || undefined);
      setStageLead(null);
      setStageNotes('');
      setStageNotice('Lead stage updated and added to the activity timeline.');
      await loadLeads();
    } catch (cause) {
      setStageError(
        cause instanceof Error ? cause.message : 'The lead stage could not be updated.',
      );
    } finally {
      setStageBusy(false);
    }
  }

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {
        search: search.trim() || undefined,
        source: source || undefined,
        calculatorSlug: calculatorSlug || undefined,
        companyId: companyId || undefined,
        from: from || undefined,
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
      };
      if (view === 'table') {
        const response = await fetchLeadsData({
          ...filters,
          page,
          limit: 10,
          status: qualifiedOnly ? 'QUALIFIED' : status === 'all' ? undefined : status,
        });
        setLeads(response.items);
        setTotal(response.total);
        setTotalPages(response.totalPages || 1);
      } else {
        const visibleStages = (qualifiedOnly
          ? leadStages.filter(([value]) => value === 'QUALIFIED')
          : status === 'UNQUALIFIED'
            ? [legacyLeadStage]
          : status === 'all'
            ? leadStages
            : leadStages.filter(([value]) => value === status));
        const results = await Promise.all(visibleStages.map(async ([stage]) => {
          const response = await fetchLeadsData({
            ...filters,
            status: stage,
            page: pipelinePages[stage] || 1,
            limit: 6,
          });
          return [stage, response] as const;
        }));
        setPipeline(Object.fromEntries(results.map(([stage, response]) => [stage, {
          items: response.items,
          total: response.total,
          totalPages: response.totalPages,
        }])));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Leads could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, source, calculatorSlug, companyId, from, to, view, qualifiedOnly, pipelinePages]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLeads(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLeads]);

  useEffect(() => {
    let active = true;
    void fetchAdminCompanies({ page: 1, limit: 100 }).then((response) => {
      if (active) setCompanies(response.items);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Company filters could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setSource('');
    setCalculatorSlug('');
    setCompanyId('');
    setFrom('');
    setTo('');
    setPage(1);
    setPipelinePages({});
  }

  const columns: Column<RecentLeadItem>[] = [
    {
      key: 'name',
      header: 'Lead',
      render: (lead) => (
        <div>
          <Link
            href={`/control-panel/leads/detail/${encodeURIComponent(lead.id)}`}
            className="font-semibold text-goswift-navy hover:underline"
          >
            {lead.name}
          </Link>
          <p className="text-xs text-goswift-grey-subtle">{lead.email}</p>
        </div>
      ),
    },
    { key: 'company', header: 'Company' },
    {
      key: 'calculator',
      header: 'Latest assessment',
      render: (lead) => (
        <div>
          <p>{lead.calculator}</p>
          {lead.score !== null && (
            <p className="text-xs text-goswift-grey-subtle">Score {lead.score}</p>
          )}
        </div>
      ),
    },
    {
      key: 'tier',
      header: 'Qualification',
      render: (lead) => <StatusBadge status={lead.tier} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (lead) => <div className="space-y-1"><StatusBadge status={lead.status} />{lead.hasOverdueFollowUp && <p className="text-xs font-semibold text-rose-700">Overdue follow-up</p>}</div>,
    },
    {
      key: 'date',
      header: 'Captured',
      render: (lead) => new Date(lead.date).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (lead) => (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/control-panel/leads/detail/${encodeURIComponent(lead.id)}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-goswift-navy hover:bg-slate-50"
          >
            View details
          </Link>
          <button
            type="button"
            onClick={() => openStageDialog(lead)}
            className="rounded-lg bg-goswift-primary px-3 py-1.5 text-xs font-semibold text-white"
          >
            Change stage
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={qualifiedOnly ? 'Qualified Leads' : 'All Leads'}
        subtitle="Manage the same lead records through a searchable pipeline or table."
      />
      {error && <ErrorNotice message={error} onRetry={() => void loadLeads()} />}
      {stageNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{stageNotice}</p>}
      <div className="rounded-xl border border-goswift-grey-muted bg-white p-4 shadow-xs">
        <div className="flex flex-wrap gap-2 pb-4">
          <button type="button" onClick={() => setView('pipeline')} aria-pressed={view === 'pipeline'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === 'pipeline' ? 'bg-goswift-primary text-white' : 'border border-slate-300 text-slate-700'}`}>Pipeline</button>
          <button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === 'table' ? 'bg-goswift-primary text-white' : 'border border-slate-300 text-slate-700'}`}>Table</button>
        </div>
        <FilterBar searchValue={search} onSearchChange={(value) => { setSearch(value); setPage(1); setPipelinePages({}); }} searchPlaceholder="Search leads by name, email or company" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {!qualifiedOnly && <label className="grid gap-1 text-xs"><span>Pipeline stage</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setPipelinePages({}); }} className="rounded-lg border border-slate-300 px-2 py-2"><option value="all">All stages</option>{leadStages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="UNQUALIFIED">Unqualified (legacy)</option></select></label>}
          <label className="grid gap-1 text-xs"><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2"><option value="">All sources</option><option value="WEBSITE">Website</option><option value="CALCULATOR">Calculator</option><option value="CAMPAIGN">Campaign</option><option value="REFERRAL">Referral</option><option value="OTHER">Other</option></select></label>
          <label className="grid gap-1 text-xs"><span>Calculator</span><select value={calculatorSlug} onChange={(event) => setCalculatorSlug(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2"><option value="">All calculators</option><option value="payroll-cost-calculator">Payroll Cost</option><option value="payroll-compliance-calculator">Payroll Compliance</option><option value="hr-administrative-cost-calculator">HR Administrative Cost</option><option value="hr-health-check">SME HR Health Check</option></select></label>
          <label className="grid gap-1 text-xs"><span>Company</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2"><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs"><span>Captured from</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2" /></label>
          <label className="grid gap-1 text-xs"><span>Captured to</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2" /></label>
        </div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={resetFilters} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Reset filters</button></div>
      </div>
      {view === 'table' ? <DataTable
        columns={columns}
        data={leads}
        isLoading={loading}
        keyExtractor={(lead) => lead.id}
        emptyTitle={search || status !== 'all' || source || calculatorSlug || companyId || from || to ? 'No matching leads' : 'No leads captured yet'}
        emptyDescription="New contacts will appear here after they submit an available GoSwiftHR assessment."
      /> : loading ? <LoadingSkeleton count={6} /> : (
        <div className={`grid gap-4 ${qualifiedOnly ? 'lg:grid-cols-1' : 'xl:grid-cols-3 lg:grid-cols-2'}`}>
          {(qualifiedOnly ? leadStages.filter(([value]) => value === 'QUALIFIED') : status === 'UNQUALIFIED' ? [legacyLeadStage] : status === 'all' ? leadStages : leadStages.filter(([value]) => value === status)).map(([stage, label]) => {
            const column = pipeline[stage];
            return <section key={stage} className="min-w-0 rounded-xl border border-goswift-grey-muted bg-slate-50 p-3">
              <header className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><StatusBadge status={stage} label={label} /><span className="text-xs text-slate-500">{column?.total ?? 0}</span></div></header>
              <div className="space-y-2">{(column?.items ?? []).map((lead) => <article key={lead.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <Link href={`/control-panel/leads/detail/${encodeURIComponent(lead.id)}`} className="font-semibold text-goswift-navy hover:underline">{lead.name}</Link>
                <p className="truncate text-xs text-slate-500">{lead.email}</p>
                <p className="mt-2 text-xs text-slate-600">{lead.company} · {lead.calculator}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={lead.source || 'OTHER'} label={lead.source || 'Source unavailable'} />{lead.hasOverdueFollowUp && <span className="text-xs font-semibold text-rose-700">Overdue follow-up</span>}</div>
                <button type="button" onClick={() => openStageDialog(lead)} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-goswift-navy">Change stage</button>
              </article>)}</div>
              {(column?.totalPages ?? 1) > 1 && <div className="mt-3 flex items-center justify-between text-xs"><button type="button" disabled={(pipelinePages[stage] || 1) <= 1} onClick={() => setPipelinePages((current) => ({ ...current, [stage]: Math.max(1, (current[stage] || 1) - 1) }))} className="rounded border bg-white px-2 py-1 disabled:opacity-40">Previous</button><span>Page {pipelinePages[stage] || 1} of {column?.totalPages}</span><button type="button" disabled={(pipelinePages[stage] || 1) >= (column?.totalPages || 1)} onClick={() => setPipelinePages((current) => ({ ...current, [stage]: (current[stage] || 1) + 1 }))} className="rounded border bg-white px-2 py-1 disabled:opacity-40">Next</button></div>}
            </section>;
          })}
        </div>
      )}
      {view === 'table' && totalPages > 1 && (
        <div className="rounded-xl border border-goswift-grey-muted bg-white p-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={10}
            onPageChange={setPage}
          />
        </div>
      )}
      {stageLead && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-directory-stage-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <form
            onSubmit={(event) => void saveLeadStage(event)}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div>
              <h2 id="lead-directory-stage-title" className="text-lg font-bold text-goswift-navy">Change lead stage</h2>
              <p className="mt-1 text-sm text-slate-600">{stageLead.name} · {stageLead.email}</p>
            </div>
            <p className="flex items-center gap-2 text-sm">Current stage: <StatusBadge status={stageLead.status} /></p>
            <label className="grid gap-1 text-sm font-medium">
              Destination stage
              <select
                required
                value={nextStage}
                onChange={(event) => setNextStage(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                {leadStages.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                {stageLead.status === 'UNQUALIFIED' && <option value="UNQUALIFIED">Unqualified (legacy)</option>}
              </select>
            </label>
            <div className="flex flex-wrap gap-2" aria-label="Available lead stages">
              {leadStages.map(([value, label]) => (
                <StatusBadge key={value} status={value} label={label} />
              ))}
            </div>
            <label className="grid gap-1 text-sm">
              Reason or note (optional)
              <textarea value={stageNotes} onChange={(event) => setStageNotes(event.target.value)} maxLength={4000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            {stageError && <p role="alert" className="text-sm text-rose-700">{stageError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStageLead(null)} disabled={stageBusy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={stageBusy || nextStage === stageLead.status} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{stageBusy ? 'Saving…' : 'Confirm change'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const leadStages = [
  ['NEW', 'New'],
  ['CONTACTED', 'Contacted'],
  ['QUALIFIED', 'Qualified'],
  ['FOLLOW_UP', 'Follow-up'],
  ['WALKTHROUGH_SCHEDULED', 'Walkthrough Scheduled'],
  ['CONVERTED', 'Converted'],
  ['DISQUALIFIED', 'Disqualified'],
  ['LOST', 'Lost'],
  ['ARCHIVED', 'Archived'],
] as const;
const legacyLeadStage = ['UNQUALIFIED', 'Unqualified (legacy)'] as const;

function LeadDetailPage({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [stage, setStage] = useState('');
  const [moveStageOpen, setMoveStageOpen] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');
  const [convertedAt, setConvertedAt] = useState('');
  const [activityType, setActivityType] = useState<'NOTE_ADDED' | 'CALL_RECORDED' | 'EMAIL_RECORDED' | 'MEETING_RECORDED'>('NOTE_ADDED');
  const [activity, setActivity] = useState('');
  const [activityOccurredAt, setActivityOccurredAt] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [method, setMethod] = useState('CALL');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [followUpAssignee, setFollowUpAssignee] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [walkthroughAt, setWalkthroughAt] = useState('');
  const [walkthroughNotes, setWalkthroughNotes] = useState('');
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [assignees, setAssignees] = useState<AdminAssignee[]>([]);
  const [qualificationTier, setQualificationTier] = useState('WARM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nextFollowUp = lead?.followUps
    .filter((item) => item.status === 'PENDING' || item.status === 'RESCHEDULED')
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())[0];

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await fetchLeadDetail(leadId);
      setLead(current);
      setStage(current.status);
      setQualificationTier(
        current.qualificationTier === 'UNGRADED'
          ? 'WARM'
          : current.qualificationTier,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lead details could not be loaded.');
    }
  }, [leadId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    void fetchAdminAssignees().then((items) => {
      if (active) setAssignees(items);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Administrators could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  async function saveStage() {
    if (!lead || stage === lead.status) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await transitionLead(
        lead.id,
        stage,
        transitionNotes.trim() || undefined,
        stage === 'CONVERTED' ? new Date(convertedAt).toISOString() : undefined,
      );
      setNotice('Lead stage updated and added to the activity timeline.');
      setTransitionNotes('');
      setMoveStageOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The stage could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !activity.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await addLeadActivity(
        lead.id,
        activityType,
        activity.trim(),
        activityOccurredAt ? new Date(activityOccurredAt).toISOString() : undefined,
      );
      setActivity('');
      setActivityOccurredAt('');
      setActivityOpen(false);
      setNotice('Activity recorded.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The activity could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !dueAt || !followUpNotes.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createLeadFollowUp(lead.id, {
        dueAt: new Date(dueAt).toISOString(),
        method,
        notes: followUpNotes.trim(),
        assignedAdminId: followUpAssignee || null,
      });
      setDueAt('');
      setFollowUpNotes('');
      setFollowUpAssignee('');
      setFollowUpOpen(false);
      setNotice('Follow-up scheduled.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The follow-up could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function saveWalkthrough(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !walkthroughNotes.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createLeadWalkthrough(lead.id, {
        ...(walkthroughAt ? { preferredDate: new Date(walkthroughAt).toISOString() } : {}),
        notes: walkthroughNotes.trim(),
      });
      setWalkthroughAt('');
      setWalkthroughNotes('');
      setWalkthroughOpen(false);
      setNotice('Walkthrough request created and added to the activity timeline.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The walkthrough request could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(assignedAdminId: string) {
    if (!lead) return;
    setBusy(true);
    setError(null);
    try {
      await assignAdminLead(lead.id, assignedAdminId || null);
      setNotice('Lead assignment updated.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lead assignment could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function saveQualification() {
    if (!lead) return;
    setBusy(true);
    setError(null);
    try {
      await qualifyAdminLead(lead.id, qualificationTier);
      setNotice('Lead qualified and qualification tier saved.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lead could not be qualified.');
    } finally {
      setBusy(false);
    }
  }

  function openMoveStage(destination?: string) {
    setStage(destination || lead?.status || '');
    setTransitionNotes('');
    setConvertedAt(destination === 'CONVERTED' ? new Date().toISOString().slice(0, 16) : '');
    setMoveStageOpen(true);
  }

  if (!lead && !error) {
    return <div className="rounded-xl border border-goswift-grey-muted bg-white p-6">Loading lead…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead ? [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email : 'Lead details'}
        subtitle="Manage contact details, assessments, activities and next steps for this lead."
      />
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {lead && (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-goswift-grey-muted bg-white p-5">
              <h2 className="font-semibold text-goswift-navy">Contact</h2>
              <p className="mt-3 text-sm">{lead.email}</p>
              {lead.phone && <p className="mt-1 text-sm">{lead.phone}</p>}
              {lead.jobTitle && <p className="mt-1 text-sm text-goswift-grey-subtle">{lead.jobTitle}</p>}
              <p className="mt-3 text-xs text-goswift-grey-subtle">Source: {lead.source} · Captured {new Date(lead.createdAt).toLocaleString()}</p>
            </article>
            <article className="rounded-xl border border-goswift-grey-muted bg-white p-5">
              <h2 className="font-semibold text-goswift-navy">Company and pipeline</h2>
              <p className="mt-3 text-sm">{lead.company ? <Link href={`/control-panel/companies/${encodeURIComponent(lead.company.id)}`} className="font-medium text-goswift-primary hover:underline">{lead.company.name}</Link> : 'No company associated'}</p>
              {lead.company && <p className="mt-1 text-sm text-goswift-grey-subtle">{[lead.company.industry, lead.company.headcountRange, lead.company.city, lead.company.country].filter(Boolean).join(' · ')}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3"><StatusBadge status={lead.status} size="md" /><button type="button" onClick={() => openMoveStage()} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white">Move stage</button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm"><span>Assign administrator</span><select disabled={busy} value={lead.assignedAdmin?.id || ''} onChange={(event) => void saveAssignment(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">Unassigned</option>{assignees.map((admin) => <option key={admin.id} value={admin.id}>{admin.firstName} {admin.lastName} · {admin.email}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>Qualification tier</span><div className="flex gap-2"><select value={qualificationTier} onChange={(event) => setQualificationTier(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select><button type="button" disabled={busy} onClick={() => void saveQualification()} className="rounded-lg border border-purple-300 px-3 py-2 text-sm font-semibold text-purple-800 disabled:opacity-50">Qualify</button></div></label>
              </div>
              <p className="mt-3 text-xs text-goswift-grey-subtle">Next action: {nextFollowUp ? `${nextFollowUp.method} · ${new Date(nextFollowUp.dueAt).toLocaleString()}${nextFollowUp.isOverdue ? ' · OVERDUE' : ''}` : 'No open follow-up scheduled'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setActivityType('NOTE_ADDED'); setActivityOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Add note</button>
                <button type="button" onClick={() => { setActivityType('CALL_RECORDED'); setActivityOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Log call</button>
                <button type="button" onClick={() => { setActivityType('EMAIL_RECORDED'); setActivityOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Log email</button>
                <button type="button" onClick={() => { setActivityType('MEETING_RECORDED'); setActivityOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Log meeting</button>
                <button type="button" onClick={() => setFollowUpOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Schedule follow-up</button>
                <button type="button" onClick={() => setWalkthroughOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Schedule walkthrough</button>
                {(['CONVERTED', 'LOST', 'DISQUALIFIED', 'ARCHIVED'] as const).map((destination) => <button key={destination} type="button" onClick={() => openMoveStage(destination)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{destination === 'CONVERTED' ? 'Mark converted' : destination === 'DISQUALIFIED' ? 'Disqualify' : destination === 'ARCHIVED' ? 'Archive' : 'Mark lost'}</button>)}
              </div>
            </article>
          </section>

          {moveStageOpen && <div role="dialog" aria-modal="true" aria-labelledby="move-stage-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={(event) => { event.preventDefault(); void saveStage(); }} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 id="move-stage-title" className="text-lg font-bold">Move lead stage</h2><p className="text-sm text-slate-600">Current stage: <StatusBadge status={lead.status} /></p><label className="grid gap-1 text-sm"><span>Destination</span><select required value={stage} onChange={(event) => { setStage(event.target.value); setConvertedAt(event.target.value === 'CONVERTED' ? new Date().toISOString().slice(0, 16) : ''); }} className="rounded-lg border border-slate-300 px-3 py-2">{leadStages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}{lead.status === 'UNQUALIFIED' && <option value="UNQUALIFIED">Unqualified (legacy)</option>}</select></label>{stage === 'CONVERTED' && <label className="grid gap-1 text-sm"><span>Conversion date and time</span><input type="datetime-local" value={convertedAt} onChange={(event) => setConvertedAt(event.target.value)} required className="rounded-lg border border-slate-300 px-3 py-2" /></label>}<label className="grid gap-1 text-sm"><span>Reason or notes (optional)</span><textarea value={transitionNotes} onChange={(event) => setTransitionNotes(event.target.value)} maxLength={4000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setMoveStageOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={busy || stage === lead.status} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm move'}</button></div></form></div>}
          {activityOpen && <div role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveActivity} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 id="activity-modal-title" className="text-lg font-bold">{activityType === 'NOTE_ADDED' ? 'Add note' : `Log ${activityType.split('_')[0].toLowerCase()}`}</h2><label className="grid gap-1 text-sm"><span>Details</span><textarea autoFocus value={activity} onChange={(event) => setActivity(event.target.value)} required minLength={1} maxLength={4000} rows={4} className="rounded-lg border border-slate-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Date and time</span><input type="datetime-local" value={activityOccurredAt} onChange={(event) => setActivityOccurredAt(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setActivityOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save activity'}</button></div></form></div>}
          {followUpOpen && <div role="dialog" aria-modal="true" aria-labelledby="followup-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveFollowUp} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 id="followup-modal-title" className="text-lg font-bold">Schedule follow-up</h2><label className="grid gap-1 text-sm"><span>Due date and time</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required className="rounded-lg border border-slate-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Contact method</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="MEETING">Meeting</option><option value="OTHER">Other</option></select></label><label className="grid gap-1 text-sm"><span>Assign administrator</span><select value={followUpAssignee} onChange={(event) => setFollowUpAssignee(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">Unassigned</option>{assignees.map((admin) => <option key={admin.id} value={admin.id}>{admin.firstName} {admin.lastName}</option>)}</select></label><label className="grid gap-1 text-sm"><span>Notes</span><textarea value={followUpNotes} onChange={(event) => setFollowUpNotes(event.target.value)} required maxLength={4000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setFollowUpOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Create follow-up'}</button></div></form></div>}
          {walkthroughOpen && <div role="dialog" aria-modal="true" aria-labelledby="walkthrough-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveWalkthrough} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 id="walkthrough-modal-title" className="text-lg font-bold">Create walkthrough request</h2><p className="text-sm text-slate-600">For {lead.company?.name || lead.email}. The lead stage changes only when the walkthrough is scheduled.</p><label className="grid gap-1 text-sm"><span>Preferred date and time (optional)</span><input type="datetime-local" value={walkthroughAt} onChange={(event) => setWalkthroughAt(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Notes</span><textarea value={walkthroughNotes} onChange={(event) => setWalkthroughNotes(event.target.value)} required maxLength={4000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setWalkthroughOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Create request'}</button></div></form></div>}

          <section className="rounded-xl border border-goswift-grey-muted bg-white p-5">
            <h2 className="font-semibold text-goswift-navy">Assessments and recommendations</h2>
            {lead.assessments.length === 0 ? <p className="mt-3 text-sm text-goswift-grey-subtle">No assessment is associated with this lead.</p> : (
              <div className="mt-4 space-y-4">
                {lead.assessments.map((assessment) => (
                  <article key={assessment.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div><h3 className="font-semibold">{assessment.calculatorVersion.calculator.name}</h3><p className="text-xs text-goswift-grey-subtle">{assessment.status} · Version {assessment.calculatorVersion.versionNumber} · {new Date(assessment.createdAt).toLocaleString()}</p></div>
                      {assessment.result && <p className="text-sm font-medium">{assessment.result.overallScore === null ? assessment.result.maturityLevel || 'Result recorded' : `Score ${assessment.result.overallScore}`}</p>}
                    </div>
                    {assessment.result && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(assessment.result.calculatedMetrics ?? assessment.result.categoryScores, null, 2)}</pre>}
                    {assessment.answers.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Submitted answers ({assessment.answers.length})</summary><dl className="mt-3 space-y-2">{assessment.answers.map((answer) => <div key={answer.id} className="border-t border-slate-100 pt-2"><dt className="text-xs font-semibold">{answer.question.title}</dt><dd className="text-sm">{answer.selectedOption?.label ?? answer.textValue ?? answer.numericValue ?? (answer.rawInput === null ? '—' : JSON.stringify(answer.rawInput))}</dd></div>)}</dl></details>}
                    {assessment.recommendations.length > 0 && <div className="mt-3 space-y-2">{assessment.recommendations.map((recommendation, index) => <div key={`${recommendation.title}-${index}`} className="rounded bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase">{recommendation.priority} recommendation</p><p className="font-medium">{recommendation.title}</p><p className="text-sm">{recommendation.summary}</p><p className="mt-1 text-sm">{recommendation.actionPlan}</p></div>)}</div>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-goswift-grey-muted bg-white p-5">
            <h2 className="font-semibold text-goswift-navy">Activity timeline</h2>
            {lead.activities.length === 0 ? <p className="mt-3 text-sm text-goswift-grey-subtle">No activity recorded yet.</p> : <ol className="mt-4 space-y-3">{lead.activities.map((item) => <li key={item.id} className="border-l-2 border-goswift-primary pl-4"><p className="text-sm font-medium">{item.description}</p><p className="text-xs text-goswift-grey-subtle">{item.type} · {new Date(item.createdAt).toLocaleString()}{item.actorAdmin ? ` · ${item.actorAdmin.firstName} ${item.actorAdmin.lastName}` : ''}</p></li>)}</ol>}
          </section>

          <section className="rounded-xl border border-goswift-grey-muted bg-white p-5">
            <h2 className="font-semibold text-goswift-navy">Follow-up history</h2>
            {lead.followUps.length === 0 ? <p className="mt-3 text-sm text-goswift-grey-subtle">No follow-ups scheduled.</p> : <ul className="mt-3 space-y-2">{lead.followUps.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{item.method} · {new Date(item.dueAt).toLocaleString()} · {item.notes}{item.assignedAdmin ? ` · Assigned to ${item.assignedAdmin.firstName} ${item.assignedAdmin.lastName}` : ''}</span><StatusBadge status={item.status} /></li>)}</ul>}
          </section>

          <section className="rounded-xl border border-goswift-grey-muted bg-white p-5">
            <h2 className="font-semibold text-goswift-navy">Walkthrough history</h2>
            {lead.walkthroughRequests.length === 0 ? <p className="mt-3 text-sm text-goswift-grey-subtle">No walkthrough requests recorded.</p> : <ul className="mt-3 space-y-2">{lead.walkthroughRequests.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{item.scheduledAt ? `Scheduled ${new Date(item.scheduledAt).toLocaleString()}` : item.preferredDate ? `Preferred ${new Date(item.preferredDate).toLocaleString()}` : 'No date selected'} · {item.notes || item.outcome || 'No notes recorded'}</span><StatusBadge status={item.status} /></li>)}</ul>}
          </section>
        </>
      )}
    </div>
  );
}

function CompanyDirectory() {
  const [items, setItems] = useState<AdminCompany[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminCompanies({ page, limit: 10, search: search.trim() || undefined });
      setItems(result.items);
      setTotalPages(result.totalPages || 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Companies could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader title="Companies" subtitle="Organizations connected to captured contacts, assessment submissions and activity." />
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      <label className="grid max-w-md gap-1 text-sm"><span>Search companies</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
      {loading ? <div className="rounded-xl border bg-white p-6">Loading companies…</div> : items.length === 0 ? <EmptyState title="No companies found" description="Companies associated with calculator leads will appear here." /> : (
        <div className="grid gap-4 md:grid-cols-2">{items.map((company) => <article key={company.id} className="rounded-xl border border-goswift-grey-muted bg-white p-5"><Link href={`/control-panel/companies/${encodeURIComponent(company.id)}`} className="font-semibold text-goswift-navy hover:underline">{company.name}</Link><p className="mt-1 text-sm text-goswift-grey-subtle">{[company.industry, company.headcountRange, company.city, company.country].filter(Boolean).join(' · ') || 'Company details not provided'}</p><p className="mt-3 text-sm">{company.leadCount} associated lead{company.leadCount === 1 ? '' : 's'}</p><ul className="mt-2 space-y-1 text-xs">{company.leads.map((lead) => <li key={lead.id}><Link href={`/control-panel/leads/detail/${encodeURIComponent(lead.id)}`} className="text-goswift-primary hover:underline">{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email}</Link> · {lead.status}</li>)}</ul></article>)}</div>
      )}
      {!loading && totalPages > 1 && <div className="flex items-center justify-between rounded-xl border bg-white p-4"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Previous</button><span className="text-sm">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Next</button></div>}
    </div>
  );
}

function CompanyDetailPage({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<AdminCompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setCompany(await fetchAdminCompany(companyId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company details could not be loaded.');
    }
  }, [companyId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader title={company?.name || 'Company details'} subtitle="Connected contacts, calculator assessments, results and activity." />
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {!company && !error ? <div className="rounded-xl border bg-white p-6">Loading company…</div> : company && <>
        <section className="rounded-xl border border-goswift-grey-muted bg-white p-5"><h2 className="font-semibold">Company profile</h2><p className="mt-2 text-sm">{[company.industry, company.headcountRange, company.city, company.country].filter(Boolean).join(' · ') || 'No additional company information recorded.'}</p>{company.website && <a className="mt-2 inline-block text-sm text-goswift-primary underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a>}</section>
        <section className="rounded-xl border border-goswift-grey-muted bg-white p-5"><h2 className="font-semibold">Associated leads and assessments</h2>{company.leads.length === 0 ? <p className="mt-3 text-sm text-goswift-grey-subtle">No active leads are associated with this company.</p> : <div className="mt-3 space-y-4">{company.leads.map((lead) => <article key={lead.id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><div><Link href={`/control-panel/leads/detail/${encodeURIComponent(lead.id)}`} className="font-medium text-goswift-primary hover:underline">{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email}</Link><p className="text-xs text-goswift-grey-subtle">{lead.email} · {lead.source} · captured {new Date(lead.createdAt).toLocaleDateString()}</p></div><StatusBadge status={lead.status} /></div><div className="mt-3 space-y-2">{lead.assessments.map((assessment) => <div key={assessment.id} className="rounded bg-slate-50 p-3 text-sm"><p className="font-medium">{assessment.calculatorVersion.calculator.name} · {assessment.status}</p><p className="text-xs text-goswift-grey-subtle">{new Date(assessment.createdAt).toLocaleString()}{assessment.result ? ` · ${assessment.result.overallScore === null ? assessment.result.maturityLevel || 'Result recorded' : `Score ${assessment.result.overallScore}`}` : ''}</p></div>)}</div></article>)}</div>}</section>
        <section className="rounded-xl border border-goswift-grey-muted bg-white p-5"><h2 className="font-semibold">Recent company activity</h2><ol className="mt-3 space-y-3">{company.leads.flatMap((lead) => lead.activities.map((activity) => ({ ...activity, leadId: lead.id, leadName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email }))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20).map((activity) => <li key={activity.id} className="border-l-2 border-goswift-primary pl-4"><p className="text-sm">{activity.description}</p><p className="text-xs text-goswift-grey-subtle"><Link href={`/control-panel/leads/detail/${encodeURIComponent(activity.leadId)}`} className="text-goswift-primary hover:underline">{activity.leadName}</Link> · {activity.type} · {new Date(activity.createdAt).toLocaleString()}</p></li>)}</ol></section>
      </>}
    </div>
  );
}

function FollowUpsPage({ walkthroughs = false }: { walkthroughs?: boolean }) {
  const [followUps, setFollowUps] = useState<AdminFollowUp[]>([]);
  const [walkthroughItems, setWalkthroughItems] = useState<AdminWalkthrough[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [queueStatus, setQueueStatus] = useState('OPEN');
  const [queueScope, setQueueScope] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (walkthroughs) {
        const response = await fetchAdminWalkthroughs({ page, limit: 10, status: queueStatus === 'OPEN' ? undefined : queueStatus });
        setWalkthroughItems(response.items);
        setTotalPages(response.totalPages || 1);
      } else {
        const response = await fetchAdminFollowUps({
          page,
          limit: 10,
          status: queueStatus === 'OPEN' ? undefined : queueStatus,
          scope: queueScope || undefined,
        });
        setFollowUps(response.items);
        setTotalPages(response.totalPages || 1);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, walkthroughs, queueStatus, queueScope]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={walkthroughs ? 'Walkthrough Requests' : 'Follow-ups'}
        subtitle={walkthroughs ? 'Review and schedule walkthrough requests connected to their leads.' : 'Review, reschedule and complete lead follow-up tasks.'}
      />
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs"><span>Status</span><select value={queueStatus} onChange={(event) => { setQueueStatus(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2"><option value="OPEN">Open</option>{walkthroughs ? <><option value="PENDING">Pending</option><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></> : <><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></>}</select></label>
        {!walkthroughs && <label className="grid gap-1 text-xs"><span>Due date</span><select value={queueScope} onChange={(event) => { setQueueScope(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">All open</option><option value="upcoming">Upcoming</option><option value="overdue">Overdue</option></select></label>}
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? (
        <div className="rounded-xl border border-goswift-grey-muted bg-white p-6 text-sm text-goswift-grey-subtle">
          Loading {walkthroughs ? 'walkthroughs' : 'follow-ups'}…
        </div>
      ) : walkthroughs ? walkthroughItems.length === 0 ? (
        <div className="rounded-xl border border-goswift-grey-muted bg-white p-8">
          <EmptyState
            title="No open walkthrough requests"
            description="Pending or scheduled walkthroughs will appear here."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {walkthroughItems.map((item) => (
            <WalkthroughWorkspaceCard key={item.id} item={item} onUpdated={() => void load()} />
          ))}
        </div>
      ) : followUps.length === 0 ? (
        <div className="rounded-xl border border-goswift-grey-muted bg-white p-8">
          <EmptyState title="No open follow-ups" description="Follow-up tasks created from lead workspaces will appear here." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {followUps.map((item) => (
            <FollowUpWorkspaceCard key={item.id} item={item} onUpdated={() => void load()} />
          ))}
        </div>
      )}
      {!loading && totalPages > 1 && <div className="flex items-center justify-between rounded-xl border bg-white p-4"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Previous</button><span className="text-sm">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Next</button></div>}
    </div>
  );
}

function FollowUpWorkspaceCard({ item, onUpdated }: { item: AdminFollowUp; onUpdated: () => void }) {
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState(item.notes);
  const [assignees, setAssignees] = useState<AdminAssignee[]>([]);
  const [assignedAdminId, setAssignedAdminId] = useState(item.assignedAdmin?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const person = item.lead ? [item.lead.firstName, item.lead.lastName].filter(Boolean).join(' ') || item.lead.email : item.leadId;
  useEffect(() => {
    let active = true;
    void fetchAdminAssignees().then((items) => { if (active) setAssignees(items); }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Administrators could not be loaded.');
    });
    return () => { active = false; };
  }, []);
  async function update(status: string) {
    setBusy(true);
    setError(null);
    try {
      await updateAdminFollowUp(item.id, {
        status,
        ...(status === 'RESCHEDULED' && date ? { dueAt: new Date(date).toISOString() } : {}),
        notes,
      });
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Follow-up could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-xl border border-goswift-grey-muted bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/control-panel/leads/detail/${encodeURIComponent(item.leadId)}`} className="font-semibold text-goswift-navy hover:underline">{person}</Link>
          <p className="mt-1 text-sm text-goswift-grey-subtle">{item.lead?.company?.name || 'Independent'} · {item.lead?.email}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p className="mt-3 text-sm text-goswift-grey-subtle">{item.method} · {item.notes}</p>
      <p className="mt-4 text-xs text-goswift-grey-subtle">
        {item.isOverdue ? 'Overdue · ' : 'Upcoming · '}
        Due: {new Date(item.dueAt).toLocaleString()}
      </p>
      <label className="grid max-w-sm gap-1 text-xs"><span>Assigned administrator</span><select value={assignedAdminId} onChange={async (event) => { const next = event.target.value; setAssignedAdminId(next); setBusy(true); setError(null); try { await updateAdminFollowUp(item.id, { assignedAdminId: next || null }); onUpdated(); } catch (cause) { setAssignedAdminId(item.assignedAdmin?.id || ''); setError(cause instanceof Error ? cause.message : 'Assignment could not be saved.'); } finally { setBusy(false); } }} disabled={busy} className="rounded border border-slate-300 px-2 py-1.5"><option value="">Unassigned</option>{assignees.map((admin) => <option key={admin.id} value={admin.id}>{admin.firstName} {admin.lastName}</option>)}</select></label>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs"><span>New due date</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-slate-300 px-2 py-1.5" /></label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs"><span>Edit notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} className="rounded border border-slate-300 px-2 py-1.5" /></label>
        <button type="button" disabled={busy || notes === item.notes} onClick={() => void update(item.status)} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Save notes</button>
        <button type="button" disabled={busy || !date} onClick={() => void update('RESCHEDULED')} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Reschedule</button>
        <button type="button" disabled={busy} onClick={() => void update('COMPLETED')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Complete</button>
        <button type="button" disabled={busy} onClick={() => void update('CANCELLED')} className="rounded border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Cancel</button>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
    </article>
  );
}

function WalkthroughWorkspaceCard({ item, onUpdated }: { item: AdminWalkthrough; onUpdated: () => void }) {
  const [date, setDate] = useState(item.scheduledAt ? new Date(item.scheduledAt).toISOString().slice(0, 16) : '');
  const [notes, setNotes] = useState(item.notes || '');
  const [outcome, setOutcome] = useState(item.outcome || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const person = [item.lead.firstName, item.lead.lastName].filter(Boolean).join(' ') || item.lead.email;
  async function update(status: string) {
    setBusy(true);
    setError(null);
    try {
      await updateAdminWalkthrough(item.id, {
        status,
        ...(date ? { scheduledAt: new Date(date).toISOString() } : {}),
        notes,
        outcome,
      });
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Walkthrough could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-xl border border-goswift-grey-muted bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div><Link href={`/control-panel/leads/detail/${encodeURIComponent(item.leadId)}`} className="font-semibold text-goswift-navy hover:underline">{person}</Link><p className="text-sm text-goswift-grey-subtle">{item.lead.company?.name || 'Independent'} · {item.lead.email}</p><p className="text-xs text-goswift-grey-subtle">{item.lead.assessments[0]?.calculatorVersion.calculator.name || 'No calculator associated'}</p></div>
        <StatusBadge status={item.status} />
      </div>
      <label className="grid gap-1 text-sm"><span>Scheduled date and time</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="grid gap-1 text-sm"><span>Request / meeting notes</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="grid gap-1 text-sm"><span>Outcome</span><textarea rows={2} value={outcome} onChange={(event) => setOutcome(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !date} onClick={() => void update('SCHEDULED')} className="rounded bg-goswift-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{item.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}</button>
        <button type="button" disabled={busy || item.status !== 'SCHEDULED'} onClick={() => void update('COMPLETED')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Complete</button>
        <button type="button" disabled={busy} onClick={() => void update('CANCELLED')} className="rounded border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Cancel</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </article>
  );
}

function AssessmentManagementPage({ scope }: { scope: string }) {
  const allowedScopes = ['all', 'active', 'completed', 'abandoned', 'expired'];
  const selectedScope = allowedScopes.includes(scope) ? scope : 'all';
  const [response, setResponse] = useState<AdminAssessmentsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAssessmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await fetchAdminAssessments({
        scope: selectedScope,
        page,
        limit: 20,
        search: search.trim() || undefined,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assessments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedScope]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openAssessment(item: AdminAssessmentItem) {
    setDetailLoading(true);
    setSelected(null);
    try {
      setSelected(await fetchAdminAssessment(item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assessment details could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  }

  const titleByScope: Record<string, string> = {
    all: 'All Assessments',
    active: 'Active Assessments',
    completed: 'Completed Assessments',
    abandoned: 'Abandoned Assessments',
    expired: 'Expired Assessments',
  };

  return (
    <div className="space-y-5">
      <PageHeader title={titleByScope[selectedScope]} subtitle="Search real assessment records and inspect their saved questions, answers, results, and lead association." />
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      <section className="rounded-xl border border-goswift-grey-muted bg-white p-5">
        <label className="grid max-w-xl gap-1 text-sm">
          Search assessment reference, calculator, contact, or company
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        {loading ? <p className="mt-5 text-sm text-slate-500">Loading assessments…</p> : response?.items.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-3 pr-4">Reference</th><th className="py-3 pr-4">Calculator</th><th className="py-3 pr-4">Company / Lead</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Started</th><th className="py-3 pr-4">Completed</th><th className="py-3 pr-4">Last activity</th><th className="py-3 pr-4">Answers</th><th className="py-3 pr-4">Lead captured</th><th className="py-3 pr-4">Result available</th><th className="py-3">Actions</th></tr></thead>
              <tbody>{response.items.map((item) => {
                const contact = item.lead ? [item.lead.firstName, item.lead.lastName].filter(Boolean).join(' ') || item.lead.email : null;
                return <tr key={item.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs">{item.id.slice(0, 8)}…</td>
                  <td className="py-3 pr-4">{item.calculatorVersion.calculator.name}<p className="text-xs text-slate-500">Version {item.calculatorVersion.versionNumber}</p></td>
                  <td className="py-3 pr-4">{item.lead?.company?.name || '—'}<p className="text-xs text-slate-500">{contact || 'No lead associated'}</p></td>
                  <td className="py-3 pr-4"><StatusBadge status={item.lifecycleStatus} /></td>
                  <td className="py-3 pr-4">{new Date(item.startedAt).toLocaleString()}</td>
                  <td className="py-3 pr-4">{item.completedAt ? new Date(item.completedAt).toLocaleString() : '—'}</td>
                  <td className="py-3 pr-4">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="py-3 pr-4">{item._count.answers}</td>
                  <td className="py-3 pr-4">{item.lead ? 'Yes' : 'No'}</td>
                  <td className="py-3 pr-4">{item.result ? 'Yes' : 'No'}</td>
                  <td className="py-3"><button type="button" onClick={() => void openAssessment(item)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-goswift-navy hover:bg-slate-50">View details</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No assessments match this view.</p>}
        {response && response.totalPages > 1 && <div className="mt-4"><Pagination currentPage={page} totalPages={response.totalPages} totalItems={response.total} pageSize={response.limit} onPageChange={setPage} /></div>}
      </section>
      {detailLoading && <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><p className="rounded-xl bg-white p-6">Loading assessment details…</p></div>}
      {selected && <AssessmentDetailDialog assessment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AssessmentDetailDialog({ assessment, onClose }: { assessment: AdminAssessmentDetail; onClose: () => void }) {
  const answersByQuestion = new Map(assessment.answers.map((answer) => [answer.questionId, answer]));
  const leadName = assessment.lead ? [assessment.lead.firstName, assessment.lead.lastName].filter(Boolean).join(' ') || assessment.lead.email : null;
  return <div role="dialog" aria-modal="true" aria-labelledby="assessment-detail-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
    <section className="max-h-full w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div><h2 id="assessment-detail-title" className="text-xl font-bold text-goswift-navy">Assessment details</h2><p className="mt-1 font-mono text-xs text-slate-500">{assessment.id}</p><p className="mt-2 text-sm">{assessment.calculatorVersion.calculator.name} · version {assessment.calculatorVersion.versionNumber} · <StatusBadge status={assessment.lifecycleStatus} /></p></div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Close</button>
      </header>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs text-slate-500">Started</span>{new Date(assessment.startedAt).toLocaleString()}</p>
        <p className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs text-slate-500">Completed</span>{assessment.completedAt ? new Date(assessment.completedAt).toLocaleString() : 'Not completed'}</p>
        <p className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs text-slate-500">Last activity</span>{new Date(assessment.updatedAt).toLocaleString()}</p>
        <p className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs text-slate-500">Expires</span>{assessment.expiresAt ? new Date(assessment.expiresAt).toLocaleString() : '—'}</p>
      </div>
      {assessment.lead && <section className="mt-5 rounded-lg border p-4"><h3 className="font-semibold">Associated lead and company</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm"><Link href={`/control-panel/leads/detail/${encodeURIComponent(assessment.lead.id)}`} className="text-goswift-primary underline">{leadName}</Link>{assessment.lead.company && <Link href={`/control-panel/companies/${encodeURIComponent(assessment.lead.company.id)}`} className="text-goswift-primary underline">{assessment.lead.company.name}</Link>}{assessment.lead.phone && <span>{assessment.lead.phone}</span>}</div></section>}
      {assessment.result && <section className="mt-5 rounded-lg border p-4">
        <h3 className="font-semibold">Saved result</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <p className="text-sm">Overall score: {assessment.result.overallScore ?? '—'}</p>
          <p className="text-sm">Normalized index: {assessment.result.normalizedIndex ?? '—'}</p>
          <p className="text-sm">Maturity: {assessment.result.maturityLevel || '—'}</p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div><h4 className="text-sm font-medium">Category scores</h4><pre className="mt-1 max-h-56 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(assessment.result.categoryScores, null, 2)}</pre></div>
          <div><h4 className="text-sm font-medium">Calculated metrics</h4><pre className="mt-1 max-h-56 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(assessment.result.calculatedMetrics, null, 2)}</pre></div>
        </div>
      </section>}
      <section className="mt-5"><h3 className="font-semibold">Original question definitions and submitted answers</h3><div className="mt-3 space-y-3">{assessment.calculatorVersion.questions.map((question) => {
        const answer = answersByQuestion.get(question.id);
        const answerText = answer ? answer.selectedOption?.label ?? answer.textValue ?? answer.numericValue ?? answer.rawInput : null;
        return <article key={question.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{question.orderIndex + 1}. {question.title}</h4><span className="text-xs text-slate-500">{question.type} · {question.isRequired ? 'Required' : 'Optional'}{question.scoreCategory ? ` · ${question.scoreCategory.name}` : ''}</span></div><p className="mt-1 text-xs text-slate-500">{question.code}</p>{question.helpText && <p className="mt-2 text-sm text-slate-600">{question.helpText}</p>}<p className="mt-2 text-sm"><strong>Answer:</strong> {answerText === null || answerText === undefined ? 'Unanswered' : typeof answerText === 'object' ? JSON.stringify(answerText) : String(answerText)}</p>{question.options.length > 0 && <p className="mt-1 text-xs text-slate-500">Options: {question.options.map((option) => option.label).join(', ')}</p>}</article>;
      })}</div></section>
      {assessment.recommendations.length > 0 && <section className="mt-5"><h3 className="font-semibold">Saved recommendations</h3><div className="mt-3 space-y-2">{assessment.recommendations.map((recommendation, index) => <article key={`${recommendation.title}-${index}`} className="rounded-lg border p-3"><div className="flex justify-between gap-2"><h4 className="font-medium">{recommendation.title}</h4><StatusBadge status={recommendation.priority} /></div><p className="mt-1 text-sm">{recommendation.summary}</p><p className="mt-1 text-sm text-slate-600">{recommendation.actionPlan}</p></article>)}</div></section>}
    </section>
  </div>;
}

function CalculatorPage({ routeSlug }: { routeSlug: string }) {
  const configuredSlug: Record<string, string> = {
    'payroll-cost': 'payroll-cost-calculator',
    'payroll-compliance': 'payroll-compliance-calculator',
    'hr-admin-cost': 'hr-administrative-cost-calculator',
    'sme-health-check': 'hr-health-check',
  };
  const slug = configuredSlug[routeSlug];
  const [workspace, setWorkspace] = useState<CalculatorWorkspaceResponse | null>(null);
  const [submissions, setSubmissions] = useState<CalculatorSubmissionsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsActive, setSettingsActive] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));

  useEffect(() => {
    if (!slug) {
      return;
    }
    let active = true;
    fetchCalculatorWorkspace(slug)
      .then((response) => {
        if (active) {
          setWorkspace(response);
          setSettingsDescription(response.calculator.description || '');
          setSettingsActive(response.calculator.isActive);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Availability could not be checked.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const loadSubmissions = useCallback(async () => {
    if (!slug) return;
    try {
    setSubmissions(await fetchCalculatorSubmissions(slug, {
      page,
      limit: 10,
      search: search.trim() || undefined,
      status: status || undefined,
    }));
    } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Submissions could not be loaded.');
    }
  }, [page, search, slug, status]);

  useEffect(() => {
    if (!slug || loading) return;
    const timer = window.setTimeout(() => void loadSubmissions(), 250);
    return () => window.clearTimeout(timer);
  }, [loadSubmissions, loading, slug]);

  const formatRate = (rate: number | null) =>
    rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;

  async function saveCalculatorSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      await updateAdminCalculatorSettings(slug, {
        isActive: settingsActive,
        description: settingsDescription.trim() || null,
      });
      setSettingsNotice('Calculator settings saved.');
      const refreshed = await fetchCalculatorWorkspace(slug);
      setWorkspace(refreshed);
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Calculator settings could not be saved.');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
    <PageHeader
      title={friendlyTitle(`/control-panel/calculators/${routeSlug}`)}
      subtitle="Database-backed calculator performance, published question definitions and assessment submissions."
    />
    {loading ? (
      <div className="rounded-xl border border-goswift-grey-muted bg-white p-6 text-sm text-goswift-grey-subtle">
        Loading calculator workspace…
      </div>
    ) : workspace ? (
      <>
        <nav aria-label="Calculator workspace" className="flex gap-2 overflow-x-auto rounded-xl border border-goswift-grey-muted bg-white p-2">
          {[
            ['overview', 'Overview'],
            ['questions', 'Questions'],
            ['preview', 'Evaluation Preview'],
            ['logic', 'Question Logic'],
            ['settings', 'Settings'],
            ['submissions', 'Submissions'],
            ['history', 'Configuration History'],
          ].map(([value, label]) => <button key={value} type="button" aria-current={activeTab === value ? 'page' : undefined} onClick={() => setActiveTab(value)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === value ? 'bg-goswift-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
        </nav>
        {activeTab === 'questions' && <CalculatorConfigurationWorkspace slug={slug} mode="questions" />}
        {activeTab === 'preview' && <CalculatorConfigurationWorkspace slug={slug} mode="preview" />}
        {activeTab === 'logic' && <CalculatorConfigurationWorkspace slug={slug} mode="logic" />}
        {activeTab === 'history' && <CalculatorConfigurationWorkspace slug={slug} mode="history" />}
        {activeTab === 'settings' && <form onSubmit={(event) => void saveCalculatorSettings(event)} className="space-y-4 rounded-xl border border-goswift-grey-muted bg-white p-6"><h2 className="font-semibold text-goswift-navy">Calculator settings</h2><p className="text-sm text-slate-500">Public availability and description changes are audit logged. Availability changes do not modify published configuration or historical assessments.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settingsActive} onChange={(event) => setSettingsActive(event.target.checked)} />Available to new public assessments</label><label className="grid gap-1 text-sm">Public description<textarea maxLength={2000} rows={4} value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" /></label>{settingsError && <p role="alert" className="text-sm text-rose-700">{settingsError}</p>}{settingsNotice && <p role="status" className="text-sm text-emerald-700">{settingsNotice}</p>}<button type="submit" disabled={settingsBusy} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{settingsBusy ? 'Saving…' : 'Save settings'}</button></form>}
        {activeTab === 'overview' && <>
        <section className="rounded-xl border border-goswift-grey-muted bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{workspace.calculator.isActive ? 'Publicly available' : 'Not publicly available'}</p><h2 className="mt-2 text-xl font-bold text-goswift-navy">{workspace.calculator.name}</h2><p className="mt-2 max-w-2xl text-sm text-goswift-grey-subtle">{workspace.calculator.description || 'No description is available.'}</p></div>
            <span className="rounded-lg bg-goswift-grey-light px-3 py-2 text-sm font-medium">{workspace.publishedVersion ? `Published version ${workspace.publishedVersion.versionNumber}` : 'No published version'}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Assessment starts', workspace.metrics.assessmentStarts],
              ['Completions', workspace.metrics.completions],
              ['Captured leads', workspace.metrics.capturedLeads],
              ['Abandoned', workspace.metrics.abandonedAssessments],
              ['Completion rate', formatRate(workspace.metrics.completionRate)],
              ['Lead capture rate', formatRate(workspace.metrics.leadCaptureRate)],
              ['Total visits', workspace.metrics.totalVisits ?? 'Not tracked'],
            ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-goswift-grey-subtle">{label}</p><p className="mt-1 text-lg font-bold text-goswift-navy">{value}</p></div>)}
          </div>
          <p className="mt-3 text-xs text-goswift-grey-subtle">Rates use recorded assessment starts and completions. Visit tracking is not available, so total visits are not represented as zero.</p>
          {workspace.trend.length > 0 && <div className="mt-5"><h3 className="font-semibold">Last 30 days</h3><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Starts</th><th className="py-2 pr-4">Completions</th><th className="py-2">Captured leads</th></tr></thead><tbody>{workspace.trend.map((row) => <tr key={row.date} className="border-b last:border-0"><td className="py-2 pr-4">{new Date(row.date).toLocaleDateString()}</td><td className="py-2 pr-4">{row.starts}</td><td className="py-2 pr-4">{row.completions}</td><td className="py-2">{row.capturedLeads}</td></tr>)}</tbody></table></div></div>}
        </section>
        </>}

        {activeTab === 'submissions' && <section className="rounded-xl border border-goswift-grey-muted bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold text-goswift-navy">Submissions</h2><p className="mt-1 text-sm text-goswift-grey-subtle">{submissions ? `${submissions.total} matching assessments` : 'Loading submissions…'}</p></div><div className="flex gap-2"><label className="grid gap-1 text-xs"><span>Search contact or company</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">All statuses</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="ABANDONED">Abandoned</option></select></label></div></div>
          {submissions && submissions.items.length === 0 ? <p className="mt-5 text-sm text-goswift-grey-subtle">No submissions match these filters.</p> : <div className="mt-4 space-y-3">{submissions?.items.map((submission) => <CalculatorSubmissionCard key={submission.id} item={submission} />)}</div>}
          {submissions && submissions.totalPages > 1 && <div className="mt-4 flex items-center justify-between"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Previous</button><span className="text-sm">Page {page} of {submissions.totalPages}</span><button type="button" disabled={page >= submissions.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Next</button></div>}
        </section>}
      </>
    ) : (
      <UnavailableState
        title="Calculator management is not available"
        description={
          error
            ? 'We could not verify availability right now. Please try again later.'
            : 'There is no supported calculator configuration for this destination.'
        }
      />
    )}
    {error && <p role="status" className="text-xs text-goswift-grey-subtle">{error}</p>}
    </div>
  );
}

function CalculatorSubmissionCard({ item }: { item: CalculatorSubmission }) {
  const person = item.lead ? [item.lead.firstName, item.lead.lastName].filter(Boolean).join(' ') || item.lead.email : 'No lead captured';
  return (
    <article className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>{item.lead ? <Link href={`/control-panel/leads/detail/${encodeURIComponent(item.lead.id)}`} className="font-medium text-goswift-primary hover:underline">{person}</Link> : <p className="font-medium">{person}</p>}<p className="text-xs text-goswift-grey-subtle">{item.lead?.company?.name || 'No company'} · {new Date(item.createdAt).toLocaleString()} · Version {item.calculatorVersion.versionNumber}</p></div><StatusBadge status={item.status} /></div>
    {item.result && <div className="mt-3"><p className="text-sm font-semibold">Result</p><p className="text-sm">{item.result.overallScore === null ? item.result.maturityLevel || 'Calculated metrics available' : `Score ${item.result.overallScore}`}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(item.result.calculatedMetrics ?? item.result.categoryScores, null, 2)}</pre></div>}
    {item.recommendations.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm">{item.recommendations.map((recommendation, index) => <li key={`${recommendation.title}-${index}`}><strong>{recommendation.title}:</strong> {recommendation.summary}</li>)}</ul>}
    {item.answers.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Submitted answers ({item.answers.length})</summary><dl className="mt-2 space-y-2">{item.answers.map((answer) => <div key={answer.question.code} className="border-t pt-2"><dt className="text-xs font-semibold">{answer.question.title}</dt><dd className="text-sm">{answer.selectedOption?.label ?? answer.textValue ?? answer.numericValue ?? (answer.rawInput === null ? '—' : JSON.stringify(answer.rawInput))}</dd></div>)}</dl></details>}
    </article>
  );
}

function AnalyticsPage({ section }: { section: string }) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboardData('last_30_days'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analytics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sectionName = section || 'overview';
  const titles: Record<string, string> = {
    overview: 'Analytics Overview',
    geography: 'Geographic Analytics',
    funnel: 'Conversion Funnel',
  };
  if (sectionName === 'campaigns') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Campaign Performance"
          subtitle="Campaign attribution and performance reporting."
        />
        <UnavailableState
          title="Campaign reporting is not available"
          description="Campaign performance data is not available in the current reporting service."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={titles[sectionName] || 'Analytics'}
        subtitle={
          sectionName === 'geography'
            ? 'Company location summaries based on recorded company information.'
            : sectionName === 'funnel'
              ? 'Assessment and lead counts recorded during the last 30 days.'
              : 'Dashboard metrics cover the last 30 days; the activity trend shows the most recent six monthly periods.'
        }
      />
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? (
        <div className="rounded-xl border border-goswift-grey-muted bg-white p-6 text-sm text-goswift-grey-subtle">
          Loading analytics…
        </div>
      ) : data ? (
        <AnalyticsContent section={sectionName} data={data} />
      ) : null}
    </div>
  );
}

function AnalyticsContent({
  section,
  data,
}: {
  section: string;
  data: DashboardResponse;
}) {
  if (section === 'geography') {
    return data.geographicDistribution.length ? (
      <div className="grid gap-4 md:grid-cols-2">
        {data.geographicDistribution.map((item) => (
          <article key={item.region} className="rounded-xl border border-goswift-grey-muted bg-white p-5">
            <div className="flex justify-between font-semibold">
              <span>{item.region}</span>
              <span>{item.count} companies</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-goswift-primary" style={{ width: `${item.percentage}%` }} />
            </div>
            <p className="mt-2 text-xs text-goswift-grey-subtle">{item.percentage}% of companies with recorded locations</p>
          </article>
        ))}
      </div>
    ) : (
      <UnavailableState
        title="Location insights will appear when data is available"
        description="No company locations have been recorded yet. Location summaries will be shown when submissions include this information."
      />
    );
  }

  if (section === 'funnel') {
    const stages = [
      ['Assessments started', data.metrics.totalAssessments],
      ['Assessments completed', data.metrics.completedAssessments],
      ['Leads captured', data.metrics.totalLeads],
      ['Qualified leads', data.metrics.qualifiedLeads],
    ] as const;
    return (
      <section className="rounded-xl border border-goswift-grey-muted bg-white p-6">
        <p className="mb-5 text-sm text-goswift-grey-subtle">
          Counts for the selected period; stages are displayed as recorded and are not assumed to be one-to-one conversions.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map(([label, count]) => (
            <div key={label} className="rounded-lg bg-goswift-grey-light p-4">
              <p className="text-xs text-goswift-grey-subtle">{label}</p>
              <p className="mt-2 text-2xl font-bold text-goswift-navy">{count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return data.acquisitionTrend.some((item) => item.assessments > 0 || item.qualifiedLeads > 0) ? (
    <section className="rounded-xl border border-goswift-grey-muted bg-white p-6">
      <h2 className="font-bold text-goswift-navy">Monthly activity</h2>
      <div className="mt-4 divide-y divide-goswift-grey-muted">
        {data.acquisitionTrend.map((item) => (
          <div key={item.month} className="grid grid-cols-3 gap-3 py-3 text-sm">
            <span className="font-medium">{item.month}</span>
            <span>{item.assessments} assessments</span>
            <span>{item.qualifiedLeads} qualified leads</span>
          </div>
        ))}
      </div>
    </section>
  ) : (
    <UnavailableState
      title="Analytics will appear when activity is recorded"
      description="There is not enough assessment or lead activity in this period to show a trend."
    />
  );
}

function UnavailableState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-goswift-grey-muted bg-white p-8">
      <EmptyState title={title} description={description} />
      <div className="mt-4 flex justify-center">
        <ClipboardList className="h-5 w-5 text-goswift-grey-subtle" aria-hidden="true" />
      </div>
    </div>
  );
}

function SectionUnavailable({ pathname }: { pathname: string }) {
  const area = pathname.split('/').filter(Boolean);
  const section = area[1] || 'control-panel';
  const page = friendlyTitle(pathname);
  const descriptions: Record<string, string> = {
    assessments: 'Administrative assessment lists and lifecycle actions are not exposed by the current backend API. Public anonymous assessments continue to work separately.',
    intelligence: 'Scoring and recommendation administration endpoints are not available. Existing backend scoring remains authoritative and is not exposed for editing here.',
    system: 'Administrator, role, audit and settings management endpoints are not available in this release.',
    companies: 'Company directory and management endpoints are not available in this release.',
  };
  return (
    <div className="space-y-6">
      <PageHeader title={page} subtitle="GoSwiftHR control panel" />
      <UnavailableState
        title={`${page} is not available yet`}
        description={descriptions[section] || 'This destination does not have a supported data source or operation yet.'}
      />
      <Link
        href="/control-panel"
        className="inline-flex items-center gap-1 text-sm font-semibold text-goswift-primary hover:underline"
      >
        Return to dashboard <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ControlPanelSubPageContent() {
  const params = useParams<{ slug: string[] }>();
  const pathname = `/control-panel/${params.slug?.join('/') || ''}`;
  const path = pathname.split('/').filter(Boolean);
  const group = path[1];
  const subsection = path[2] || '';

  if (group === 'leads' && subsection === 'detail' && path[3]) {
    return <LeadDetailPage leadId={path[3]} />;
  }
  if (group === 'companies' && subsection) {
    return <CompanyDetailPage companyId={subsection} />;
  }
  if (group === 'companies') {
    return <CompanyDirectory />;
  }
  if (group === 'leads' && (subsection === '' || subsection === 'qualified')) {
    return <LeadDirectory qualifiedOnly={subsection === 'qualified'} />;
  }
  if (group === 'leads' && subsection === 'follow-ups') {
    return <FollowUpsPage />;
  }
  if (group === 'leads' && subsection === 'walkthroughs') {
    return <FollowUpsPage walkthroughs />;
  }
  if (group === 'assessments') {
    return <AssessmentManagementPage scope={subsection || 'all'} />;
  }
  if (group === 'calculators' && subsection) {
    return <CalculatorPage routeSlug={subsection} />;
  }
  if (group === 'analytics') {
    return <AnalyticsPage section={subsection || 'overview'} />;
  }
  if (group === 'system' && subsection === 'integrations') {
    return (
      <UnavailableState
        title="Integration management is not available"
        description="Integration setup and connection checks are not available in this release. No external service is shown as connected."
      />
    );
  }

  return <SectionUnavailable pathname={pathname} />;
}

export default function ControlPanelSubPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <LoadingSkeleton count={4} />
        </div>
      }
    >
      <ControlPanelSubPageContent />
    </Suspense>
  );
}
