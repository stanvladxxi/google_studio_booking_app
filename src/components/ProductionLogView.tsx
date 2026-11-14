import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  History,
  Link2,
  Plus,
  RefreshCw,
  Snowflake,
  Trash2,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  OperationType,
  connectGoogleFormsAccess,
  db,
  getWorkspaceAccessToken,
  handleFirestoreError,
} from '../firebase';
import {
  AttachedGoogleForm,
  Booking,
  CustomFormQuestion,
  CustomFormQuestionType,
  FormProcessType,
  LIMITS,
  ProductionBatch,
  ProductionUnit,
  QcStatus,
  clampStr,
} from '../types';
import {
  buildProcessQuestionPreview,
  createBatchEvaluationForm,
  fetchBatchFormResponses,
} from '../utils/googleFormsApi';

interface ProductionLogViewProps {
  uid: string;
  userName: string;
  bookings: Booking[];
  batches: ProductionBatch[];
  attachedForms: AttachedGoogleForm[];
  preselectedBookingId?: string;
  loading: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenSurveyHistory: () => void;
}

const UNITS: ProductionUnit[] = ['units', 'kg', 'g', 'L', 'trays'];

export function ProductionLogView({
  uid,
  userName,
  bookings,
  batches,
  attachedForms,
  preselectedBookingId = '',
  loading,
  onNotify,
  onOpenSurveyHistory,
}: ProductionLogViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [bookingId, setBookingId] = useState(preselectedBookingId);
  const [batchNumber, setBatchNumber] = useState(
    `B-${todayStr.replace(/-/g, '')}-${String(batches.length + 1).padStart(2, '0')}`
  );
  const [productName, setProductName] = useState('');
  const [quantityProduced, setQuantityProduced] = useState('48');
  const [unit, setUnit] = useState<ProductionUnit>('units');
  const [bakeTempC, setBakeTempC] = useState('215');
  const [textureScore, setTextureScore] = useState('8');
  const [flavorScore, setFlavorScore] = useState('8');
  const [appearanceScore, setAppearanceScore] = useState('8');
  const [qcStatus, setQcStatus] = useState<QcStatus>('passed');
  const [productionNotes, setProductionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Batch History & Ranking Selection for Google Survey Generation
  const [historyScope, setHistoryScope] = useState<'all' | 'date'>('all');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // Google Forms state
  const [formProcessType, setFormProcessType] = useState<FormProcessType>('hot');
  const [testedPricePoint, setTestedPricePoint] = useState('12.00');
  const [customQuestions, setCustomQuestions] = useState<CustomFormQuestion[]>([]);
  const [draftQTitle, setDraftQTitle] = useState('');
  const [draftQType, setDraftQType] = useState<CustomFormQuestionType>('scale');
  const [draftQOptions, setDraftQOptions] = useState('Yes, Maybe, No');
  const [draftQRequired, setDraftQRequired] = useState(true);
  const [hasFormsToken, setHasFormsToken] = useState(() => Boolean(getWorkspaceAccessToken()));
  const [connectingForms, setConnectingForms] = useState(false);
  const [showFormConfirmModal, setShowFormConfirmModal] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);
  const [syncingFormId, setSyncingFormId] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedBookingId) {
      setBookingId(preselectedBookingId);
      const matched = bookings.find((b) => b.id === preselectedBookingId);
      if (matched) setSelectedDate(matched.date);
    }
  }, [preselectedBookingId, bookings]);

  const dayBatches = useMemo(
    () => batches.filter((b) => b.date === selectedDate),
    [batches, selectedDate]
  );

  const dayForms = useMemo(
    () => attachedForms.filter((f) => f.date === selectedDate),
    [attachedForms, selectedDate]
  );

  // Rank batches across chosen history scope (all production history or selected date)
  const rankedBatches = useMemo(() => {
    const source = historyScope === 'date' && dayBatches.length > 0 ? dayBatches : batches;
    return [...source]
      .map((b) => {
        const formScore100 = b.formResponseCount > 0 ? b.formAvgRating * 10 : null;
        const compositeScore =
          formScore100 !== null
            ? Number((b.qcScore * 0.4 + formScore100 * 0.6).toFixed(1))
            : b.qcScore;
        return { ...b, compositeScore };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }, [historyScope, dayBatches, batches]);

  // Batches targeted for the next Google Survey Form (checked rows from history, or visible ranked batches)
  const surveyTargetBatches = useMemo(() => {
    if (selectedBatchIds.length > 0) {
      const selectedSet = new Set(selectedBatchIds);
      const picked = rankedBatches.filter((b) => selectedSet.has(b.id));
      if (picked.length > 0) return picked.slice(0, 30);
    }
    if (historyScope === 'date' && dayBatches.length > 0) {
      return dayBatches.slice(0, 30);
    }
    return rankedBatches.slice(0, 30);
  }, [selectedBatchIds, rankedBatches, historyScope, dayBatches]);

  // Map each batchNumber / batchId to linked Google Surveys
  const batchSurveysMap = useMemo(() => {
    const map: Record<string, AttachedGoogleForm[]> = {};
    for (const b of batches) {
      map[b.id] = attachedForms.filter(
        (f) => (f.batchNumbers || []).includes(b.batchNumber) || f.formId === b.attachedFormId
      );
    }
    return map;
  }, [batches, attachedForms]);

  const bestBatch = rankedBatches[0] || null;

  const computedQcScore = useMemo(() => {
    const t = Math.min(10, Math.max(0, Number(textureScore) || 0));
    const f = Math.min(10, Math.max(0, Number(flavorScore) || 0));
    const a = Math.min(10, Math.max(0, Number(appearanceScore) || 0));
    return Math.round(((t + f + a) / 30) * 100);
  }, [textureScore, flavorScore, appearanceScore]);

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanProduct = clampStr(productName, LIMITS.TITLE_MAX);
    const cleanBatch = clampStr(batchNumber, LIMITS.BATCH_MAX);
    if (!cleanProduct || !cleanBatch) {
      onNotify('Enter both a Batch Number and Product Made.', 'error');
      return;
    }

    const id = `prd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const linkedBooking = bookings.find((b) => b.id === bookingId);

      batch.set(doc(db, 'productionBatches', id), {
        ownerId: uid,
        producerName: clampStr(userName || 'Kitchen Producer', LIMITS.NAME_MAX),
        bookingId: clampStr(bookingId, 128),
        date: selectedDate,
        batchNumber: cleanBatch,
        productName: cleanProduct,
        quantityProduced: Math.max(0, Number(quantityProduced) || 0),
        unit,
        bakeTempC: Number(bakeTempC) || 0,
        textureScore: Math.min(10, Math.max(0, Number(textureScore) || 0)),
        flavorScore: Math.min(10, Math.max(0, Number(flavorScore) || 0)),
        appearanceScore: Math.min(10, Math.max(0, Number(appearanceScore) || 0)),
        qcScore: computedQcScore,
        qcStatus,
        productionNotes: clampStr(productionNotes, LIMITS.NOTES_MAX),
        attachedFormId: '',
        formResponseCount: 0,
        formAvgRating: 0,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Producer', LIMITS.NAME_MAX),
        eventType: 'production',
        severity: qcStatus === 'failed' ? 'critical' : qcStatus === 'hold' ? 'warn' : 'info',
        station: linkedBooking?.spaceName || 'Production Floor',
        tempReadingC: String(Number(bakeTempC) || 0),
        message: clampStr(
          `Logged production batch ${cleanBatch}: ${quantityProduced} ${unit} of ${cleanProduct} — QC Score ${computedQcScore}/100 (${qcStatus.toUpperCase()}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: clampStr(bookingId, 128),
        createdAt: now,
      });

      await batch.commit();
      setProductName('');
      setProductionNotes('');
      setBatchNumber(
        `B-${selectedDate.replace(/-/g, '')}-${String(batches.length + 2).padStart(2, '0')}`
      );
      onNotify(`Logged batch ${cleanBatch} (${cleanProduct}) to daily production book.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `productionBatches/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConnectForms = async () => {
    setConnectingForms(true);
    try {
      await connectGoogleFormsAccess();
      setHasFormsToken(true);
      onNotify('Google Forms connected. You can now create and sync batch evaluation forms.', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to connect Google Forms.';
      onNotify(msg, 'error');
    } finally {
      setConnectingForms(false);
    }
  };

  const handleAddDraftQuestion = () => {
    const cleanTitle = clampStr(draftQTitle, 140);
    if (!cleanTitle) {
      onNotify('Enter a question title before adding.', 'error');
      return;
    }
    const parsedOptions =
      draftQType === 'choice'
        ? draftQOptions
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 12)
        : undefined;

    if (draftQType === 'choice' && (!parsedOptions || parsedOptions.length < 2)) {
      onNotify('Enter at least two comma-separated choices.', 'error');
      return;
    }

    setCustomQuestions((prev) => [
      ...prev.slice(0, 24),
      {
        title: cleanTitle,
        type: draftQType,
        required: draftQRequired,
        ...(parsedOptions ? { options: parsedOptions } : {}),
      },
    ]);
    setDraftQTitle('');
  };

  const handleRemoveDraftQuestion = (index: number) => {
    setCustomQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleBatchSelection = (id: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openSurveyModalForSelection = (specificBatchIds?: string[]) => {
    if (specificBatchIds && specificBatchIds.length > 0) {
      setSelectedBatchIds(specificBatchIds);
    }
    if (batches.length === 0) {
      onNotify('Log at least one production batch before generating a Google survey form.', 'error');
      return;
    }
    setShowFormConfirmModal(true);
  };

  const handleConfirmCreateGoogleForm = async () => {
    let token = getWorkspaceAccessToken();
    if (!token) {
      try {
        token = await connectGoogleFormsAccess();
        setHasFormsToken(true);
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'Please connect Google Forms first.',
          'error'
        );
        return;
      }
    }

    if (surveyTargetBatches.length === 0) {
      onNotify('Select or log at least one production batch first.', 'error');
      return;
    }

    setCreatingForm(true);
    try {
      const linkedBooking = bookings.find((b) => b.id === bookingId);
      const parsedPrice = Math.max(0, Number(testedPricePoint) || 0);
      const processLabel = formProcessType === 'hot' ? 'Hot Process' : 'Cold Process';
      const surveyDate = surveyTargetBatches[0]?.date || selectedDate;
      const title = `Hearthline ${processLabel} Survey — ${surveyDate}${
        linkedBooking ? ` (${linkedBooking.spaceName})` : ''
      }`;

      const created = await createBatchEvaluationForm(token, {
        title: clampStr(title, 160),
        date: surveyDate,
        processType: formProcessType,
        testedPricePoint: parsedPrice,
        batches: surveyTargetBatches.slice(0, 30),
        customQuestions,
      });

      const formDocId = `frm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = serverTimestamp();

      const topTarget = [...surveyTargetBatches].sort((a, b) => b.qcScore - a.qcScore)[0];

      const batch = writeBatch(db);
      batch.set(doc(db, 'attachedForms', formDocId), {
        ownerId: uid,
        formId: created.formId,
        title: clampStr(created.title, 160),
        responderUri: clampStr(created.responderUri, 400),
        date: surveyDate,
        bookingId: clampStr(bookingId, 128),
        batchNumbers: surveyTargetBatches.slice(0, 30).map((b) => b.batchNumber),
        productsSummary: clampStr(
          surveyTargetBatches.map((b) => `${b.batchNumber}: ${b.productName}`).join(', '),
          400
        ),
        responseCount: 0,
        bestBatchNumber: topTarget?.batchNumber || bestBatch?.batchNumber || '',
        bestBatchScore: topTarget?.qcScore || bestBatch?.qcScore || 0,
        processType: formProcessType,
        testedPricePoint: Number(parsedPrice.toFixed(2)),
        willingToPayPct: 0,
        avgSweetness: 0,
        customQuestions,
        createdAt: now,
        updatedAt: now,
      });

      for (const b of surveyTargetBatches) {
        batch.update(doc(db, 'productionBatches', b.id), {
          attachedFormId: created.formId,
          updatedAt: now,
        });
      }

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Producer', LIMITS.NAME_MAX),
        eventType: 'production',
        severity: 'info',
        station: 'Quality Evaluation',
        tempReadingC: '',
        message: clampStr(
          `Created ${processLabel} Google Survey "${created.title}" (${created.formId}) testing $${parsedPrice.toFixed(2)} across ${surveyTargetBatches.length} batch(es)${customQuestions.length > 0 ? ` with ${customQuestions.length} custom question(s)` : ''}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: clampStr(bookingId, 128),
        createdAt: now,
      });

      await batch.commit();
      setShowFormConfirmModal(false);
      setCustomQuestions([]);
      setSelectedBatchIds([]);
      onNotify(
        `Generated ${processLabel} Google Survey linking ${surveyTargetBatches.length} batch(es). View anytime in Survey History.`,
        'success'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create Google Form.';
      onNotify(msg, 'error');
    } finally {
      setCreatingForm(false);
    }
  };

  const handleSyncFormResponses = async (formDoc: AttachedGoogleForm) => {
    let token = getWorkspaceAccessToken();
    if (!token) {
      try {
        token = await connectGoogleFormsAccess();
        setHasFormsToken(true);
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
          ? `Synced ${synced.totalResponses} Google Form responses. Top rated batch: ${synced.bestBatchNumber}.`
          : 'Form synced: 0 responses submitted yet. Share the form link with tasters.',
        'success'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sync form responses.';
      onNotify(msg, 'error');
    } finally {
      setSyncingFormId(null);
    }
  };

  const handleDeleteBatch = async (batchItem: ProductionBatch) => {
    try {
      await deleteDoc(doc(db, 'productionBatches', batchItem.id));
      onNotify(`Removed batch ${batchItem.batchNumber}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `productionBatches/${batchItem.id}`);
    }
  };

  const handleUpdateQcStatus = async (batchItem: ProductionBatch, status: QcStatus) => {
    try {
      await updateDoc(doc(db, 'productionBatches', batchItem.id), {
        qcStatus: status,
        updatedAt: serverTimestamp(),
      });
      onNotify(`Batch ${batchItem.batchNumber} marked ${status}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `productionBatches/${batchItem.id}`);
    }
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* User Confirmation & Custom Question Modal for Google Survey Creation */}
      {showFormConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900">
              Generate Google Survey Form from Batch History
            </h3>
            <p className="text-sm text-slate-600">
              Create a{' '}
              <span className="font-semibold text-slate-900">
                {formProcessType === 'hot' ? 'Hot Process' : 'Cold Process'}
              </span>{' '}
              Google Survey in your Google account with target price{' '}
              <span className="font-mono font-semibold text-teal-800">
                ${Math.max(0, Number(testedPricePoint) || 0).toFixed(2)}
              </span>{' '}
              linked to the selected production batches?
            </p>

            {/* Quick Process & Price Adjustment right inside Modal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-700">Process Type</span>
                <select
                  value={formProcessType}
                  onChange={(e) => setFormProcessType(e.target.value as FormProcessType)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="hot">Hot Process</option>
                  <option value="cold">Cold Process</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-700">Price Point ($)</span>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={testedPricePoint}
                  onChange={(e) => setTestedPricePoint(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded"
                />
              </label>
              <div className="flex flex-col justify-center text-xs text-slate-600">
                <span className="text-[11px] font-medium text-slate-700">Linked Batches</span>
                <span className="font-mono font-semibold text-slate-900">
                  {surveyTargetBatches.length} batch(es)
                </span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-xs">
              <div className="font-semibold text-slate-800">
                Linked Batches Included ({surveyTargetBatches.length}):
              </div>
              <ul className="space-y-1 text-slate-600 font-mono max-h-28 overflow-y-auto">
                {surveyTargetBatches.slice(0, 12).map((b) => (
                  <li key={b.id}>
                    {b.batchNumber} ({b.date}) — {b.productName} · QC {b.qcScore}/100
                  </li>
                ))}
                {surveyTargetBatches.length > 12 && (
                  <li>...and {surveyTargetBatches.length - 12} more batches</li>
                )}
              </ul>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-xs">
              <div className="font-semibold text-slate-800">
                Base Questions ({formProcessType === 'hot' ? 'Hot Process' : 'Cold Process'} + Sweetness, Texture, Quantity &amp; Price):
              </div>
              <ul className="space-y-1 text-slate-600">
                {buildProcessQuestionPreview(
                  formProcessType,
                  Math.max(0, Number(testedPricePoint) || 0)
                ).map((q) => (
                  <li key={q.title}>
                    <span className="font-semibold text-slate-800">[{q.category}]</span> {q.title}
                  </li>
                ))}
              </ul>
            </div>

            {/* Add Question Option During Creation */}
            <div className="border border-slate-200 rounded-md p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Add Custom Questions Before Creating ({customQuestions.length} added)
                </span>
              </div>
              {customQuestions.length > 0 && (
                <ul className="divide-y divide-slate-200 border border-slate-200 rounded text-xs">
                  {customQuestions.map((cq, idx) => (
                    <li key={`${cq.title}_${idx}`} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-900">{cq.title}</span>
                        <span className="text-slate-500 ml-2 font-mono">
                          ({cq.type}
                          {cq.options ? `: ${cq.options.join(' / ')}` : ''}
                          {cq.required ? ' · required' : ''})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftQuestion(idx)}
                        className="text-xs text-red-600 hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <label className="block space-y-1 sm:col-span-6">
                  <span className="text-[11px] font-medium text-slate-700">Question Prompt</span>
                  <input
                    type="text"
                    maxLength={140}
                    value={draftQTitle}
                    onChange={(e) => setDraftQTitle(e.target.value)}
                    placeholder="e.g. Packaging convenience rating"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </label>
                <label className="block space-y-1 sm:col-span-3">
                  <span className="text-[11px] font-medium text-slate-700">Type</span>
                  <select
                    value={draftQType}
                    onChange={(e) => setDraftQType(e.target.value as CustomFormQuestionType)}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="scale">1–5 Scale</option>
                    <option value="choice">Multiple Choice</option>
                    <option value="text">Text Answer</option>
                  </select>
                </label>
                <div className="sm:col-span-3 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftQRequired}
                      onChange={(e) => setDraftQRequired(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>Req</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDraftQuestion}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Q
                  </button>
                </div>
              </div>
              {draftQType === 'choice' && (
                <input
                  type="text"
                  value={draftQOptions}
                  onChange={(e) => setDraftQOptions(e.target.value)}
                  placeholder="Comma-separated options, e.g. Yes, Maybe, No"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFormConfirmModal(false)}
                disabled={creatingForm}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateGoogleForm}
                disabled={creatingForm}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-md"
              >
                {creatingForm ? 'Generating Survey...' : 'Confirm & Create Google Survey'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Best Batch Identifier Banner */}
      {bestBatch && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800">
              <Award className="w-4 h-4" />
              <span>Best Performing Batch Identified ({dayBatches.length > 0 ? selectedDate : 'All Sessions'})</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-xl font-bold text-slate-900">
                {bestBatch.productName}
              </h2>
              <span className="font-mono text-sm font-semibold text-teal-800">
                Batch #{bestBatch.batchNumber}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Produced {bestBatch.quantityProduced} {bestBatch.unit} at {bestBatch.bakeTempC}°C · Internal QC:{' '}
              <span className="font-mono font-semibold">{bestBatch.qcScore}/100</span>
              {bestBatch.formResponseCount > 0 && (
                <>
                  {' '}
                  · Google Form Rating:{' '}
                  <span className="font-mono font-semibold">
                    {bestBatch.formAvgRating}/10 ({bestBatch.formResponseCount} responses)
                  </span>
                </>
              )}
              {bestBatch.productionNotes ? ` · ${bestBatch.productionNotes}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-6">
            <div className="text-xs text-slate-500">Composite Batch Score</div>
            <div className="text-3xl font-mono tabular-nums font-bold text-teal-800">
              {bestBatch.compositeScore}
              <span className="text-sm font-normal text-slate-400">/100</span>
            </div>
          </div>
        </section>
      )}

      {/* Log Daily Production & Quality Test Results */}
      <form onSubmit={handleSaveBatch} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Daily Production Log Book & Batch Test Results
            </h2>
            <p className="text-sm text-slate-600">
              Record what was produced after your kitchen booking and log batch numbers & quality test scores.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-medium text-slate-600">Production Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Linked Kitchen Booking</span>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="">General Daily Run</option>
              {bookings
                .filter((b) => b.status !== 'cancelled')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.date} · {b.spaceName} ({String(b.startHour).padStart(2, '0')}:00)
                  </option>
                ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Batch Number</span>
            <input
              type="text"
              maxLength={LIMITS.BATCH_MAX}
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. B-20261113-01"
              required
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Product Made</span>
            <input
              type="text"
              maxLength={LIMITS.TITLE_MAX}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Country Levain Loaf (78% Hydration)"
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Qty Made</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={quantityProduced}
                onChange={(e) => setQuantityProduced(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Unit</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductionUnit)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Cook / Bake Temp (°C)</span>
            <input
              type="number"
              min="-50"
              max="450"
              value={bakeTempC}
              onChange={(e) => setBakeTempC(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-slate-700">Texture /10</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={textureScore}
                onChange={(e) => setTextureScore(e.target.value)}
                className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-slate-700">Flavor /10</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={flavorScore}
                onChange={(e) => setFlavorScore(e.target.value)}
                className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-slate-700">Look /10</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={appearanceScore}
                onChange={(e) => setAppearanceScore(e.target.value)}
                className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">
              QC Decision (Score: <span className="font-mono font-semibold">{computedQcScore}/100</span>)
            </span>
            <select
              value={qcStatus}
              onChange={(e) => setQcStatus(e.target.value as QcStatus)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
            >
              <option value="passed">Passed QC</option>
              <option value="hold">Hold / Re-test</option>
              <option value="failed">Failed QC</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            maxLength={LIMITS.NOTES_MAX}
            value={productionNotes}
            onChange={(e) => setProductionNotes(e.target.value)}
            placeholder="Test result observations: crust color, internal probe temp, shelf-life stability, or adjustments..."
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Saving Batch...' : 'Log Production Batch'}
          </button>
        </div>
      </form>

      {/* Google Form Attachment & Sync Section */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Attached Google Form for Batch &amp; Price Testing
            </h2>
            <p className="text-sm text-slate-600">
              Choose Hot or Cold process and attach a target price point to generate tailored evaluation questions for {selectedDate}&apos;s batches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!hasFormsToken && (
              <button
                type="button"
                onClick={handleConnectForms}
                disabled={connectingForms}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-xs whitespace-nowrap"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                {connectingForms ? 'Connecting...' : 'Sign in with Google Forms'}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSurveyHistory}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5" />
              Survey History ({attachedForms.length})
            </button>

            <button
              type="button"
              onClick={() => openSurveyModalForSelection()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Generate Google Survey Form
            </button>
          </div>
        </div>

        {/* Process Type & Target Price Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-700 block">
                1. Choose Kitchen Process Type
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormProcessType('hot')}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    formProcessType === 'hot'
                      ? 'border-amber-600 bg-amber-50/70 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Flame
                      className={`w-4 h-4 ${
                        formProcessType === 'hot' ? 'text-amber-600' : 'text-slate-400'
                      }`}
                    />
                    <span>Hot Process</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Baked, roasted, seared, warm-served items
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormProcessType('cold')}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    formProcessType === 'cold'
                      ? 'border-teal-700 bg-teal-50/70 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Snowflake
                      className={`w-4 h-4 ${
                        formProcessType === 'cold' ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <span>Cold Process</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Chilled, cold-set, frozen, cold-brewed items
                  </div>
                </button>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                2. Attached Price Point to Test ($ per unit/portion)
              </span>
              <input
                type="number"
                step="0.50"
                min="0"
                max="10000"
                value={testedPricePoint}
                onChange={(e) => setTestedPricePoint(e.target.value)}
                placeholder="12.00"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <span className="text-[11px] text-slate-500 block">
                Responders will be asked directly whether they are willing to pay $
                {Math.max(0, Number(testedPricePoint) || 0).toFixed(2)} for this quantity and quality.
              </span>
            </label>
          </div>

          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-semibold text-slate-900">
                Generated Form Questions ({formProcessType === 'hot' ? 'Hot Process' : 'Cold Process'})
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                7 structured questions + notes
              </span>
            </div>
            <div className="divide-y divide-slate-200 text-xs">
              {buildProcessQuestionPreview(
                formProcessType,
                Math.max(0, Number(testedPricePoint) || 0)
              ).map((q) => (
                <div key={q.title} className="py-1.5 flex items-baseline justify-between gap-3">
                  <div>
                    <span className="font-semibold text-slate-900">{q.title}</span>
                    <span className="text-slate-500 ml-2">{q.detail}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {q.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {dayForms.length === 0 && attachedForms.length === 0 ? (
          <div className="text-sm text-slate-600 py-4 text-center border-t border-slate-100">
            No Google Forms attached yet. Log today&apos;s production batches above, select Hot or Cold process &amp; price point, then click &ldquo;Create {formProcessType === 'hot' ? 'Hot' : 'Cold'} Process Form&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {(dayForms.length > 0 ? dayForms : attachedForms).map((formDoc) => (
              <div
                key={formDoc.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{formDoc.title}</span>
                    <span className="text-xs font-mono text-slate-500">· {formDoc.date}</span>
                    {formDoc.processType && (
                      <span className="text-xs font-semibold text-slate-700 capitalize">
                        · {formDoc.processType} Process
                      </span>
                    )}
                    {typeof formDoc.testedPricePoint === 'number' && (
                      <span className="text-xs font-mono font-semibold text-teal-800">
                        · ${formDoc.testedPricePoint.toFixed(2)} price test
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{formDoc.productsSummary}</p>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 pt-0.5">
                    <span className="font-mono tabular-nums">
                      {formDoc.responseCount} form responses
                    </span>
                    {formDoc.responseCount > 0 && typeof formDoc.willingToPayPct === 'number' && (
                      <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                        {formDoc.willingToPayPct}% willing to pay
                      </span>
                    )}
                    {formDoc.responseCount > 0 && typeof formDoc.avgSweetness === 'number' && formDoc.avgSweetness > 0 && (
                      <span className="font-mono tabular-nums text-slate-700">
                        Sweetness {formDoc.avgSweetness}/5
                      </span>
                    )}
                    {formDoc.bestBatchNumber && (
                      <span className="font-semibold text-teal-800">
                        Top Batch: #{formDoc.bestBatchNumber} ({formDoc.bestBatchScore}/100)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                    {syncingFormId === formDoc.id ? 'Syncing...' : 'Sync Form Responses'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ranked Production Batches History Table with Survey Generator */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">
                Batch Production History &amp; Quality Ranking
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              ({rankedBatches.length} batches)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setHistoryScope('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                  historyScope === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All History ({batches.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryScope('date')}
                className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap ${
                  historyScope === 'date'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {selectedDate} ({dayBatches.length})
              </button>
            </div>

            {rankedBatches.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedBatchIds(
                      selectedBatchIds.length === rankedBatches.length
                        ? []
                        : rankedBatches.slice(0, 30).map((b) => b.id)
                    )
                  }
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  {selectedBatchIds.length === rankedBatches.length ? 'Clear Selection' : 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={() => openSurveyModalForSelection()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Generate Google Survey Form
                  {selectedBatchIds.length > 0 ? ` (${selectedBatchIds.length})` : ''}
                </button>
              </>
            )}
          </div>
        </div>

        {rankedBatches.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No production batches logged yet</p>
            <p className="text-xs text-slate-500">
              After completing a kitchen booking, log what was made and its quality test scores above.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3 px-4">Rank · Batch #</th>
                  <th className="py-3 px-4">Product Made</th>
                  <th className="py-3 px-4 text-right">Output</th>
                  <th className="py-3 px-4 text-right">Internal QC</th>
                  <th className="py-3 px-4 text-right">Form Rating</th>
                  <th className="py-3 px-4 text-right">Composite</th>
                  <th className="py-3 px-4">Linked Surveys</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {rankedBatches.map((b, idx) => {
                  const isChecked = selectedBatchIds.includes(b.id);
                  const linkedSurveys = batchSurveysMap[b.id] || [];
                  return (
                    <tr
                      key={b.id}
                      className={
                        isChecked
                          ? 'bg-teal-50/70'
                          : idx === 0
                          ? 'bg-teal-50/30'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleBatchSelection(b.id)}
                          aria-label={`Select batch ${b.batchNumber}`}
                          className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                        />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {b.batchNumber}
                          </span>
                          {idx === 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Best
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-500">{b.date}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{b.productName}</div>
                        {b.productionNotes && (
                          <div className="text-xs text-slate-500 truncate max-w-xs">
                            {b.productionNotes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {b.quantityProduced} {b.unit} · {b.bakeTempC}°C
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                        {b.qcScore}/100
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {b.formResponseCount > 0
                          ? `${b.formAvgRating}/10 (${b.formResponseCount})`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-teal-800">
                        {b.compositeScore}/100
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {linkedSurveys.length > 0 ? (
                          <button
                            type="button"
                            onClick={onOpenSurveyHistory}
                            className="inline-flex items-center gap-1 font-medium text-teal-800 hover:underline"
                          >
                            <Link2 className="w-3 h-3" />
                            {linkedSurveys.length} survey{linkedSurveys.length > 1 ? 's' : ''}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSurveyModalForSelection([b.id])}
                            className="text-slate-500 hover:text-teal-800 hover:underline"
                          >
                            + Survey
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={b.qcStatus}
                          onChange={(e) => handleUpdateQcStatus(b, e.target.value as QcStatus)}
                          className="px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        >
                          <option value="passed">Passed</option>
                          <option value="hold">Hold</option>
                          <option value="failed">Failed</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(b)}
                          title="Delete batch"
                          className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
