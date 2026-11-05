'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Compass,
  HeartPulse,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ApiError,
  fetchPublishedCalculators,
  PublicCalculator,
} from '@/lib/api';

const mainCalculatorSlugs = new Set([
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
const productCalculatorAreas = [
  {
    slug: 'payroll-cost-calculator',
    name: 'Payroll Cost Calculator',
    description: 'Estimate payroll costs in NGN from gross pay, employer-paid amounts, benefits, and processing costs you provide.',
    audience: 'Business owners, finance teams and payroll or HR managers.',
    information: 'Employee count, payroll runs, gross pay, and any employer-paid amounts or payroll expenses you know.',
    outcome: 'A per-run and annualized cost estimate, with unknown components kept separate rather than treated as zero.',
  },
  {
    slug: 'payroll-compliance-calculator',
    name: 'Payroll Compliance Calculator',
    description: 'Review self-reported payroll evidence coverage for Nigeria. This checklist does not determine legal compliance.',
    audience: 'Employers and teams responsible for payroll records and review.',
    information: 'Your primary payroll jurisdiction, whether you operate in multiple jurisdictions, and the evidence statuses you can confirm.',
    outcome: 'A checklist of verified, partial, unverified, and explained not-applicable evidence items. Nigeria only; no legal rules or liability are calculated.',
  },
  {
    slug: 'hr-administrative-cost-calculator',
    name: 'HR Administrative Cost Calculator',
    description: 'Estimate annual HR administration labor, software, and external service costs using your own inputs.',
    audience: 'Business owners and teams responsible for HR operations and finance.',
    information: 'Employees in scope, weekly HR administration hours, loaded hourly labor cost, and annual software or service costs.',
    outcome: 'An annual and monthly cost breakdown. The calculator does not estimate savings or return on investment.',
  },
  {
    slug: 'hr-health-check',
    name: 'SME HR Health Check',
    description: 'Review HR operations, hiring, retention, and people practices using the published assessment questions.',
    audience: 'Small and medium-sized business owners, HR managers, and decision-makers.',
    information: 'Your current HR policies, hiring practices, employee engagement activities, and operational processes.',
    outcome: 'An assessment summary, category results, and recommendations returned by the GoSwiftHR assessment engine.',
  },
];

function calculatorIcon(slug: string) {
  if (slug.includes('compliance')) return ShieldCheck;
  if (slug.includes('health')) return HeartPulse;
  if (slug.includes('payroll-cost')) return BriefcaseBusiness;
  return Compass;
}

function isSupported(calculator: PublicCalculator): boolean {
  return (
    calculator.totalQuestions > 0 &&
    calculator.questionTypes.every((type) => supportedQuestionTypes.has(type))
  );
}

export default function HomePage() {
  const [calculators, setCalculators] = useState<PublicCalculator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalculators = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const published = await fetchPublishedCalculators();
      setCalculators(
        published.filter((calculator) => mainCalculatorSlugs.has(calculator.slug)),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'We could not load the available assessments. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCalculators(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCalculators]);

  const calculatorsBySlug = new Map(
    calculators.map((calculator) => [calculator.slug, calculator]),
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#080A15] text-white selection:bg-[#5157FB] selection:text-white">
      <div className="pointer-events-none absolute left-1/4 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-indigo-900/20 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-[30rem] h-[30rem] w-[30rem] rounded-full bg-sky-900/15 blur-[140px]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="GoSwiftHR home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#5157FB] to-[#6878FF] shadow-[0_2px_12px_rgba(81,87,251,0.45)]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            GoSwift<span className="text-[#6878FF]">HR</span>
          </span>
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-[#303954] bg-[#12172A] px-4 py-2.5 text-sm font-semibold text-[#C7D2FE] transition hover:border-[#6878FF] hover:text-white"
        >
          Administrator sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#303954] bg-[#12172A]/80 px-3.5 py-2 text-xs font-semibold text-[#C7D2FE]">
            <span className="h-2 w-2 rounded-full bg-[#3ECFD2]" />
            HR intelligence built around your real operations
          </div>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            See where your HR operations can work{' '}
            <span className="bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#3ECFD2] bg-clip-text text-transparent">
              better.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            GoSwiftHR Intelligence helps business owners and HR teams assess
            their people operations, spot administrative weaknesses and risks,
            and find practical opportunities to improve.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
            {[
              'Evaluate HR operations',
              'Understand efficiency and performance',
              'Get assessment-based recommendations',
            ].map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-[#27304A] bg-[#111729]/80 px-3.5 py-2"
              >
                <CheckCircle2 className="h-4 w-4 text-[#3ECFD2]" aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="rounded-3xl border border-[#293452] bg-gradient-to-br from-[#151D35] to-[#0D1222] p-6 shadow-[0_24px_100px_rgba(49,67,145,0.24)] sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5157FB]/15 text-[#9BA8FF]">
                <Compass className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">A clearer view of your people operations</p>
                <p className="mt-1 text-xs text-slate-400">Start with an assessment that fits your needs</p>
              </div>
            </div>
            <div className="mt-7 space-y-3">
              {[
                ['Assess', 'Answer focused questions about your HR practices.'],
                ['Understand', 'Review the results generated from your responses.'],
                ['Improve', 'Explore recommendations returned by the assessment.'],
              ].map(([title, detail], index) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-2xl border border-[#252E48] bg-[#0A1020]/70 p-4"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5157FB]/20 text-xs font-bold text-[#B9C1FF]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <a
              href="#assessments"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#A5B4FC] hover:text-white"
            >
              Explore available assessments
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <div className="pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 rounded-full bg-[#5157FB]/15 blur-3xl" />
        </div>
      </section>

      <section
        id="assessments"
        className="relative z-10 border-y border-[#1F2940] bg-[#0C1120]/85 px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-9 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7C8BFA]">
                Start here
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Four focused HR calculators
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Choose the assessment that matches your needs. Available journeys
                use published backend questions and save your answers as you go.
                Calculators without a published configuration are clearly marked
                as coming soon.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadCalculators()}
                className="inline-flex shrink-0 items-center gap-2 self-start font-semibold hover:text-white sm:self-auto"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          )}

          {isLoading ? (
            <div
              className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
              aria-label="Loading available assessments"
              aria-busy="true"
            >
              {productCalculatorAreas.map((area) => (
                <div
                  key={area.slug}
                  className="h-[24rem] animate-pulse rounded-2xl border border-[#252E48] bg-[#111729]"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {productCalculatorAreas.map((area) => {
                const calculator = calculatorsBySlug.get(area.slug);
                const Icon = calculatorIcon(area.slug);
                const available = calculator ? isSupported(calculator) : false;
                const displayName =
                  calculator?.name || area.name;
                const topics = calculator?.questionTopics.slice(0, 3) || [];
                const availabilityLabel = error
                  ? 'Availability unavailable'
                  : available
                    ? 'Available now'
                    : calculator
                      ? 'Assessment unavailable'
                      : 'Coming soon';
                return (
                  <article
                    key={area.slug}
                    className="flex min-h-[26rem] flex-col rounded-2xl border border-[#27304A] bg-gradient-to-b from-[#151B2D] to-[#101525] p-6 transition hover:-translate-y-1 hover:border-[#5157FB]/60 hover:shadow-[0_18px_50px_rgba(81,87,251,0.12)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#5157FB]/25 bg-[#5157FB]/10 text-[#A5B4FC]">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="rounded-full border border-[#33405D] bg-[#0B1120] px-3 py-1 text-xs font-semibold text-slate-300">
                        {availabilityLabel}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-bold leading-snug text-white">
                      {displayName}
                    </h3>
                    <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
                      {calculator?.description || area.description}
                    </p>

                    <div className="mt-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#A5B4FC]">
                          Who should use it
                        </p>
                        <p className="mt-1.5 text-sm leading-5 text-slate-300">
                          {area.audience}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#A5B4FC]">
                          What to have ready
                        </p>
                        <p className="mt-1.5 text-sm leading-5 text-slate-300">
                          {area.information}
                        </p>
                      </div>
                      {topics.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-[#A5B4FC]">
                            Published question topics
                          </p>
                          <ul className="mt-1.5 space-y-1 text-sm leading-5 text-slate-300">
                            {topics.map((topic) => (
                              <li key={topic} className="line-clamp-2">
                                · {topic}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#A5B4FC]">
                          What you’ll get
                        </p>
                        <p className="mt-1.5 text-sm leading-5 text-slate-300">{area.outcome}</p>
                      </div>
                    </div>

                    <div className="mt-auto pt-6">
                      {available && calculator && !error ? (
                        <Link
                          href={`/assessments/${encodeURIComponent(area.slug)}`}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5157FB] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#4243DA] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC] focus:ring-offset-2 focus:ring-offset-[#101525]"
                        >
                          Start assessment
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full cursor-not-allowed rounded-xl border border-[#303954] bg-[#171D2D] px-4 py-3 text-sm font-semibold text-slate-500"
                          title={
                            error
                              ? 'Availability could not be confirmed.'
                              : calculator
                                ? 'This assessment configuration is incomplete.'
                                : 'This calculator does not have a published configuration yet.'
                          }
                        >
                          {error
                            ? 'Try again later'
                            : calculator
                              ? 'Assessment unavailable'
                              : 'Coming soon'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-6 text-xs leading-5 text-slate-500">
            Only published, supported journeys can be started. Existing assessments that do not
            match these four product areas are not listed here.
          </p>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>GoSwiftHR Intelligence — practical insight for better HR operations.</p>
        <Link href="/login" className="font-semibold text-slate-400 hover:text-white">
          Administrator sign in
        </Link>
      </footer>
    </main>
  );
}
