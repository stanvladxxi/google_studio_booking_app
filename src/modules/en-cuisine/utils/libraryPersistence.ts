import {
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  IngredientCostUnit,
  IngredientLibraryDoc,
  InventoryHistoryEntry,
  LIMITS,
  clampStr,
  sanitizeId,
} from '../../../types';
import { CATEGORY_ORDER, SEED_LIBRARY } from '../data/ingredientLibrarySeed';
import { LibraryIngredient } from '../types';

export interface MergedLibraryState {
  library: LibraryIngredient[];
  libraryById: Map<string, LibraryIngredient>;
  categories: string[];
  stockMap: Map<string, number>;
  historyMap: Map<string, InventoryHistoryEntry[]>;
  docIdByIngredientId: Map<string, string>;
}

export function mergeIngredientLibrary(
  docs: IngredientLibraryDoc[],
  localCategories: string[] = []
): MergedLibraryState {
  const docMap = new Map<string, IngredientLibraryDoc>();
  for (const d of docs) {
    docMap.set(d.ingredientId, d);
  }

  const library: LibraryIngredient[] = [];
  const stockMap = new Map<string, number>();
  const historyMap = new Map<string, InventoryHistoryEntry[]>();
  const docIdByIngredientId = new Map<string, string>();
  const catSet = new Set<string>([...CATEGORY_ORDER, ...localCategories]);

  for (const seed of SEED_LIBRARY) {
    const ov = docMap.get(seed.id);
    if (ov) {
      docIdByIngredientId.set(seed.id, ov.id);
      if (ov.isDeleted) {
        continue;
      }
      const merged: LibraryIngredient = {
        ...seed,
        name: ov.name || seed.name,
        cat: ov.cat || seed.cat,
        custom: Boolean(ov.custom),
        vegan: ov.vegan,
        allergens: Array.isArray(ov.allergens) ? ov.allergens : seed.allergens,
        costUnit: ov.costUnit === 'weight' ? undefined : ov.costUnit,
        costKg: Number.isFinite(ov.costKg) ? ov.costKg : seed.costKg,
        wastagePct: Number.isFinite(ov.wastagePct) ? ov.wastagePct : seed.wastagePct,
        pieceWeightG: ov.pieceWeightG ?? seed.pieceWeightG,
        bulkPieces: ov.bulkPieces ?? seed.bulkPieces,
        costPerUnit: ov.costPerUnit ?? seed.costPerUnit,
        bulkUnitQty: ov.bulkUnitQty ?? seed.bulkUnitQty,
        rollLengthM: ov.rollLengthM ?? seed.rollLengthM,
        rollWidthMM: ov.rollWidthMM ?? seed.rollWidthMM,
        gsm: ov.gsm ?? seed.gsm,
        costPerRoll: ov.costPerRoll ?? seed.costPerRoll,
        wrapLengthCmPerUnit: ov.wrapLengthCmPerUnit ?? seed.wrapLengthCmPerUnit,
        bulkQty: ov.bulkQty ?? seed.bulkQty,
        bulkUnit: ov.bulkUnit ?? seed.bulkUnit,
        bulkCost: ov.bulkCost ?? seed.bulkCost,
        bulkCurrency: ov.bulkCurrency ?? seed.bulkCurrency,
        kcal: Number.isFinite(ov.kcal) ? ov.kcal : seed.kcal,
        fat: Number.isFinite(ov.fat) ? ov.fat : seed.fat,
        satFat: Number.isFinite(ov.satFat) ? ov.satFat : seed.satFat,
        sugar: Number.isFinite(ov.sugar) ? ov.sugar : seed.sugar,
        protein: Number.isFinite(ov.protein) ? ov.protein : seed.protein,
        carbs: Number.isFinite(ov.carbs) ? ov.carbs : seed.carbs,
        ecode: ov.ecode ?? seed.ecode,
        dosage: ov.dosage ?? seed.dosage,
        func: ov.func ?? seed.func,
        note: ov.note ?? seed.note,
      };
      library.push(merged);
      stockMap.set(merged.id, Math.max(0, Number(ov.stockQty) || 0));
      historyMap.set(merged.id, Array.isArray(ov.history) ? ov.history : []);
      catSet.add(merged.cat);
    } else {
      library.push({ ...seed });
      stockMap.set(seed.id, 0);
      historyMap.set(seed.id, []);
    }
  }

  const seedIds = new Set(SEED_LIBRARY.map((s) => s.id));
  for (const d of docs) {
    if (seedIds.has(d.ingredientId) || d.isDeleted) continue;
    docIdByIngredientId.set(d.ingredientId, d.id);
    const customIng: LibraryIngredient = {
      id: d.ingredientId,
      name: d.name,
      cat: d.cat,
      custom: true,
      vegan: Boolean(d.vegan),
      allergens: Array.isArray(d.allergens) ? d.allergens : [],
      costUnit: d.costUnit === 'weight' ? undefined : d.costUnit,
      costKg: Number(d.costKg) || 0,
      wastagePct: Number(d.wastagePct) || 0,
      pieceWeightG: d.pieceWeightG,
      bulkPieces: d.bulkPieces,
      costPerUnit: d.costPerUnit,
      bulkUnitQty: d.bulkUnitQty,
      rollLengthM: d.rollLengthM,
      rollWidthMM: d.rollWidthMM,
      gsm: d.gsm,
      costPerRoll: d.costPerRoll,
      wrapLengthCmPerUnit: d.wrapLengthCmPerUnit,
      bulkQty: d.bulkQty,
      bulkUnit: d.bulkUnit,
      bulkCost: d.bulkCost,
      bulkCurrency: d.bulkCurrency,
      kcal: Number(d.kcal) || 0,
      fat: Number(d.fat) || 0,
      satFat: Number(d.satFat) || 0,
      sugar: Number(d.sugar) || 0,
      protein: Number(d.protein) || 0,
      carbs: Number(d.carbs) || 0,
      ecode: d.ecode,
      dosage: d.dosage,
      func: d.func,
      note: d.note,
    };
    library.push(customIng);
    stockMap.set(customIng.id, Math.max(0, Number(d.stockQty) || 0));
    historyMap.set(customIng.id, Array.isArray(d.history) ? d.history : []);
    catSet.add(customIng.cat);
  }

  const libraryById = new Map(library.map((i) => [i.id, i]));
  return {
    library,
    libraryById,
    categories: Array.from(catSet),
    stockMap,
    historyMap,
    docIdByIngredientId,
  };
}

