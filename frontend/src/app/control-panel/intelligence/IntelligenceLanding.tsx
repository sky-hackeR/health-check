"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, CircleAlert, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  AdminCompanyPainPoint,
  fetchColdEmailTemplates,
  fetchCompanyPainPoints,
  fetchIntelligenceVersions,
} from "@/lib/api";

type Summary = {
  scoringCategories: number;
  activePainPoints: number;
  emailTemplates: number;
  recentPainPoints: AdminCompanyPainPoint[];
};

const areas = [
  { href: "/control-panel/intelligence/scoring-rules", title: "Scoring & Assessment", description: "See how the SME HR Health Check turns configured answers into category scores, maturity levels and recommendations.", icon: Activity, action: "Explore assessment scoring" },
  { href: "/control-panel/intelligence/pain-points", title: "Company Pain Points", description: "Maintain verified operational findings and understand the assessment evidence that can trigger each one.", icon: CircleAlert, action: "Manage pain points" },
  { href: "/control-panel/intelligence/cold-emails", title: "Email Templates", description: "Prepare reusable, personalized outreach drafts from real company and assessment context. Nothing is sent automatically.", icon: Mail, action: "Open email templates" },
  { href: "/control-panel/intelligence/how-it-works", title: "How Intelligence Works", description: "Follow the real path from an assessment answer to a business finding and a meaningful next step.", icon: BrainCircuit, action: "View the workflow" },
];

export default function IntelligenceLanding() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchIntelligenceVersions(),
      fetchCompanyPainPoints(),
      fetchColdEmailTemplates({ limit: 1 }),
    ]).then(([versions, painPoints, emails]) => {
      const publishedHealthCheck = versions.find(
        (version) => version.isPublished && version.calculator.slug === "hr-health-check",
      );
      setSummary({
        scoringCategories: publishedHealthCheck?.scoreCategories.length ?? 0,
        activePainPoints: painPoints.filter((point) => point.isActive && point.publishedAt).length,
        emailTemplates: emails.total,
        recentPainPoints: painPoints.filter((point) => point.publishedAt).slice(0, 3),
      });
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Intelligence information could not be loaded.");
    });
  }, []);

  return <div className="space-y-7">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#073634] via-[#0D5C58] to-[#0A192F] p-7 text-white shadow-xl sm:p-10">
      <div className="max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-emerald-100"><Sparkles className="h-4 w-4" /> GoSwiftHR Intelligence</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Turn assessment evidence into better business conversations.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-teal-50">Understand assessment results, discover company problems and prepare meaningful business conversations. Every finding is grounded in configured assessment evidence—not guesses.</p>
      </div>
    </section>
    <PageHeader title="Intelligence overview" subtitle="A clear view of how GoSwiftHR interprets assessments and supports the next conversation." />
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : <div className="grid gap-4 sm:grid-cols-3">
      <SummaryCard label="HR Health Check categories" value={summary?.scoringCategories} detail="Configured in the current published assessment" />
      <SummaryCard label="Active pain points" value={summary?.activePainPoints} detail="Published mappings available for detection" />
      <SummaryCard label="Email templates" value={summary?.emailTemplates} detail="Reusable outreach drafts in the library" />
    </div>}
    <div className="grid gap-5 md:grid-cols-2">{areas.map(({ href, title, description, icon: Icon, action }) => <Link key={title} href={href} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0D5C58] hover:shadow-md"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-[#0D5C58]"><Icon className="h-5 w-5" /></div><h2 className="mt-5 text-xl font-bold text-[#0A192F]">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{description}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#0D5C58]">{action}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></Link>)}</div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="font-bold text-[#0A192F]">Recently configured pain points</h2><p className="mt-1 text-sm text-slate-600">Published mappings available to evaluate completed assessments.</p></div><Link href="/control-panel/intelligence/pain-points" className="text-sm font-semibold text-[#0D5C58]">View library</Link></div>{summary?.recentPainPoints.length ? <div className="mt-4 grid gap-3 md:grid-cols-3">{summary.recentPainPoints.map((point) => <article key={point.id} className="rounded-xl bg-slate-50 p-4"><p className="font-semibold text-[#0A192F]">{point.title}</p><p className="mt-1 text-sm text-slate-600">{point.calculatorSlug.replaceAll("-", " ")}</p><p className="mt-3 text-xs font-semibold text-[#0D5C58]">{point.priority} priority</p></article>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No published pain-point mappings are available yet. Add one only when a verified assessment question and supported trigger exist.</p>}</section>
    <Link href="/control-panel/intelligence/advanced" className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><span><span className="font-bold">Advanced Configuration / Danger Zone</span><span className="mt-1 block text-sm">Versioned scoring, recommendation and configuration controls for authorized administrators.</span></span><ShieldCheck className="h-6 w-6" /></Link>
  </div>;
}

function SummaryCard({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-[#073634]">{value === undefined ? "—" : value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></article>;
}
