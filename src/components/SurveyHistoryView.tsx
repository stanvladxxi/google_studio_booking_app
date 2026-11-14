import { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Snowflake,
} from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  OperationType,
  connectGoogleFormsAccess,
  db,
  getWorkspaceAccessToken,
  handleFirestoreError,
} from '../firebase';
import {
  AttachedGoogleForm,
  CustomFormQuestion,
  CustomFormQuestionType,
  FormProcessType,
  LIMITS,
  ProductionBatch,
  clampStr,
} from '../types';
import {
  appendQuestionToGoogleForm,
  fetchBatchFormResponses,
} from '../utils/googleFormsApi';

interface SurveyHistoryViewProps {
  uid: string;
  userName: string;
  batches: ProductionBatch[];
  attachedForms: AttachedGoogleForm[];
  loading: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenProduction: () => void;
}

export function SurveyHistoryView({
  uid,
  userName,
  batches,
  attachedForms,
  loading,
  onNotify,
  onOpenProduction,
}: SurveyHistoryViewProps) {
  const [processFilter, setProcessFilter] = useState<'all' | FormProcessType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [syncingFormId, setSyncingFormId] = useState<string | null>(null);

  // Add Question Modal State
  const [addQuestionTarget, setAddQuestionTarget] = useState<AttachedGoogleForm | null>(null);
  const [newQTitle, setNewQTitle] = useState('');
  const [newQType, setNewQType] = useState<CustomFormQuestionType>('scale');
  const [newQOptions, setNewQOptions] = useState('Yes, Maybe, No');
  const [newQRequired, setNewQRequired] = useState(true);
  const [addingQuestion, setAddingQuestion] = useState(false);

  const formLinkedBatchesMap = useMemo(() => {
    const map: Record<string, Array<ProductionBatch & { compositeScore: number }>> = {};
    for (const form of attachedForms) {
      const batchSet = new Set(form.batchNumbers || []);
      const linked = batches
        .filter((b) => batchSet.has(b.batchNumber) || b.attachedFormId === form.formId)
        .map((b) => {
          const formScore100 = b.formResponseCount > 0 ? b.formAvgRating * 10 : null;
          const compositeScore =
            formScore100 !== null
              ? Number((b.qcScore * 0.4 + formScore100 * 0.6).toFixed(1))
              : b.qcScore;
          return { ...b, compositeScore };
        })
        .sort((a, b) => b.compositeScore - a.compositeScore);
      map[form.id] = linked;
    }
    return map;
  }, [attachedForms, batches]);

  const unlinkedBatches = useMemo(() => {
    const linkedBatchNumbers = new Set<string>();
    const linkedFormIds = new Set<string>();
    for (const form of attachedForms) {
      linkedFormIds.add(form.formId);
      for (const bn of form.batchNumbers || []) {
        linkedBatchNumbers.add(bn);
      }
    }
    return batches.filter(
      (b) => !linkedBatchNumbers.has(b.batchNumber) && !(b.attachedFormId && linkedFormIds.has(b.attachedFormId))
    );
  }, [attachedForms, batches]);

  const filteredForms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return attachedForms.filter((f) => {
      if (processFilter !== 'all' && f.processType !== processFilter) return false;
      if (!q) return true;
      const inTitle = f.title.toLowerCase().includes(q);
      const inProducts = f.productsSummary.toLowerCase().includes(q);
      const inBatches = (f.batchNumbers || []).some((b) => b.toLowerCase().includes(q));
      return inTitle || inProducts || inBatches;
    });
  }, [attachedForms, processFilter, searchTerm]);

  const kpis = useMemo(() => {
    const totalSurveys = attachedForms.length;
    const totalResponses = attachedForms.reduce((s, f) => s + (f.responseCount || 0), 0);
    const linkedBatchIds = new Set<string>();
    for (const form of attachedForms) {
      for (const b of formLinkedBatchesMap[form.id] || []) {
        linkedBatchIds.add(b.id);
      }
    }
    const formsWithResponses = attachedForms.filter(
      (f) => f.responseCount > 0 && typeof f.willingToPayPct === 'number'
    );
    const avgWillingPct =
      formsWithResponses.length > 0
        ? Math.round(
            formsWithResponses.reduce((s, f) => s + (f.willingToPayPct || 0), 0) /
              formsWithResponses.length
          )
        : 0;
    return {
      totalSurveys,
      linkedBatchesCount: linkedBatchIds.size,
      totalResponses,
      avgWillingPct,
    };
  }, [attachedForms, formLinkedBatchesMap]);

  const handleSyncFormResponses = async (formDoc: AttachedGoogleForm) => {
    let token = getWorkspaceAccessToken();
    if (!token) {
      try {
        token = await connectGoogleFormsAccess();
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'Connect Google Forms to sync responses.',
          'error'
        );
        return;
      }
    }

    setSyncingFormId(formDoc.id);
    try {
      const synced = await fetchBatchFormResponses(token, formDoc.formId);
      const now = serverTimestamp();
      const batch = writeBatch(db);

      for (const b of batches) {
        const stat = synced.batchStats[b.batchNumber];
        if (stat) {
          batch.update(doc(db, 'productionBatches', b.id), {
            formResponseCount: stat.responseCount,
            formAvgRating: stat.avgCombined10,
            updatedAt: now,
          });
        }
      }

      batch.update(doc(db, 'attachedForms', formDoc.id), {
        responseCount: synced.totalResponses,
        bestBatchNumber: synced.bestBatchNumber || formDoc.bestBatchNumber,
        bestBatchScore: synced.bestBatchScore10
          ? Math.round(synced.bestBatchScore10 * 10)
          : formDoc.bestBatchScore,
        willingToPayPct: synced.overallWillingToPayPct,
        avgSweetness: synced.overallAvgSweetness,
        updatedAt: now,
      });

      await batch.commit();
      onNotify(
        synced.totalResponses > 0
          ? `Synced ${synced.totalResponses} responses for "${formDoc.title}".`
          : `Synced "${formDoc.title}": 0 responses yet.`,
        'success'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sync form responses.';
      onNotify(msg, 'error');
    } finally {
      setSyncingFormId(null);
    }
  };

  const handleConfirmAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addQuestionTarget) return;
    const cleanTitle = clampStr(newQTitle, 140);
    if (!cleanTitle) {
      onNotify('Enter a question prompt before adding.', 'error');
      return;
    }

    const parsedOptions =
      newQType === 'choice'
        ? newQOptions
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 12)
        : undefined;

    if (newQType === 'choice' && (!parsedOptions || parsedOptions.length < 2)) {
      onNotify('Provide at least two comma-separated choices for a multiple-choice question.', 'error');
      return;
    }

    let token = getWorkspaceAccessToken();
    if (!token) {
      try {
        token = await connectGoogleFormsAccess();
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'Connect Google Forms to add a question.',
          'error'
        );
        return;
      }
    }

    const questionPayload: CustomFormQuestion = {
      title: cleanTitle,
      type: newQType,
      required: newQRequired,
      ...(parsedOptions ? { options: parsedOptions } : {}),
    };

    setAddingQuestion(true);
    try {
      await appendQuestionToGoogleForm(token, addQuestionTarget.formId, questionPayload);

      const updatedQuestions = [...(addQuestionTarget.customQuestions || []), questionPayload].slice(
        0,
        25
      );
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = serverTimestamp();

      const batch = writeBatch(db);
      batch.update(doc(db, 'attachedForms', addQuestionTarget.id), {
        customQuestions: updatedQuestions,
        updatedAt: now,
      });
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Producer', LIMITS.NAME_MAX),
        eventType: 'production',
        severity: 'info',
        station: 'Survey History',
        tempReadingC: '',
        message: clampStr(
          `Appended custom question "${cleanTitle}" (${newQType}) to Google Survey "${addQuestionTarget.title}" (${addQuestionTarget.formId}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: addQuestionTarget.bookingId || '',
        createdAt: now,
      });
      await batch.commit();

      setAddQuestionTarget(null);
      setNewQTitle('');
      onNotify(`Added question "${cleanTitle}" directly to your Google Form.`, 'success');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Firestore')) {
        handleFirestoreError(error, OperationType.UPDATE, `attachedForms/${addQuestionTarget.id}`);
      } else {
        onNotify(
          error instanceof Error ? error.message : 'Unable to append question to Google Form.',
          'error'
        );
      }
    } finally {
      setAddingQuestion(false);
    }
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Explicit User Confirmation Modal before Mutating Google Form */}
      {addQuestionTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmAddQuestion}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">
              Add Question to Existing Google Survey
            </h3>
            <p className="text-xs text-slate-600">
              This will append a live question to{' '}
              <span className="font-semibold text-slate-900">{addQuestionTarget.title}</span> in your Google Forms account.
            </p>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Question Prompt</span>
              <input
                type="text"
                maxLength={140}
                value={newQTitle}
                onChange={(e) => setNewQTitle(e.target.value)}
                placeholder="e.g. Would you recommend this item for daily bakery menu?"
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Question Type</span>
                <select
                  value={newQType}
                  onChange={(e) => setNewQType(e.target.value as CustomFormQuestionType)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  <option value="scale">1–5 Rating Scale</option>
                  <option value="choice">Multiple Choice</option>
                  <option value="text">Paragraph Text</option>
                </select>
              </label>

              <label className="flex items-center gap-2 pt-6 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newQRequired}
                  onChange={(e) => setNewQRequired(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>Required question</span>
              </label>
            </div>

            {newQType === 'choice' && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Options (comma-separated)
                </span>
                <input
                  type="text"
                  value={newQOptions}
                  onChange={(e) => setNewQOptions(e.target.value)}
                  placeholder="Yes, Maybe, No"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                />
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAddQuestionTarget(null)}
                disabled={addingQuestion}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingQuestion}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                {addingQuestion ? 'Updating Google Form...' : 'Confirm & Add Question'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Top KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Surveys Created</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.totalSurveys}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Production Batches Linked</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.linkedBatchesCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Survey Responses</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.totalResponses}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Avg Price Acceptance</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-teal-800">
            {kpis.avgWillingPct}%
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Google Survey History &amp; Batch Linkage
          </h2>
          <p className="text-sm text-slate-600">
            Inspect every generated Google survey, see which production batches and rankings it tracks, and append new questions anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search survey or batch #..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(['all', 'hot', 'cold'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setProcessFilter(filter)}
                className={`px-2.5 py-1 text-xs font-medium rounded capitalize whitespace-nowrap ${
                  processFilter === filter
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {filter === 'all' ? 'All Processes' : `${filter} Process`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenProduction}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Generate New Survey
          </button>
        </div>
      </div>

      {/* Survey History Cards with Explicit Linked Batches Table */}
      {filteredForms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-900">
            No Google surveys match this view
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Select production batches in Production &amp; Forms (Quality Ranking history) and click &ldquo;Generate Google Survey Form&rdquo; to track batches here.
          </p>
          <div>
            <button
              type="button"
              onClick={onOpenProduction}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
            >
              Go to Batch Production &amp; Ranking
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredForms.map((formDoc) => {
            const linkedBatches = formLinkedBatchesMap[formDoc.id] || [];
            const customQs = formDoc.customQuestions || [];

            return (
              <article
                key={formDoc.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Survey Header */}
                <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-900">{formDoc.title}</h3>
                      {formDoc.processType && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 capitalize">
                          {formDoc.processType === 'hot' ? (
                            <Flame className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <Snowflake className="w-3.5 h-3.5 text-teal-700" />
                          )}
                          {formDoc.processType} Process
                        </span>
                      )}
                      {typeof formDoc.testedPricePoint === 'number' && (
                        <span className="text-xs font-mono font-semibold text-teal-800">
                          · Price Test ${formDoc.testedPricePoint.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span className="font-mono">Survey Date: {formDoc.date}</span>
                      <span className="font-mono">Form ID: {formDoc.formId}</span>
                      <span className="font-mono tabular-nums">
                        {linkedBatches.length} linked batch(es)
                      </span>
                      <span className="font-mono tabular-nums">
                        {formDoc.responseCount} response(s)
                      </span>
                      {formDoc.responseCount > 0 && typeof formDoc.willingToPayPct === 'number' && (
                        <span className="font-mono font-semibold text-emerald-700">
                          {formDoc.willingToPayPct}% willing to pay
                        </span>
                      )}
                      {formDoc.responseCount > 0 &&
                        typeof formDoc.avgSweetness === 'number' &&
                        formDoc.avgSweetness > 0 && (
                          <span className="font-mono text-slate-700">
                            Sweetness {formDoc.avgSweetness}/5
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAddQuestionTarget(formDoc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Question
                    </button>
                    <a
                      href={formDoc.responderUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Form
                    </a>
                    <button
                      type="button"
                      onClick={() => handleSyncFormResponses(formDoc)}
                      disabled={syncingFormId === formDoc.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-md whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncingFormId === formDoc.id ? 'animate-spin' : ''}`}
                      />
                      {syncingFormId === formDoc.id ? 'Syncing...' : 'Sync Responses'}
                    </button>
                  </div>
                </div>

                {/* Custom Questions Added */}
                {customQs.length > 0 && (
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs space-y-1.5">
                    <div className="font-semibold text-slate-700">
                      Custom Questions Added ({customQs.length}):
                    </div>
                    <ul className="space-y-1 text-slate-600">
                      {customQs.map((cq, i) => (
                        <li key={`${cq.title}_${i}`} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-slate-400">Q+{i + 1}.</span>
                          <span className="font-medium text-slate-900">{cq.title}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            ({cq.type}
                            {cq.options && cq.options.length > 0
                              ? `: ${cq.options.join(' / ')}`
                              : ''}
                            {cq.required ? ' · required' : ''})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Linked Production Batches Table */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Link2 className="w-3.5 h-3.5 text-teal-700" />
                      <span>Linked Production Batches &amp; Quality Performance</span>
                    </div>
                    {formDoc.bestBatchNumber && (
                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800">
                        <Award className="w-3.5 h-3.5" />
                        <span>
                          Best Batch: #{formDoc.bestBatchNumber} ({formDoc.bestBatchScore}/100)
                        </span>
                      </div>
                    )}
                  </div>

                  {linkedBatches.length === 0 ? (
                    <div className="text-xs text-slate-500 py-2">
                      Batch numbers tracked: {(formDoc.batchNumbers || []).join(', ') || formDoc.productsSummary}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-md overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-600 bg-slate-50">
                            <th className="py-2.5 px-3">Batch # &amp; Date</th>
                            <th className="py-2.5 px-3">Product Made</th>
                            <th className="py-2.5 px-3 text-right">Output</th>
                            <th className="py-2.5 px-3 text-right">Internal QC</th>
                            <th className="py-2.5 px-3 text-right">Survey Rating</th>
                            <th className="py-2.5 px-3 text-right">Composite Rank</th>
                            <th className="py-2.5 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs">
                          {linkedBatches.map((b, idx) => (
                            <tr
                              key={b.id}
                              className={idx === 0 ? 'bg-teal-50/40' : 'hover:bg-slate-50/70'}
                            >
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-semibold text-slate-900">
                                    {b.batchNumber}
                                  </span>
                                  {idx === 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-teal-800">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Top
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">{b.date}</div>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {b.productName}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                {b.quantityProduced} {b.unit} · {b.bakeTempC}°C
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                                {b.qcScore}/100
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {b.formResponseCount > 0
                                  ? `${b.formAvgRating}/10 (${b.formResponseCount})`
                                  : 'Pending'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-teal-800">
                                {b.compositeScore}/100
                              </td>
                              <td className="py-2.5 px-3 capitalize font-medium text-slate-700">
                                {b.qcStatus}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Unlinked Batches Reminder */}
      {unlinkedBatches.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              {unlinkedBatches.length} Production Batch(es) Not Yet Linked to a Survey
            </h3>
            <p className="text-xs text-slate-600">
              Unlinked batches:{' '}
              <span className="font-mono">
                {unlinkedBatches
                  .slice(0, 5)
                  .map((b) => `${b.batchNumber} (${b.productName})`)
                  .join(', ')}
                {unlinkedBatches.length > 5 ? ` +${unlinkedBatches.length - 5} more` : ''}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenProduction}
            className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap shrink-0"
          >
            Select Batches &amp; Generate Survey
          </button>
        </section>
      )}
    </div>
  );
}
