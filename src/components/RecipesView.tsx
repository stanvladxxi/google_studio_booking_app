import { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Copy,
  FlaskConical,
  GitBranch,
  Lock,
  Plus,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  BookingPrefillRequest,
  ExperimentDecision,
  KitchenEquipment,
  LIMITS,
  Product,
  ProductStatus,
  RawMaterial,
  RecipeCategory,
  RecipeExperiment,
  RecipeTest,
  RecipeVersion,
  RecipeVersionIngredient,
  ValidationStatus,
  clampStr,
} from '../types';
import {
  buildMaterialOrderItems,
  computeBatchCosting,
  formatKwd,
  getStockSummary,
  roundKwd,
  toGrams,
} from '../utils/costing';

interface RecipesViewProps {
  uid: string;
  userName: string;
  recipes: RecipeTest[];
  products?: Product[];
  recipeVersions?: RecipeVersion[];
  experiments?: RecipeExperiment[];
  materials: RawMaterial[];
  equipment?: KitchenEquipment[];
  bookings: Booking[];
  loading: boolean;
  readOnly?: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenMaterialsOrders?: () => void;
  onBookKitchenFromVersion?: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
}

const RECIPE_CATEGORIES: RecipeCategory[] = [
  'Bakery',
  'Sauce & Emulsion',
  'Fermentation',
  'Plant-Based',
  'Confectionery',
  'Savory Prep',
];

const VALIDATION_STATUSES: { id: ValidationStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'testing', label: 'In Testing' },
  { id: 'consumer_validated', label: 'Consumer Validated' },
  { id: 'production_validated', label: 'Production Validated' },
  { id: 'approved', label: 'Approved for Menu' },
];

const VALIDATION_TEXT_CLASS: Record<ValidationStatus, string> = {
  draft: 'text-slate-600 font-medium',
  testing: 'text-amber-700 font-semibold',
  consumer_validated: 'text-sky-700 font-semibold',
  production_validated: 'text-teal-700 font-semibold',
  approved: 'text-emerald-700 font-semibold',
};

interface DraftIngredientRow {
  name: string;
  displayAmount: number;
  unit: string;
  unitCostKwd: string; // Optional manual override KWD/kg or KWD/unit
}

type CreatorTab = 'products' | 'compare' | 'experiments' | 'legacy';

