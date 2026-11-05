'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import {
  ApiError,
  AssessmentAnswer,
  AssessmentLeadDetails,
  AssessmentRecommendation,
  AssessmentResult,
  AssessmentSession,
  CalculatorConfig,
  captureAssessmentLead,
  completeAssessment,
  fetchAssessment,
  fetchAssessmentRecommendations,
  fetchAssessmentResult,
  fetchCalculatorConfig,
  fetchPublishedCalculators,
  PublicAssessmentQuestion,
  PublicCalculator,
  saveAssessmentAnswer,
  startAssessment,
} from '@/lib/api';

type AnswerDraft = {
  selectedOptionId?: string;
  numericValue?: string;
  selectedOptionIds?: string[];
};

const publicCalculatorSlugs = new Set([
  'payroll-cost-calculator',
  'payroll-compliance-calculator',
  'hr-administrative-cost-calculator',
  'hr-health-check',
]);
const supportedQuestionTypes = new Set([
  'SINGLE_CHOICE',
  'BOOLEAN',
  'NUMERIC_INPUT',
  'SLIDER',
]);

function sessionStorageKey(slug: string): string {
  return `goswifthr.assessment.${slug}`;
}

function getDrafts(session: AssessmentSession): Record<string, AnswerDraft> {
  const saved = Object.fromEntries(
    session.answers.map((answer) => [
      answer.questionId,
      {
        ...(answer.selectedOptionId
          ? { selectedOptionId: answer.selectedOptionId }
          : {}),
        ...(answer.numericValue !== null && answer.numericValue !== undefined
          ? { numericValue: String(answer.numericValue) }
          : {}),
        ...(Array.isArray(answer.rawInput) &&
        answer.rawInput.every((value) => typeof value === 'string')
          ? { selectedOptionIds: answer.rawInput }
          : {}),
      },
    ]),
  );
  const defaults: Record<string, AnswerDraft> = {};
  for (const question of session.questions) {
    if (question.defaultValue === undefined || question.defaultValue === null) continue;
    if (
      (question.type === 'SINGLE_CHOICE' || question.type === 'BOOLEAN') &&
      typeof question.defaultValue === 'string'
    ) {
      const option = question.options.find((item) => item.value === question.defaultValue);
      if (option) defaults[question.id] = { selectedOptionId: option.id };
    } else if (
      (question.type === 'NUMERIC_INPUT' || question.type === 'SLIDER') &&
      typeof question.defaultValue === 'number' &&
      Number.isFinite(question.defaultValue)
    ) {
      defaults[question.id] = { numericValue: String(question.defaultValue) };
    }
  }
  return { ...defaults, ...saved };
}

function getAnswer(
  question: PublicAssessmentQuestion,
  draft: AnswerDraft | undefined,
): AssessmentAnswer | null {
  if (!draft) return null;

  if (question.type === 'SINGLE_CHOICE' || question.type === 'BOOLEAN') {
    return draft.selectedOptionId
      ? { questionId: question.id, selectedOptionId: draft.selectedOptionId }
      : null;
  }

  if (question.type === 'NUMERIC_INPUT' || question.type === 'SLIDER') {
    if (!draft.numericValue?.trim()) return null;
    const numericValue = Number(draft.numericValue);
    if (!Number.isFinite(numericValue)) return null;
    const rules =
      question.validationRules && typeof question.validationRules === 'object'
        ? question.validationRules as Record<string, unknown>
        : {};
    if (
      (typeof rules.minimum === 'number' && numericValue < rules.minimum) ||
      (typeof rules.maximum === 'number' && numericValue > rules.maximum)
    ) {
      return null;
    }
    return { questionId: question.id, numericValue };
  }

  return null;
}

