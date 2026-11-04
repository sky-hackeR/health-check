'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Percent,
  Download,
  Building2,
  Clock,
  ArrowRight,
  Database,
  CheckCircle,
  Zap,
  Mail,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DateRangeFilter, DateRangeOption } from '@/components/ui/DateRangeFilter';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {
  fetchDashboardData,
  pingBackendHealth,
  DashboardResponse,
  RecentLeadItem,
} from '@/lib/api';

export default function ControlPanelDashboard() {
  const [dateRange, setDateRange] = useState<DateRangeOption>('all_time');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'healthy' | 'error'>('idle');
  const [healthLatency, setHealthLatency] = useState<number | null>(null);

  // Load real database metrics
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchDashboardData(dateRange);
      setData(response);
    } catch (err) {
      setError((err as Error).message || 'Failed to connect to backend service.');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Live backend health ping
  const handleTestBackendHealth = async () => {
    setHealthStatus('checking');
    try {
      const ping = await pingBackendHealth();
      if (ping.ok) {
        setHealthStatus('healthy');
        setHealthLatency(ping.latencyMs);
      } else {
        setHealthStatus('error');
      }
    } catch {
      setHealthStatus('error');
    }
  };

  const handleExportData = () => {
    if (!data) return;
    setIsExporting(true);
    try {
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [
          ['Name', 'Email', 'Company', 'Calculator', 'Score', 'Tier', 'Status', 'Date'].join(','),
          ...data.recentLeads.map((l) =>
            [
              `"${l.name}"`,
              `"${l.email}"`,
              `"${l.company}"`,
              `"${l.calculator}"`,
              l.score !== null ? l.score : '',
              l.tier,
              l.status,
              `"${l.date}"`,
            ].join(',')
          ),
        ].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `goswifthr-leads-${dateRange}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
      setShowExportModal(false);
    }
  };

  const columns: Column<RecentLeadItem>[] = [
    {
      key: 'name',
      header: 'Lead Name & Company',
      sortable: true,
      render: (lead) => (
        <div>
          <p className="font-semibold text-goswift-navy">{lead.name}</p>
          <div className="flex items-center gap-1.5 text-xs text-goswift-grey-subtle mt-0.5">
            <Building2 className="w-3 h-3 text-goswift-grey-subtle/80" />
            <span>{lead.company}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'calculator',
      header: 'Calculator Taken',
      sortable: true,
      render: (lead) => (
        <span className="text-xs font-medium text-goswift-navy bg-goswift-grey-light px-2.5 py-1 rounded-md border border-goswift-grey-muted">
          {lead.calculator}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Health Score',
      sortable: true,
      render: (lead) => {
        if (lead.score === null) {
          return <span className="text-xs text-goswift-grey-subtle italic">Pending evaluation</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  lead.score >= 70 ? 'bg-emerald-500' : lead.score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${lead.score}%` }}
              />
            </div>
            <span className="text-xs font-bold text-goswift-navy">{lead.score}%</span>
          </div>
        );
      },
    },
    {
      key: 'tier',
      header: 'Qualification',
      sortable: true,
      render: (lead) => <StatusBadge status={lead.tier} size="sm" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (lead) => <StatusBadge status={lead.status} size="sm" />,
    },
    {
      key: 'date',
      header: 'Submitted',
      render: (lead) => (
        <span className="text-xs text-goswift-grey-subtle">
          {new Date(lead.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Intelligence Dashboard"
        subtitle="Real-time pulse on workforce assessments, qualified enterprise leads, and ROI calculator engagement."
        badge={
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EEF0FF] text-[#5157FB] border border-[#5157FB]/20">
            PostgreSQL Live
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <button
              type="button"
              onClick={loadDashboardData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-white border border-goswift-grey-muted rounded-lg text-goswift-navy hover:bg-goswift-grey-light transition-colors shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 text-goswift-grey-subtle ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={!data || data.recentLeads.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-white border border-goswift-grey-muted rounded-lg text-goswift-navy hover:bg-goswift-grey-light hover:border-slate-300 disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4 text-goswift-grey-subtle" />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* Error Banner with Retry */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Unable to load live dashboard data</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadDashboardData}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors shrink-0 ml-4"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && !data && (
        <div className="space-y-6">
          <LoadingSkeleton type="card" count={6} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-goswift-grey-muted p-6">
              <LoadingSkeleton count={5} />
            </div>
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-6">
              <LoadingSkeleton count={4} />
            </div>
          </div>
        </div>
      )}

      {/* Live Database Data */}
      {data && (
        <>
          {/* 6 Core Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <MetricCard
              title="Total Leads"
              value={data.metrics.totalLeads.toLocaleString()}
              badgeText={`${data.metrics.newLeads} new`}
              timeframe={dateRange.replace(/_/g, ' ')}
              icon={Users}
              iconBgColor="bg-blue-50"
              iconTextColor="text-blue-600"
            />
            <MetricCard
              title="Qualified Leads"
              value={data.metrics.qualifiedLeads.toLocaleString()}
              badgeText="Scored"
              timeframe={dateRange.replace(/_/g, ' ')}
              icon={UserCheck}
              iconBgColor="bg-emerald-50"
              iconTextColor="text-emerald-600"
            />
            <MetricCard
              title="Completions"
              value={data.metrics.completedAssessments.toLocaleString()}
              timeframe={`${data.metrics.completionRate}% completion`}
              icon={CheckCircle2}
              iconBgColor="bg-indigo-50"
              iconTextColor="text-goswift-primary"
            />
            <MetricCard
              title="Abandonment Rate"
              value={`${data.metrics.abandonmentRate}%`}
              timeframe={`${data.metrics.abandonedAssessments} dropped`}
              icon={AlertCircle}
              iconBgColor="bg-rose-50"
              iconTextColor="text-rose-600"
            />
            <MetricCard
              title="Walkthroughs"
              value={data.metrics.walkthroughRequests.toLocaleString()}
              timeframe="consultations"
              icon={Calendar}
              iconBgColor="bg-purple-50"
              iconTextColor="text-purple-600"
            />
            <MetricCard
              title="Conversion Rate"
              value={`${data.metrics.leadConversionRate}%`}
              timeframe="qualified / total leads"
              icon={Percent}
              iconBgColor="bg-amber-50"
              iconTextColor="text-amber-600"
            />
          </div>

          {/* Chart Section: Real Acquisition Trends & Calculator Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Dynamic Trend Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-goswift-grey-muted p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-base font-bold text-goswift-navy">Monthly Assessment & Lead Velocity</h3>
                  <p className="text-xs text-goswift-grey-subtle mt-0.5">
                    Real-time monthly volume derived from PostgreSQL timestamp records
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-goswift-navy">
                    <span className="w-3 h-3 rounded-sm bg-[#5157FB]" /> Assessments Started
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-goswift-navy">
                    <span className="w-3 h-3 rounded-sm bg-[#3ECFD2]" /> Qualified Leads
                  </span>
                </div>
              </div>

              {/* Dynamic SVG Chart */}
              <div className="h-60 w-full flex flex-col justify-end">
                {data.acquisitionTrend.every((m) => m.assessments === 0 && m.qualifiedLeads === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-goswift-grey-muted rounded-lg bg-goswift-grey-light/30">
                    <p className="text-xs font-semibold text-goswift-navy">No historical assessment volume recorded yet</p>
                    <p className="text-[11px] text-goswift-grey-subtle mt-1">
                      As respondents take calculators, monthly velocity will plot here automatically.
                    </p>
                  </div>
                ) : (
                  <svg viewBox="0 0 700 200" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5157FB" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#5157FB" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3ECFD2" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#3ECFD2" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    <line x1="0" y1="40" x2="700" y2="40" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="0" y1="90" x2="700" y2="90" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="0" y1="140" x2="700" y2="140" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="0" y1="190" x2="700" y2="190" stroke="#CBD5E1" />

                    {/* Dynamic Bar/Line plotting */}
                    {data.acquisitionTrend.map((item, idx) => {
                      const maxVal = Math.max(
                        ...data.acquisitionTrend.map((t) => Math.max(t.assessments, t.qualifiedLeads, 1))
                      );
                      const x = 50 + idx * 115;
                      const hAssess = Math.min(150, (item.assessments / maxVal) * 150);
                      const hLeads = Math.min(150, (item.qualifiedLeads / maxVal) * 150);

                      return (
                        <g key={item.month}>
                          <rect
                            x={x - 18}
                            y={190 - hAssess}
                            width="16"
                            height={hAssess}
                            rx="3"
                            fill="#5157FB"
                            opacity="0.9"
                          />
                          <rect
                            x={x + 2}
                            y={190 - hLeads}
                            width="16"
                            height={hLeads}
                            rx="3"
                            fill="#3ECFD2"
                            opacity="0.9"
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* X-Axis Labels */}
                <div className="flex justify-between text-[11px] font-semibold text-goswift-grey-subtle pt-2 border-t border-slate-200">
                  {data.acquisitionTrend.map((t) => (
                    <span key={t.month}>{t.month}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Calculator Engagement */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-goswift-navy">Calculator Engagement</h3>
                <p className="text-xs text-goswift-grey-subtle mt-0.5">
                  Actual completed sessions per calculator model
                </p>

                <div className="mt-5 space-y-4">
                  {data.calculatorEngagement.map((calc) => (
                    <div key={calc.id}>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-goswift-navy truncate mr-2">{calc.name}</span>
                        <span className="text-goswift-primary shrink-0">
                          {calc.percentage}% ({calc.completions})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-goswift-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${calc.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-goswift-grey-muted text-xs text-goswift-grey-subtle flex items-center justify-between">
                <span>Active calculators</span>
                <span className="font-bold text-goswift-navy">{data.calculatorEngagement.length} published</span>
              </div>
            </div>
          </div>

          {/* Middle Grid: Status Distribution & Geographic Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Status Distribution */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 sm:p-6 shadow-xs">
              <h3 className="text-base font-bold text-goswift-navy mb-1">Lead Pipeline Distribution</h3>
              <p className="text-xs text-goswift-grey-subtle mb-4">
                Real status breakdown from PostgreSQL leads table
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200/50">
                  <p className="text-[11px] font-semibold text-blue-700 uppercase">New</p>
                  <p className="text-xl font-extrabold text-blue-900 mt-0.5">
                    {data.statusDistribution.NEW || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-200/50">
                  <p className="text-[11px] font-semibold text-indigo-700 uppercase">Contacted</p>
                  <p className="text-xl font-extrabold text-indigo-900 mt-0.5">
                    {data.statusDistribution.CONTACTED || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/50">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase">Qualified</p>
                  <p className="text-xl font-extrabold text-emerald-900 mt-0.5">
                    {data.statusDistribution.QUALIFIED || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-violet-50/60 border border-violet-200/50">
                  <p className="text-[11px] font-semibold text-violet-700 uppercase">Converted</p>
                  <p className="text-xl font-extrabold text-violet-900 mt-0.5">
                    {data.statusDistribution.CONVERTED || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Geographic Breakdown */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-goswift-navy mb-1">Geographic Distribution</h3>
                <p className="text-xs text-goswift-grey-subtle mb-4">
                  Aggregated location data from registered leads and companies
                </p>

                {data.geographicDistribution.length === 0 ? (
                  <div className="p-6 text-center text-xs text-goswift-grey-subtle border border-dashed border-goswift-grey-muted rounded-lg">
                    No geographic entries recorded in database yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.geographicDistribution.map((geo) => (
                      <div key={geo.region}>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-goswift-navy">{geo.region}</span>
                          <span className="text-goswift-primary">
                            {geo.percentage}% ({geo.count})
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-goswift-primary h-full rounded-full"
                            style={{ width: `${geo.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Table: Live Recent Leads */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-goswift-navy">Recent Inbound Leads</h3>
                <p className="text-xs text-goswift-grey-subtle">
                  Live submissions retrieved from the database
                </p>
              </div>
              <a
                href="/control-panel/leads"
                className="text-xs font-semibold text-goswift-primary hover:underline inline-flex items-center gap-1"
              >
                <span>View All Leads ({data.metrics.totalLeads})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

            <DataTable
              columns={columns}
              data={data.recentLeads}
              keyExtractor={(item) => item.id}
              emptyTitle="No leads in database"
              emptyDescription="No leads have submitted the assessment form yet. Submissions will appear here live."
            />
          </div>

          {/* Bottom Grid: Live Activities, Follow-ups, and Integration Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Activities Stream */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 shadow-xs">
              <h4 className="text-sm font-bold text-goswift-navy mb-4 flex items-center justify-between">
                <span>Recent System Activity</span>
                <span className="text-[10px] font-semibold text-goswift-primary uppercase">Database Stream</span>
              </h4>

              {data.recentActivities.length === 0 ? (
                <EmptyState
                  title="No activities recorded"
                  description="Lead events, consultations, and assessments will stream here automatically."
                  className="p-4"
                />
              ) : (
                <div className="space-y-4">
                  {data.recentActivities.map((act) => (
                    <div key={act.id} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-goswift-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-goswift-navy font-semibold">{act.userName}</p>
                        <p className="text-goswift-grey-subtle leading-relaxed">{act.description}</p>
                        <span className="text-[10px] text-goswift-grey-subtle/70 mt-1 inline-block">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outstanding Follow-ups Queue */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-bold text-goswift-navy mb-4 flex items-center justify-between">
                  <span>Outstanding Follow-ups</span>
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    {data.followUps.length} Pending
                  </span>
                </h4>

                {data.followUps.length === 0 ? (
                  <EmptyState
                    title="All follow-ups complete"
                    description="No pending walkthrough requests or consultation tasks in queue."
                    className="p-4"
                  />
                ) : (
                  <div className="space-y-3">
                    {data.followUps.map((fu) => (
                      <div
                        key={fu.id}
                        className="p-3 rounded-lg border border-goswift-grey-muted bg-goswift-grey-light/40"
                      >
                        <p className="text-xs font-bold text-goswift-navy">{fu.name}</p>
                        <p className="text-[11px] text-goswift-primary font-medium mb-1">{fu.company}</p>
                        <p className="text-xs text-goswift-grey-subtle leading-tight mb-2">{fu.note}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-goswift-grey-subtle">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-goswift-grey-subtle" />
                            {new Date(fu.timeDue).toLocaleDateString()}
                          </span>
                          <span className="text-goswift-primary font-semibold">{fu.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-goswift-grey-muted text-center">
                <a
                  href="/control-panel/leads/follow-ups"
                  className="text-xs font-semibold text-goswift-primary hover:underline"
                >
                  Open Follow-up Queue &rarr;
                </a>
              </div>
            </div>

            {/* Live Integration Status & Health Ping */}
            <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-goswift-navy">System Integrations</h4>
                  <button
                    type="button"
                    onClick={handleTestBackendHealth}
                    disabled={healthStatus === 'checking'}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5157FB] hover:text-[#4243DA] bg-[#EEF0FF] px-2 py-1 rounded-md border border-[#5157FB]/20 hover:bg-[#E0E4FF] transition-colors"
                    title="Ping Backend API"
                  >
                    <Zap className={`w-3 h-3 ${healthStatus === 'checking' ? 'animate-spin' : ''}`} />
                    <span>{healthStatus === 'checking' ? 'Testing...' : 'Test Health Ping'}</span>
                  </button>
                </div>

                {healthStatus === 'healthy' && (
                  <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      API is Live on Port 3001
                    </span>
                    <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                      {healthLatency}ms
                    </span>
                  </div>
                )}

                {healthStatus === 'error' && (
                  <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Backend offline or unreachable on port 3001.</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-goswift-primary" />
                      <span className="font-semibold text-goswift-navy">PostgreSQL Database</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {data.integrationStatus.database.status} (
                      {data.integrationStatus.database.latencyMs !== null
                        ? `${data.integrationStatus.database.latencyMs}ms`
                        : 'offline'}
                      )
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-goswift-navy">HubSpot CRM Sync</span>
                    </div>
                    <StatusBadge status={data.integrationStatus.hubspot.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-goswift-navy">SendGrid Transactional</span>
                    </div>
                    <StatusBadge status={data.integrationStatus.sendgrid.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-600" />
                      <span className="font-semibold text-goswift-navy">Webhook Relay</span>
                    </div>
                    <StatusBadge status={data.integrationStatus.webhook.status} size="sm" />
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-goswift-grey-muted text-center">
                <a
                  href="/control-panel/system/integrations"
                  className="text-xs font-semibold text-goswift-primary hover:underline"
                >
                  Configure Integrations &rarr;
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Export Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onConfirm={handleExportData}
        title="Export Intelligence Data"
        description={`Export live lead records and assessment status as a formatted CSV spreadsheet.`}
        confirmLabel="Download CSV"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isExporting}
      />
    </div>
  );
}