export function RecipesView({
  uid,
  userName,
  recipes,
  products = [],
  recipeVersions = [],
  experiments = [],
  materials,
  equipment = [],
  bookings,
  loading,
  readOnly = false,
  onNotify,
  onOpenMaterialsOrders,
  onBookKitchenFromVersion,
}: RecipesViewProps) {
  const [activeTab, setActiveTab] = useState<CreatorTab>('products');

  // Recipe Creator / Version Authoring State
  const [iteratingProductId, setIteratingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<RecipeCategory>('Bakery');
  const [productStatus, setProductStatus] = useState<ProductStatus>('testing');
  const [expectedYield, setExpectedYield] = useState('24');
  const [yieldUnit, setYieldUnit] = useState('units');
  const [prepMinutes, setPrepMinutes] = useState('90');
  const [targetTempC, setTargetTempC] = useState('215');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [method, setMethod] = useState('');
  const [changeReason, setChangeReason] = useState('Initial baseline formulation');
  const [expectedEffect, setExpectedEffect] = useState('Baseline texture, crumb, and food cost');
  const [packagingCostKwd, setPackagingCostKwd] = useState('0.600');
  const [overheadCostKwd, setOverheadCostKwd] = useState('1.500');
  const [pricingMode, setPricingMode] = useState<'markup' | 'price'>('markup');
  const [markupPct, setMarkupPct] = useState('200');
  const [targetPriceOverride, setTargetPriceOverride] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredientRow[]>([
    { name: '', displayAmount: 500, unit: 'g', unitCostKwd: '' },
  ]);
  const [savingVersion, setSavingVersion] = useState(false);

  // Selection state for Products & Versions inspector
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [outcomeNotesInput, setOutcomeNotesInput] = useState<string>('');
  const [outcomeStatusInput, setOutcomeStatusInput] = useState<ValidationStatus>('testing');
  const [updatingOutcome, setUpdatingOutcome] = useState(false);

  // Order Raw Materials from Version state
  const [orderMultiplier, setOrderMultiplier] = useState('1');
  const [orderShortfallsOnly, setOrderShortfallsOnly] = useState(true);
  const [orderSupplier, setOrderSupplier] = useState('Al-Yasra Culinary Supply');
  const [placingOrder, setPlacingOrder] = useState(false);

  // Side-by-Side Version Compare state
  const [compareProductId, setCompareProductId] = useState<string>('');
  const [compareLeftVersionId, setCompareLeftVersionId] = useState<string>('');
  const [compareRightVersionId, setCompareRightVersionId] = useState<string>('');

  // Experiment state
  const [expProductId, setExpProductId] = useState<string>('');
  const [expObjective, setExpObjective] = useState('');
  const [expBaselineId, setExpBaselineId] = useState('');
  const [expVariantId, setExpVariantId] = useState('');
  const [expVariable, setExpVariable] = useState('');
  const [expExpectedResult, setExpExpectedResult] = useState('');
  const [expDecision, setExpDecision] = useState<ExperimentDecision>('continue');
  const [savingExperiment, setSavingExperiment] = useState(false);

  // Legacy Archive selection
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState<'all' | 'approved' | 'iterate' | 'archived'>('all');
  const [activeLegacyId, setActiveLegacyId] = useState<string | null>(null);
  const [migratingLegacyId, setMigratingLegacyId] = useState<string | null>(null);

  // Build normalized ingredients & deterministic live costing preview for Recipe Creator
  const normalizedDraftIngredients: RecipeVersionIngredient[] = useMemo(() => {
    return draftIngredients.map((row) => {
      const amountG = toGrams(row.displayAmount, row.unit);
      const manualCost = Number(row.unitCostKwd);
      return {
        name: row.name.trim(),
        amountG,
        unit: row.unit,
        displayAmount: Math.max(0, Number(row.displayAmount) || 0),
        unitCostKwd: Number.isFinite(manualCost) && manualCost > 0 ? manualCost : undefined,
      };
    });
  }, [draftIngredients]);

  const creatorCosting = useMemo(() => {
    const priceNum = Number(targetPriceOverride);
    return computeBatchCosting({
      ingredients: normalizedDraftIngredients,
      materials,
      expectedYield: Number(expectedYield) || 1,
      packagingCostKwd: Number(packagingCostKwd) || 0,
      overheadCostKwd: Number(overheadCostKwd) || 0,
      markupPct: Number(markupPct) || 0,
      sellingPriceOverrideKwd:
        pricingMode === 'price' && Number.isFinite(priceNum) && priceNum > 0
          ? priceNum
          : null,
    });
  }, [
    normalizedDraftIngredients,
    materials,
    expectedYield,
    packagingCostKwd,
    overheadCostKwd,
    markupPct,
    pricingMode,
    targetPriceOverride,
  ]);

  const activeProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0] || null;
  }, [products, selectedProductId]);

  const productVersions = useMemo(() => {
    if (!activeProduct) return [];
    return recipeVersions
      .filter((v) => v.productId === activeProduct.id)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }, [recipeVersions, activeProduct]);

  const activeVersion = useMemo(() => {
    if (!activeProduct) return null;
    return (
      productVersions.find((v) => v.id === selectedVersionId) ||
      productVersions.find((v) => v.id === activeProduct.currentRecipeVersionId) ||
      productVersions[0] ||
      null
    );
  }, [activeProduct, productVersions, selectedVersionId]);

  const activeVersionCosting = useMemo(() => {
    if (!activeVersion) return null;
    return computeBatchCosting({
      ingredients: activeVersion.ingredients,
      materials,
      expectedYield: activeVersion.expectedYield,
      packagingCostKwd: activeVersion.packagingCostKwd || 0,
      overheadCostKwd: activeVersion.overheadCostKwd || 0,
      markupPct: activeVersion.markupPct ?? 180,
      sellingPriceOverrideKwd: activeVersion.suggestedPriceKwd || null,
    });
  }, [activeVersion, materials]);

  const versionOrderItems = useMemo(() => {
    if (!activeVersionCosting) return [];
    return buildMaterialOrderItems(
      activeVersionCosting.lines,
      Number(orderMultiplier) || 1,
      orderShortfallsOnly
    );
  }, [activeVersionCosting, orderMultiplier, orderShortfallsOnly]);

  const versionOrderSubtotalKwd = useMemo(
    () => roundKwd(versionOrderItems.reduce((s, i) => s + i.lineTotalKwd, 0)),
    [versionOrderItems]
  );

  // Handlers for Recipe Creator ingredients
  const addIngredientRow = () => {
    if (draftIngredients.length >= 40) return;
    setDraftIngredients((prev) => [
      ...prev,
      { name: '', displayAmount: 100, unit: 'g', unitCostKwd: '' },
    ]);
  };

  const updateIngredientRow = (idx: number, patch: Partial<DraftIngredientRow>) => {
    setDraftIngredients((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeIngredientRow = (idx: number) => {
    setDraftIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleEquipmentItem = (eqName: string) => {
    setSelectedEquipment((prev) =>
      prev.includes(eqName) ? prev.filter((x) => x !== eqName) : [...prev, eqName].slice(0, 20)
    );
  };

  const resetCreatorForm = () => {
    setIteratingProductId(null);
    setProductName('');
    setCategory('Bakery');
    setProductStatus('testing');
    setExpectedYield('24');
    setYieldUnit('units');
    setPrepMinutes('90');
    setTargetTempC('215');
    setSelectedEquipment([]);
    setMethod('');
    setChangeReason('Initial baseline formulation');
    setExpectedEffect('Baseline texture, crumb, and food cost');
    setPackagingCostKwd('0.600');
    setOverheadCostKwd('1.500');
    setPricingMode('markup');
    setMarkupPct('200');
    setTargetPriceOverride('');
    setDraftIngredients([{ name: '', displayAmount: 500, unit: 'g', unitCostKwd: '' }]);
  };

  const handleStartIterateFromVersion = (product: Product, ver: RecipeVersion) => {
    setIteratingProductId(product.id);
    setProductName(product.name);
    setCategory(product.category);
    setProductStatus(product.status);
    setExpectedYield(String(ver.expectedYield));
    setYieldUnit(ver.yieldUnit || 'units');
    setPrepMinutes(String(ver.prepMinutes));
    setTargetTempC(String(ver.targetTempC));
    setSelectedEquipment(ver.equipment || []);
    setMethod(ver.method || '');
    setChangeReason('');
    setExpectedEffect('');
    setPackagingCostKwd(String(ver.packagingCostKwd ?? 0));
    setOverheadCostKwd(String(ver.overheadCostKwd ?? 0));
    setPricingMode('markup');
    setMarkupPct(String(ver.markupPct ?? 200));
    setTargetPriceOverride(ver.suggestedPriceKwd ? String(ver.suggestedPriceKwd) : '');
    setDraftIngredients(
      ver.ingredients.length > 0
        ? ver.ingredients.map((ing) => ({
            name: ing.name,
            displayAmount: ing.displayAmount ?? ing.amountG,
            unit: ing.unit || 'g',
            unitCostKwd: ing.unitCostKwd ? String(ing.unitCostKwd) : '',
          }))
        : [{ name: '', displayAmount: 100, unit: 'g', unitCostKwd: '' }]
    );
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveRecipeVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(productName, LIMITS.TITLE_MAX);
    if (!cleanName) {
      onNotify('Enter a product / recipe name.', 'error');
      return;
    }

    const validIngredients = normalizedDraftIngredients
      .filter((i) => i.name.length > 0 && i.amountG > 0)
      .slice(0, 40)
      .map((i) => ({
        name: clampStr(i.name, 80),
        amountG: i.amountG,
        unit: clampStr(i.unit || 'g', 16),
        displayAmount: i.displayAmount ?? i.amountG,
        ...(i.unitCostKwd !== undefined ? { unitCostKwd: roundKwd(i.unitCostKwd) } : {}),
      }));

    if (validIngredients.length === 0) {
      onNotify('Add at least one ingredient with weight/quantity.', 'error');
      return;
    }

    const existingProd = iteratingProductId
      ? products.find((p) => p.id === iteratingProductId) || null
      : null;

    const existingVers = existingProd
      ? recipeVersions.filter((v) => v.productId === existingProd.id)
      : [];
    const nextVersionNumber =
      existingVers.length > 0
        ? Math.max(...existingVers.map((v) => v.versionNumber)) + 1
        : 1;

    const prodId =
      existingProd?.id ||
      `prd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const verId = `rv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    const effectiveMarkup =
      pricingMode === 'price'
        ? Math.max(0, creatorCosting.impliedMarkupPct)
        : Math.max(0, Number(markupPct) || 0);

    setSavingVersion(true);
    try {
      const batch = writeBatch(db);

      if (existingProd) {
        batch.update(doc(db, 'products', prodId), {
          name: cleanName,
          category,
          status: productStatus,
          currentRecipeVersionId: verId,
          targetMarkupPct: effectiveMarkup,
          sellingPriceKwd: creatorCosting.activeSellingPriceKwd,
          updatedAt: now,
        });
      } else {
        batch.set(doc(db, 'products', prodId), {
          id: prodId,
          ownerId: uid,
          name: cleanName,
          category,
          status: productStatus,
          currentRecipeVersionId: verId,
          targetMarkupPct: effectiveMarkup,
          sellingPriceKwd: creatorCosting.activeSellingPriceKwd,
          createdAt: now,
          updatedAt: now,
        });
      }

      batch.set(doc(db, 'recipeVersions', verId), {
        id: verId,
        productId: prodId,
        ownerId: uid,
        versionNumber: nextVersionNumber,
        ingredients: validIngredients,
        batchSize: creatorCosting.totalBatchWeightG,
        expectedYield: Math.max(1, Number(expectedYield) || 1),
        yieldUnit: clampStr(yieldUnit || 'units', 24),
        prepMinutes: Math.max(0, Number(prepMinutes) || 0),
        targetTempC: Number(targetTempC) || 0,
        method: clampStr(method, LIMITS.METHOD_MAX),
        equipment: selectedEquipment.slice(0, 20),
        expectedCost: creatorCosting.totalBatchCostKwd,
        packagingCostKwd: creatorCosting.packagingCostKwd,
        overheadCostKwd: creatorCosting.overheadCostKwd,
        markupPct: effectiveMarkup,
        suggestedPriceKwd: creatorCosting.activeSellingPriceKwd,
        changeReason: clampStr(
          changeReason || (nextVersionNumber === 1 ? 'Initial formulation' : 'Formulation iteration'),
          LIMITS.REASON_MAX
        ),
        expectedEffect: clampStr(expectedEffect, LIMITS.REASON_MAX),
        actualOutcome: '',
        validationStatus: 'draft',
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'recipe',
        severity: 'info',
        station: category,
        tempReadingC: String(Number(targetTempC) || 0),
        message: clampStr(
          `Created immutable recipe ${cleanName} v${nextVersionNumber} (Cost: ${formatKwd(
            creatorCosting.costPerUnitKwd
          )}/${yieldUnit}, Price: ${formatKwd(creatorCosting.activeSellingPriceKwd)}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: '',
        createdAt: now,
      });

      await batch.commit();
      setSelectedProductId(prodId);
      setSelectedVersionId(verId);
      resetCreatorForm();
      onNotify(
        `Saved ${cleanName} v${nextVersionNumber} (immutable snapshot locked).`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `recipeVersions/${verId}`);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleSaveVersionOutcome = async (ver: RecipeVersion) => {
    if (readOnly) return;
    setUpdatingOutcome(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'recipeVersions', ver.id), {
        validationStatus: outcomeStatusInput,
        actualOutcome: clampStr(outcomeNotesInput, 600),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(
        `Updated v${ver.versionNumber} validation status to ${outcomeStatusInput.replace('_', ' ')}.`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recipeVersions/${ver.id}`);
    } finally {
      setUpdatingOutcome(false);
    }
  };

  const handlePlaceOrderFromVersion = async () => {
    if (!activeProduct || !activeVersion || versionOrderItems.length === 0) return;
    const orderId = `po_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderCode = `PO-${Date.now().toString().slice(-6)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();
    const expectedDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const cleanSupplier = clampStr(orderSupplier || 'Al-Yasra Culinary Supply', LIMITS.NAME_MAX);

    setPlacingOrder(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'materialOrders', orderId), {
        id: orderId,
        ownerId: uid,
        orderedByName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        orderCode,
        supplier: cleanSupplier,
        sourceProductId: activeProduct.id,
        sourceVersionLabel: clampStr(`${activeProduct.name} v${activeVersion.versionNumber}`, 48),
        items: versionOrderItems,
        subtotalKwd: versionOrderSubtotalKwd,
        deliveryFeeKwd: 0,
        totalKwd: versionOrderSubtotalKwd,
        status: 'ordered',
        expectedDate,
        notes: clampStr(
          `Generated from ${activeProduct.name} v${activeVersion.versionNumber} (${orderMultiplier}x batch${orderShortfallsOnly ? ', shortfalls only' : ''}).`,
          400
        ),
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'material',
        severity: 'info',
        station: 'Procurement',
        tempReadingC: '',
        message: clampStr(
          `Ordered ${versionOrderItems.length} raw materials (${formatKwd(
            versionOrderSubtotalKwd
          )}) for ${activeProduct.name} v${activeVersion.versionNumber} (${orderMultiplier}x).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: '',
        createdAt: now,
      });

      await batch.commit();
      onNotify(
        `Placed PO ${orderCode} (${formatKwd(versionOrderSubtotalKwd)}) for ${activeProduct.name} v${activeVersion.versionNumber}.`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `materialOrders/${orderId}`);
    } finally {
      setPlacingOrder(false);
    }
  };

  // Lazy migration of legacy recipe test doc -> Product + V1
  const handleMigrateLegacyRecipe = async (legacy: RecipeTest) => {
    setMigratingLegacyId(legacy.id);
    const prodId = `prd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const verId = `rv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    const mappedIngredients: RecipeVersionIngredient[] = legacy.ingredients.map((ing) => ({
      name: ing.name,
      amountG: toGrams(ing.amount, ing.unit),
      unit: ing.unit || 'g',
      displayAmount: ing.amount,
    }));

    const costing = computeBatchCosting({
      ingredients: mappedIngredients,
      materials,
      expectedYield: 20,
      markupPct: 200,
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'products', prodId), {
        id: prodId,
        ownerId: uid,
        name: clampStr(legacy.title, LIMITS.TITLE_MAX),
        category: legacy.category,
        status: legacy.outcome === 'approved' ? 'active' : legacy.outcome === 'archived' ? 'archived' : 'testing',
        currentRecipeVersionId: verId,
        targetMarkupPct: 200,
        sellingPriceKwd: costing.activeSellingPriceKwd,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'recipeVersions', verId), {
        id: verId,
        productId: prodId,
        ownerId: uid,
        versionNumber: 1,
        ingredients: mappedIngredients,
        batchSize: costing.totalBatchWeightG,
        expectedYield: 20,
        yieldUnit: 'units',
        prepMinutes: legacy.prepMinutes || 0,
        targetTempC: legacy.targetTempC || 0,
        method: clampStr(legacy.tastingNotes || `Migrated from legacy trial (${legacy.yieldText}).`, LIMITS.METHOD_MAX),
        equipment: [],
        expectedCost: costing.totalBatchCostKwd,
        packagingCostKwd: 0,
        overheadCostKwd: 0,
        markupPct: 200,
        suggestedPriceKwd: costing.activeSellingPriceKwd,
        changeReason: clampStr(`Migrated from legacy recipe ${legacy.version}`, LIMITS.REASON_MAX),
        expectedEffect: 'Preserve historical formulation as immutable V1',
        actualOutcome: clampStr(legacy.tastingNotes || '', 600),
        validationStatus: legacy.outcome === 'approved' ? 'approved' : 'testing',
        legacyRecipeId: legacy.id,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'recipe',
        severity: 'info',
        station: legacy.category,
        tempReadingC: String(legacy.targetTempC || 0),
        message: clampStr(
          `Converted legacy recipe "${legacy.title}" (${legacy.version}) into Product + immutable V1.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: legacy.bookingId || '',
        createdAt: now,
      });

      await batch.commit();
      setSelectedProductId(prodId);
      setSelectedVersionId(verId);
      setActiveTab('products');
      onNotify(`Converted "${legacy.title}" into Product + immutable V1 (original trial kept intact).`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${prodId}`);
    } finally {
      setMigratingLegacyId(null);
    }
  };

  // Experiment creation
  const effectiveExpProductId = expProductId || products[0]?.id || '';
  const expProductVersions = useMemo(
    () =>
      recipeVersions
        .filter((v) => v.productId === effectiveExpProductId)
        .sort((a, b) => a.versionNumber - b.versionNumber),
    [recipeVersions, effectiveExpProductId]
  );

  const handleSaveExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    const baseId = expBaselineId || expProductVersions[0]?.id;
    const varId = expVariantId || expProductVersions[expProductVersions.length - 1]?.id;
    if (!effectiveExpProductId || !baseId || !varId) {
      onNotify('Select a product and baseline/experiment versions first.', 'error');
      return;
    }
    if (!expObjective.trim() || !expVariable.trim()) {
      onNotify('Enter experiment objective and variable changed.', 'error');
      return;
    }

    const expId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();
    setSavingExperiment(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'experiments', expId), {
        id: expId,
        productId: effectiveExpProductId,
        ownerId: uid,
        objective: clampStr(expObjective, 300),
        baselineVersionId: baseId,
        variableChanged: clampStr(expVariable, 240),
        experimentVersionId: varId,
        expectedResult: clampStr(expExpectedResult, 400),
        decision: expDecision,
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
      setExpObjective('');
      setExpVariable('');
      setExpExpectedResult('');
      onNotify('Logged structured recipe experiment.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `experiments/${expId}`);
    } finally {
      setSavingExperiment(false);
    }
  };

  const handleUpdateExperimentDecision = async (exp: RecipeExperiment, decision: ExperimentDecision) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'experiments', exp.id), {
        decision,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(`Experiment decision set to ${decision.toUpperCase()}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `experiments/${exp.id}`);
    }
  };

  // Compare View computation
  const effectiveCompareProductId = compareProductId || products[0]?.id || '';
  const compareVersionsList = useMemo(
    () =>
      recipeVersions
        .filter((v) => v.productId === effectiveCompareProductId)
        .sort((a, b) => a.versionNumber - b.versionNumber),
    [recipeVersions, effectiveCompareProductId]
  );
  const leftVersion =
    compareVersionsList.find((v) => v.id === compareLeftVersionId) ||
    compareVersionsList[0] ||
    null;
  const rightVersion =
    compareVersionsList.find((v) => v.id === compareRightVersionId) ||
    compareVersionsList[compareVersionsList.length - 1] ||
    null;

  const ingredientDiffRows = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    const names = new Set<string>([
      ...leftVersion.ingredients.map((i) => i.name),
      ...rightVersion.ingredients.map((i) => i.name),
    ]);
    return Array.from(names).map((ingName) => {
      const a = leftVersion.ingredients.find((i) => i.name === ingName);
      const b = rightVersion.ingredients.find((i) => i.name === ingName);
      const gA = a?.amountG ?? 0;
      const gB = b?.amountG ?? 0;
      const deltaG = Math.round((gB - gA) * 100) / 100;
      return { name: ingName, gA, gB, deltaG };
    });
  }, [leftVersion, rightVersion]);

  // Legacy delete
  const handleDeleteLegacy = async (recipe: RecipeTest) => {
    try {
      await deleteDoc(doc(db, 'recipes', recipe.id));
      if (activeLegacyId === recipe.id) setActiveLegacyId(null);
      onNotify(`Deleted legacy trial "${recipe.title}".`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `recipes/${recipe.id}`);
    }
  };

  const filteredLegacy = useMemo(
    () =>
      recipes.filter(
        (r) => selectedOutcomeFilter === 'all' || r.outcome === selectedOutcomeFilter
      ),
    [recipes, selectedOutcomeFilter]
  );
  const activeLegacy =
    filteredLegacy.find((r) => r.id === activeLegacyId) || filteredLegacy[0] || null;

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Header & Workspace Mode Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {readOnly ? 'Recipe Formulations & Costing (Read-Only)' : 'Recipe Creator & Version Control'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {readOnly
              ? 'Review immutable product versions, KWD unit costs, yields, and process methods. Authoring is reserved for Recipe Developers and Admins.'
              : 'Author gram-normalized products, lock immutable versions, model KWD costs & markup margins, and order missing raw materials.'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start overflow-x-auto">
          {(
            [
              { id: 'products', label: `Products & Versions (${products.length})` },
              { id: 'compare', label: 'Compare Versions' },
              { id: 'experiments', label: `Experiments (${experiments.length})` },
              { id: 'legacy', label: `Legacy Trials (${recipes.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: PRODUCTS, RECIPE CREATOR, COSTING & MARKUP ENGINE */}
      {activeTab === 'products' && (
        <div className="space-y-8">
          {!readOnly && (
            <form
              onSubmit={handleSaveRecipeVersion}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-6"
            >
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-teal-700" />
                    <h3 className="text-base font-semibold text-slate-900">
                      {iteratingProductId
                        ? `Iterate New Version · ${productName}`
                        : 'Create New Product & V1 Formulation'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every saved formulation becomes an immutable snapshot in version history; costs convert to grams in KWD.
                  </p>
                </div>

                {iteratingProductId && (
                  <button
                    type="button"
                    onClick={resetCreatorForm}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    Switch to New Product
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 8 Cols: Recipe Metadata & Gram Ingredients */}
                <div className="lg:col-span-8 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-slate-700">Product Name</span>
                      <input
                        type="text"
                        maxLength={LIMITS.TITLE_MAX}
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="e.g. Cardamom Cultured Brioche"
                        required
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Category</span>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as RecipeCategory)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        {RECIPE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Product Status</span>
                      <select
                        value={productStatus}
                        onChange={(e) => setProductStatus(e.target.value as ProductStatus)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        <option value="testing">Testing</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-slate-700">Expected Yield</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={expectedYield}
                          onChange={(e) => setExpectedYield(e.target.value)}
                          required
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-slate-700">Yield Unit</span>
                        <input
                          type="text"
                          maxLength={24}
                          value={yieldUnit}
                          onChange={(e) => setYieldUnit(e.target.value)}
                          placeholder="units"
                          required
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Prep &amp; Cook (min)</span>
                      <input
                        type="number"
                        min="0"
                        value={prepMinutes}
                        onChange={(e) => setPrepMinutes(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Target Temp (°C)</span>
                      <input
                        type="number"
                        min="-50"
                        max="450"
                        value={targetTempC}
                        onChange={(e) => setTargetTempC(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Batch Weight (auto g)</span>
                      <div className="px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-800">
                        {creatorCosting.totalBatchWeightG.toLocaleString()} g
                      </div>
                    </label>
                  </div>

                  {/* Ingredients with live KWD & stock lookup */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Ingredients (auto-converted to grams · linked to Raw Materials stock)
                      </span>
                      <button
                        type="button"
                        onClick={addIngredientRow}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Ingredient
                      </button>
                    </div>

                    <datalist id="creator-materials-datalist">
                      {materials.map((m) => (
                        <option key={m.id} value={m.name} />
                      ))}
                    </datalist>

                    <div className="space-y-2">
                      {draftIngredients.map((row, idx) => {
                        const stockInfo = getStockSummary(row.name, materials);
                        const grams = toGrams(row.displayAmount, row.unit);
                        const linePreview = creatorCosting.lines.find(
                          (l) => l.name === row.name.trim()
                        );
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <input
                                type="text"
                                list="creator-materials-datalist"
                                value={row.name}
                                onChange={(e) => updateIngredientRow(idx, { name: e.target.value })}
                                placeholder="Ingredient (select stock or type)"
                                className="col-span-5 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                              />
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={row.displayAmount}
                                onChange={(e) =>
                                  updateIngredientRow(idx, { displayAmount: Number(e.target.value) })
                                }
                                className="col-span-2 px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                              />
                              <select
                                value={row.unit}
                                onChange={(e) => updateIngredientRow(idx, { unit: e.target.value })}
                                className="col-span-2 px-2 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                              >
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="mL">mL</option>
                                <option value="L">L</option>
                                <option value="units">units</option>
                              </select>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={row.unitCostKwd}
                                onChange={(e) =>
                                  updateIngredientRow(idx, { unitCostKwd: e.target.value })
                                }
                                placeholder={
                                  stockInfo.costPerKgOrUnitKwd > 0
                                    ? `${stockInfo.costPerKgOrUnitKwd.toFixed(3)}`
                                    : 'KWD/kg'
                                }
                                title="Optional manual rate in KWD per kg (or per unit)"
                                className="col-span-2 px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                              />
                              <button
                                type="button"
                                onClick={() => removeIngredientRow(idx)}
                                disabled={draftIngredients.length === 1}
                                className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 flex justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {row.name.trim() && (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pl-1">
                                <span className="font-mono tabular-nums">
                                  {grams} {row.unit === 'units' ? 'units' : 'g'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-700">
                                  Line Cost: {formatKwd(linePreview?.lineCostKwd ?? 0)}
                                </span>
                                <span aria-hidden="true">·</span>
                                {stockInfo.matchedMaterialName ? (
                                  <span
                                    className={`font-mono tabular-nums ${
                                      (linePreview?.shortfallG ?? 0) > 0
                                        ? 'text-amber-700 font-medium'
                                        : 'text-emerald-700'
                                    }`}
                                  >
                                    Stock: {stockInfo.totalStockGrams.toLocaleString()}{' '}
                                    {stockInfo.isDiscreteUnits ? 'units' : 'g'}
                                    {(linePreview?.shortfallG ?? 0) > 0
                                      ? ` (Short ${linePreview?.shortfallG} g)`
                                      : ' (Ready)'}
                                  </span>
                                ) : (
                                  <span className="text-amber-700">
                                    Not in stock ledger (will need PO or manual KWD/kg rate)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Method, Equipment, & Version Change Reason */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">
                        Change Reason / Version Intent
                      </span>
                      <input
                        type="text"
                        maxLength={LIMITS.REASON_MAX}
                        value={changeReason}
                        onChange={(e) => setChangeReason(e.target.value)}
                        placeholder="e.g. Increased butter hydration +4% for flakier lamination"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Expected Effect</span>
                      <input
                        type="text"
                        maxLength={LIMITS.REASON_MAX}
                        value={expectedEffect}
                        onChange={(e) => setExpectedEffect(e.target.value)}
                        placeholder="e.g. Higher oven spring, 2% lower shrink"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>
                  </div>

                  {equipment.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-700">Required Equipment</span>
                      <div className="flex flex-wrap gap-1.5">
                        {equipment.slice(0, 12).map((eq) => {
                          const active = selectedEquipment.includes(eq.name);
                          return (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() => toggleEquipmentItem(eq.name)}
                              className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-teal-700 border-teal-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {eq.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-700">Method &amp; Process Steps</span>
                    <textarea
                      rows={3}
                      maxLength={LIMITS.METHOD_MAX}
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      placeholder="Step-by-step mixing speeds, fermentation times, fold counts, oven deck temps..."
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </label>
                </div>

                {/* Right 4 Cols: Deterministic KWD Costing & Markup Engine */}
                <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                    <Calculator className="w-4 h-4 text-teal-700" />
                    <h4 className="text-sm font-semibold text-slate-900">
                      KWD Costing &amp; Markup Engine
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-slate-600">
                        Packaging (KWD/batch)
                      </span>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={packagingCostKwd}
                        onChange={(e) => setPackagingCostKwd(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-slate-600">
                        Kitchen/Labor (KWD)
                      </span>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={overheadCostKwd}
                        onChange={(e) => setOverheadCostKwd(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                      />
                    </label>
                  </div>

                  {/* Pricing Mode Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                      <button
                        type="button"
                        onClick={() => setPricingMode('markup')}
                        className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                          pricingMode === 'markup'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        By Markup %
                      </button>
                      <button
                        type="button"
                        onClick={() => setPricingMode('price')}
                        className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                          pricingMode === 'price'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        By Target KWD Price
                      </button>
                    </div>

                    {pricingMode === 'markup' ? (
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-slate-600">
                          Markup Over Cost (%)
                        </span>
                        <input
                          type="number"
                          step="5"
                          min="0"
                          max="5000"
                          value={markupPct}
                          onChange={(e) => setMarkupPct(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                        />
                      </label>
                    ) : (
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-slate-600">
                          Target Selling Price (KWD / {yieldUnit})
                        </span>
                        <input
                          type="number"
                          step="0.050"
                          min="0"
                          value={targetPriceOverride}
                          onChange={(e) => setTargetPriceOverride(e.target.value)}
                          placeholder={creatorCosting.suggestedPriceKwd.toFixed(3)}
                          className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                        />
                      </label>
                    )}
                  </div>

                  {/* Deterministic Breakdown Table */}
                  <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Ingredients Cost</span>
                      <span className="font-mono tabular-nums">
                        {formatKwd(creatorCosting.ingredientCostKwd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Batch Cost</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatKwd(creatorCosting.totalBatchCostKwd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Cost per {yieldUnit}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatKwd(creatorCosting.costPerUnitKwd)}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline">
                      <span className="font-semibold text-slate-900">Suggested Selling Price</span>
                      <span className="text-base font-mono tabular-nums font-bold text-teal-800">
                        {formatKwd(creatorCosting.activeSellingPriceKwd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Gross Profit / {yieldUnit}</span>
                      <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                        {formatKwd(creatorCosting.grossProfitPerUnitKwd)} ({creatorCosting.grossMarginPct}%)
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Markup · Food Cost %</span>
                      <span className="font-mono tabular-nums">
                        {pricingMode === 'price'
                          ? `${creatorCosting.impliedMarkupPct}%`
                          : `${creatorCosting.markupPct}%`}{' '}
                        · {creatorCosting.foodCostPct}%
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Projected Batch Profit</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatKwd(creatorCosting.batchProfitKwd)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingVersion}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap"
                  >
                    <GitBranch className="w-4 h-4" />
                    {savingVersion
                      ? 'Saving Version...'
                      : iteratingProductId
                      ? 'Lock New Immutable Version'
                      : 'Create Product + V1'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Product Catalog + Version History & Order Raw Materials */}
          {products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">No versioned products created yet</p>
              <p className="text-xs text-slate-500">
                Create your first product above or convert an existing entry from the Legacy Trials tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 4 Cols: Products & Versions Tree */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                  <div className="px-4 py-3 bg-slate-50 text-xs font-semibold text-slate-700">
                    Products ({products.length})
                  </div>
                  {products.map((p) => {
                    const isSelected = activeProduct?.id === p.id;
                    const verCount = recipeVersions.filter((v) => v.productId === p.id).length;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setSelectedVersionId(p.currentRecipeVersionId);
                        }}
                        className={`w-full text-left p-4 transition-colors ${
                          isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-900">{p.name}</span>
                          <span className="font-mono tabular-nums text-xs text-teal-800 font-semibold shrink-0">
                            {p.sellingPriceKwd ? formatKwd(p.sellingPriceKwd) : '—'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>{p.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{verCount} versions</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{p.status}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {activeProduct && (
                  <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                    <div className="px-4 py-3 bg-slate-50 text-xs font-semibold text-slate-700">
                      Version Timeline · {activeProduct.name}
                    </div>
                    {productVersions.map((v) => {
                      const isSel = activeVersion?.id === v.id;
                      const isCurrent = activeProduct.currentRecipeVersionId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVersionId(v.id);
                            setOutcomeNotesInput(v.actualOutcome || '');
                            setOutcomeStatusInput(v.validationStatus);
                          }}
                          className={`w-full text-left p-3.5 transition-colors ${
                            isSel ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-900">
                              v{v.versionNumber}
                              {isCurrent ? ' (Current)' : ''}
                            </span>
                            <span className={`text-xs ${VALIDATION_TEXT_CLASS[v.validationStatus]}`}>
                              {v.validationStatus.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 truncate">
                            {v.changeReason || 'Formulation snapshot'}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600">
                            <span>Batch: {formatKwd(v.expectedCost)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Unit: {formatKwd(v.expectedCost / Math.max(1, v.expectedYield))}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 8 Cols: Active Version Detail + Order Raw Materials */}
              {activeProduct && activeVersion && activeVersionCosting && (
                <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {activeProduct.name}
                          </h3>
                          <span className="font-mono text-sm font-semibold text-teal-800">
                            v{activeVersion.versionNumber}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Lock className="w-3 h-3" />
                            Immutable Formulation
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{activeProduct.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{activeVersion.batchSize} g</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Yield: {activeVersion.expectedYield} {activeVersion.yieldUnit}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{activeVersion.targetTempC}°C</span>
                          <span aria-hidden="true">·</span>
                          <span className={VALIDATION_TEXT_CLASS[activeVersion.validationStatus]}>
                            {activeVersion.validationStatus.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onBookKitchenFromVersion && (
                          <button
                            type="button"
                            onClick={() =>
                              onBookKitchenFromVersion({
                                durationHours: Math.min(
                                  12,
                                  Math.max(1, Math.ceil((activeVersion.prepMinutes || 60) / 60))
                                ),
                                equipmentNames: activeVersion.equipment || [],
                                notes: `En Cuisine Recipe: ${activeProduct.name} (v${activeVersion.versionNumber}) · Yield: ${activeVersion.expectedYield} ${activeVersion.yieldUnit}`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Book a Kitchen
                          </button>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleStartIterateFromVersion(activeProduct, activeVersion)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Iterate New Version
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cost & Markup KPI Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                        <div className="text-[11px] text-slate-500">Batch Cost</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                          {formatKwd(activeVersionCosting.totalBatchCostKwd)}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                        <div className="text-[11px] text-slate-500">
                          Cost / {activeVersion.yieldUnit}
                        </div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                          {formatKwd(activeVersionCosting.costPerUnitKwd)}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                        <div className="text-[11px] text-slate-500">Selling Price</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-teal-800 mt-0.5">
                          {formatKwd(activeVersionCosting.activeSellingPriceKwd)}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                        <div className="text-[11px] text-slate-500">Margin / Markup</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-emerald-700 mt-0.5">
                          {activeVersionCosting.grossMarginPct}% · {activeVersionCosting.impliedMarkupPct}%
                        </div>
                      </div>
                    </div>

                    {/* Ingredients Breakdown with Live Stock Status */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 mb-2">
                        Formulation &amp; Live Stock Check (Grams + KWD)
                      </h4>
                      <div className="border border-slate-200 rounded-md overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="py-2 px-3">Ingredient</th>
                              <th className="py-2 px-3 text-right">Batch Weight</th>
                              <th className="py-2 px-3 text-right">Stock Available</th>
                              <th className="py-2 px-3 text-right">Line Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeVersionCosting.lines.map((line, i) => (
                              <tr key={i}>
                                <td className="py-2 px-3 text-slate-900 font-medium">{line.name}</td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                  {line.amountG} {line.unit === 'units' ? 'units' : 'g'}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-mono tabular-nums ${
                                    line.shortfallG > 0
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {line.stockAvailableG.toLocaleString()}{' '}
                                  {line.unit === 'units' ? 'units' : 'g'}
                                  {line.shortfallG > 0 ? ` (-${line.shortfallG}g)` : ''}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                                  {formatKwd(line.lineCostKwd)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Method & Change Log */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-700">Change Reason</div>
                        <p className="text-slate-600">{activeVersion.changeReason || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-700">Expected Effect</div>
                        <p className="text-slate-600">{activeVersion.expectedEffect || '—'}</p>
                      </div>
                    </div>

                    {activeVersion.method && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-700">Process Method</div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {activeVersion.method}
                        </p>
                      </div>
                    )}

                    {/* Outcome & Validation Status Update (only non-immutable fields) */}
                    {!readOnly && (
                      <div className="border-t border-slate-200 pt-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            Update Outcome &amp; Validation Stage (Formulation stays locked)
                          </span>
                          <select
                            value={outcomeStatusInput}
                            onChange={(e) =>
                              setOutcomeStatusInput(e.target.value as ValidationStatus)
                            }
                            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                          >
                            {VALIDATION_STATUSES.map((vs) => (
                              <option key={vs.id} value={vs.id}>
                                {vs.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            maxLength={600}
                            value={outcomeNotesInput}
                            onChange={(e) => setOutcomeNotesInput(e.target.value)}
                            placeholder="Record actual baking/sensory outcome for this version..."
                            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                          />
                          <button
                            type="button"
                            disabled={updatingOutcome}
                            onClick={() => handleSaveVersionOutcome(activeVersion)}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-800 bg-white border border-teal-300 hover:bg-teal-50 rounded-md whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {updatingOutcome ? 'Saving...' : 'Save Outcome'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Order Raw Materials Engine for Selected Version */}
                  <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-teal-700" />
                          <h4 className="text-sm font-semibold text-slate-900">
                            Order Raw Materials for {activeProduct.name} v{activeVersion.versionNumber}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Calculate missing inventory shortfalls or scale up a full multi-batch purchase order in KWD.
                        </p>
                      </div>

                      {onOpenMaterialsOrders && (
                        <button
                          type="button"
                          onClick={onOpenMaterialsOrders}
                          className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                        >
                          View All Material Orders →
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-700">Batch Multiplier</span>
                        <select
                          value={orderMultiplier}
                          onChange={(e) => setOrderMultiplier(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                        >
                          <option value="1">1x Batch ({activeVersion.expectedYield} {activeVersion.yieldUnit})</option>
                          <option value="2">2x Batches ({activeVersion.expectedYield * 2} {activeVersion.yieldUnit})</option>
                          <option value="5">5x Batches ({activeVersion.expectedYield * 5} {activeVersion.yieldUnit})</option>
                          <option value="10">10x Batches ({activeVersion.expectedYield * 10} {activeVersion.yieldUnit})</option>
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-slate-700">Supplier</span>
                        <input
                          type="text"
                          maxLength={LIMITS.NAME_MAX}
                          value={orderSupplier}
                          onChange={(e) => setOrderSupplier(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                        />
                      </label>

                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setOrderShortfallsOnly(true)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            orderShortfallsOnly
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          Shortfalls Only
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderShortfallsOnly(false)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            !orderShortfallsOnly
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          Full Batch
                        </button>
                      </div>
                    </div>

                    {versionOrderItems.length === 0 ? (
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-md p-4 text-xs text-emerald-900 flex items-center justify-between">
                        <span>
                          All required ingredients for {orderMultiplier}x batch are already in stock.
                        </span>
                        <button
                          type="button"
                          onClick={() => setOrderShortfallsOnly(false)}
                          className="font-semibold underline whitespace-nowrap ml-3"
                        >
                          Order Full Replenishment Instead
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="border border-slate-200 rounded-md divide-y divide-slate-200 text-xs">
                          {versionOrderItems.map((item, idx) => (
                            <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2">
                              <div>
                                <span className="font-medium text-slate-900">{item.materialName}</span>
                                <span className="text-slate-400 mx-1.5" aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-700">
                                  {item.quantity} {item.unit}
                                </span>
                              </div>
                              <span className="font-mono tabular-nums font-medium text-slate-900">
                                {formatKwd(item.lineTotalKwd)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-slate-600">
                            Estimated PO Subtotal:{' '}
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              {formatKwd(versionOrderSubtotalKwd)}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={placingOrder}
                            onClick={handlePlaceOrderFromVersion}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {placingOrder
                              ? 'Placing Order...'
                              : `Place Raw Material Order (${formatKwd(versionOrderSubtotalKwd)})`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SIDE-BY-SIDE VERSION COMPARE */}
      {activeTab === 'compare' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-teal-700" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Side-by-Side Version Comparison
                </h3>
                <p className="text-xs text-slate-500">
                  Compare gram formulations, KWD batch cost, cost per unit, yields, and outcomes across versions.
                </p>
              </div>
            </div>

            {products.length > 0 && (
              <select
                value={effectiveCompareProductId}
                onChange={(e) => {
                  setCompareProductId(e.target.value);
                  setCompareLeftVersionId('');
                  setCompareRightVersionId('');
                }}
                className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {compareVersionsList.length < 2 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Select a product with at least 2 versions (click &ldquo;Iterate New Version&rdquo; on a product) to compare side by side.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">Baseline Version (A)</span>
                  <select
                    value={leftVersion?.id || ''}
                    onChange={(e) => setCompareLeftVersionId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                  >
                    {compareVersionsList.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.versionNumber} · {v.validationStatus} ({formatKwd(v.expectedCost)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">Comparison Version (B)</span>
                  <select
                    value={rightVersion?.id || ''}
                    onChange={(e) => setCompareRightVersionId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                  >
                    {compareVersionsList.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.versionNumber} · {v.validationStatus} ({formatKwd(v.expectedCost)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {leftVersion && rightVersion && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <div className="text-slate-500">Batch Cost Delta</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-1">
                        {formatKwd(rightVersion.expectedCost - leftVersion.expectedCost)}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <div className="text-slate-500">Unit Cost (A vs B)</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-1">
                        {formatKwd(leftVersion.expectedCost / Math.max(1, leftVersion.expectedYield))} →{' '}
                        {formatKwd(rightVersion.expectedCost / Math.max(1, rightVersion.expectedYield))}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <div className="text-slate-500">Yield (A vs B)</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-1">
                        {leftVersion.expectedYield} → {rightVersion.expectedYield} {rightVersion.yieldUnit}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <div className="text-slate-500">Status (A vs B)</div>
                      <div className="text-sm font-semibold text-teal-800 mt-1">
                        {leftVersion.validationStatus} → {rightVersion.validationStatus}
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-4">Ingredient</th>
                          <th className="py-2.5 px-4 text-right">v{leftVersion.versionNumber} (g)</th>
                          <th className="py-2.5 px-4 text-right">v{rightVersion.versionNumber} (g)</th>
                          <th className="py-2.5 px-4 text-right">Delta (g)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {ingredientDiffRows.map((row) => (
                          <tr key={row.name}>
                            <td className="py-2.5 px-4 font-medium text-slate-900">{row.name}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {row.gA}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                              {row.gB}
                            </td>
                            <td
                              className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                                row.deltaG > 0
                                  ? 'text-teal-700'
                                  : row.deltaG < 0
                                  ? 'text-amber-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {row.deltaG > 0 ? `+${row.deltaG}` : row.deltaG}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EXPERIMENT RECORDS */}
      {activeTab === 'experiments' && (
        <div className="space-y-6">
          {!readOnly && products.length > 0 && (
            <form
              onSubmit={handleSaveExperiment}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <h3 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
                Log Structured Formulation Experiment
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Product</span>
                  <select
                    value={effectiveExpProductId}
                    onChange={(e) => {
                      setExpProductId(e.target.value);
                      setExpBaselineId('');
                      setExpVariantId('');
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Baseline Version</span>
                  <select
                    value={expBaselineId || expProductVersions[0]?.id || ''}
                    onChange={(e) => setExpBaselineId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                  >
                    {expProductVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.versionNumber}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Experiment Version</span>
                  <select
                    value={
                      expVariantId ||
                      expProductVersions[expProductVersions.length - 1]?.id ||
                      ''
                    }
                    onChange={(e) => setExpVariantId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                  >
                    {expProductVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.versionNumber}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Objective</span>
                  <input
                    type="text"
                    maxLength={300}
                    value={expObjective}
                    onChange={(e) => setExpObjective(e.target.value)}
                    placeholder="e.g. Reduce unit cost 8% without texture loss"
                    required
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Variable Changed</span>
                  <input
                    type="text"
                    maxLength={240}
                    value={expVariable}
                    onChange={(e) => setExpVariable(e.target.value)}
                    placeholder="e.g. Butter ratio 28% -> 24%, hydration +2%"
                    required
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Decision</span>
                  <select
                    value={expDecision}
                    onChange={(e) => setExpDecision(e.target.value as ExperimentDecision)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  >
                    <option value="continue">Continue Testing</option>
                    <option value="adopt">Adopt Variant</option>
                    <option value="reject">Reject Variant</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <label className="block flex-1 space-y-1.5 w-full">
                  <span className="text-xs font-medium text-slate-700">Expected Result</span>
                  <input
                    type="text"
                    maxLength={400}
                    value={expExpectedResult}
                    onChange={(e) => setExpExpectedResult(e.target.value)}
                    placeholder="Target sensory/cost outcome..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingExperiment}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                >
                  {savingExperiment ? 'Logging...' : 'Log Experiment'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {experiments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No experiments recorded yet. Create a product with versions to track hypothesis tests.
              </div>
            ) : (
              experiments.map((exp) => {
                const prod = products.find((p) => p.id === exp.productId);
                const baseV = recipeVersions.find((v) => v.id === exp.baselineVersionId);
                const varV = recipeVersions.find((v) => v.id === exp.experimentVersionId);
                return (
                  <div key={exp.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {prod?.name || 'Product'} ·{' '}
                        <span className="font-mono text-xs text-slate-600">
                          v{baseV?.versionNumber ?? '?'} vs v{varV?.versionNumber ?? '?'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700">
                        <span className="font-medium">Objective:</span> {exp.objective}
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="font-medium">Variable:</span> {exp.variableChanged}
                        {exp.expectedResult ? ` · Expected: ${exp.expectedResult}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['continue', 'adopt', 'reject'] as const).map((dec) => (
                        <button
                          key={dec}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleUpdateExperimentDecision(exp, dec)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize transition-colors ${
                            exp.decision === dec
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {dec}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LEGACY TRIALS + LAZY MIGRATION */}
      {activeTab === 'legacy' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Legacy Recipe Trials (Backward-Compatible Archive)
              </h3>
              <p className="text-xs text-slate-500">
                Convert any older trial into a versioned Product + immutable V1 without deleting original history.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              {(['all', 'approved', 'iterate', 'archived'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedOutcomeFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                    selectedOutcomeFilter === status
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status === 'iterate' ? 'Needs Iteration' : status}
                </button>
              ))}
            </div>
          </div>

          {filteredLegacy.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">No legacy recipe trials found</p>
              <p className="text-xs text-slate-500">
                All new formulations created in Products &amp; Versions are stored as immutable versions.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                {filteredLegacy.map((r) => {
                  const isSelected = activeLegacy?.id === r.id;
                  const alreadyMigrated = recipeVersions.some((v) => v.legacyRecipeId === r.id);
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setActiveLegacyId(r.id)}
                      className={`w-full text-left p-4 transition-colors ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">{r.title}</span>
                        <span className="font-mono text-xs text-slate-500 shrink-0">{r.version}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{r.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{r.targetTempC}°C</span>
                        {alreadyMigrated && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-teal-700 font-medium">Converted to V1</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeLegacy && (
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="flex items-baseline gap-2.5">
                        <h4 className="text-lg font-semibold text-slate-900">{activeLegacy.title}</h4>
                        <span className="text-xs font-mono text-slate-500">{activeLegacy.version}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{activeLegacy.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{activeLegacy.prepMinutes} min</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{activeLegacy.targetTempC}°C</span>
                        <span aria-hidden="true">·</span>
                        <span>Yield: {activeLegacy.yieldText}</span>
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={migratingLegacyId === activeLegacy.id}
                          onClick={() => handleMigrateLegacyRecipe(activeLegacy)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          {migratingLegacyId === activeLegacy.id
                            ? 'Converting...'
                            : 'Convert to Product + V1'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLegacy(activeLegacy)}
                          className="p-1.5 text-red-600 border border-slate-200 rounded-md hover:bg-red-50"
                          title="Delete legacy trial"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-slate-700 mb-2">Ingredients</h5>
                    {activeLegacy.ingredients.length === 0 ? (
                      <p className="text-xs text-slate-500">No ingredient breakdown listed.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
                        {activeLegacy.ingredients.map((ing, idx) => (
                          <div key={idx} className="px-3 py-2 flex items-center justify-between text-sm">
                            <span className="text-slate-800">{ing.name}</span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {ing.amount} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-slate-700 mb-1.5">Tasting &amp; Process Notes</h5>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {activeLegacy.tastingNotes || 'No sensory notes recorded.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