function resolveDocId(
  uid: string,
  ingredientId: string,
  existingDocId?: string
): string {
  if (existingDocId) return existingDocId;
  return sanitizeId(`ing_${uid.slice(0, 10)}_${ingredientId}`);
}

function buildPayload(
  docId: string,
  ownerId: string,
  item: LibraryIngredient,
  stockQty: number,
  history: InventoryHistoryEntry[],
  createdAtValue: unknown,
  isDeleted = false
): Record<string, unknown> {
  const costUnit: IngredientCostUnit = item.costUnit || 'weight';
  const clampedHistory = history.slice(-25).map((h) => ({
    date: clampStr(h.date || new Date().toISOString(), 40),
    type: h.type,
    qty: Math.max(0, Number(h.qty) || 0),
    note: clampStr(h.note || '', 240),
  }));

  const payload: Record<string, unknown> = {
    id: docId,
    ownerId,
    ingredientId: sanitizeId(item.id),
    name: clampStr(item.name || 'Ingredient', 140),
    cat: clampStr(item.cat || 'Salt & Misc', 80),
    custom: Boolean(item.custom),
    vegan: Boolean(item.vegan),
    allergens: (item.allergens || []).slice(0, 20).map((a) => clampStr(a, 60)).filter(Boolean),
    costUnit,
    costKg: Math.min(1000000, Math.max(0, Number(item.costKg) || 0)),
    wastagePct: Math.min(99, Math.max(0, Number(item.wastagePct) || 0)),
    kcal: Math.min(5000, Math.max(0, Number(item.kcal) || 0)),
    fat: Math.min(200, Math.max(0, Number(item.fat) || 0)),
    satFat: Math.min(200, Math.max(0, Number(item.satFat) || 0)),
    sugar: Math.min(200, Math.max(0, Number(item.sugar) || 0)),
    protein: Math.min(200, Math.max(0, Number(item.protein) || 0)),
    carbs: Math.min(200, Math.max(0, Number(item.carbs) || 0)),
    stockQty: Math.min(100000000, Math.max(0, Number(stockQty) || 0)),
    history: clampedHistory,
    isDeleted,
    createdAt: createdAtValue || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (item.pieceWeightG !== undefined) payload.pieceWeightG = Math.max(0, Number(item.pieceWeightG) || 0);
  if (item.bulkPieces !== undefined) payload.bulkPieces = Math.max(0, Number(item.bulkPieces) || 0);
  if (item.costPerUnit !== undefined) payload.costPerUnit = Math.max(0, Number(item.costPerUnit) || 0);
  if (item.bulkUnitQty !== undefined) payload.bulkUnitQty = Math.max(0, Number(item.bulkUnitQty) || 0);
  if (item.rollLengthM !== undefined) payload.rollLengthM = Math.max(0, Number(item.rollLengthM) || 0);
  if (item.rollWidthMM !== undefined) payload.rollWidthMM = Math.max(0, Number(item.rollWidthMM) || 0);
  if (item.gsm !== undefined) payload.gsm = Math.max(0, Number(item.gsm) || 0);
  if (item.costPerRoll !== undefined) payload.costPerRoll = Math.max(0, Number(item.costPerRoll) || 0);
  if (item.wrapLengthCmPerUnit !== undefined) payload.wrapLengthCmPerUnit = Math.max(0, Number(item.wrapLengthCmPerUnit) || 0);
  if (item.bulkQty !== undefined) payload.bulkQty = Math.max(0, Number(item.bulkQty) || 0);
  if (item.bulkUnit === 'kg' || item.bulkUnit === 'g') payload.bulkUnit = item.bulkUnit;
  if (item.bulkCost !== undefined) payload.bulkCost = Math.max(0, Number(item.bulkCost) || 0);
  if (item.bulkCurrency) payload.bulkCurrency = clampStr(item.bulkCurrency, 12);
  if (item.ecode) payload.ecode = clampStr(item.ecode, 24);
  if (item.dosage) payload.dosage = clampStr(item.dosage, 160);
  if (item.func) payload.func = clampStr(item.func, 200);
  if (item.note) payload.note = clampStr(item.note, 500);

  return payload;
}

export async function saveIngredientLibraryItem(params: {
  uid: string;
  userName: string;
  item: LibraryIngredient;
  stockQty: number;
  history: InventoryHistoryEntry[];
  existingDoc?: IngredientLibraryDoc;
  logMessage?: string;
}): Promise<string> {
  const { uid, userName, item, stockQty, history, existingDoc, logMessage } = params;
  const docId = resolveDocId(uid, item.id, existingDoc?.id);
  const ownerId = existingDoc?.ownerId || uid;
  const payload = buildPayload(
    docId,
    ownerId,
    item,
    stockQty,
    history,
    existingDoc?.createdAt,
    false
  );
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'ingredientLibrary', docId), payload);
    if (logMessage) {
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Chef', LIMITS.NAME_MAX),
        eventType: 'material',
        severity: 'info',
        station: 'En Cuisine Studio',
        tempReadingC: '--',
        message: clampStr(logMessage, LIMITS.LOG_MSG_MAX),
        bookingId: '',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `ingredientLibrary/${docId}`);
  }
}

