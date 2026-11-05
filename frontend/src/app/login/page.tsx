'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';
import {
  AdminAuthProvider,
  useAdminAuth,
} from '@/components/auth/AdminAuthProvider';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, error: sessionError, login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestedDestination = searchParams.get('next');
  const destination =
    requestedDestination?.startsWith('/control-panel') &&
    !requestedDestination.startsWith('//')
      ? requestedDestination
      : '/control-panel';

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(destination);
    }
  }, [destination, router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.replace(destination);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Sign-in failed. Check your details and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#080A15] px-4 py-10 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-[#5157FB] to-[#6878FF]">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            GoSwift<span className="text-[#6878FF]">HR</span>
          </span>
        </Link>

        <section className="rounded-2xl border border-[#232F55] bg-[#0F1424] p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-[#5157FB]/15 text-[#899EFF]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold">Administrator sign in</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sign in with your GoSwiftHR administrator account to access the control panel.
          </p>

          {(error || sessionError) && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200"
            >
              {error || `Session verification is unavailable: ${sessionError}`}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-200">
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#303954] bg-[#080A15] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[#6878FF] focus:ring-2 focus:ring-[#5157FB]/25"
              />
            </label>

            <label className="block text-sm font-medium text-slate-200">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#303954] bg-[#080A15] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[#6878FF] focus:ring-2 focus:ring-[#5157FB]/25"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || status === 'loading'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#5157FB] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4243DA] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="text-slate-300 hover:text-white">
            Return to GoSwiftHR
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <AdminAuthProvider>
      <Suspense fallback={<div className="min-h-screen bg-[#080A15]" />}>
        <LoginForm />
      </Suspense>
    </AdminAuthProvider>
  );
}
