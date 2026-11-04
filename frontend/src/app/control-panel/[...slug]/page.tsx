'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Plus, ArrowRight, AlertCircle } from 'lucide-react';
import { PageHeader, BreadcrumbItem } from '@/components/ui/PageHeader';
import { FilterBar } from '@/components/ui/FilterBar';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { fetchLeadsData, RecentLeadItem } from '@/lib/api';

function SubPageContent() {
  const params = useParams();
  const slug = (params.slug as string[]) || [];

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isActionOpen, setIsActionOpen] = useState(false);

  const [leads, setLeads] = useState<RecentLeadItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Friendly title resolution
  const title =
    slug[slug.length - 1]
      ?.split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Management';

  const groupTitle =
    slug[0]
      ?.split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Section';

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Control Panel', href: '/control-panel' },
    { label: groupTitle, href: `/control-panel/${slug[0]}` },
    ...(slug.length > 1 ? [{ label: title }] : []),
  ];

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchLeadsData({
        page: currentPage,
        limit: 10,
        search: search.trim() || undefined,
        status: activeTab !== 'all' ? activeTab : undefined,
      });
      setLeads(res.items);
      setTotalItems(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError((err as Error).message || 'Failed to load records from backend.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const columns: Column<RecentLeadItem>[] = [
    {
      key: 'name',
      header: 'Lead Name & Email',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-semibold text-goswift-navy">{r.name}</p>
          <p className="text-xs text-goswift-grey-subtle">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (r) => (
        <span className="text-xs font-medium text-goswift-navy">
          {r.company}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} size="sm" />,
    },
    {
      key: 'tier',
      header: 'Qualification',
      render: (r) => <StatusBadge status={r.tier} size="sm" />,
    },
    {
      key: 'date',
      header: 'Registered',
      render: (r) => (
        <span className="text-xs text-goswift-grey-subtle">
          {new Date(r.date).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => alert(`Reviewing record for ${r.name}`)}
            className="text-xs font-semibold text-goswift-primary hover:underline inline-flex items-center gap-1"
          >
            <span>Review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={`Live administrative records and status for ${title.toLowerCase()}.`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsActionOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-goswift-primary hover:bg-goswift-primary-hover text-white transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Lead</span>
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="text-xs font-bold text-rose-700 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-goswift-grey-muted p-4 shadow-xs">
        <FilterBar
          searchValue={search}
          onSearchChange={(v) => {
            setSearch(v);
            setCurrentPage(1);
          }}
          searchPlaceholder={`Search ${title.toLowerCase()}...`}
          tabs={[
            { id: 'all', label: 'All Records', count: totalItems },
            { id: 'NEW', label: 'New' },
            { id: 'CONTACTED', label: 'Contacted' },
            { id: 'QUALIFIED', label: 'Qualified' },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setCurrentPage(1);
          }}
          hasActiveFilters={Boolean(search) || activeTab !== 'all'}
          onResetFilters={() => {
            setSearch('');
            setActiveTab('all');
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={leads}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyTitle={`No records found in database`}
        emptyDescription={`There are currently zero records matching this criteria in PostgreSQL. New submissions will appear here automatically.`}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl border border-goswift-grey-muted p-4 shadow-xs">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={10}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Action Dialog */}
      <ConfirmationDialog
        isOpen={isActionOpen}
        onClose={() => setIsActionOpen(false)}
        onConfirm={() => {
          setIsActionOpen(false);
          alert('Lead creation form will connect in next step.');
        }}
        title={`New ${title} Action`}
        description="Connect with prospect directly or create an administrative record."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="primary"
      />
    </div>
  );
}

export default function ControlPanelSubPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
          <LoadingSkeleton count={4} />
        </div>
      }
    >
      <SubPageContent />
    </Suspense>
  );
}
