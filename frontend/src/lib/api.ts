const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export interface AdminIdentity {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
}

export interface DashboardMetrics {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  completedAssessments: number;
  abandonedAssessments: number;
  inProgressAssessments: number;
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
  source?: string;
  hasOverdueFollowUp?: boolean;
  date: string;
}

export interface AdminLeadDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  phone: string | null;
  status: string;
  source: string;
  qualificationTier: string;
  consentGdpr: boolean;
  consentMarketing: boolean;
  createdAt: string;
  company: {
    id: string;
    name: string;
    industry: string | null;
    headcountRange: string | null;
    country: string | null;
    city: string | null;
  } | null;
  assignedAdmin: { id: string; firstName: string; lastName: string; email: string } | null;
  assessments: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    calculatorVersion: {
      versionNumber: number;
      calculator: { id: string; slug: string; name: string };
    };
    answers: Array<{
      id: string;
      textValue: string | null;
      numericValue: number | null;
      rawInput: unknown;
      question: { code: string; title: string; type: string };
      selectedOption: { label: string; value: string } | null;
    }>;
    result: {
      overallScore: number | null;
      normalizedIndex: number | null;
      maturityLevel: string | null;
      categoryScores: unknown;
      calculatedMetrics: unknown;
      summaryHtml: string | null;
    } | null;
    recommendations: Array<{
      title: string;
      summary: string;
      actionPlan: string;
      priority: string;
      status: string;
    }>;
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    metadata: unknown;
    createdAt: string;
    actorAdmin: { id: string; firstName: string; lastName: string; email: string } | null;
  }>;
  followUps: AdminFollowUp[];
  walkthroughRequests: Array<{
    id: string;
    preferredDate: string | null;
    scheduledAt: string | null;
    notes: string | null;
    outcome: string | null;
    status: string;
    createdAt: string;
  }>;
}

export interface AdminFollowUp {
  id: string;
  leadId: string;
  dueAt: string;
  method: string;
  notes: string;
  status: string;
  assignedAdminId?: string | null;
  assignedAdmin?: { id: string; firstName: string; lastName: string; email: string } | null;
  isOverdue?: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
  lead?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: { id: string; name: string } | null;
  };
}

export interface AdminQueueResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminWalkthrough {
  id: string;
  leadId: string;
  preferredDate: string | null;
  scheduledAt: string | null;
  notes: string | null;
  outcome: string | null;
  status: string;
  createdAt: string;
  lead: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    company: { id: string; name: string } | null;
    assessments: Array<{ calculatorVersion: { calculator: { name: string; slug: string } } }>;
  };
}

export interface CreatedAdminWalkthrough {
  id: string;
  leadId: string;
  preferredDate: string | null;
  scheduledAt: string | null;
  notes: string | null;
  outcome: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalculatorWorkspaceResponse {
  calculator: { id: string; slug: string; name: string; description: string | null; isActive: boolean };
  publishedVersion: {
    id: string;
    versionNumber: number;
    questions: Array<{
      id: string;
      code: string;
      title: string;
      helpText: string | null;
      type: string;
      orderIndex: number;
      isRequired: boolean;
      options: Array<{ label: string; value: string; scoreValue: number }>;
    }>;
    scoreCategories: Array<{ id: string; code: string; name: string }>;
  } | null;
  metrics: {
    totalVisits: number | null;
    visitsAvailability: string;
    assessmentStarts: number;
    completions: number;
    capturedLeads: number;
    abandonedAssessments: number;
    completionRate: number | null;
    leadCaptureRate: number | null;
  };
  trend: Array<{ date: string; starts: number; completions: number; capturedLeads: number }>;
}

export interface AdminCalculatorVersion {
  id: string;
  versionNumber: number;
  changelog: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  questions: Array<{
    id: string;
    code: string;
    title: string;
    helpText: string | null;
    type: string;
    orderIndex: number;
    weight: number;
    isRequired: boolean;
    isActive: boolean;
    calculationKey: string | null;
    validationRules: unknown;
    defaultValue: unknown;
    displayConditions: unknown;
    scoreCategoryId: string | null;
    updatedAt: string;
    options: Array<{ id: string; label: string; value: string; orderIndex: number; scoreValue: number }>;
  }>;
  scoreCategories: Array<{ id: string; code: string; name: string; weight: number }>;
}

export interface AdminCalculatorQuestionInput {
  code: string;
  title: string;
  helpText?: string | null;
  type: string;
  orderIndex?: number;
  weight?: number;
  isRequired: boolean;
  isActive?: boolean;
  calculationKey?: string | null;
  validationRules?: unknown;
  defaultValue?: unknown;
  displayConditions?: unknown;
  scoreCategoryId?: string | null;
  options: Array<{ label: string; value: string; orderIndex?: number; scoreValue?: number }>;
}

export interface CalculatorVersionValidation {
  valid: boolean;
  errors: string[];
}

export interface CalculatorEvaluationPreview {
  simulated: true;
  notice: string;
  calculator: { slug: string; name: string; versionNumber: number };
  answers: Array<{ questionId: string; questionCode: string; question: string; visible: boolean; answer: string | number | null; evaluation: string }>;
  result: Record<string, unknown>;
  recommendations: Array<{ title: string; summary: string; actionPlan: string; priority: string }>;
}

export interface CalculatorSubmission {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  calculatorVersion: { versionNumber: number };
  lead: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: { id: string; name: string } | null;
  } | null;
  answers: Array<{
    textValue: string | null;
    numericValue: number | null;
    rawInput: unknown;
    question: { code: string; title: string };
    selectedOption: { label: string } | null;
  }>;
  result: {
    overallScore: number | null;
    normalizedIndex: number | null;
    maturityLevel: string | null;
    calculatedMetrics: unknown;
    categoryScores: unknown;
  } | null;
  recommendations: Array<{ title: string; summary: string; priority: string }>;
}

