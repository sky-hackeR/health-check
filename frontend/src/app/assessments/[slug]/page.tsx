import { Suspense } from 'react';
import AssessmentJourney from '@/components/assessment/AssessmentJourney';

async function AssessmentRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AssessmentJourney slug={slug} />;
}

export default function AssessmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-5 py-20">
          <p className="mx-auto max-w-xl text-center text-sm text-slate-600">
            Loading assessment…
          </p>
        </main>
      }
    >
      <AssessmentRoute params={params} />
    </Suspense>
  );
}
