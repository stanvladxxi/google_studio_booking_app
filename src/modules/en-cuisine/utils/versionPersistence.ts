import {
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  BakeTestResult,
  LIMITS,
  MaterialCategory,
  MaterialOrderItem,
  Product,
  ProductStatus,
  RecipeCategory,
  RecipeVersion,
  RecipeVersionIngredient,
  StorageZone,
  ValidationStatus,
  clampStr,
  sanitizeId,
} from '../../../types';
import { BuilderDraftState, LibraryIngredient } from '../types';
import {
  computeFormulationTotals,
  diffVersionPayloads,
  effectiveCostKg,
  effectiveCostPerUnit,
  isPackagingItem,
} from './formulationEngine';

export async function saveFormulationAsVersion(params: {
  uid: string;
  userName: string;
  draft: BuilderDraftState;
  libraryById: Map<string, LibraryIngredient>;
  targetProductId: string | '__new__';
  existingProducts: Product[];
  existingVersions: RecipeVersion[];
  rationale: string;
  expectedEffect: string;
}): Promise<{ productId: string; versionId: string; versionNumber: number }> {
  const {
    uid,
    userName,
    draft,
    libraryById,
    targetProductId,
    existingProducts,
    existingVersions,
    rationale,
    expectedEffect,
  } = params;

  const totals = computeFormulationTotals(draft.items, draft.unitWeightG, libraryById);
  const overhead = Math.max(0, Number(draft.overheadCostKwd) || 0);
  const totalCostKwd = totals.totalCostKwd + overhead;
  const estYield = Math.max(1, totals.estYieldPieces || 1);
  const perUnitCost = totalCostKwd / estYield;
  const markupPct = Math.max(0, Number(draft.markupPct) || 0);
  const suggestedPriceKwd = Number((perUnitCost * (1 + markupPct / 100)).toFixed(3));

  const isNew = targetProductId === '__new__';
  const existingProduct = isNew
    ? undefined
    : existingProducts.find((p) => p.id === targetProductId);

  const productId = existingProduct
    ? existingProduct.id
    : sanitizeId(
        `prod_${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${Date.now().toString(36)}`
      );

  const productVersions = existingVersions
    .filter((v) => v.productId === productId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const parent = productVersions[productVersions.length - 1] || null;
  const versionNumber = parent ? parent.versionNumber + 1 : 1;
  const versionId = sanitizeId(`${productId}_v${versionNumber}_${Date.now().toString(36)}`);

  const versionIngredients: RecipeVersionIngredient[] = draft.items
    .map((line) => {
      const lib = libraryById.get(line.id);
      if (!lib) return null;
      const pkg = isPackagingItem(lib);
      const lineCostKwd = pkg
        ? effectiveCostPerUnit(lib) * line.g
        : (effectiveCostKg(lib) / 1000) * line.g;
      return {
        ingredientId: lib.id,
        name: clampStr(lib.name, 100),
        amountG: Number((line.g || 0).toFixed(2)),
        unit: pkg ? 'units' : 'g',
        cat: clampStr(lib.cat, 60),
        supplier: clampStr(line.supplier || '', 80),
        isPackaging: pkg,
        unitCostKwd: Number(lineCostKwd.toFixed(4)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 60);

  const diffs = parent
    ? diffVersionPayloads(parent, draft, libraryById)
    : [];

  const nowTs = serverTimestamp();
  const batch = writeBatch(db);

  if (existingProduct) {
    batch.update(doc(db, 'products', productId), {
      name: clampStr(draft.name || existingProduct.name, 120),
      category: draft.category,
      currentRecipeVersionId: versionId,
      targetMarkupPct: markupPct,
      sellingPriceKwd: suggestedPriceKwd,
      updatedAt: nowTs,
    });
  } else {
    const newProductPayload: Record<string, unknown> = {
      id: productId,
      ownerId: uid,
      name: clampStr(draft.name || 'Untitled Recipe', 120),
      category: draft.category,
      status: 'testing' as ProductStatus,
      currentRecipeVersionId: versionId,
      targetMarkupPct: markupPct,
      sellingPriceKwd: suggestedPriceKwd,
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    batch.set(doc(db, 'products', productId), newProductPayload);
  }

  const versionPayload: Record<string, unknown> = {
    id: versionId,
    productId,
    ownerId: existingProduct?.ownerId || uid,
    versionNumber,
    ingredients: versionIngredients,
    batchSize: Number(totals.totalG.toFixed(2)),
    expectedYield: estYield,
    yieldUnit: 'pieces',
    prepMinutes: Math.max(0, Math.min(10000, Number(draft.prepMinutes) || 25)),
    targetTempC: Math.max(-50, Math.min(450, Number(draft.targetTempC) || 175)),
    method: clampStr(draft.methodNotes || '', LIMITS.METHOD_MAX),
    equipment: (draft.equipment || []).slice(0, 20).map((e) => clampStr(e, 100)),
    expectedCost: Number(totals.ingredientCostKwd.toFixed(3)),
    packagingCostKwd: Number(totals.packagingCostKwd.toFixed(3)),
    overheadCostKwd: Number(overhead.toFixed(3)),
    markupPct,
    suggestedPriceKwd,
    targetPieceWeightG: Math.max(1, Number(draft.unitWeightG) || 90),
    nutritionPer100g: {
      kcal: Math.round(totals.per100g.kcal),
      fat: Number(totals.per100g.fat.toFixed(1)),
      satFat: Number(totals.per100g.satFat.toFixed(1)),
      sugar: Number(totals.per100g.sugar.toFixed(1)),
      protein: Number(totals.per100g.protein.toFixed(1)),
      carbs: Number(totals.per100g.carbs.toFixed(1)),
    },
    allergens: totals.allergens.slice(0, 20),
    additives: totals.additives
      .map((a) => `${a.ecode} — ${a.name}`)
      .slice(0, 30),
    diffs,
    changeReason: clampStr(rationale, LIMITS.REASON_MAX),
    expectedEffect: clampStr(expectedEffect || 'Standard trial run', LIMITS.REASON_MAX),
    actualOutcome: '',
    validationStatus: 'draft' as ValidationStatus,
    createdAt: nowTs,
    updatedAt: nowTs,
  };

  batch.set(doc(db, 'recipeVersions', versionId), versionPayload);

  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  batch.set(doc(db, 'logs', logId), {
    ownerId: uid,
    actorName: clampStr(userName || 'Chef', LIMITS.NAME_MAX),
    eventType: 'recipe',
    severity: 'info',
    station: 'En Cuisine Studio',
    tempReadingC: `${draft.targetTempC || 175}°C`,
    message: clampStr(
      `Saved ${draft.name} v${versionNumber}.0 (${totals.totalG.toFixed(0)}g, KWD ${totalCostKwd.toFixed(3)}). Rationale: ${rationale}`,
      LIMITS.LOG_MSG_MAX
    ),
    bookingId: '',
    createdAt: nowTs,
  });

  try {
    await batch.commit();
    return { productId, versionId, versionNumber };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `recipeVersions/${versionId}`);
  }
}

export async function saveBakeTestToVersion(params: {
  version: RecipeVersion;
  bakeTest: BakeTestResult;
}): Promise<void> {
  const { version, bakeTest } = params;
  const nextStatus: ValidationStatus =
    version.validationStatus === 'draft' ? 'testing' : version.validationStatus;
  const outcomeSummary = `Bake test: ${bakeTest.actualYieldPieces}/${bakeTest.theoreticalYieldPieces} pcs actual · ${bakeTest.moistureLossPct.toFixed(1)}% moisture loss · ${bakeTest.wastagePct.toFixed(1)}% wastage`;
  try {
    await updateDoc(doc(db, 'recipeVersions', version.id), {
      bakeTest,
      validationStatus: nextStatus,
      actualOutcome: clampStr(
        version.actualOutcome ? `${version.actualOutcome} | ${outcomeSummary}` : outcomeSummary,
        LIMITS.NOTES_MAX
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `recipeVersions/${version.id}`);
  }
}

export async function saveScoreToVersion(params: {
  productId: string;
  versionId: string;
  score: number | null;
  validationStatus: ValidationStatus;
  scoreNotes: string;
}): Promise<void> {
  const { productId, versionId, score, validationStatus, scoreNotes } = params;
  try {
    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      validationStatus,
      scoreNotes: clampStr(scoreNotes, LIMITS.NOTES_MAX),
      updatedAt: serverTimestamp(),
    };
    if (score !== null && Number.isFinite(score)) {
      updatePayload.score = Math.min(10, Math.max(1, Math.round(score)));
    }
    batch.update(doc(db, 'recipeVersions', versionId), updatePayload);
    if (validationStatus === 'approved') {
      batch.update(doc(db, 'products', productId), {
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `recipeVersions/${versionId}`);
  }
}

function mapLibCatToMaterialCat(cat: string): {
  category: MaterialCategory;
  storageZone: StorageZone;
} {
  if (cat === 'Flours' || cat === 'Sugars & Sweeteners' || cat === 'Leavening' || cat === 'Salt & Misc') {
    return { category: 'Flour & Dry', storageZone: 'Dry Pantry' };
  }
  if (cat === 'Fats & Oils' || cat === 'Eggs & Dairy') {
    return { category: 'Dairy & Fats', storageZone: 'Walk-In Cooler' };
  }
  if (cat === 'Fruit & Mash') {
    return { category: 'Produce', storageZone: 'Walk-In Cooler' };
  }
  if (cat === 'Meat & Protein') {
    return { category: 'Proteins', storageZone: 'Walk-In Cooler' };
  }
  if (cat === 'Packing Materials') {
    return { category: 'Packaging', storageZone: 'Dry Pantry' };
  }
  return { category: 'Specialty', storageZone: 'Dry Pantry' };
}

export async function createPurchaseOrderFromFormulation(params: {
  uid: string;
  userName: string;
  supplier: string;
  sourceProductId: string;
  sourceVersionLabel: string;
  multiplier: number;
  draftItems: { id: string; g: number }[];
  libraryById: Map<string, LibraryIngredient>;
  stockMap: Map<string, number>;
  onlyShortfall: boolean;
  deliveryFeeKwd?: number;
  notes?: string;
}): Promise<string> {
  const {
    uid,
    userName,
    supplier,
    sourceProductId,
    sourceVersionLabel,
    multiplier,
    draftItems,
    libraryById,
    stockMap,
    onlyShortfall,
    deliveryFeeKwd = 2.5,
    notes = '',
  } = params;

  const orderItems: MaterialOrderItem[] = [];
  for (const line of draftItems) {
    const lib = libraryById.get(line.id);
    if (!lib) continue;
    const pkg = isPackagingItem(lib);
    const neededRaw = Math.max(0, line.g * multiplier);
    const inStock = stockMap.get(line.id) || 0;
    const orderRaw = onlyShortfall ? Math.max(0, neededRaw - inStock) : neededRaw;
    if (orderRaw <= 0) continue;

    const { category, storageZone } = mapLibCatToMaterialCat(lib.cat);
    if (pkg) {
      const qty = Math.ceil(orderRaw);
      const unitCost = effectiveCostPerUnit(lib);
      orderItems.push({
        materialName: clampStr(lib.name, 100),
        category,
        quantity: qty,
        unit: 'units',
        gramsTotal: qty,
        unitCostKwd: Number(unitCost.toFixed(3)),
        lineTotalKwd: Number((qty * unitCost).toFixed(3)),
        storageZone,
      });
    } else {
      const qtyKg = Math.max(0.05, Math.ceil((orderRaw / 1000) * 20) / 20);
      const unitCost = effectiveCostKg(lib);
      orderItems.push({
        materialName: clampStr(lib.name, 100),
        category,
        quantity: Number(qtyKg.toFixed(2)),
        unit: 'kg',
        gramsTotal: Math.round(qtyKg * 1000),
        unitCostKwd: Number(unitCost.toFixed(3)),
        lineTotalKwd: Number((qtyKg * unitCost).toFixed(3)),
        storageZone,
      });
    }
  }

  if (orderItems.length === 0) {
    throw new Error('No materials need ordering for the selected mode.');
  }

  const trimmedItems = orderItems.slice(0, 40);
  const subtotalKwd = Number(
    trimmedItems.reduce((s, i) => s + i.lineTotalKwd, 0).toFixed(3)
  );
  const totalKwd = Number((subtotalKwd + deliveryFeeKwd).toFixed(3));
  const orderId = sanitizeId(`po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const orderCode = `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`;
  const expectedDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const batch = writeBatch(db);
  batch.set(doc(db, 'materialOrders', orderId), {
    id: orderId,
    ownerId: uid,
    orderedByName: clampStr(userName || 'Chef', 100),
    orderCode,
    supplier: clampStr(supplier || 'Kuwait Food Supply Co.', 100),
    sourceProductId: clampStr(sourceProductId || '', 128),
    sourceVersionLabel: clampStr(sourceVersionLabel || 'Builder Draft', 48),
    items: trimmedItems,
    subtotalKwd,
    deliveryFeeKwd,
    totalKwd,
    status: 'ordered',
    expectedDate,
    notes: clampStr(notes || `Ordered from En Cuisine (${sourceVersionLabel})`, 400),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  batch.set(doc(db, 'logs', logId), {
    ownerId: uid,
    actorName: clampStr(userName || 'Chef', LIMITS.NAME_MAX),
    eventType: 'material',
    severity: 'info',
    station: 'Procurement',
    tempReadingC: '--',
    message: clampStr(
      `Created PO ${orderCode} (${trimmedItems.length} lines, KWD ${totalKwd.toFixed(3)}) from ${sourceVersionLabel}.`,
      LIMITS.LOG_MSG_MAX
    ),
    bookingId: '',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return orderCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `materialOrders/${orderId}`);
  }
}

export const ALL_RECIPE_CATEGORIES: RecipeCategory[] = [
  'Bakery',
  'Sauce & Emulsion',
  'Fermentation',
  'Plant-Based',
  'Confectionery',
  'Savory Prep',
];