export async function softDeleteIngredientLibraryItem(params: {
  uid: string;
  item: LibraryIngredient;
  existingDoc?: IngredientLibraryDoc;
}): Promise<void> {
  const { uid, item, existingDoc } = params;
  const docId = resolveDocId(uid, item.id, existingDoc?.id);
  const ownerId = existingDoc?.ownerId || uid;
  const payload = buildPayload(
    docId,
    ownerId,
    item,
    0,
    [],
    existingDoc?.createdAt,
    true
  );
  try {
    await setDoc(doc(db, 'ingredientLibrary', docId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `ingredientLibrary/${docId}`);
  }
}

export async function renameCategoryAcrossLibrary(params: {
  uid: string;
  oldName: string;
  newName: string;
  itemsInCategory: LibraryIngredient[];
  existingDocsByIngredientId: Map<string, IngredientLibraryDoc>;
  stockMap: Map<string, number>;
  historyMap: Map<string, InventoryHistoryEntry[]>;
}): Promise<void> {
  const {
    uid,
    newName,
    itemsInCategory,
    existingDocsByIngredientId,
    stockMap,
    historyMap,
  } = params;
  if (itemsInCategory.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const item of itemsInCategory) {
      const existing = existingDocsByIngredientId.get(item.id);
      const docId = resolveDocId(uid, item.id, existing?.id);
      const ownerId = existing?.ownerId || uid;
      const updatedItem = { ...item, cat: newName };
      const payload = buildPayload(
        docId,
        ownerId,
        updatedItem,
        stockMap.get(item.id) || 0,
        historyMap.get(item.id) || [],
        existing?.createdAt,
        false
      );
      batch.set(doc(db, 'ingredientLibrary', docId), payload);
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'ingredientLibrary');
  }
}

export async function batchDeductRecipeFromStock(params: {
  uid: string;
  userName: string;
  recipeName: string;
  deductions: {
    item: LibraryIngredient;
    deductQty: number;
    currentStock: number;
    currentHistory: InventoryHistoryEntry[];
    existingDoc?: IngredientLibraryDoc;
  }[];
}): Promise<void> {
  const { uid, userName, recipeName, deductions } = params;
  if (deductions.length === 0) return;
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    for (const d of deductions) {
      const docId = resolveDocId(uid, d.item.id, d.existingDoc?.id);
      const ownerId = d.existingDoc?.ownerId || uid;
      const nextStock = Math.max(0, d.currentStock - Math.max(0, d.deductQty));
      const nextHistory: InventoryHistoryEntry[] = [
        ...d.currentHistory,
        {
          date: nowIso,
          type: 'consumed',
          qty: Math.max(0, d.deductQty),
          note: `Produced batch: ${recipeName}`,
        },
      ];
      const payload = buildPayload(
        docId,
        ownerId,
        d.item,
        nextStock,
        nextHistory,
        d.existingDoc?.createdAt,
        false
      );
      batch.set(doc(db, 'ingredientLibrary', docId), payload);
    }
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, 'logs', logId), {
      ownerId: uid,
      actorName: clampStr(userName || 'Chef', LIMITS.NAME_MAX),
      eventType: 'production',
      severity: 'info',
      station: 'En Cuisine Inventory',
      tempReadingC: '--',
      message: clampStr(
        `Deducted ${deductions.length} formulation ingredients for "${recipeName}" batch.`,
        LIMITS.LOG_MSG_MAX
      ),
      bookingId: '',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'ingredientLibrary');
  }
}