export interface CalculatorSubmissionsResponse {
  items: CalculatorSubmission[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminAssessmentItem {
  id: string;
  status: string;
  lifecycleStatus: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  _count: { answers: number };
  calculatorVersion: {
    versionNumber: number;
    calculator: { id: string; slug: string; name: string };
  };
  lead: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: { id: string; name: string } | null;
  } | null;
  result: {
    overallScore: number | null;
    normalizedIndex: number | null;
    maturityLevel: string | null;
  } | null;
}

export interface AdminAssessmentDetail extends Omit<AdminAssessmentItem, '_count' | 'result'> {
  calculatorVersion: AdminAssessmentItem['calculatorVersion'] & {
    questions: Array<{
      id: string;
      code: string;
      title: string;
      helpText: string | null;
      type: string;
      orderIndex: number;
      isRequired: boolean;
      displayConditions: unknown;
      scoreCategory: { code: string; name: string } | null;
      options: Array<{ id: string; label: string; value: string; scoreValue: number }>;
    }>;
  };
  lead: (NonNullable<AdminAssessmentItem['lead']> & {
    phone: string | null;
  }) | null;
  answers: Array<{
    questionId: string;
    textValue: string | null;
    numericValue: number | null;
    rawInput: unknown;
    question: {
      id: string;
      code: string;
      title: string;
      type: string;
    };
    selectedOption: { label: string; value: string } | null;
  }>;
  result: {
    overallScore: number | null;
    normalizedIndex: number | null;
    maturityLevel: string | null;
    categoryScores: unknown;
    calculatedMetrics: unknown;
    summaryHtml: string | null;
  } | null;
  recommendations: Array<{
    title: string;
    summary: string;
    actionPlan: string;
    priority: string;
    status: string;
    createdAt: string;
  }>;
}

export interface AdminAssessmentsResponse {
  items: AdminAssessmentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCompany {
  id: string;
  name: string;
  industry: string | null;
  headcountRange: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  leadCount: number;
  leads: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    source: string;
    createdAt: string;
  }>;
}

export interface AdminCompanyDetail extends Omit<AdminCompany, 'leadCount' | 'leads'> {
  leads: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    source: string;
    createdAt: string;
    activities: Array<{ id: string; type: string; description: string; createdAt: string }>;
    assessments: Array<{
      id: string;
      status: string;
      createdAt: string;
      completedAt: string | null;
      calculatorVersion: { calculator: { name: string; slug: string } };
      result: { overallScore: number | null; maturityLevel: string | null; calculatedMetrics: unknown } | null;
    }>;
  }>;
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
  source?: string;
  companyId?: string;
  calculatorSlug?: string;
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

export interface AdminAssignee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface CalculatorConfig {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  versionNumber: number;
  publishedAt?: string | null;
  categories: Array<{ id: string; code: string; name: string }>;
  questions: PublicAssessmentQuestion[];
  totalQuestions: number;
}

export interface PublicCalculator {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  versionNumber: number;
  publishedAt?: string | null;
  categories: Array<{ id: string; code: string; name: string }>;
  questionTopics: string[];
  questionTypes: string[];
  totalQuestions: number;
}

export interface PublicAssessmentQuestion {
  id: string;
  code: string;
  title: string;
  helpText?: string | null;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'NUMERIC_INPUT' | 'SLIDER' | 'BOOLEAN';
  orderIndex: number;
  isRequired: boolean;
  categoryCode?: string | null;
  categoryName?: string | null;
  isVisible?: boolean;
  displayConditions?: unknown;
  validationRules?: unknown;
  defaultValue?: unknown;
  options: Array<{
    id: string;
    label: string;
    value: string;
    orderIndex: number;
    metadata?: unknown;
  }>;
}

export interface AssessmentProgress {
  totalQuestions: number;
  visibleQuestions: number;
  answeredQuestions: number;
  percentage: number;
  isComplete: boolean;
}

export interface AssessmentAnswer {
  questionId: string;
  selectedOptionId?: string | null;
  numericValue?: number | null;
  textValue?: string | null;
  rawInput?: unknown;
}

export interface SavedAssessmentAnswer extends AssessmentAnswer {
  questionCode: string;
  selectedOptionValue?: string | null;
  updatedAt: string;
}

export interface AssessmentSession {
  assessmentId: string;
  sessionToken: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  leadAssociated: boolean;
  calculator: { id: string; slug: string; name: string; versionNumber: number };
  progress: AssessmentProgress;
  questions: Array<PublicAssessmentQuestion & { isVisible: boolean }>;
  answers: SavedAssessmentAnswer[];
  startedAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export interface AssessmentResult {
  assessmentId: string;
  sessionToken: string;
  resultType:
    | 'HR_HEALTH_CHECK'
    | 'PAYROLL_COST_ESTIMATE'
    | 'PAYROLL_COMPLIANCE_EVIDENCE'
    | 'HR_ADMINISTRATIVE_COST_ESTIMATE';
  overallScore: number | null;
  normalizedIndex: number | null;
  maturityLevel: string | null;
  riskLevel: string | null;
  categoryScores: Record<
    string,
    {
      code: string;
      name: string;
      weight: number;
      rawScore: number;
      maxPossibleScore: number;
      percentage: number;
      riskLevel: string;
      answeredCount: number;
      visibleCount: number;
    }
  >;
  benchmark: {
    status: 'configured' | 'unconfigured';
    source?: string;
    segment?: string;
    geography?: string;
    industryAverageIndex?: number;
    variance?: number;
    message?: string;
  };
  calculatedMetrics:
    | PayrollCostMetrics
    | PayrollComplianceMetrics
    | HrAdministrativeCostMetrics
    | null;
  isImmutable: boolean;
  calculatedAt: string;
}

export interface PayrollCostMetrics {
  resultType: 'PAYROLL_COST_ESTIMATE';
  status: 'COMPLETE' | 'PARTIAL';
  currency: 'NGN';
  employeeCount: number;
  payrollRunsPerYear: number;
  componentsPerRun: {
    regularGrossPay: number;
    variableGrossPay: number | null;
    employerPaidStatutoryAmounts: number | null;
    benefits: number | null;
    processingAndServiceCosts: number | null;
  };
  knownSubtotalPerRun: number;
  knownAnnualizedSubtotal: number;
  totalPerRun: number | null;
  totalAnnualized: number | null;
  perEmployeeAnnualized: number | null;
  unknownComponents: string[];
}

export interface PayrollComplianceMetrics {
  resultType: 'PAYROLL_COMPLIANCE_EVIDENCE';
  jurisdiction: 'Nigeria' | 'Unsupported jurisdiction';
  status: 'SUPPORTED' | 'UNSUPPORTED_JURISDICTION';
  checklistVersion: 'NG-PAYROLL-EVIDENCE-V1';
  scopeNotice: string;
  operatesInMultipleJurisdictions: boolean | null;
  evidenceCoverage: {
    verified: number;
    partial: number;
    notVerified: number;
    notApplicable: number;
    applicableItems: number;
    verifiedPercent: number | null;
  } | null;
  checklist: Array<{
    code: string;
    label: string;
    status: 'VERIFIED' | 'PARTIAL' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';
    reportedStatus: 'verified' | 'partial' | 'not_verified' | 'not_applicable';
    reason?: string;
  }>;
}

export interface HrAdministrativeCostMetrics {
  resultType: 'HR_ADMINISTRATIVE_COST_ESTIMATE';
  status: 'COMPLETE' | 'PARTIAL';
  currency: 'NGN';
  employeeCount: number;
  componentsPerYear: {
    allocatedLaborCost: number;
    softwareCost: number | null;
    externalServiceCost: number | null;
  };
  knownSubtotalPerYear: number;
  knownMonthlySubtotal: number;
  totalPerYear: number | null;
  totalPerMonth: number | null;
  perEmployeeAnnualized: number | null;
  unknownComponents: string[];
}

export interface AssessmentRecommendation {
  id: string;
  templateId: string;
  title: string;
  summary: string;
  actionPlan: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'IMPLEMENTED';
  serviceLink?: string | null;
  createdAt: string;
}

export interface AssessmentLeadDetails {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  jobTitle?: string;
  phone?: string;
  headcountRange?: string;
  industry?: string;
  city?: string;
  country?: string;
  consentGdpr?: boolean;
  consentMarketing?: boolean;
}

export interface AssessmentLeadResponse {
  leadId: string;
  calculatorName: string;
  alreadyAssociated: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly endpoint?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Unable to reach GoSwiftHR right now. Please try again.',
      undefined,
      path,
    );
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.startsWith('/auth/login') &&
      !path.startsWith('/auth/session') &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('admin-session-expired'));
    }

    let message: string;
    switch (response.status) {
      case 401:
        message = 'Your session has ended. Please sign in again.';
        break;
      case 403:
        message = 'Your account does not have permission to do that.';
        break;
      case 404:
        message = 'This information is not available.';
        break;
      case 429:
        message = 'Too many attempts. Please wait before trying again.';
        break;
      default:
        message = 'We could not complete that request. Please try again.';
    }
    throw new ApiError(message, response.status, path);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function loginAdmin(
  email: string,
  password: string,
): Promise<AdminIdentity> {
  try {
    return await requestJson<AdminIdentity>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      throw new ApiError('Email or password is not correct.', 401, cause.endpoint);
    }
    throw cause;
  }
}

