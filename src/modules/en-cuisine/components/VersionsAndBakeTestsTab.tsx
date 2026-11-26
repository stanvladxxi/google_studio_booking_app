import { ChangeEvent, Fragment, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FlaskConical,
  GitCompare,
  Layers,
  Scale,
  ShoppingCart,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  BookingPrefillRequest,
  ExperimentDecision,
  LIMITS,
  Product,
  RecipeExperiment,
  RecipeTest,
  RecipeVersion,
  ValidationStatus,
  clampStr,
  sanitizeId,
} from '../../../types';
import { BuilderDraftState, BuilderLineItem } from '../types';
import {
  ParsedBulkRecipeGroup,
  computeBakeTestDerived,
  diffVersionPayloads,
  downloadBulkRecipeTemplate,
  exportAllSavedCSV,
  exportAllSavedJSON,
  exportCurrentRecipeCSV,
  exportCurrentRecipeJSON,
  exportCurrentRecipeText,
  formatKwd,
  formatWeightText,
  parseBulkRecipesCsv,
  versionToBuilderDraft,
} from '../utils/formulationEngine';
import { MergedLibraryState } from '../utils/libraryPersistence';
import {
  saveBakeTestToVersion,
  saveFormulationAsVersion,
  saveScoreToVersion,
} from '../utils/versionPersistence';
import { ViewRecipeSpecModal } from './IngredientModals';
import { OrderMaterialsModal } from './OrderMaterialsModal';

interface VersionsAndBakeTestsTabProps {
  uid: string;
  userName: string;
  readOnly: boolean;
  products: Product[];
  recipeVersions: RecipeVersion[];
  experiments: RecipeExperiment[];
  legacyRecipes: RecipeTest[];
  mergedLibrary: MergedLibraryState;
  canBookKitchen: boolean;
  onLoadVersionIntoBuilder: (draft: BuilderDraftState) => void;
  onBookKitchenFromVersion: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
  onOpenMaterialsOrders?: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  draft: 'Draft',
  testing: 'Testing',
  consumer_validated: 'Consumer Validated',
  production_validated: 'Production Validated',
  approved: 'Approved',
};

