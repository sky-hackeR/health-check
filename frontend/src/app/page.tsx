import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Activity, Database, Server, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col justify-between bg-[#080A15] text-white selection:bg-[#5157FB] selection:text-white relative overflow-hidden">
      {/* Ambient Radial Glows (matching goswifthr.com) */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[600px] h-[500px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-0 w-[500px] h-[400px] bg-sky-900/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5157FB] to-[#6878FF] flex items-center justify-center shrink-0 shadow-[0_2px_12px_rgba(81,87,251,0.45)]">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white">
            GoSwift<span className="text-[#6878FF]">HR</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/control-panel"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-[#A5B4FC] bg-[#12172A] border border-[#232F55] hover:bg-[#1A2242] hover:text-white transition-all shadow-xs"
          >
            <Activity className="w-3.5 h-3.5 text-[#6878FF]" />
            <span>Go to dashboard</span>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-4xl mx-auto">
        {/* Release / Feature Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#12172A]/80 border border-[#232F55] text-xs mb-8 shadow-xs backdrop-blur-sm">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#5157FB] text-white uppercase tracking-wider">
            NEW
          </span>
          <span className="text-slate-300">People analytics, now with workforce assessment & ROI forecasting</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Every part of HR. One <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-[#38BDF8] via-[#60A5FA] to-[#3ECFD2] bg-clip-text text-transparent">
            intelligent platform.
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto mb-8 font-normal leading-relaxed">
          GoSwiftHR brings hiring, onboarding, payroll, leave, performance and analytics into a single system — with the speed and polish that enterprise HR software forgot about.
        </p>

        {/* Interactive AI Prompt Simulator */}
        <div className="w-full max-w-xl mx-auto mb-10 p-1 rounded-2xl bg-gradient-to-r from-[#1E2749]/80 to-[#151D36]/80 border border-[#232F55] shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#0B0F19]/90 text-sm text-left">
            <div className="w-6 h-6 rounded-lg bg-[#5157FB]/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[#899EFF]" />
            </div>
            <span className="text-slate-300 font-mono text-xs truncate">
              The AI inside it answers &ldquo;<span className="text-[#38BDF8]">who is due for review this quarter?</span>&rdquo;
            </span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <Link
            href="/control-panel"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-[#5157FB] hover:bg-[#4243DA] text-white font-bold text-sm transition-all duration-200 shadow-[0_4px_22px_rgba(81,87,251,0.45)] hover:scale-[1.02]"
          >
            <span>Open Intelligence Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="http://localhost:3001/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#12172A] hover:bg-[#1A2242] text-slate-200 font-semibold text-sm border border-[#232F55] transition-colors"
          >
            <Server className="w-4 h-4 text-[#899EFF]" />
            <span>Swagger API Specs</span>
          </a>
        </div>

        <p className="text-xs text-slate-500 flex items-center gap-4 font-medium">
          <span>✓ 14-day free trial</span>
          <span>✓ No card required</span>
          <span>✓ Live in under an hour</span>
        </p>
      </div>

      {/* Architecture Cards Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-8 border-t border-[#1E2438]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#0F1424] border border-[#1E2438] text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Frontend App</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white">Next.js 16 App Router</p>
            <p className="text-xs text-slate-500 mt-0.5">Control panel & public UI (Port 3000)</p>
          </div>

          <div className="p-4 rounded-xl bg-[#0F1424] border border-[#1E2438] text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Backend Engine</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white">NestJS Modular Core</p>
            <p className="text-xs text-slate-500 mt-0.5">REST APIs & Intelligence (Port 3001)</p>
          </div>

          <div className="p-4 rounded-xl bg-[#0F1424] border border-[#1E2438] text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Database & ORM</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white">PostgreSQL + Prisma</p>
            <p className="text-xs text-slate-500 mt-0.5">25 Relational Models (Port 5432)</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