export async function fetchAdminSession(): Promise<AdminIdentity> {
  return requestJson<AdminIdentity>('/auth/session');
}

export async function fetchPublishedCalculators(): Promise<PublicCalculator[]> {
  return requestJson<PublicCalculator[]>('/calculators');
}

export async function fetchCalculatorConfig(
  slug: string,
): Promise<CalculatorConfig> {
  return requestJson<CalculatorConfig>(`/calculators/${encodeURIComponent(slug)}`);
}

export async function startAssessment(
  calculatorSlug: string,
): Promise<{ assessmentId: string; sessionToken: string }> {
  return requestJson<{ assessmentId: string; sessionToken: string }>(
    '/assessments/start',
    {
    method: 'POST',
    body: JSON.stringify({ calculatorSlug }),
    },
  );
}

export async function fetchAssessment(
  sessionToken: string,
): Promise<AssessmentSession> {
  return requestJson<AssessmentSession>(
    `/assessments/${encodeURIComponent(sessionToken)}`,
  );
}

export async function saveAssessmentAnswer(
  sessionToken: string,
  answer: AssessmentAnswer,
): Promise<void> {
  await requestJson(`/assessments/${encodeURIComponent(sessionToken)}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers: [answer] }),
  });
}

export async function completeAssessment(
  sessionToken: string,
): Promise<void> {
  await requestJson(`/assessments/${encodeURIComponent(sessionToken)}/complete`, {
    method: 'POST',
  });
}

export async function fetchAssessmentResult(
  sessionToken: string,
): Promise<AssessmentResult> {
  return requestJson<AssessmentResult>(
    `/assessments/${encodeURIComponent(sessionToken)}/result`,
  );
}

export async function fetchAssessmentRecommendations(
  sessionToken: string,
): Promise<AssessmentRecommendation[]> {
  return requestJson<AssessmentRecommendation[]>(
    `/assessments/${encodeURIComponent(sessionToken)}/recommendations`,
  );
}

export interface AdminIntelligenceVersion {
  id: string;
  versionNumber: number;
  changelog: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  calculator: { id: string; slug: string; name: string };
  scoreCategories: AdminScoreCategory[];
  scoringRuleCount: number;
  recommendationRuleCount: number;
}

export interface AdminScoreCategory {
  id: string;
  code: string;
  name: string;
  weight: number;
}

export interface AdminScoringRule {
  id: string;
  name: string;
  conditionExpression: string;
  multiplier: number;
  scoreCategory: Pick<AdminScoreCategory, 'id' | 'code' | 'name'> | null;
  calculatorVersion: {
    id: string;
    versionNumber: number;
    isPublished: boolean;
    calculator: { slug: string; name: string };
  };
}

export interface AdminRecommendationRule {
  id: string;
  templateId: string;
  scoreCategoryId: string | null;
  minScore: number | null;
  maxScore: number | null;
  conditionJson: unknown;
  scoreCategory: Pick<AdminScoreCategory, 'id' | 'code' | 'name'> | null;
  template: AdminRecommendationTemplate;
  calculatorVersion: {
    id: string;
    versionNumber: number;
    isPublished: boolean;
    calculator: { slug: string; name: string };
  };
}

export interface AdminRecommendationTemplate {
  id: string;
  code: string;
  versionGroupId: string;
  versionNumber: number;
  isPublished: boolean;
  publishedAt: string | null;
  status?: 'PUBLISHED' | 'DRAFT' | 'SUPERSEDED' | 'INACTIVE';
  title: string;
  summary: string;
  actionPlan: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  serviceLink: string | null;
  ruleCount?: number;
  generatedRecommendationCount?: number;
  applicableCategories?: string[];
}

export interface AdminPreviewAssessment {
  id: string;
  completedAt: string | null;
  calculatorVersion: {
    versionNumber: number;
    calculator: { name: string };
  };
}


export interface AdminCompanyPainPoint {
  id: string;
  code: string;
  versionGroupId: string;
  versionNumber: number;
  title: string;
  description: string;
  businessImpact: string;
  calculatorSlug: string;
  detectionRule: Record<string, unknown>;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedSolution: string | null;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { findings: number };
}

export interface AdminColdEmailTemplate {
  id: string;
  versionGroupId: string;
  versionNumber: number;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  internalNotes: string | null;
  applicablePainPointCategories: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminColdEmailPreview {
  templateId: string;
  assessmentId: string;
  renderedSubject: string;
  renderedBody: string;
  context: {
    companyName: string;
    recipientName: string;
    calculatorName: string;
    score: string;
    painPointCount: number;
  };
  detectedPainPoints: Array<{
    code: string;
    title: string;
    businessImpact: string;
    priority: string;
    suggestedSolution: string | null;
  }>;
}

export interface PaginatedAdminItems<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function captureAssessmentLead(
  sessionToken: string,
  details: AssessmentLeadDetails,
): Promise<AssessmentLeadResponse> {
  return requestJson<AssessmentLeadResponse>(
    `/assessments/${encodeURIComponent(sessionToken)}/lead`,
    {
      method: 'POST',
      body: JSON.stringify(details),
    },
  );
}

export async function logoutAdmin(): Promise<void> {
  await requestJson<void>('/auth/logout', { method: 'POST' });
}

export async function fetchDashboardData(
  timeframe = 'last_30_days',
): Promise<DashboardResponse> {
  return requestJson(
    `/admin/dashboard?timeframe=${encodeURIComponent(timeframe)}`,
  );
}

interface BackendLeadItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source?: string;
  hasOverdueFollowUp?: boolean;
  qualificationTier: string;
  company: { id: string; name: string } | null;
  latestAssessment: {
    calculator?: string | null;
    score: number | string | null;
  } | null;
  createdAt: string;
}

interface BackendLeadsResponse {
  items: BackendLeadItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchLeadsData(
  params: LeadsQueryParams = {},
): Promise<PaginatedLeadsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }
  const response = await requestJson<BackendLeadsResponse>(
    `/admin/leads?${query.toString()}`,
  );

  return {
    ...response,
    items: response.items.map((lead) => {
      const score =
        lead.latestAssessment?.score === null ||
        lead.latestAssessment?.score === undefined
          ? null
          : Number(lead.latestAssessment.score);
      return {
        id: lead.id,
        name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email,
        email: lead.email,
        company: lead.company?.name || 'Independent',
        calculator: lead.latestAssessment?.calculator || 'No assessment yet',
        score: score !== null && Number.isFinite(score) ? Math.round(score) : null,
        tier: lead.qualificationTier,
        status: lead.status,
        source: lead.source,
        hasOverdueFollowUp: lead.hasOverdueFollowUp,
        date: lead.createdAt,
      };
    }),
  };
}

export async function fetchLeadDetail(leadId: string): Promise<AdminLeadDetail> {
  return requestJson(`/admin/leads/${encodeURIComponent(leadId)}`);
}

export async function transitionLead(
  leadId: string,
  status: string,
  notes?: string,
  occurredAt?: string,
): Promise<{ id: string; status: string; updatedAt: string }> {
  return requestJson(`/admin/leads/${encodeURIComponent(leadId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(notes ? { notes } : {}), ...(occurredAt ? { occurredAt } : {}) }),
  });
}