export function VersionsAndBakeTestsTab({
  uid,
  userName,
  readOnly,
  products,
  recipeVersions,
  experiments,
  legacyRecipes,
  mergedLibrary,
  canBookKitchen,
  onLoadVersionIntoBuilder,
  onBookKitchenFromVersion,
  onOpenMaterialsOrders,
  onNotify,
}: VersionsAndBakeTestsTabProps) {
  const { library, libraryById, categories, stockMap } = mergedLibrary;

  const [specModal, setSpecModal] = useState<{
    title: string;
    items: BuilderLineItem[];
  } | null>(null);
  const [orderModal, setOrderModal] = useState<{
    productId: string;
    label: string;
    items: BuilderLineItem[];
  } | null>(null);

  // Bake Test Modal State
  const [bakeTarget, setBakeTarget] = useState<{
    product: Product;
    version: RecipeVersion;
  } | null>(null);
  const [beforeG, setBeforeG] = useState(1180);
  const [afterG, setAfterG] = useState(1055);
  const [trimG, setTrimG] = useState(25);
  const [unitWeightG, setUnitWeightG] = useState(90);
  const [savingBake, setSavingBake] = useState(false);

  // Score & Validation Modal State
  const [scoreTarget, setScoreTarget] = useState<{
    product: Product;
    version: RecipeVersion;
  } | null>(null);
  const [scoreVal, setScoreVal] = useState<number>(8);
  const [valStatus, setValStatus] = useState<ValidationStatus>('testing');
  const [scoreNotes, setScoreNotes] = useState('');
  const [savingScore, setSavingScore] = useState(false);

  // Version Compare Modal
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareAId, setCompareAId] = useState('');
  const [compareBId, setCompareBId] = useState('');

  // Bulk CSV Import Modal
  const bulkFileRef = useRef<HTMLInputElement | null>(null);
  const [bulkPreview, setBulkPreview] = useState<{
    groups: ParsedBulkRecipeGroup[];
    missingBases: { recipe: string; baseRef: string }[];
    unmatchedIngredients: { recipe: string; ingredient: string }[];
  } | null>(null);
  const [importingBulk, setImportingBulk] = useState(false);

  // Experiments & Legacy Migration Collapsibles
  const [showExperiments, setShowExperiments] = useState(false);
  const [expProductId, setExpProductId] = useState('');
  const [expObjective, setExpObjective] = useState('');
  const [expBaselineId, setExpBaselineId] = useState('');
  const [expVariantId, setExpVariantId] = useState('');
  const [expVariable, setExpVariable] = useState('');
  const [expExpected, setExpExpected] = useState('');
  const [expDecision, setExpDecision] = useState<ExperimentDecision>('continue');
  const [savingExp, setSavingExp] = useState(false);

  const [showLegacy, setShowLegacy] = useState(false);
  const [migratingLegacyId, setMigratingLegacyId] = useState<string | null>(null);

  const versionsByProduct = useMemo(() => {
    const map = new Map<string, RecipeVersion[]>();
    for (const v of recipeVersions) {
      const list = map.get(v.productId) || [];
      list.push(v);
      map.set(v.productId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.versionNumber - a.versionNumber);
    }
    return map;
  }, [recipeVersions]);

  const unmigratedLegacy = useMemo(() => {
    const migratedIds = new Set(
      recipeVersions.map((v) => v.legacyRecipeId).filter(Boolean)
    );
    return legacyRecipes.filter((r) => !migratedIds.has(r.id));
  }, [legacyRecipes, recipeVersions]);

  const versionSelectList = useMemo(() => {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    return recipeVersions.map((v) => ({
      id: v.id,
      version: v,
      product: prodMap.get(v.productId),
      label: `${prodMap.get(v.productId)?.name || v.productId} · v${v.versionNumber}.0`,
    }));
  }, [products, recipeVersions]);

  const bakePreview = useMemo(
    () => computeBakeTestDerived(beforeG, afterG, trimG, unitWeightG),
    [beforeG, afterG, trimG, unitWeightG]
  );

  const openBakeModal = (product: Product, version: RecipeVersion) => {
    const prevBake = version.bakeTest;
    setBakeTarget({ product, version });
    setBeforeG(prevBake?.beforeG ?? Math.max(100, Math.round(version.batchSize || 1000)));
    setAfterG(prevBake?.afterG ?? Math.max(80, Math.round((version.batchSize || 1000) * 0.9)));
    setTrimG(prevBake?.trimG ?? 0);
    setUnitWeightG(prevBake?.unitWeightG ?? (version.targetPieceWeightG || 90));
  };

  const handleSaveBakeTest = async () => {
    if (!bakeTarget) return;
    setSavingBake(true);
    try {
      await saveBakeTestToVersion({
        version: bakeTarget.version,
        bakeTest: bakePreview,
      });
      setBakeTarget(null);
      onNotify(
        `Logged bake test for ${bakeTarget.product.name} v${bakeTarget.version.versionNumber}.0.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save bake test.', 'error');
    } finally {
      setSavingBake(false);
    }
  };

  const openScoreModal = (product: Product, version: RecipeVersion) => {
    setScoreTarget({ product, version });
    setScoreVal(version.score ?? 8);
    setValStatus(version.validationStatus);
    setScoreNotes(version.scoreNotes || version.actualOutcome || '');
  };

  const handleSaveScore = async () => {
    if (!scoreTarget) return;
    setSavingScore(true);
    try {
      await saveScoreToVersion({
        productId: scoreTarget.product.id,
        versionId: scoreTarget.version.id,
        score: scoreVal,
        validationStatus: valStatus,
        scoreNotes,
      });
      setScoreTarget(null);
      onNotify(
        `Updated validation & score for ${scoreTarget.product.name} v${scoreTarget.version.versionNumber}.0.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save score.', 'error');
    } finally {
      setSavingScore(false);
    }
  };

  const handleBulkCsvUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBulkRecipesCsv(text, library);
      setBulkPreview(parsed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid bulk CSV.', 'error');
    }
  };

  const handleCommitBulkImport = async () => {
    if (!bulkPreview || bulkPreview.groups.length === 0) return;
    setImportingBulk(true);
    try {
      let savedCount = 0;
      for (const grp of bulkPreview.groups) {
        if (grp.items.length === 0) continue;
        const draftObj: BuilderDraftState = {
          name: grp.recipeName,
          category: 'Bakery',
          unitWeightG: grp.unitWeightG,
          prepMinutes: 30,
          targetTempC: 175,
          methodNotes: `Bulk imported base/variant formulation: ${grp.recipeName}`,
          overheadCostKwd: 0,
          markupPct: 150,
          equipment: [],
          items: grp.items,
        };
        await saveFormulationAsVersion({
          uid,
          userName,
          draft: draftObj,
          libraryById,
          targetProductId: '__new__',
          existingProducts: products,
          existingVersions: recipeVersions,
          rationale: grp.rationale,
          expectedEffect: 'Bulk CSV import baseline',
        });
        savedCount++;
      }
      setBulkPreview(null);
      onNotify(`Saved ${savedCount} bulk-imported products & v1.0 formulations to Firestore.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Bulk import failed.', 'error');
    } finally {
      setImportingBulk(false);
    }
  };

  const handleCreateExperiment = async () => {
    if (!expProductId || !expObjective.trim() || !expVariable.trim()) {
      onNotify('Select a product, objective, and variable changed.', 'error');
      return;
    }
    setSavingExp(true);
    const expId = sanitizeId(`exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    try {
      await setDoc(doc(db, 'experiments', expId), {
        id: expId,
        productId: expProductId,
        ownerId: uid,
        objective: clampStr(expObjective, LIMITS.REASON_MAX),
        baselineVersionId: expBaselineId || '',
        variableChanged: clampStr(expVariable, LIMITS.REASON_MAX),
        experimentVersionId: expVariantId || '',
        expectedResult: clampStr(expExpected || 'Pending tasting panel', LIMITS.REASON_MAX),
        decision: expDecision,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setExpObjective('');
      setExpVariable('');
      setExpExpected('');
      onNotify('Logged A/B formulation experiment.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `experiments/${expId}`);
    } finally {
      setSavingExp(false);
    }
  };

  const handleMigrateLegacy = async (legacy: RecipeTest) => {
    setMigratingLegacyId(legacy.id);
    try {
      const prodId = sanitizeId(`prod_leg_${legacy.id.slice(0, 24)}`);
      const verId = sanitizeId(`${prodId}_v1_${Date.now().toString(36)}`);
      const now = serverTimestamp();
      const batch = writeBatch(db);
      const ingredients = (legacy.ingredients || []).map((ing) => ({
        name: clampStr(ing.name, 100),
        amountG: Number(ing.amount) || 0,
        unit: clampStr(ing.unit || 'g', 24),
        unitCostKwd: 0,
      }));
      const totalG = ingredients.reduce((s, i) => s + i.amountG, 0);
      batch.set(doc(db, 'products', prodId), {
        id: prodId,
        ownerId: uid,
        name: clampStr(legacy.title, 120),
        category: legacy.category,
        status: legacy.outcome === 'approved' ? 'active' : legacy.outcome === 'archived' ? 'archived' : 'testing',
        currentRecipeVersionId: verId,
        createdAt: now,
        updatedAt: now,
      });
      batch.set(doc(db, 'recipeVersions', verId), {
        id: verId,
        productId: prodId,
        ownerId: uid,
        versionNumber: 1,
        ingredients,
        batchSize: totalG,
        expectedYield: 12,
        yieldUnit: clampStr(legacy.yieldText || 'units', 40),
        prepMinutes: legacy.prepMinutes || 25,
        targetTempC: legacy.targetTempC || 175,
        method: clampStr(legacy.tastingNotes || 'Migrated from legacy recipe log', LIMITS.METHOD_MAX),
        equipment: [],
        expectedCost: 0,
        changeReason: `Migrated from legacy recipe ${legacy.version}`,
        expectedEffect: 'Baseline migration to immutable version history',
        actualOutcome: '',
        validationStatus: legacy.outcome === 'approved' ? 'approved' : 'testing',
        legacyRecipeId: legacy.id,
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
      onNotify(`Migrated "${legacy.title}" to immutable Product + v1.0.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Migration failed.', 'error');
    } finally {
      setMigratingLegacyId(null);
    }
  };

  // Compare two arbitrary versions
  const comparisonResult = useMemo(() => {
    const a = versionSelectList.find((x) => x.id === compareAId);
    const b = versionSelectList.find((x) => x.id === compareBId);
    if (!a || !b) return null;
    const draftB = versionToBuilderDraft(b.product || ({ name: b.label, category: 'Bakery' } as Product), b.version, library);
    const diffs = diffVersionPayloads(a.version, draftB, libraryById);
    const costDelta = (b.version.expectedCost || 0) - (a.version.expectedCost || 0);
    return { a, b, diffs, costDelta };
  }, [compareAId, compareBId, versionSelectList, library, libraryById]);

  return (
    <div className="space-y-5">
      {/* Header & Bulk Operations */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#0B3B2B] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Immutable R&amp;D Version Ledger &amp; Bake Test Analytics
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Versions &amp; Bake Tests ({products.length} products · {recipeVersions.length} versions)
          </h2>
          <p className="text-xs text-slate-600">
            Saved ingredient formulations are locked in Firestore. Iterate in the 3-Column Builder to create v+1 with automatic diffs, or log oven bake tests &amp; sensory scores here.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {recipeVersions.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setCompareAId(versionSelectList[1]?.id || versionSelectList[0]?.id || '');
                setCompareBId(versionSelectList[0]?.id || '');
                setCompareOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Compare Any 2 Versions
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadBulkRecipeTemplate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Bulk CSV Template
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => bulkFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Import (Base + Variants CSV)
            </button>
          )}
          <button
            type="button"
            onClick={() => exportAllSavedJSON(products, recipeVersions)}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => exportAllSavedCSV(products, recipeVersions)}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            Export CSV
          </button>
          <input
            ref={bulkFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleBulkCsvUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Product Version Cards */}
      {products.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
          <FlaskConical className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-800">
            No saved product versions yet
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Build a formulation in the <strong>Recipes</strong> 3-Column Builder and click{' '}
            <strong>Save Immutable Version</strong>, or use <strong>Bulk Import (CSV)</strong> above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const pVersions = versionsByProduct.get(product.id) || [];
            const latest = pVersions[0];

            return (
              <div
                key={product.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-900">{product.name}</h3>
                      <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                        {product.category}
                      </span>
                      <span className="font-mono text-[11px] font-semibold uppercase text-[#0B3B2B]">
                        · {product.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      {pVersions.length} version{pVersions.length === 1 ? '' : 's'}
                      {latest && (
                        <>
                          {' '}
                          · Current: v{latest.versionNumber}.0 ({latest.expectedYield}{' '}
                          {latest.yieldUnit} · {formatKwd(latest.expectedCost)} batch)
                        </>
                      )}
                      {product.sellingPriceKwd !== undefined && (
                        <> · Sell: {formatKwd(product.sellingPriceKwd)}/pc</>
                      )}
                    </div>
                  </div>

                  {latest && canBookKitchen && (
                    <button
                      type="button"
                      onClick={() =>
                        onBookKitchenFromVersion({
                          durationHours: Math.max(1, Math.ceil((latest.prepMinutes || 60) / 60)),
                          equipmentNames: latest.equipment || [],
                          notes: `Production trial: ${product.name} v${latest.versionNumber}.0 (${latest.expectedYield} ${latest.yieldUnit})`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap shrink-0"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Book Kitchen
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-200">
                  {pVersions.map((ver) => {
                    const draftForVer = versionToBuilderDraft(product, ver, library);
                    return (
                      <div key={ver.id} className="p-4 sm:px-5 space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono font-bold text-slate-900 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                                v{ver.versionNumber}.0
                              </span>
                              <span className="font-mono text-[11px] font-semibold uppercase text-[#0B3B2B]">
                                {VALIDATION_STATUS_LABELS[ver.validationStatus]}
                              </span>
                              {ver.score !== undefined && (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-orange-700">
                                  <Star className="w-3 h-3 fill-orange-500 text-orange-500" />
                                  {ver.score}/10
                                </span>
                              )}
                              <span className="font-mono tabular-nums text-slate-600">
                                · {formatWeightText(ver.batchSize)} · {ver.expectedYield}{' '}
                                {ver.yieldUnit} · Batch {formatKwd(ver.expectedCost)}
                              </span>
                              {ver.nutritionPer100g && (
                                <span className="font-mono tabular-nums text-slate-500">
                                  · {ver.nutritionPer100g.kcal} kcal/100g
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Rationale:</span>{' '}
                              {ver.changeReason}
                            </div>

                            {ver.diffs && ver.diffs.length > 0 && (
                              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
                                <span className="font-mono font-semibold text-slate-700">
                                  Diffs vs previous:{' '}
                                </span>
                                {ver.diffs
                                  .slice(0, 5)
                                  .map((d) => `${d.field}: ${d.from} → ${d.to}`)
                                  .join(' · ')}
                                {ver.diffs.length > 5 && ` (+${ver.diffs.length - 5} more)`}
                              </div>
                            )}

                            {ver.bakeTest && (
                              <div className="text-[11px] font-mono tabular-nums bg-emerald-50/70 border border-emerald-200 text-[#0B3B2B] rounded px-2.5 py-1.5">
                                Bake Test: {ver.bakeTest.actualYieldPieces}/
                                {ver.bakeTest.theoreticalYieldPieces} pcs actual ·{' '}
                                {ver.bakeTest.moistureLossPct.toFixed(1)}% moisture loss ·{' '}
                                {ver.bakeTest.wastagePct.toFixed(1)}% total wastage (usable{' '}
                                {ver.bakeTest.usableWeightG.toFixed(0)}g)
                              </div>
                            )}

                            {ver.scoreNotes && (
                              <div className="text-[11px] text-slate-500">
                                Panel notes: {ver.scoreNotes}
                              </div>
                            )}
                          </div>

                          {/* Version Actions */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onLoadVersionIntoBuilder(draftForVer)}
                              className="px-2.5 py-1.5 text-[11px] font-semibold bg-[#0B3B2B] text-white rounded hover:bg-[#08291E] whitespace-nowrap"
                            >
                              Load in Builder
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSpecModal({
                                  title: `${product.name} v${ver.versionNumber}.0`,
                                  items: draftForVer.items,
                                })
                              }
                              className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                            >
                              View Spec
                            </button>
                            {!readOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openBakeModal(product, ver)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100 whitespace-nowrap"
                                >
                                  <Scale className="w-3 h-3" />
                                  Log Bake Test
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openScoreModal(product, ver)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                                >
                                  <Star className="w-3 h-3 text-orange-500" />
                                  Score / Validate
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setOrderModal({
                                  productId: product.id,
                                  label: `${product.name} v${ver.versionNumber}.0`,
                                  items: draftForVer.items,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#0B3B2B] border border-emerald-300 bg-emerald-50 rounded hover:bg-emerald-100 whitespace-nowrap"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              Order Materials
                            </button>
                            <button
                              type="button"
                              onClick={() => exportCurrentRecipeJSON(draftForVer, libraryById)}
                              className="px-2 py-1.5 text-[11px] font-mono text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                            >
                              JSON
                            </button>
                            <button
                              type="button"
                              onClick={() => exportCurrentRecipeCSV(draftForVer, libraryById)}
                              className="px-2 py-1.5 text-[11px] font-mono text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                            >
                              CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => exportCurrentRecipeText(draftForVer, libraryById)}
                              className="px-2 py-1.5 text-[11px] font-mono text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                            >
                              TXT
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsible A/B Experiments Tracker */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExperiments((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left bg-slate-50 hover:bg-slate-100"
        >
          <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-[#0B3B2B]" />
            A/B Formulation Experiments Tracker ({experiments.length})
          </span>
          {showExperiments ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>
        {showExperiments && (
          <div className="p-5 space-y-4 border-t border-slate-200">
            {!readOnly && products.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-md p-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Product
                  </label>
                  <select
                    value={expProductId}
                    onChange={(e) => setExpProductId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Objective
                  </label>
                  <input
                    type="text"
                    value={expObjective}
                    onChange={(e) => setExpObjective(e.target.value)}
                    placeholder="e.g. Reduce added sugar 15%"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Variable Changed
                  </label>
                  <input
                    type="text"
                    value={expVariable}
                    onChange={(e) => setExpVariable(e.target.value)}
                    placeholder="e.g. Replaced white sugar with date paste"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Baseline Version
                  </label>
                  <select
                    value={expBaselineId}
                    onChange={(e) => setExpBaselineId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="">Optional...</option>
                    {versionSelectList
                      .filter((v) => !expProductId || v.version.productId === expProductId)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Test Version
                  </label>
                  <select
                    value={expVariantId}
                    onChange={(e) => setExpVariantId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="">Optional...</option>
                    {versionSelectList
                      .filter((v) => !expProductId || v.version.productId === expProductId)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <select
                    value={expDecision}
                    onChange={(e) => setExpDecision(e.target.value as ExperimentDecision)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="continue">Continue</option>
                    <option value="adopt">Adopt</option>
                    <option value="reject">Reject</option>
                  </select>
                  <button
                    type="button"
                    disabled={savingExp}
                    onClick={handleCreateExperiment}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#0B3B2B] text-white rounded hover:bg-[#08291E] whitespace-nowrap"
                  >
                    Log Experiment
                  </button>
                </div>
              </div>
            )}

            {experiments.length === 0 ? (
              <div className="text-xs text-slate-500">No A/B experiments logged yet.</div>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {experiments.map((exp) => {
                  const pName =
                    products.find((p) => p.id === exp.productId)?.name || exp.productId;
                  return (
                    <div key={exp.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {pName} — {exp.objective}
                        </div>
                        <div className="text-slate-600">
                          Variable: {exp.variableChanged} · Expected: {exp.expectedResult}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-bold uppercase text-[#0B3B2B] shrink-0">
                        {exp.decision}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Legacy Recipes Migration */}
      {unmigratedLegacy.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left bg-amber-50/60 hover:bg-amber-50"
          >
            <span className="text-xs font-bold text-amber-950 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-orange-600" />
              Legacy Recipes Ready to Migrate ({unmigratedLegacy.length})
            </span>
            {showLegacy ? (
              <ChevronUp className="w-4 h-4 text-amber-800" />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-800" />
            )}
          </button>
          {showLegacy && (
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {unmigratedLegacy.map((leg) => (
                <div
                  key={leg.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {leg.title} ({leg.version})
                    </div>
                    <div className="text-slate-500">
                      {leg.category} · {leg.ingredients.length} ingredients · {leg.yieldText}
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={migratingLegacyId === leg.id}
                      onClick={() => handleMigrateLegacy(leg)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded whitespace-nowrap"
                    >
                      {migratingLegacyId === leg.id ? 'Migrating...' : 'Migrate to v1.0'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bake Test Modal */}
      {bakeTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Log Bake Test — {bakeTarget.product.name} v{bakeTarget.version.versionNumber}.0
                </h3>
                <p className="text-xs text-slate-500">
                  Measures moisture loss % &amp; usable yield without altering immutable ingredients.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBakeTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Weight Before Baking (g)
                </label>
                <input
                  type="number"
                  min={1}
                  value={beforeG}
                  onChange={(e) => setBeforeG(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Weight After Baking (g)
                </label>
                <input
                  type="number"
                  min={0}
                  value={afterG}
                  onChange={(e) => setAfterG(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Trim / Scrap Loss (g)
                </label>
                <input
                  type="number"
                  min={0}
                  value={trimG}
                  onChange={(e) => setTrimG(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Target Piece Weight (g)
                </label>
                <input
                  type="number"
                  min={1}
                  value={unitWeightG}
                  onChange={(e) => setUnitWeightG(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-md p-3.5 grid grid-cols-2 gap-2 font-mono tabular-nums text-xs text-[#0B3B2B]">
              <div>
                Moisture Loss:{' '}
                <span className="font-bold">{bakePreview.moistureLossPct.toFixed(1)}%</span>
              </div>
              <div>
                Total Wastage:{' '}
                <span className="font-bold">{bakePreview.wastagePct.toFixed(1)}%</span>
              </div>
              <div>
                Usable Weight:{' '}
                <span className="font-bold">{bakePreview.usableWeightG.toFixed(0)} g</span>
              </div>
              <div>
                Yield:{' '}
                <span className="font-bold">
                  {bakePreview.actualYieldPieces} / {bakePreview.theoreticalYieldPieces} pcs
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBakeTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingBake}
                onClick={handleSaveBakeTest}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                {savingBake ? 'Saving...' : 'Save Bake Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score & Validate Modal */}
      {scoreTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Score &amp; Validate — v{scoreTarget.version.versionNumber}.0
                </h3>
                <p className="text-xs text-slate-500">{scoreTarget.product.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setScoreTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Sensory Score (1–10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scoreVal}
                  onChange={(e) =>
                    setScoreVal(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-full px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Validation Status
                </label>
                <select
                  value={valStatus}
                  onChange={(e) => setValStatus(e.target.value as ValidationStatus)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  {(Object.keys(VALIDATION_STATUS_LABELS) as ValidationStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {VALIDATION_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Tasting &amp; Panel Notes
              </label>
              <textarea
                rows={3}
                value={scoreNotes}
                onChange={(e) => setScoreNotes(e.target.value)}
                placeholder="Crumb texture, crust color, sweetness balance..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setScoreTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingScore}
                onClick={handleSaveScore}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md disabled:opacity-50"
              >
                {savingScore ? 'Saving...' : 'Save Validation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Any 2 Versions Modal */}
      {compareOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Compare Any 2 Versions</h3>
                <p className="text-xs text-slate-500">
                  Side-by-side gram &amp; KWD deltas across any saved formulations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Baseline (Version A)
                </label>
                <select
                  value={compareAId}
                  onChange={(e) => setCompareAId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  {versionSelectList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Comparison (Version B)
                </label>
                <select
                  value={compareBId}
                  onChange={(e) => setCompareBId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  {versionSelectList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {comparisonResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3 font-mono tabular-nums text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500">Version A Cost</div>
                    <div className="font-bold">
                      {formatKwd(comparisonResult.a.version.expectedCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Version B Cost</div>
                    <div className="font-bold">
                      {formatKwd(comparisonResult.b.version.expectedCost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Cost Delta</div>
                    <div
                      className={`font-bold ${
                        comparisonResult.costDelta > 0
                          ? 'text-red-700'
                          : comparisonResult.costDelta < 0
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {comparisonResult.costDelta >= 0 ? '+' : ''}
                      {formatKwd(comparisonResult.costDelta)}
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-md divide-y divide-slate-200 text-xs">
                  {comparisonResult.diffs.length === 0 ? (
                    <div className="p-4 text-center text-slate-500">
                      Identical formulation weights &amp; method.
                    </div>
                  ) : (
                    comparisonResult.diffs.map((d, i) => (
                      <div key={i} className="px-3 py-2 flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">{d.field}</span>
                        <span className="font-mono text-slate-700">
                          {String(d.from)} → <span className="font-bold text-[#0B3B2B]">{String(d.to)}</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Preview Modal */}
      {bulkPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Bulk CSV Recipe Import ({bulkPreview.groups.length} formulations)
                </h3>
                <p className="text-xs text-slate-500">
                  Base recipes with Code/BaseCode expand automatically into variant products.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(bulkPreview.missingBases.length > 0 ||
              bulkPreview.unmatchedIngredients.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 space-y-1">
                {bulkPreview.missingBases.map((m, i) => (
                  <div key={`mb-${i}`}>
                    Missing BaseCode &ldquo;{m.baseRef}&rdquo; for {m.recipe}
                  </div>
                ))}
                {bulkPreview.unmatchedIngredients.slice(0, 6).map((u, i) => (
                  <div key={`ui-${i}`}>
                    Unmatched ingredient &ldquo;{u.ingredient}&rdquo; in {u.recipe} (skipped)
                  </div>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-md divide-y divide-slate-200 text-xs max-h-64 overflow-y-auto">
              {bulkPreview.groups.map((g, idx) => (
                <div key={`${g.recipeName}-${idx}`} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{g.recipeName}</div>
                    <div className="text-slate-500">
                      {g.rationale} · {g.items.length} ingredients · {g.unitWeightG}g/pc
                    </div>
                  </div>
                  <Fragment>
                    <span className="font-mono font-semibold text-[#0B3B2B]">
                      {g.items.length > 0 ? 'Ready' : 'Empty'}
                    </span>
                  </Fragment>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importingBulk}
                onClick={handleCommitBulkImport}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                {importingBulk ? 'Saving to Firestore...' : 'Save All to Firestore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {specModal && (
        <ViewRecipeSpecModal
          title={specModal.title}
          items={specModal.items}
          categories={categories}
          libraryById={libraryById}
          onClose={() => setSpecModal(null)}
        />
      )}

      {orderModal && (
        <OrderMaterialsModal
          uid={uid}
          userName={userName}
          sourceProductId={orderModal.productId}
          sourceVersionLabel={orderModal.label}
          items={orderModal.items}
          libraryById={libraryById}
          stockMap={stockMap}
          onClose={() => setOrderModal(null)}
          onSuccess={(code) =>
            onNotify(`Purchase Order ${code} created in Raw Materials & Orders.`)
          }
          onOpenMaterialsOrders={onOpenMaterialsOrders}
        />
      )}
    </div>
  );
}
