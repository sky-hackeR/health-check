const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export interface DashboardMetrics {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  completedAssessments: number;
  abandonedAssessments: number;
  totalAssessments: number;
  walkthroughRequests: number;
  completionRate: number;
  leadConversionRate: number;
  abandonmentRate: number;
  conversionRateDescription: string;
}

export interface AcquisitionTrendItem {
  month: string;
  assessments: number;
  qualifiedLeads: number;
}

export interface CalculatorEngagementItem {
  id: string;
  slug: string;
  name: string;
  completions: number;
  percentage: number;
}

export interface RecentLeadItem {
  id: string;
  name: string;
  email: string;
  company: string;
  calculator: string;
  score: number | null;
  tier: string;
  status: string;
  date: string;
}

export interface RecentActivityItem {
  id: string;
  leadId: string;
  userName: string;
  type: string;
  description: string;
  createdAt: string;
}

export interface FollowUpItem {
  id: string;
  leadId: string;
  name: string;
  company: string;
  note: string;
  timeDue: string;
  status: string;
}

export interface IntegrationStatus {
  database: {
    status: string;
    latencyMs: number | null;
  };
  hubspot: {
    status: string;
    lastSync: string | null;
  };
  sendgrid: {
    status: string;
    lastSync: string | null;
  };
  webhook: {
    status: string;
    lastSync: string | null;
  };
}

export interface GeographicItem {
  region: string;
  count: number;
  percentage: number;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  acquisitionTrend: AcquisitionTrendItem[];
  calculatorEngagement: CalculatorEngagementItem[];
  statusDistribution: Record<string, number>;
  geographicDistribution: GeographicItem[];
  recentLeads: RecentLeadItem[];
  recentActivities: RecentActivityItem[];
  followUps: FollowUpItem[];
  integrationStatus: IntegrationStatus;
  timeframe: string;
  generatedAt: string;
}

export interface LeadsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tier?: string;
  from?: string;
  to?: string;
}

export interface PaginatedLeadsResponse {
  items: RecentLeadItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Fetches real-time dashboard analytics from PostgreSQL.
 */
export async function fetchDashboardData(timeframe: string = 'last_30_days'): Promise<DashboardResponse> {
  const url = `${API_BASE_URL}/admin/dashboard?timeframe=${encodeURIComponent(timeframe)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    // Ensure fresh client data on request
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to load dashboard data: HTTP ${res.status} - ${errorText}`);
  }

  return res.json();
}

/**
 * Fetches paginated leads from PostgreSQL.
 */
export async function fetchLeadsData(params: LeadsQueryParams = {}): Promise<PaginatedLeadsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.tier) query.set('tier', params.tier);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);

  const url = `${API_BASE_URL}/admin/leads?${query.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to load leads: HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Real-time health probe against the backend server.
 */
export async function pingBackendHealth(): Promise<{ ok: boolean; latencyMs: number; service: string }> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      const data = await res.json();
      return { ok: true, latencyMs, service: data.service || 'api' };
    }
    return { ok: false, latencyMs, service: 'unhealthy' };
  } catch {
    return { ok: false, latencyMs: -1, service: 'unreachable' };
  }
}