export async function fetchAdminAssignees(): Promise<AdminAssignee[]> {
  return requestJson('/admin/administrators');
}

export async function assignAdminLead(
  leadId: string,
  assignedAdminId: string | null,
): Promise<void> {
  await requestJson(`/admin/leads/${encodeURIComponent(leadId)}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedAdminId }),
  });
}

export async function qualifyAdminLead(
  leadId: string,
  qualificationTier: string,
): Promise<void> {
  await requestJson(`/admin/leads/${encodeURIComponent(leadId)}/qualification`, {
    method: 'PATCH',
    body: JSON.stringify({ qualificationTier }),
  });
}

export async function addLeadActivity(
  leadId: string,
  type: 'NOTE_ADDED' | 'CALL_RECORDED' | 'EMAIL_RECORDED' | 'MEETING_RECORDED',
  description: string,
  occurredAt?: string,
): Promise<void> {
  await requestJson(`/admin/leads/${encodeURIComponent(leadId)}/activities`, {
    method: 'POST',
    body: JSON.stringify({ type, description, ...(occurredAt ? { occurredAt } : {}) }),
  });
}

export async function fetchAdminFollowUps(params: { status?: string; scope?: string; assignedAdminId?: string; page?: number; limit?: number } = {}): Promise<AdminQueueResponse<AdminFollowUp>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return requestJson(`/admin/follow-ups?${query.toString()}`);
}

export async function createLeadFollowUp(
  leadId: string,
  input: { dueAt: string; method: string; notes: string; assignedAdminId?: string | null },
): Promise<AdminFollowUp> {
  return requestJson(`/admin/leads/${encodeURIComponent(leadId)}/follow-ups`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminFollowUp(
  followUpId: string,
  input: { status?: string; dueAt?: string; notes?: string; assignedAdminId?: string | null },
): Promise<AdminFollowUp> {
  return requestJson(`/admin/follow-ups/${encodeURIComponent(followUpId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function createLeadWalkthrough(
  leadId: string,
  input: { preferredDate?: string; notes?: string },
): Promise<CreatedAdminWalkthrough> {
  return requestJson(`/admin/leads/${encodeURIComponent(leadId)}/walkthroughs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchAdminWalkthroughs(params: { status?: string; page?: number; limit?: number } = {}): Promise<AdminQueueResponse<AdminWalkthrough>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return requestJson(`/admin/walkthroughs?${query.toString()}`);
}

export async function updateAdminWalkthrough(
  requestId: string,
  input: { status: string; scheduledAt?: string; outcome?: string; notes?: string },
): Promise<AdminWalkthrough> {
  return requestJson(`/admin/walkthroughs/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchCalculatorWorkspace(
  slug: string,
): Promise<CalculatorWorkspaceResponse> {
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/workspace`);
}

export async function fetchAdminCalculatorVersions(slug: string): Promise<AdminCalculatorVersion[]> {
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/versions`);
}

export async function previewAdminCalculatorEvaluation(
  slug: string,
  input: { versionId: string; answers: Array<{ questionId: string; selectedOptionId?: string; numericValue?: number }> },
): Promise<CalculatorEvaluationPreview> {
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/evaluation-preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createAdminCalculatorDraft(slug: string, sourceVersionId: string): Promise<AdminCalculatorVersion> {
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/versions/${encodeURIComponent(sourceVersionId)}/drafts`, {
    method: 'POST',
  });
}

export async function createAdminCalculatorQuestion(versionId: string, input: AdminCalculatorQuestionInput) {
  return requestJson(`/admin/calculator-versions/${encodeURIComponent(versionId)}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminCalculatorQuestion(questionId: string, input: AdminCalculatorQuestionInput) {
  return requestJson(`/admin/calculator-questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function archiveAdminCalculatorQuestion(questionId: string) {
  return requestJson(`/admin/calculator-questions/${encodeURIComponent(questionId)}/archive`, {
    method: 'PATCH',
  });
}

export async function reorderAdminCalculatorQuestions(versionId: string, questionIds: string[]) {
  return requestJson(`/admin/calculator-versions/${encodeURIComponent(versionId)}/questions/order`, {
    method: 'PATCH',
    body: JSON.stringify({ questionIds }),
  });
}

export async function validateAdminCalculatorVersion(versionId: string): Promise<CalculatorVersionValidation> {
  return requestJson(`/admin/calculator-versions/${encodeURIComponent(versionId)}/validate`);
}

export async function publishAdminCalculatorVersion(versionId: string) {
  return requestJson(`/admin/calculator-versions/${encodeURIComponent(versionId)}/publish`, {
    method: 'POST',
  });
}

export async function updateAdminCalculatorSettings(
  slug: string,
  input: { isActive: boolean; description?: string | null },
) {
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchCalculatorSubmissions(
  slug: string,
  params: { page?: number; limit?: number; search?: string; status?: string } = {},
): Promise<CalculatorSubmissionsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return requestJson(`/admin/calculators/${encodeURIComponent(slug)}/submissions?${query.toString()}`);
}

export async function fetchAdminAssessments(
  params: { page?: number; limit?: number; search?: string; scope?: string } = {},
): Promise<AdminAssessmentsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return requestJson(`/admin/assessments?${query.toString()}`);
}

export async function fetchAdminAssessment(assessmentId: string): Promise<AdminAssessmentDetail> {
  return requestJson(`/admin/assessments/${encodeURIComponent(assessmentId)}`);
}

export async function fetchAdminCompanies(params: { page?: number; limit?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return requestJson<{ items: AdminCompany[]; total: number; page: number; limit: number; totalPages: number }>(`/admin/companies?${query.toString()}`);
}

export async function fetchAdminCompany(companyId: string): Promise<AdminCompanyDetail> {
  return requestJson(`/admin/companies/${encodeURIComponent(companyId)}`);
}

export async function pingBackendHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  service: string;
}> {
  const start = performance.now();
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const latencyMs = Math.round(performance.now() - start);
    if (response.ok) {
      const data = (await response.json()) as { service?: string };
      return { ok: true, latencyMs, service: data.service || 'api' };
    }
    return { ok: false, latencyMs, service: 'unavailable' };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      service: 'unavailable',
    };
  }
}

function intelligenceQuery(params: { page?: number; limit?: number; search?: string; versionId?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

export async function fetchIntelligenceVersions(): Promise<AdminIntelligenceVersion[]> {
  return requestJson('/admin/intelligence/versions');
}

export async function createIntelligenceDraft(sourceVersionId: string): Promise<AdminIntelligenceVersion> {
  return requestJson(`/admin/intelligence/versions/${encodeURIComponent(sourceVersionId)}/draft`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function publishIntelligenceVersion(versionId: string): Promise<AdminIntelligenceVersion> {
  return requestJson(`/admin/intelligence/versions/${encodeURIComponent(versionId)}/publish`, {
    method: 'POST',
  });
}

export async function fetchIntelligenceScoringRules(params: { page?: number; limit?: number; search?: string; versionId?: string } = {}) {
  return requestJson<PaginatedAdminItems<AdminScoringRule>>(
    `/admin/intelligence/scoring-rules?${intelligenceQuery(params)}`,
  );
}

export async function createIntelligenceScoringRule(versionId: string, input: {
  name: string;
  conditionExpression: string;
  multiplier: number;
  scoreCategoryId?: string | null;
}): Promise<AdminScoringRule> {
  return requestJson(`/admin/intelligence/versions/${encodeURIComponent(versionId)}/scoring-rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateIntelligenceScoringRule(ruleId: string, input: Partial<{
  name: string;
  conditionExpression: string;
  multiplier: number;
  scoreCategoryId: string | null;
}>): Promise<AdminScoringRule> {
  return requestJson(`/admin/intelligence/scoring-rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteIntelligenceScoringRule(ruleId: string): Promise<void> {
  await requestJson(`/admin/intelligence/scoring-rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}

export async function updateIntelligenceCategory(categoryId: string, input: {
  name?: string;
  weight?: number;
}): Promise<AdminScoreCategory> {
  return requestJson(`/admin/intelligence/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchIntelligenceRecommendationRules(params: { page?: number; limit?: number; search?: string; versionId?: string } = {}) {
  return requestJson<PaginatedAdminItems<AdminRecommendationRule>>(
    `/admin/intelligence/recommendation-rules?${intelligenceQuery(params)}`,
  );
}

export async function createIntelligenceRecommendationRule(versionId: string, input: {
  templateId: string;
  scoreCategoryId?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  conditionJson?: Record<string, unknown> | null;
}): Promise<AdminRecommendationRule> {
  return requestJson(`/admin/intelligence/versions/${encodeURIComponent(versionId)}/recommendation-rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateIntelligenceRecommendationRule(ruleId: string, input: Partial<{
  templateId: string;
  scoreCategoryId: string | null;
  minScore: number | null;
  maxScore: number | null;
  conditionJson: Record<string, unknown> | null;
}>): Promise<AdminRecommendationRule> {
  return requestJson(`/admin/intelligence/recommendation-rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteIntelligenceRecommendationRule(ruleId: string): Promise<void> {
  await requestJson(`/admin/intelligence/recommendation-rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}

export async function fetchIntelligenceTemplates(params: { page?: number; limit?: number; search?: string } = {}) {
  return requestJson<PaginatedAdminItems<AdminRecommendationTemplate>>(
    `/admin/intelligence/templates?${intelligenceQuery(params)}`,
  );
}

export async function createIntelligenceTemplate(input: {
  code: string;
  title: string;
  summary: string;
  actionPlan: string;
  priority: AdminRecommendationTemplate['priority'];
  serviceLink?: string | null;
}): Promise<AdminRecommendationTemplate> {
  return requestJson('/admin/intelligence/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createIntelligenceTemplateDraft(templateId: string): Promise<AdminRecommendationTemplate> {
  return requestJson(`/admin/intelligence/templates/${encodeURIComponent(templateId)}/draft`, {
    method: 'POST',
  });
}

export async function updateIntelligenceTemplate(templateId: string, input: Partial<{
  title: string;
  summary: string;
  actionPlan: string;
  priority: AdminRecommendationTemplate['priority'];
  serviceLink: string | null;
}>): Promise<AdminRecommendationTemplate> {
  return requestJson(`/admin/intelligence/templates/${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function publishIntelligenceTemplate(templateId: string): Promise<AdminRecommendationTemplate> {
  return requestJson(`/admin/intelligence/templates/${encodeURIComponent(templateId)}/publish`, {
    method: 'POST',
  });
}

export async function deactivateIntelligenceTemplate(templateId: string): Promise<AdminRecommendationTemplate> {
  return requestJson(`/admin/intelligence/templates/${encodeURIComponent(templateId)}/deactivate`, {
    method: 'POST',
  });
}

export async function previewIntelligenceTemplate(templateId: string) {
  return requestJson<{
    title: string;
    summary: string;
    actionPlan: string;
    placeholders: string[];
  }>(`/admin/intelligence/templates/${encodeURIComponent(templateId)}/preview`);
}

export async function fetchIntelligencePreviewAssessments() {
  return requestJson<PaginatedAdminItems<AdminPreviewAssessment>>(
    '/admin/intelligence/preview-assessments?limit=100',
  );
}

export async function previewIntelligenceVersion(versionId: string, assessmentId: string) {
  return requestJson<{
    assessmentId: string;
    versionId: string;
    scoringResult: unknown;
    recommendations: Array<{ title: string; summary: string; actionPlan: string; priority: string }>;
  }>(`/admin/intelligence/versions/${encodeURIComponent(versionId)}/preview/${encodeURIComponent(assessmentId)}`);
}

export async function fetchCompanyPainPoints(params: {
  search?: string;
  calculatorSlug?: string;
} = {}): Promise<AdminCompanyPainPoint[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.calculatorSlug) query.set('calculatorSlug', params.calculatorSlug);
  const qs = query.toString();
  return requestJson(`/admin/intelligence/pain-points${qs ? `?${qs}` : ''}`);
}

export async function createCompanyPainPointDraft(input: {
  code: string;
  title: string;
  description: string;
  businessImpact: string;
  calculatorSlug: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedSolution?: string | null;
  isActive: boolean;
  detectionRule: Record<string, unknown>;
}): Promise<AdminCompanyPainPoint> {
  return requestJson('/admin/intelligence/pain-points', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createCompanyPainPointVersion(pointId: string): Promise<AdminCompanyPainPoint> {
  return requestJson(`/admin/intelligence/pain-points/${encodeURIComponent(pointId)}/version`, {
    method: 'POST',
  });
}

export async function updateCompanyPainPoint(pointId: string, input: {
  code: string;
  title: string;
  description: string;
  businessImpact: string;
  calculatorSlug: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedSolution?: string | null;
  isActive: boolean;
  detectionRule: Record<string, unknown>;
}): Promise<AdminCompanyPainPoint> {
  return requestJson(`/admin/intelligence/pain-points/${encodeURIComponent(pointId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function publishCompanyPainPoint(pointId: string): Promise<AdminCompanyPainPoint> {
  return requestJson(`/admin/intelligence/pain-points/${encodeURIComponent(pointId)}/publish`, {
    method: 'POST',
  });
}

export async function fetchColdEmailTemplates(params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedAdminItems<AdminColdEmailTemplate>> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return requestJson(`/admin/intelligence/cold-email-templates${qs ? `?${qs}` : ''}`);
}

export async function createColdEmailTemplateDraft(input: {
  name: string;
  subject: string;
  body: string;
  description?: string | null;
  internalNotes?: string | null;
  applicablePainPointCategories: string[];
}): Promise<AdminColdEmailTemplate> {
  return requestJson('/admin/intelligence/cold-email-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createColdEmailTemplateVersion(templateId: string): Promise<AdminColdEmailTemplate> {
  return requestJson(`/admin/intelligence/cold-email-templates/${encodeURIComponent(templateId)}/version`, {
    method: 'POST',
  });
}

export async function updateColdEmailTemplate(templateId: string, input: Partial<{
  name: string;
  subject: string;
  body: string;
  description?: string | null;
  internalNotes?: string | null;
  applicablePainPointCategories: string[];
}>): Promise<AdminColdEmailTemplate> {
  return requestJson(`/admin/intelligence/cold-email-templates/${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function publishColdEmailTemplate(templateId: string): Promise<AdminColdEmailTemplate> {
  return requestJson(`/admin/intelligence/cold-email-templates/${encodeURIComponent(templateId)}/publish`, {
    method: 'POST',
  });
}

export async function archiveColdEmailTemplate(templateId: string): Promise<AdminColdEmailTemplate> {
  return requestJson(`/admin/intelligence/cold-email-templates/${encodeURIComponent(templateId)}/archive`, {
    method: 'POST',
  });
}

export async function previewColdEmail(
  templateId: string,
  assessmentId: string,
  params?: { senderName?: string; senderCompany?: string },
): Promise<AdminColdEmailPreview> {
  const query = new URLSearchParams();
  if (params?.senderName) query.set('senderName', params.senderName);
  if (params?.senderCompany) query.set('senderCompany', params.senderCompany);
  const qs = query.toString();
  return requestJson(
    `/admin/intelligence/cold-email-templates/${encodeURIComponent(templateId)}/preview/${encodeURIComponent(assessmentId)}${qs ? `?${qs}` : ''}`,
  );
}