function hasAnswer(session: AssessmentSession, questionId: string): boolean {
  return session.answers.some((answer) => answer.questionId === questionId);
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function formatNaira(value: number | null): string {
  if (value === null) return 'Not provided';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(value);
}

function DomainResultPanel({ result }: { result: AssessmentResult }) {
  const metrics = result.calculatedMetrics;
  if (!metrics) return null;

  if (metrics.resultType === 'PAYROLL_COST_ESTIMATE') {
    const components = [
      ['Regular gross pay per run', metrics.componentsPerRun.regularGrossPay],
      ['Variable gross pay per run', metrics.componentsPerRun.variableGrossPay],
      [
        'Employer-paid statutory amounts per run',
        metrics.componentsPerRun.employerPaidStatutoryAmounts,
      ],
      ['Benefits per run', metrics.componentsPerRun.benefits],
      [
        'Processing and service costs per run',
        metrics.componentsPerRun.processingAndServiceCosts,
      ],
    ] as const;

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">Payroll cost estimate</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          NGN estimate based only on the values you entered. Employee deductions are excluded.
        </p>
        {metrics.status === 'PARTIAL' && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
            This estimate is incomplete. The known subtotal below excludes unknown components and
            is not a full payroll cost total.
          </p>
        )}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">Employees in estimate</dt>
            <dd className="mt-1 font-bold">{metrics.employeeCount.toLocaleString()}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">Payroll runs per year</dt>
            <dd className="mt-1 font-bold">{metrics.payrollRunsPerYear}</dd>
          </div>
          {components.map(([label, amount]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="mt-1 font-bold">{formatNaira(amount)}</dd>
            </div>
          ))}
          <div className="rounded-xl bg-[#F5F6FF] p-4">
            <dt className="text-xs font-semibold text-slate-500">
              {metrics.status === 'COMPLETE' ? 'Total per payroll run' : 'Known subtotal per run'}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-[#4148D8]">
              {formatNaira(metrics.totalPerRun ?? metrics.knownSubtotalPerRun)}
            </dd>
          </div>
          <div className="rounded-xl bg-[#F5F6FF] p-4">
            <dt className="text-xs font-semibold text-slate-500">
              {metrics.status === 'COMPLETE' ? 'Annualized total' : 'Known annualized subtotal'}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-[#4148D8]">
              {formatNaira(metrics.totalAnnualized ?? metrics.knownAnnualizedSubtotal)}
            </dd>
          </div>
          {metrics.status === 'COMPLETE' && (
            <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="text-xs font-semibold text-slate-500">
                Annualized cost per employee
              </dt>
              <dd className="mt-1 font-bold">{formatNaira(metrics.perEmployeeAnnualized)}</dd>
            </div>
          )}
        </dl>
        {metrics.unknownComponents.length > 0 && (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Not included because unknown: {metrics.unknownComponents.join(', ')}.
          </p>
        )}
      </section>
    );
  }

  if (metrics.resultType === 'HR_ADMINISTRATIVE_COST_ESTIMATE') {
    const components = [
      ['Allocated HR labor cost per year', metrics.componentsPerYear.allocatedLaborCost],
      ['HR software per year', metrics.componentsPerYear.softwareCost],
      ['External HR services per year', metrics.componentsPerYear.externalServiceCost],
    ] as const;

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">HR administrative cost estimate</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Annualized NGN estimate from your labor, software, and external-service inputs. It does
          not estimate savings or return on investment.
        </p>
        {metrics.status === 'PARTIAL' && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
            This estimate is incomplete. The known subtotal excludes unknown cost components.
          </p>
        )}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">Employees in estimate</dt>
            <dd className="mt-1 font-bold">{metrics.employeeCount.toLocaleString()}</dd>
          </div>
          {components.map(([label, amount]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="mt-1 font-bold">{formatNaira(amount)}</dd>
            </div>
          ))}
          <div className="rounded-xl bg-[#F5F6FF] p-4">
            <dt className="text-xs font-semibold text-slate-500">
              {metrics.status === 'COMPLETE' ? 'Total per year' : 'Known subtotal per year'}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-[#4148D8]">
              {formatNaira(metrics.totalPerYear ?? metrics.knownSubtotalPerYear)}
            </dd>
          </div>
          <div className="rounded-xl bg-[#F5F6FF] p-4">
            <dt className="text-xs font-semibold text-slate-500">
              {metrics.status === 'COMPLETE' ? 'Total per month' : 'Known monthly subtotal'}
            </dt>
            <dd className="mt-1 text-lg font-extrabold text-[#4148D8]">
              {formatNaira(metrics.totalPerMonth ?? metrics.knownMonthlySubtotal)}
            </dd>
          </div>
          {metrics.status === 'COMPLETE' && (
            <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="text-xs font-semibold text-slate-500">
                Annualized cost per employee
              </dt>
              <dd className="mt-1 font-bold">{formatNaira(metrics.perEmployeeAnnualized)}</dd>
            </div>
          )}
        </dl>
        {metrics.unknownComponents.length > 0 && (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Not included because unknown: {metrics.unknownComponents.join(', ')}.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold">Payroll evidence checklist</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{metrics.scopeNotice}</p>
      {metrics.status === 'UNSUPPORTED_JURISDICTION' ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
          The current evidence checklist is available for Nigeria only. No jurisdiction-specific
          result was generated.
        </p>
      ) : (
        <>
          {metrics.evidenceCoverage && (
            <div className="mt-5 rounded-xl bg-[#F5F6FF] p-4">
              <p className="text-xs font-semibold text-slate-500">Self-reported verified evidence</p>
              <p className="mt-1 text-2xl font-extrabold text-[#4148D8]">
                {metrics.evidenceCoverage.verifiedPercent === null
                  ? 'No applicable items'
                  : `${metrics.evidenceCoverage.verifiedPercent.toFixed(1)}%`}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {metrics.evidenceCoverage.verified} verified of {metrics.evidenceCoverage.applicableItems}{' '}
                applicable items. This is not a legal compliance score.
              </p>
            </div>
          )}
          {metrics.operatesInMultipleJurisdictions && (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Your responses cover only the primary jurisdiction selected. Other jurisdictions have
              not been assessed.
            </p>
          )}
          <ul className="mt-5 divide-y divide-slate-100">
            {metrics.checklist.map((item) => (
              <li key={item.code} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="font-semibold text-slate-600">
                  {item.status.replaceAll('_', ' ').toLowerCase()}
                  {item.reason ? ` · ${item.reason.replaceAll('_', ' ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function AssessmentJourneyPage({ slug }: { slug: string }) {
  const [calculator, setCalculator] = useState<PublicCalculator | null>(null);
  const [config, setConfig] = useState<CalculatorConfig | null>(null);
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [recommendations, setRecommendations] = useState<AssessmentRecommendation[]>([]);
  const [isLeadAssociated, setIsLeadAssociated] = useState(false);
  const [leadDetails, setLeadDetails] = useState({
    email: '',
    firstName: '',
    companyName: '',
    consentMarketing: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCapturingLead, setIsCapturingLead] = useState(false);
  const [isLoadingResult, setIsLoadingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const loadResult = useCallback(async (token: string) => {
    setIsLoadingResult(true);
    try {
      const [assessmentResult, assessmentRecommendations] = await Promise.all([
        fetchAssessmentResult(token),
        fetchAssessmentRecommendations(token),
      ]);
      setResult(assessmentResult);
      setRecommendations(assessmentRecommendations);
    } finally {
      setIsLoadingResult(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      setIsLoading(true);
      setError(null);
      try {
        if (!publicCalculatorSlugs.has(slug)) {
          setIsUnavailable(true);
          return;
        }

        const published = await fetchPublishedCalculators();
        const selectedCalculator = published.find((item) => item.slug === slug);
        if (!selectedCalculator) {
          setIsUnavailable(true);
          return;
        }

        const selectedConfig = await fetchCalculatorConfig(slug);
        if (!active) return;
        setCalculator(selectedCalculator);
        setConfig(selectedConfig);
        setIsUnavailable(
          selectedConfig.questions.length === 0 ||
            selectedConfig.questions.some(
              (question) => !supportedQuestionTypes.has(question.type),
            ),
        );

        const token = window.sessionStorage.getItem(sessionStorageKey(slug));
        if (!token) return;
        try {
          const currentSession = await fetchAssessment(token);
          if (!active) return;
          if (currentSession.calculator.slug !== slug) {
            window.sessionStorage.removeItem(sessionStorageKey(slug));
            return;
          }
          setSessionToken(token);
          setSession(currentSession);
          setDrafts(getDrafts(currentSession));
          setIsLeadAssociated(currentSession.leadAssociated);
          if (currentSession.status === 'COMPLETED' && currentSession.leadAssociated) {
            try {
              await loadResult(token);
            } catch {
              setError(
                'Your email is saved with this assessment, but the result could not be loaded. Please retry.',
              );
            }
          }
        } catch {
          window.sessionStorage.removeItem(sessionStorageKey(slug));
          if (active) {
            setError(
              'Your saved assessment session is no longer available. You can start a new assessment.',
            );
          }
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'We could not load this assessment. Please try again.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [loadResult, slug]);

  const visibleQuestions = useMemo(
    () => session?.questions.filter((question) => question.isVisible) ?? [],
    [session],
  );
  const safeCurrentIndex = Math.min(
    currentIndex,
    Math.max(visibleQuestions.length - 1, 0),
  );
  const currentQuestion = visibleQuestions[safeCurrentIndex];

  async function handleStart() {
    setIsStarting(true);
    setError(null);
    try {
      const started = await startAssessment(slug);
      window.sessionStorage.setItem(
        sessionStorageKey(slug),
        started.sessionToken,
      );
      const currentSession = await fetchAssessment(started.sessionToken);
      setSessionToken(started.sessionToken);
      setSession(currentSession);
      setDrafts(getDrafts(currentSession));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'We could not start this assessment. Please try again.',
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function saveCurrentAnswer(
    validateRequired = true,
  ): Promise<AssessmentSession | null> {
    if (!session || !sessionToken || !currentQuestion) return session;
    const answer = getAnswer(currentQuestion, drafts[currentQuestion.id]);
    const numericDraft = drafts[currentQuestion.id]?.numericValue?.trim();
    if (validateRequired && numericDraft && !answer) {
      const numericRules =
        currentQuestion.validationRules && typeof currentQuestion.validationRules === 'object'
          ? currentQuestion.validationRules as Record<string, unknown>
          : {};
      if (numericDraft && !answer) {
        setError(
          typeof numericRules.minimum === 'number' && Number(numericDraft) < numericRules.minimum
            ? `Enter a value of at least ${numericRules.minimum}.`
            : typeof numericRules.maximum === 'number' && Number(numericDraft) > numericRules.maximum
              ? `Enter a value no greater than ${numericRules.maximum}.`
              : 'Enter a valid number for this question.',
        );
      } else {
        setError('Please answer this question before continuing.');
      }
      return null;
    }
    if (validateRequired && currentQuestion.isRequired && !answer) {
      setError('Please answer this question before continuing.');
      return null;
    }
    if (!answer) return session;

    setIsSaving(true);
    setError(null);
    try {
      await saveAssessmentAnswer(sessionToken, answer);
      const refreshed = await fetchAssessment(sessionToken);
      setSession(refreshed);
      setDrafts((existing) => ({ ...existing, ...getDrafts(refreshed) }));
      return refreshed;
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Your answer could not be saved. Please try again.',
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleNext() {
    const updatedSession = await saveCurrentAnswer();
    if (!updatedSession) return;
    const updatedVisibleQuestions = updatedSession.questions.filter(
      (question) => question.isVisible,
    );
    const updatedIndex = updatedVisibleQuestions.findIndex(
      (question) => question.id === currentQuestion?.id,
    );
    if (updatedIndex >= 0 && updatedIndex < updatedVisibleQuestions.length - 1) {
      setCurrentIndex(updatedIndex + 1);
      return;
    }
    await handleComplete(updatedSession);
  }

  async function handleBack() {
    if (safeCurrentIndex > 0) {
      const updatedSession = await saveCurrentAnswer(false);
      if (!updatedSession) return;
      const updatedVisibleQuestions = updatedSession.questions.filter(
        (question) => question.isVisible,
      );
      const updatedIndex = updatedVisibleQuestions.findIndex(
        (question) => question.id === currentQuestion?.id,
      );
      setCurrentIndex(Math.max(0, updatedIndex - 1));
    }
  }

  async function handleComplete(currentSession: AssessmentSession) {
    if (!sessionToken) return;
    const allRequiredAnswered = currentSession.questions
      .filter((question) => question.isVisible && question.isRequired)
      .every((question) => hasAnswer(currentSession, question.id));
    if (!allRequiredAnswered) {
      setError('Please answer each required question before completing the assessment.');
      return;
    }

    setIsCompleting(true);
    setError(null);
    try {
      await completeAssessment(sessionToken);
      const completedSession = await fetchAssessment(sessionToken);
      setSession(completedSession);
      setIsLeadAssociated(completedSession.leadAssociated);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'We could not complete the assessment. Your saved answers are still available.',
      );
    } finally {
      setIsCompleting(false);
    }
  }

  async function handleCaptureLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !leadDetails.email.trim()) return;
    setIsCapturingLead(true);
    setError(null);
    let leadWasSaved = false;
    try {
      const details: AssessmentLeadDetails = {
        email: leadDetails.email.trim(),
        ...(leadDetails.firstName.trim()
          ? { firstName: leadDetails.firstName.trim() }
          : {}),
        ...(leadDetails.companyName.trim()
          ? { companyName: leadDetails.companyName.trim() }
          : {}),
        consentMarketing: leadDetails.consentMarketing,
      };
      await captureAssessmentLead(sessionToken, details);
      leadWasSaved = true;
      setIsLeadAssociated(true);
      await loadResult(sessionToken);
    } catch (cause) {
      setError(
        leadWasSaved
          ? 'Your email was saved, but we could not load your results. Please retry.'
          : cause instanceof ApiError
          ? cause.message
          : 'Your email could not be submitted. Your answers are saved; please try again.',
      );
    } finally {
      setIsCapturingLead(false);
    }
  }

  async function handleRetryResults() {
    if (!sessionToken) return;
    setError(null);
    try {
      await loadResult(sessionToken);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Your results could not be loaded. Please try again.',
      );
    }
  }

  function updateDraft(
    questionId: string,
    patch: Partial<AnswerDraft>,
  ) {
    setDrafts((existing) => ({
      ...existing,
      [questionId]: { ...existing[questionId], ...patch },
    }));
  }

  function setLeadField(
    field: keyof typeof leadDetails,
    value: string | boolean,
  ) {
    setLeadDetails((details) => ({ ...details, [field]: value }));
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-20">
        <p className="mx-auto max-w-xl text-center text-sm text-slate-600" role="status">
          Loading assessment…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="GoSwiftHR home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#5157FB] to-[#6878FF] text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-extrabold tracking-tight text-slate-900">
              GoSwift<span className="text-[#5157FB]">HR</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#5157FB]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All assessments
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {error && <div className="mb-6"><ErrorNotice message={error} /></div>}

        {isUnavailable ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5157FB]">
              Assessment unavailable
            </p>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
              This assessment is not available to visitors right now.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              It may not have a published question set or may use a question
              format that the current assessment journey cannot safely score.
              No sample questions or results are shown.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#5157FB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4243DA]"
            >
              Return to assessments <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        ) : !calculator || !config ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h1 className="text-xl font-bold">Assessment information is unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              Please return to the homepage and try again.
            </p>
            <Link href="/" className="mt-4 inline-block text-sm font-semibold text-[#5157FB]">
              Return to GoSwiftHR
            </Link>
          </section>
        ) : result ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5157FB]">
                Assessment complete
              </p>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{calculator.name}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your results are based on the responses you provided.
              </p>
              {result.resultType === 'HR_HEALTH_CHECK' && result.overallScore !== null && (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#F5F6FF] p-4">
                    <p className="text-xs font-semibold text-slate-500">Overall assessment</p>
                    <p className="mt-1 text-3xl font-extrabold text-[#4148D8]">
                      {result.overallScore.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">Maturity</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {result.maturityLevel ?? 'Not available'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">Risk level</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {result.riskLevel ?? 'Not available'}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {result.resultType === 'HR_HEALTH_CHECK' &&
              Object.keys(result.categoryScores).length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-lg font-bold">Assessment areas</h2>
                  <div className="mt-5 space-y-5">
                    {Object.values(result.categoryScores).map((category) => (
                      <div key={category.code}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-slate-800">{category.name}</span>
                          <span className="shrink-0 font-bold text-slate-700">
                            {category.percentage.toFixed(1)}% · {category.riskLevel.toLowerCase()} risk
                          </span>
                        </div>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                          role="progressbar"
                          aria-label={`${category.name} assessment score`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={category.percentage}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#5157FB] to-[#3ECFD2]"
                            style={{ width: `${Math.min(100, Math.max(0, category.percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            {result.resultType !== 'HR_HEALTH_CHECK' && (
              <DomainResultPanel result={result} />
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-bold">Recommendations</h2>
              {recommendations.length ? (
                <div className="mt-4 space-y-4">
                  {recommendations.map((recommendation) => (
                    <article
                      key={recommendation.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-900">{recommendation.title}</h3>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                          {recommendation.priority.toLowerCase()} priority
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {recommendation.summary}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {recommendation.actionPlan}
                      </p>
                      {recommendation.serviceLink && (
                        <a
                          href={recommendation.serviceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#5157FB] hover:underline"
                        >
                          Learn more <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  No recommendations were returned for this assessment.
                </p>
              )}
            </section>

            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5157FB] hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Return to the four calculators
            </Link>
          </div>
        ) : session?.status === 'COMPLETED' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5157FB]">
              Assessment complete
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
              Enter your email to view your results
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your answers are saved. We will associate your email with this
              assessment before displaying its results and recommendations.
              Name and company details are optional.
            </p>
            {isLeadAssociated ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
                  Your email has been saved with this assessment. Your results
                  remain protected while they load.
                </p>
                <button
                  type="button"
                  onClick={() => void handleRetryResults()}
                  disabled={isLoadingResult}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5157FB] px-5 py-3 text-sm font-semibold text-white hover:bg-[#4243DA] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingResult ? 'Loading results…' : 'View my results'}
                  {isLoadingResult && (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                </button>
              </div>
            ) : (
              <form onSubmit={handleCaptureLead} className="mt-6 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Email address
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={leadDetails.email}
                    onChange={(event) => setLeadField('email', event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#5157FB] focus:ring-2 focus:ring-[#5157FB]/20"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    First name <span className="font-normal text-slate-500">(optional)</span>
                    <input
                      type="text"
                      maxLength={100}
                      autoComplete="given-name"
                      value={leadDetails.firstName}
                      onChange={(event) => setLeadField('firstName', event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#5157FB] focus:ring-2 focus:ring-[#5157FB]/20"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Company <span className="font-normal text-slate-500">(optional)</span>
                    <input
                      type="text"
                      maxLength={200}
                      autoComplete="organization"
                      value={leadDetails.companyName}
                      onChange={(event) => setLeadField('companyName', event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#5157FB] focus:ring-2 focus:ring-[#5157FB]/20"
                    />
                  </label>
                </div>
                <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                  <input
                    type="checkbox"
                    checked={leadDetails.consentMarketing}
                    onChange={(event) =>
                      setLeadField('consentMarketing', event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#5157FB] focus:ring-[#5157FB]"
                  />
                  <span>
                    I would also like to receive GoSwiftHR product and HR
                    insights by email. This is optional.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={isCapturingLead || isLoadingResult}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5157FB] px-5 py-3 text-sm font-semibold text-white hover:bg-[#4243DA] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCapturingLead ? 'Saving email…' : 'Submit email and view results'}
                  {isCapturingLead && (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                </button>
              </form>
            )}
          </section>
        ) : !session ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5157FB]">
              Published assessment · {config.totalQuestions}{' '}
              {config.totalQuestions === 1 ? 'question' : 'questions'}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold text-slate-900">{calculator.name}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {calculator.description || 'Review your HR practices with this assessment.'}
            </p>
            <div className="mt-6 rounded-xl bg-slate-50 p-5">
              <h2 className="text-sm font-bold text-slate-900">Assessment focus</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {config.categories.map((category) => (
                  <li key={category.id} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#5157FB]" aria-hidden="true" />
                    <span>{category.name}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                You can answer anonymously. Your progress is saved in this
                browser session and on the GoSwiftHR assessment service.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={isStarting}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-[#5157FB] px-5 py-3 text-sm font-semibold text-white hover:bg-[#4243DA] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStarting ? 'Starting…' : 'Start assessment'}
              {isStarting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5157FB]">
                  {calculator.name}
                </p>
                <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
                  Assessment questions
                </h1>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {session.progress.answeredQuestions} of {session.progress.visibleQuestions} answered
              </span>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Progress</span>
                <span>{session.progress.percentage}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Assessment progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={session.progress.percentage}
              >
                <div
                  className="h-full rounded-full bg-[#5157FB] transition-all"
                  style={{ width: `${session.progress.percentage}%` }}
                />
              </div>
            </div>

            {currentQuestion ? (
              <>
                <p className="mt-7 text-xs font-semibold text-slate-500">
                  Question {safeCurrentIndex + 1} of {visibleQuestions.length}
                  {currentQuestion.categoryCode && ` · ${currentQuestion.categoryCode}`}
                  {currentQuestion.isRequired ? ' · Required' : ' · Optional'}
                </p>
                <fieldset className="mt-3">
                  <legend className="text-lg font-bold leading-7 text-slate-900">
                    {currentQuestion.title}
                  </legend>
                  {currentQuestion.helpText && (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {currentQuestion.helpText}
                    </p>
                  )}

                  {(currentQuestion.type === 'SINGLE_CHOICE' ||
                    currentQuestion.type === 'BOOLEAN') && (
                    <div className="mt-5 space-y-3">
                      {currentQuestion.options.map((option) => (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                            drafts[currentQuestion.id]?.selectedOptionId === option.id
                              ? 'border-[#5157FB] bg-[#F5F6FF] ring-1 ring-[#5157FB]'
                              : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            value={option.id}
                            checked={
                              drafts[currentQuestion.id]?.selectedOptionId === option.id
                            }
                            onChange={() =>
                              updateDraft(currentQuestion.id, {
                                selectedOptionId: option.id,
                              })
                            }
                            className="mt-0.5 h-4 w-4 border-slate-300 text-[#5157FB] focus:ring-[#5157FB]"
                          />
                          <span className="text-sm leading-5 text-slate-700">
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {(currentQuestion.type === 'NUMERIC_INPUT' ||
                    currentQuestion.type === 'SLIDER') && (
                    <label className="mt-5 block max-w-sm text-sm font-medium text-slate-700">
                      Your answer
                      <input
                        type="number"
                        inputMode="decimal"
                        min={
                          currentQuestion.validationRules &&
                          typeof currentQuestion.validationRules === 'object' &&
                          typeof (currentQuestion.validationRules as Record<string, unknown>).minimum === 'number'
                            ? (currentQuestion.validationRules as { minimum: number }).minimum
                            : undefined
                        }
                        max={
                          currentQuestion.validationRules &&
                          typeof currentQuestion.validationRules === 'object' &&
                          typeof (currentQuestion.validationRules as Record<string, unknown>).maximum === 'number'
                            ? (currentQuestion.validationRules as { maximum: number }).maximum
                            : undefined
                        }
                        step={
                          currentQuestion.validationRules &&
                          typeof currentQuestion.validationRules === 'object' &&
                          typeof (currentQuestion.validationRules as Record<string, unknown>).step === 'number'
                            ? (currentQuestion.validationRules as { step: number }).step
                            : 'any'
                        }
                        required={currentQuestion.isRequired}
                        value={drafts[currentQuestion.id]?.numericValue ?? ''}
                        onChange={(event) =>
                          updateDraft(currentQuestion.id, {
                            numericValue: event.target.value,
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-[#5157FB] focus:ring-2 focus:ring-[#5157FB]/20"
                      />
                    </label>
                  )}
                </fieldset>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => void handleBack()}
                    disabled={safeCurrentIndex === 0 || isSaving || isCompleting}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </button>
                  <div className="flex items-center gap-3">
                    {isSaving && (
                      <span className="text-xs text-slate-500" role="status">
                        Saving answer…
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleNext()}
                      disabled={isSaving || isCompleting}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#5157FB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4243DA] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCompleting
                        ? 'Preparing results…'
                        : safeCurrentIndex === visibleQuestions.length - 1
                          ? 'Complete assessment'
                          : 'Save and continue'}
                      {isCompleting ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-7 text-sm text-slate-600">
                No questions are currently visible. Please contact GoSwiftHR.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
