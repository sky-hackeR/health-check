'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  AdminCalculatorQuestionInput,
  AdminCalculatorVersion,
  archiveAdminCalculatorQuestion,
  createAdminCalculatorDraft,
  createAdminCalculatorQuestion,
  fetchAdminCalculatorVersions,
  publishAdminCalculatorVersion,
  previewAdminCalculatorEvaluation,
  reorderAdminCalculatorQuestions,
  updateAdminCalculatorQuestion,
  validateAdminCalculatorVersion,
} from '@/lib/api';

type WorkspaceMode = 'questions' | 'logic' | 'history' | 'preview';
type QuestionOption = AdminCalculatorQuestionInput['options'][number];
type FormState = AdminCalculatorQuestionInput & { id?: string };

const questionTypes = ['SINGLE_CHOICE', 'BOOLEAN', 'NUMERIC_INPUT', 'SLIDER'] as const;
const conditionOperators = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'CONTAINS',
  'NOT_CONTAINS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
] as const;

const emptyForm = (): FormState => ({
  code: '',
  title: '',
  helpText: '',
  type: 'SINGLE_CHOICE',
  isRequired: true,
  isActive: true,
  weight: 1,
  validationRules: {},
  options: [{ label: '', value: '', scoreValue: 0 }],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function displayCondition(value: unknown): string {
  if (!isRecord(value)) return 'Always visible';
  if (value.operator === 'AND' || value.operator === 'OR') {
    const conditions = Array.isArray(value.conditions) ? value.conditions : [];
    const groups = Array.isArray(value.groups) ? value.groups : [];
    const parts = [...conditions, ...groups].map(displayCondition);
    return parts.length ? parts.join(value.operator === 'AND' ? ' and ' : ' or ') : 'Always visible';
  }
  const code = typeof value.questionCode === 'string' ? value.questionCode : 'question';
  const operator = typeof value.operator === 'string' ? value.operator.replaceAll('_', ' ').toLowerCase() : 'matches';
  const target = value.value === undefined ? '' : ` “${String(value.value)}”`;
  return `${code} ${operator}${target}`;
}

function evaluationExplanation(
  slug: string,
  question: AdminCalculatorVersion['questions'][number],
  categories: AdminCalculatorVersion['scoreCategories'],
): string {
  if (slug === 'hr-health-check') {
    const category = categories.find((item) => item.id === question.scoreCategoryId);
    return category
      ? `This answer contributes to the configured ${category.name} assessment category. Its configured option mapping and category weight are applied by the HR Health Check scoring engine.`
      : 'This question is not currently mapped to a scoring category and cannot be published until it is mapped.';
  }
  if (slug === 'payroll-compliance-calculator') {
    return 'This answer is evaluated as self-reported payroll-process evidence. It contributes to evidence coverage, not a legal compliance verdict or maturity score.';
  }
  return `This answer is used by the ${slug === 'payroll-cost-calculator' ? 'payroll cost' : 'HR administrative cost'} calculation engine as the configured input “${question.calculationKey || question.code}”. It affects the estimate, not a maturity score.`;
}

function parseSingleCondition(value: unknown) {
  if (!isRecord(value) || typeof value.questionCode !== 'string' || typeof value.operator !== 'string') {
    return null;
  }
  if (!conditionOperators.some((operator) => operator === value.operator)) return null;
  return {
    questionCode: value.questionCode,
    operator: value.operator,
    value: value.value === undefined ? '' : String(value.value),
  };
}

export function CalculatorConfigurationWorkspace({
  slug,
  mode,
}: {
  slug: string;
  mode: WorkspaceMode;
}) {
  const [versions, setVersions] = useState<AdminCalculatorVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [form, setForm] = useState<FormState | null>(null);
  const [conditionDraft, setConditionDraft] = useState({ enabled: false, questionCode: '', operator: 'EQUALS', value: '' });
  const [preserveComplexCondition, setPreserveComplexCondition] = useState(false);
  const [previewQuestionId, setPreviewQuestionId] = useState('');
  const [previewAnswer, setPreviewAnswer] = useState('');
  const [simulationAnswers, setSimulationAnswers] = useState<Record<string, string>>({});
  const [simulationResult, setSimulationResult] = useState<Awaited<ReturnType<typeof previewAdminCalculatorEvaluation>> | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedVersion = versions.find((version) => version.id === versionId);
  const isDraft = Boolean(selectedVersion && !selectedVersion.isPublished && !selectedVersion.publishedAt);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminCalculatorVersions(slug);
      setVersions(rows);
      setVersionId((current) =>
        rows.some((item) => item.id === current)
          ? current
          : rows.find((item) => !item.isPublished && !item.publishedAt)?.id ?? rows[0]?.id ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Calculator versions could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleQuestions = useMemo(() => {
    const questions = selectedVersion?.questions ?? [];
    return questions.filter((question) => {
      const matchesSearch = `${question.code} ${question.title}`.toLowerCase().includes(search.toLowerCase());
      const matchesType = !typeFilter || question.type === typeFilter;
      const matchesActive = activeFilter === 'all' ||
        (activeFilter === 'active' ? question.isActive : !question.isActive);
      return matchesSearch && matchesType && matchesActive;
    }).sort((left, right) => left.orderIndex - right.orderIndex);
  }, [activeFilter, search, selectedVersion, typeFilter]);

  function startEditing(question?: AdminCalculatorVersion['questions'][number]) {
    setError(null);
    setValidationErrors([]);
    if (!question) {
      const next = emptyForm();
      next.orderIndex = selectedVersion?.questions.length ?? 0;
      setForm(next);
      setConditionDraft({ enabled: false, questionCode: '', operator: 'EQUALS', value: '' });
      setPreserveComplexCondition(false);
      return;
    }
    const single = parseSingleCondition(question.displayConditions);
    const hasLogic = question.displayConditions !== null && question.displayConditions !== undefined;
    setForm({
      id: question.id,
      code: question.code,
      title: question.title,
      helpText: question.helpText,
      type: question.type,
      orderIndex: question.orderIndex,
      weight: question.weight,
      isRequired: question.isRequired,
      isActive: question.isActive,
      calculationKey: question.calculationKey,
      validationRules: question.validationRules ?? {},
      defaultValue: question.defaultValue,
      displayConditions: question.displayConditions,
      scoreCategoryId: question.scoreCategoryId,
      options: question.options.map(({ label, value, orderIndex, scoreValue }) => ({
        label,
        value,
        orderIndex,
        scoreValue,
      })),
    });
    setConditionDraft({
      enabled: Boolean(single),
      questionCode: single?.questionCode ?? '',
      operator: single?.operator ?? 'EQUALS',
      value: single?.value ?? '',
    });
    setPreserveComplexCondition(hasLogic && !single);
  }

  function openEditor(question?: AdminCalculatorVersion['questions'][number]) {
    startEditing(question);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function changeType(type: string) {
    if (!form) return;
    const numeric = type === 'NUMERIC_INPUT' || type === 'SLIDER';
    setForm({
      ...form,
      type,
      options: numeric ? [] : form.options.length ? form.options : [{ label: '', value: '', scoreValue: 0 }],
    });
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    if (!form) return;
    setField('options', form.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, ...patch } : option,
    ));
  }

  async function createDraft(sourceVersionId: string) {
    setBusy(true);
    setError(null);
    try {
      const draft = await createAdminCalculatorDraft(slug, sourceVersionId);
      setVersionId(draft.id);
      setNotice(`Draft version ${draft.versionNumber} created. Published versions remain unchanged.`);
      await load();
      setVersionId(draft.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A calculator draft could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function buildInput(): AdminCalculatorQuestionInput {
    if (!form) throw new Error('Question editor is closed.');
    const rules = form.type === 'NUMERIC_INPUT' || form.type === 'SLIDER'
      ? {
          ...(isRecord(form.validationRules) && typeof form.validationRules.minimum === 'number'
            ? { minimum: form.validationRules.minimum } : {}),
          ...(isRecord(form.validationRules) && typeof form.validationRules.maximum === 'number'
            ? { maximum: form.validationRules.maximum } : {}),
          ...(isRecord(form.validationRules) && typeof form.validationRules.step === 'number'
            ? { step: form.validationRules.step } : {}),
        }
      : undefined;
    const condition = preserveComplexCondition
      ? form.displayConditions
      : conditionDraft.enabled
        ? {
            questionCode: conditionDraft.questionCode,
            operator: conditionDraft.operator,
            ...(conditionDraft.value ? { value: conditionDraft.value } : {}),
          }
        : null;
    const numericDefault = form.defaultValue;
    return {
      ...form,
      ...(form.type === 'NUMERIC_INPUT' || form.type === 'SLIDER'
        ? {
            validationRules: rules,
            defaultValue: numericDefault === '' || numericDefault === undefined
              ? undefined
              : Number(numericDefault),
          }
        : {
            validationRules: undefined,
            defaultValue: numericDefault || undefined,
          }),
      displayConditions: condition,
      options: form.options.filter((option) => option.label.trim() && option.value.trim()),
    };
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !selectedVersion || !isDraft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input = buildInput();
      if (form.id) await updateAdminCalculatorQuestion(form.id, input);
      else await createAdminCalculatorQuestion(selectedVersion.id, input);
      setForm(null);
      setNotice('Question draft saved.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Question could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function validateDraft() {
    if (!selectedVersion) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await validateAdminCalculatorVersion(selectedVersion.id);
      setValidationErrors(result.errors);
      if (result.valid) setNotice('Configuration validation passed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Configuration validation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selectedVersion || !isDraft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await validateAdminCalculatorVersion(selectedVersion.id);
      setValidationErrors(result.errors);
      if (!result.valid) {
        setError('Fix the configuration validation errors before publishing.');
        return;
      }
      if (!window.confirm(`Publish calculator version ${selectedVersion.versionNumber}? New assessments will use it.`)) return;
      await publishAdminCalculatorVersion(selectedVersion.id);
      setNotice(`Version ${selectedVersion.versionNumber} published.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Calculator version could not be published.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(question: AdminCalculatorVersion['questions'][number]) {
    if (
      question.isActive &&
      !window.confirm(`Disable “${question.title}” in this draft? Published history will not change.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (question.isActive) {
        await archiveAdminCalculatorQuestion(question.id);
      } else {
        await updateAdminCalculatorQuestion(question.id, {
        code: question.code,
        title: question.title,
        helpText: question.helpText,
        type: question.type,
        orderIndex: question.orderIndex,
        weight: question.weight,
        isRequired: question.isRequired,
        isActive: !question.isActive,
        calculationKey: question.calculationKey,
        validationRules: question.validationRules,
        defaultValue: question.defaultValue,
        displayConditions: question.displayConditions,
        scoreCategoryId: question.scoreCategoryId,
        options: question.options.map(({ label, value, orderIndex, scoreValue }) => ({
          label,
          value,
          orderIndex,
          scoreValue,
        })),
        });
      }
      setNotice(question.isActive ? 'Question disabled in the draft.' : 'Question enabled in the draft.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Question status could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(question: AdminCalculatorVersion['questions'][number]) {
    if (!selectedVersion) return;
    const baseCode = `${question.code.slice(0, 55)}_COPY`;
    const existing = new Set(selectedVersion.questions.map((item) => item.code));
    let code = baseCode;
    let suffix = 2;
    while (existing.has(code)) {
      code = `${baseCode.slice(0, 60)}_${suffix++}`;
    }
    setBusy(true);
    setError(null);
    try {
      await createAdminCalculatorQuestion(selectedVersion.id, {
        code,
        title: `${question.title} (copy)`,
        helpText: question.helpText,
        type: question.type,
        orderIndex: selectedVersion.questions.length,
        weight: question.weight,
        isRequired: question.isRequired,
        isActive: false,
        calculationKey: slug === 'hr-health-check' ? null : question.calculationKey,
        validationRules: question.validationRules,
        defaultValue: question.defaultValue,
        displayConditions: question.displayConditions,
        scoreCategoryId: question.scoreCategoryId,
        options: question.options.map(({ label, value, scoreValue }) => ({
          label,
          value,
          scoreValue,
        })),
      });
      setNotice('Disabled question duplicate added to the draft for editing.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Question could not be duplicated.');
    } finally {
      setBusy(false);
    }
  }

  async function reorder(question: AdminCalculatorVersion['questions'][number], direction: -1 | 1) {
    if (!selectedVersion) return;
    const ordered = [...selectedVersion.questions].sort((a, b) => a.orderIndex - b.orderIndex);
    const index = ordered.findIndex((item) => item.id === question.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy(true);
    setError(null);
    try {
      await reorderAdminCalculatorQuestions(selectedVersion.id, ordered.map((item) => item.id));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Question order could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function runSimulation() {
    if (!selectedVersion) return;
    setBusy(true);
    setError(null);
    try {
      type SimulationAnswerItem = { questionId: string; selectedOptionId?: string; numericValue?: number };
      const answers: SimulationAnswerItem[] =
        selectedVersion.questions.flatMap<SimulationAnswerItem>((question) => {
        const value = simulationAnswers[question.id];
        if (value === undefined || value === '') return [];
        if (question.type === 'NUMERIC_INPUT' || question.type === 'SLIDER') {
          const numericValue = Number(value);
          return Number.isFinite(numericValue) ? [{ questionId: question.id, numericValue }] : [];
        }
        return [{ questionId: question.id, selectedOptionId: value }];
      });
      setSimulationResult(await previewAdminCalculatorEvaluation(slug, { versionId: selectedVersion.id, answers }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The evaluation preview could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  const currentQuestion = selectedVersion?.questions.find((question) => question.id === previewQuestionId);

  if (loading) return <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Loading configuration history…</p>;
  if (error && !versions.length) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-white p-4">
        <label className="grid gap-1 text-sm font-medium">Configuration version
          <select value={versionId} onChange={(event) => { setVersionId(event.target.value); setValidationErrors([]); }} className="rounded-lg border border-slate-300 px-3 py-2">
            {versions.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber} · {version.isPublished ? 'Published' : version.publishedAt ? 'Historical' : 'Draft'}</option>)}
          </select>
        </label>
        {selectedVersion && <div className="flex flex-wrap gap-2">
          {!isDraft && <button type="button" disabled={busy} onClick={() => void createDraft(selectedVersion.id)} className="rounded-lg bg-goswift-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create draft from this version</button>}
          {isDraft && mode !== 'history' && <>
            <button type="button" disabled={busy} onClick={() => void validateDraft()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Validate configuration</button>
            <button type="button" disabled={busy} onClick={() => void publishDraft()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish</button>
          </>}
        </div>}
      </div>
      {validationErrors.length > 0 && <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-4 pl-8 text-sm text-amber-900">{validationErrors.map((item) => <li key={item}>{item}</li>)}</ul>}

      {mode === 'history' ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Configuration history</h2>
          <div className="mt-4 divide-y">{versions.map((version) => <article key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">Version {version.versionNumber} <StatusBadge status={version.isPublished ? 'COMPLETED' : version.publishedAt ? 'ARCHIVED' : 'PENDING'} label={version.isPublished ? 'Published' : version.publishedAt ? 'Historical' : 'Draft'} /></p><p className="mt-1 text-xs text-slate-500">{version.publishedAt ? new Date(version.publishedAt).toLocaleString() : 'Not published'} · {version.questions.length} questions</p><p className="text-xs text-slate-500">{version.changelog || 'No change note'}</p></div><div className="flex gap-2"><button type="button" onClick={() => setVersionId(version.id)} className="rounded border px-3 py-1.5 text-xs">Inspect</button>{(version.isPublished || version.publishedAt) && <button type="button" disabled={busy} onClick={() => void createDraft(version.id)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">Restore into draft</button>}</div></article>)}</div>
        </section>
      ) : mode === 'preview' ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Evaluation preview</h2>
          <p className="mt-1 text-sm text-slate-600">Choose sample answers and run the authoritative backend evaluation. This is a simulation: it does not create an assessment, lead, result, pain point, or configuration change.</p>
          <div className="mt-5 space-y-4">
            {(selectedVersion?.questions ?? []).filter((question) => question.isActive).map((question) => <label key={question.id} className="grid gap-1 rounded-lg border p-3 text-sm"><span className="font-medium">{question.title}</span><span className="text-xs text-slate-500">{question.helpText || 'No additional guidance configured.'}</span>{question.type === 'NUMERIC_INPUT' || question.type === 'SLIDER' ? <input type="number" value={simulationAnswers[question.id] ?? ''} onChange={(event) => setSimulationAnswers((current) => ({ ...current, [question.id]: event.target.value }))} className="rounded border px-3 py-2" /> : <select value={simulationAnswers[question.id] ?? ''} onChange={(event) => setSimulationAnswers((current) => ({ ...current, [question.id]: event.target.value }))} className="rounded border px-3 py-2"><option value="">No simulated answer</option>{question.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}</label>)}
          </div>
          <button type="button" onClick={() => void runSimulation()} disabled={busy || !selectedVersion} className="mt-5 rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Evaluating…' : 'Run safe evaluation preview'}</button>
          {simulationResult && <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4"><p className="font-semibold text-teal-950">Simulated result</p><p className="mt-1 text-sm text-teal-900">{simulationResult.notice}</p><pre className="mt-3 max-h-80 overflow-auto rounded bg-white p-3 text-xs">{JSON.stringify(simulationResult.result, null, 2)}</pre><div className="mt-3 space-y-2">{simulationResult.answers.map((answer) => <p key={answer.questionId} className="text-sm"><span className="font-medium">{answer.question}:</span> {answer.answer ?? 'No answer'} — {answer.evaluation}</p>)}</div>{simulationResult.recommendations.length > 0 && <div className="mt-3"><p className="font-medium">Recommendations</p>{simulationResult.recommendations.map((item) => <p key={item.title} className="text-sm">{item.title}: {item.summary}</p>)}</div>}</div>}
        </section>
      ) : mode === 'logic' ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Question logic</h2>
          <p className="mt-1 text-sm text-slate-500">Visibility is evaluated against saved answers. Unknown or unanswered values do not trigger equality conditions.</p>
          <div className="mt-4 space-y-2">{(selectedVersion?.questions ?? []).sort((a, b) => a.orderIndex - b.orderIndex).map((question) => <article key={question.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{question.orderIndex + 1}. {question.title}</p><p className="mt-1 text-xs text-slate-500">{question.code}</p><p className="mt-2 text-sm">Visibility: {displayCondition(question.displayConditions)}</p>{question.calculationKey && <p className="mt-1 text-xs text-slate-500">Calculation input: {question.calculationKey}</p>}</div>{isDraft && <button type="button" onClick={() => openEditor(question)} className="rounded border px-3 py-1.5 text-xs">Edit logic</button>}</article>)}</div>
        </section>
      ) : (
        <section className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-semibold">Questions</h2><p className="mt-1 text-sm text-slate-500">{selectedVersion?.questions.length ?? 0} definitions in this version. Editing is draft-only.</p></div>
            {isDraft && <button type="button" onClick={() => openEditor()} className="rounded-lg bg-goswift-primary px-3 py-2 text-sm font-semibold text-white">Add question</button>}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <input aria-label="Search questions" placeholder="Search question text or key" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
            <select aria-label="Filter question type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All question types</option>{questionTypes.map((type) => <option key={type}>{type}</option>)}</select>
            <select aria-label="Filter question status" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="all">All statuses</option><option value="active">Enabled</option><option value="inactive">Disabled</option></select>
          </div>
          <div className="mt-4 space-y-2">{visibleQuestions.map((question) => <article key={question.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{question.orderIndex + 1}. {question.title}</h3><p className="mt-1 text-xs text-slate-500">{question.code} · {question.type} · {question.isRequired ? 'Required' : 'Optional'}{question.calculationKey ? ` · Input: ${question.calculationKey}` : ''}</p><p className="mt-1 text-sm text-slate-600">{question.helpText}</p><p className="mt-2 text-xs text-slate-500">{question.options.length ? `Options: ${question.options.map((option) => option.label).join(', ')}` : 'No options'} · {displayCondition(question.displayConditions)}</p><details className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700"><summary className="cursor-pointer font-medium">How this question is evaluated</summary><p className="mt-2">{evaluationExplanation(slug, question, selectedVersion?.scoreCategories ?? [])}</p><p className="mt-2 text-xs text-slate-500">Missing answers are not simulated. Use Evaluation Preview to test configured behaviour safely.</p></details></div><StatusBadge status={question.isActive ? 'ACTIVE' : 'INACTIVE'} /></div>
            <p className="mt-2 text-xs text-slate-400">Last updated: {new Date(question.updatedAt).toLocaleString()}</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setPreviewQuestionId(question.id); setPreviewAnswer(''); }} className="rounded border px-3 py-1.5 text-xs">Preview</button>{isDraft && <><button type="button" onClick={() => openEditor(question)} className="rounded border px-3 py-1.5 text-xs">Edit</button><button type="button" disabled={busy} onClick={() => void duplicate(question)} className="rounded border px-3 py-1.5 text-xs">Duplicate</button><button type="button" disabled={busy || question.orderIndex === 0} onClick={() => void reorder(question, -1)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">Move up</button><button type="button" disabled={busy || question.orderIndex === (selectedVersion?.questions.length ?? 1) - 1} onClick={() => void reorder(question, 1)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">Move down</button><button type="button" disabled={busy} onClick={() => void toggleActive(question)} className="rounded border border-slate-300 px-3 py-1.5 text-xs">{question.isActive ? 'Disable' : 'Enable'}</button></>}</div>
          </article>)}</div>
          {!visibleQuestions.length && <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No questions match these filters.</p>}
        </section>
      )}

      {form && selectedVersion && <div role="dialog" aria-modal="true" aria-labelledby="question-editor-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
        <form onSubmit={(event) => void saveQuestion(event)} className="max-h-full w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-7">
          <header className="flex justify-between gap-3"><div><h2 id="question-editor-title" className="text-lg font-bold">{form.id ? 'Edit question draft' : 'Add question'}</h2><p className="text-xs text-slate-500">Changes apply only to version {selectedVersion.versionNumber} until published.</p></div><button type="button" onClick={() => setForm(null)} className="rounded border px-3 py-1.5 text-sm">Close</button></header>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Question text<input required maxLength={2000} value={form.title} onChange={(event) => setField('title', event.target.value)} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Internal question key<input required pattern="[A-Z][A-Z0-9_]{1,63}" value={form.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm">Question type<select value={form.type} onChange={(event) => changeType(event.target.value)} className="rounded-lg border px-3 py-2">{questionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Display order<input type="number" min={0} value={form.orderIndex ?? 0} onChange={(event) => setField('orderIndex', Number(event.target.value))} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">Help text<textarea maxLength={5000} rows={2} value={form.helpText ?? ''} onChange={(event) => setField('helpText', event.target.value)} className="rounded-lg border px-3 py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isRequired} onChange={(event) => setField('isRequired', event.target.checked)} />Required</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive ?? true} onChange={(event) => setField('isActive', event.target.checked)} />Enabled in this draft</label>
          </div>
          {slug === 'hr-health-check' ? <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Scoring category<select required value={form.scoreCategoryId ?? ''} onChange={(event) => setField('scoreCategoryId', event.target.value || null)} className="rounded-lg border px-3 py-2"><option value="">Select category</option>{selectedVersion.scoreCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Question weight<input type="number" min="0" step="any" value={form.weight ?? 1} onChange={(event) => setField('weight', Number(event.target.value))} className="rounded-lg border px-3 py-2" /></label>
          </div> : <label className="grid gap-1 text-sm">Supported calculation input<select required value={form.calculationKey || form.code} onChange={(event) => setField('calculationKey', event.target.value)} className="rounded-lg border px-3 py-2"><option value="">Choose calculation input</option>{(slug === 'payroll-cost-calculator' ? ['PC_EMPLOYEE_COUNT','PC_RUNS_PER_YEAR','PC_REGULAR_GROSS_PER_RUN','PC_VARIABLE_STATUS','PC_VARIABLE_GROSS_PER_RUN','PC_EMPLOYER_STATUTORY_STATUS','PC_EMPLOYER_STATUTORY_PER_RUN','PC_BENEFITS_STATUS','PC_BENEFITS_PER_RUN','PC_PROCESSING_STATUS','PC_PROCESSING_PER_RUN'] : slug === 'payroll-compliance-calculator' ? ['NG_JURISDICTION','NG_MULTIPLE_JURISDICTIONS','NG_PAYROLL_RECORDS','NG_PAYROLL_RECORDS_NA_REASON','NG_EMPLOYEE_PAY_DOCUMENTS','NG_EMPLOYEE_PAY_DOCUMENTS_NA_REASON','NG_TAX_REMITTANCE_RECORDS','NG_TAX_REMITTANCE_RECORDS_NA_REASON','NG_EMPLOYER_CONTRIBUTION_RECORDS','NG_EMPLOYER_CONTRIBUTION_RECORDS_NA_REASON','NG_PAYROLL_RECONCILIATION','NG_PAYROLL_RECONCILIATION_NA_REASON'] : ['HA_EMPLOYEE_COUNT','HA_HOURS_PER_WEEK','HA_LOADED_HOURLY_COST','HA_SOFTWARE_STATUS','HA_SOFTWARE_ANNUAL','HA_EXTERNAL_SERVICES_STATUS','HA_EXTERNAL_SERVICES_ANNUAL']).map((key) => <option key={key} value={key}>{key}</option>)}</select></label>}
          {(form.type === 'NUMERIC_INPUT' || form.type === 'SLIDER') && <div className="grid gap-3 sm:grid-cols-4">
            {(['minimum','maximum','step'] as const).map((key) => <label key={key} className="grid gap-1 text-sm">{key === 'minimum' ? 'Minimum' : key === 'maximum' ? 'Maximum' : 'Step'}<input type="number" step="any" value={isRecord(form.validationRules) && typeof form.validationRules[key] === 'number' ? String(form.validationRules[key]) : ''} onChange={(event) => { const current = isRecord(form.validationRules) ? form.validationRules : {}; setField('validationRules', { ...current, [key]: event.target.value === '' ? undefined : Number(event.target.value) }); }} className="rounded-lg border px-3 py-2" /></label>)}
            <label className="grid gap-1 text-sm">Default value<input type="number" step="any" value={typeof form.defaultValue === 'number' ? form.defaultValue : ''} onChange={(event) => setField('defaultValue', event.target.value === '' ? undefined : Number(event.target.value))} className="rounded-lg border px-3 py-2" /></label>
          </div>}
          {form.type === 'SINGLE_CHOICE' || form.type === 'BOOLEAN' ? <fieldset className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Answer options</legend>{form.options.map((option, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"><input required aria-label={`Option ${index + 1} label`} placeholder="Option label" value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} className="rounded border px-2 py-1.5 text-sm" /><input required aria-label={`Option ${index + 1} value`} placeholder="Stored value" value={option.value} onChange={(event) => updateOption(index, { value: event.target.value })} className="rounded border px-2 py-1.5 text-sm" /><input type="number" step="any" aria-label={`Option ${index + 1} score`} value={option.scoreValue ?? 0} onChange={(event) => updateOption(index, { scoreValue: Number(event.target.value) })} className="rounded border px-2 py-1.5 text-sm" />{form.options.length > 1 && <button type="button" onClick={() => setField('options', form.options.filter((_, optionIndex) => optionIndex !== index))} className="rounded border px-2 text-xs">Remove</button>}</div>)}<button type="button" onClick={() => setField('options', [...form.options, { label: '', value: '', scoreValue: 0 }])} className="rounded border px-3 py-1.5 text-xs">Add option</button></fieldset> : null}
          <fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Conditional visibility</legend>{preserveComplexCondition ? <div className="rounded bg-amber-50 p-3 text-sm text-amber-900"><p>This question has a complex existing rule: {displayCondition(form.displayConditions)}. It will be preserved unless you replace it.</p><button type="button" onClick={() => { setPreserveComplexCondition(false); setConditionDraft({ enabled: false, questionCode: '', operator: 'EQUALS', value: '' }); }} className="mt-2 underline">Replace with a single condition</button></div> : <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conditionDraft.enabled} onChange={(event) => setConditionDraft({ ...conditionDraft, enabled: event.target.checked })} />Show only when another answer matches a condition</label>
            {conditionDraft.enabled && <div className="grid gap-2 sm:grid-cols-3"><select required value={conditionDraft.questionCode} onChange={(event) => setConditionDraft({ ...conditionDraft, questionCode: event.target.value })} className="rounded border px-2 py-2 text-sm"><option value="">Choose question</option>{selectedVersion.questions.filter((question) => question.id !== form.id).map((question) => <option key={question.id} value={question.code}>{question.code} · {question.title}</option>)}</select><select value={conditionDraft.operator} onChange={(event) => setConditionDraft({ ...conditionDraft, operator: event.target.value })} className="rounded border px-2 py-2 text-sm">{conditionOperators.map((operator) => <option key={operator}>{operator}</option>)}</select><input aria-label="Condition value" value={conditionDraft.value} onChange={(event) => setConditionDraft({ ...conditionDraft, value: event.target.value })} className="rounded border px-2 py-2 text-sm" placeholder="Expected answer" /></div>}
          </>}</fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <footer className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setForm(null)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-goswift-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save draft'}</button></footer>
        </form>
      </div>}
      {currentQuestion && <div role="dialog" aria-modal="true" aria-labelledby="question-preview-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 id="question-preview-title" className="font-bold">Question preview</h2><button type="button" onClick={() => setPreviewQuestionId('')} className="rounded border px-2">Close</button></div><p className="mt-4 text-lg font-semibold">{currentQuestion.title}{currentQuestion.isRequired && <span className="text-rose-600"> *</span>}</p>{currentQuestion.helpText && <p className="mt-2 text-sm text-slate-600">{currentQuestion.helpText}</p>}{currentQuestion.type === 'SINGLE_CHOICE' || currentQuestion.type === 'BOOLEAN' ? <div className="mt-4 space-y-2">{currentQuestion.options.map((option) => <label key={option.id} className="flex items-center gap-2"><input type="radio" name="question-preview" value={option.value} checked={previewAnswer === option.value} onChange={() => setPreviewAnswer(option.value)} />{option.label}</label>)}</div> : <input type="number" min={isRecord(currentQuestion.validationRules) ? String(currentQuestion.validationRules.minimum ?? '') : undefined} max={isRecord(currentQuestion.validationRules) ? String(currentQuestion.validationRules.maximum ?? '') : undefined} placeholder={currentQuestion.helpText || 'Enter a value'} className="mt-4 w-full rounded border px-3 py-2" />}</section></div>}
    </div>
  );
}
