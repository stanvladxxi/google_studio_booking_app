import {
  BakeTestResult,
  NutritionMacros,
  Product,
  RecipeVersion,
  VersionDiffItem,
} from '../../../types';
import {
  CATEGORY_ORDER,
  NUTRITION_REFERENCE_DB,
  SEED_LIBRARY,
} from '../data/ingredientLibrarySeed';
import {
  BuilderDraftState,
  BuilderLineItem,
  InvoiceExtractedLine,
  LibraryIngredient,
  NutritionLookupResult,
} from '../types';

export function isPackagingItem(item: LibraryIngredient | undefined): boolean {
  return Boolean(item && item.cat === 'Packing Materials');
}

export function isPieceOrCountStock(item: LibraryIngredient | undefined): boolean {
  return Boolean(
    item &&
      (item.costUnit === 'piece' || item.costUnit === 'unit' || item.costUnit === 'roll')
  );
}

export function rawCostKg(item: LibraryIngredient): number {
  return Number.isFinite(item.costKg) ? item.costKg : 0;
}

export function effectiveCostKg(item: LibraryIngredient): number {
  const raw = rawCostKg(item);
  const wastage = item.wastagePct || 0;
  if (wastage <= 0) return raw;
  const factor = 1 - Math.min(wastage, 99) / 100;
  return factor > 0 ? raw / factor : raw;
}

export function effectiveCostPerUnit(item: LibraryIngredient): number {
  if (item.costUnit === 'roll') {
    const lenM = item.rollLengthM || 0;
    const wrapCm = item.wrapLengthCmPerUnit || 0;
    const packagesPerRoll = wrapCm > 0 ? (lenM * 100) / wrapCm : 0;
    return packagesPerRoll > 0 ? (item.costPerRoll || 0) / packagesPerRoll : 0;
  }
  return item.costPerUnit || 0;
}

export function effectivePricePerPiece(item: LibraryIngredient): number | null {
  if (item.costUnit !== 'piece') return null;
  return effectiveCostKg(item) * ((item.pieceWeightG || 0) / 1000);
}

export function parseWeightInput(val: string | number): number {
  const s = String(val).trim().toLowerCase();
  if (!s) return 0;
  if (s.endsWith('kg')) {
    const num = parseFloat(s.slice(0, -2));
    return Math.max(0, Number.isFinite(num) ? num * 1000 : 0);
  }
  if (s.endsWith('g')) {
    const num = parseFloat(s.slice(0, -1));
    return Math.max(0, Number.isFinite(num) ? num : 0);
  }
  const num = parseFloat(s);
  return Math.max(0, Number.isFinite(num) ? num * 1000 : 0);
}

export function formatWeightText(g: number): string {
  if (!Number.isFinite(g) || g <= 0) return '0 g';
  if (g >= 1000) {
    return `${(g / 1000).toFixed(2)} kg (${g.toFixed(0)} g)`;
  }
  return `${Number.isInteger(g) ? g : g.toFixed(1)} g`;
}

export function formatKwd(amount: number, decimals = 3): string {
  return `KWD ${(Number.isFinite(amount) ? amount : 0).toFixed(decimals)}`;
}

export interface FormulationTotals {
  flourTotalG: number;
  totalG: number;
  acc: NutritionMacros;
  per100g: NutritionMacros;
  perSlice: NutritionMacros;
  ingredientCostKwd: number;
  packagingCostKwd: number;
  totalCostKwd: number;
  estYieldPieces: number;
  costPerKgBatch: number;
  costPerSliceIngredients: number;
  packagingPerSlice: number;
  totalCostPerSlice: number;
  allergens: string[];
  additives: LibraryIngredient[];
  packagingLines: { id: string; name: string; qty: number; unitCost: number; lineCost: number }[];
}

export function computeFormulationTotals(
  items: BuilderLineItem[],
  unitWeightG: number,
  libraryById: Map<string, LibraryIngredient>,
  costOverridesKwd?: Map<string, number>
): FormulationTotals {
  const safeUnitW = Math.max(1, unitWeightG || 1);
  const resolvedItems = items
    .map((line) => ({ line, item: libraryById.get(line.id) }))
    .filter((x): x is { line: BuilderLineItem; item: LibraryIngredient } => Boolean(x.item));

  const foodList = resolvedItems.filter((x) => !isPackagingItem(x.item));
  const packagingList = resolvedItems.filter((x) => isPackagingItem(x.item));

  const flourTotalG = foodList
    .filter((x) => x.item.cat === 'Flours')
    .reduce((sum, x) => sum + (x.line.g || 0), 0);

  const totalG = foodList.reduce((sum, x) => sum + (x.line.g || 0), 0);

  const acc: NutritionMacros = {
    kcal: 0,
    fat: 0,
    satFat: 0,
    sugar: 0,
    protein: 0,
    carbs: 0,
  };

  let ingredientCostKwd = 0;
  const allergenSet = new Set<string>();
  const additives: LibraryIngredient[] = [];

  for (const { line, item } of foodList) {
    const g = Math.max(0, line.g || 0);
    const frac = g / 100;
    acc.kcal += (item.kcal || 0) * frac;
    acc.fat += (item.fat || 0) * frac;
    acc.satFat += (item.satFat || 0) * frac;
    acc.sugar += (item.sugar || 0) * frac;
    acc.protein += (item.protein || 0) * frac;
    acc.carbs += (item.carbs || 0) * frac;

    const overrideKg = costOverridesKwd?.get(item.id);
    const kgCost = overrideKg !== undefined ? overrideKg : effectiveCostKg(item);
    ingredientCostKwd += (kgCost / 1000) * g;

    for (const a of item.allergens || []) {
      if (a.trim()) allergenSet.add(a.trim());
    }
    if (item.ecode) additives.push(item);
  }

  let packagingCostKwd = 0;
  const packagingLines: {
    id: string;
    name: string;
    qty: number;
    unitCost: number;
    lineCost: number;
  }[] = [];

  for (const { line, item } of packagingList) {
    const qty = Math.max(0, line.g || 0);
    const unitCost = effectiveCostPerUnit(item);
    const lineCost = unitCost * qty;
    packagingCostKwd += lineCost;
    packagingLines.push({
      id: item.id,
      name: item.name,
      qty,
      unitCost,
      lineCost,
    });
  }

  const per100g: NutritionMacros = {
    kcal: totalG > 0 ? (acc.kcal / totalG) * 100 : 0,
    fat: totalG > 0 ? (acc.fat / totalG) * 100 : 0,
    satFat: totalG > 0 ? (acc.satFat / totalG) * 100 : 0,
    sugar: totalG > 0 ? (acc.sugar / totalG) * 100 : 0,
    protein: totalG > 0 ? (acc.protein / totalG) * 100 : 0,
    carbs: totalG > 0 ? (acc.carbs / totalG) * 100 : 0,
  };

  const perSlice: NutritionMacros = {
    kcal: (per100g.kcal * safeUnitW) / 100,
    fat: (per100g.fat * safeUnitW) / 100,
    satFat: (per100g.satFat * safeUnitW) / 100,
    sugar: (per100g.sugar * safeUnitW) / 100,
    protein: (per100g.protein * safeUnitW) / 100,
    carbs: (per100g.carbs * safeUnitW) / 100,
  };

  const estYieldPieces = totalG > 0 ? Math.floor(totalG / safeUnitW) : 0;
  const costPerKgBatch = totalG > 0 ? (ingredientCostKwd / totalG) * 1000 : 0;
  const costPerSliceIngredients = (costPerKgBatch / 1000) * safeUnitW;
  const packagingPerSlice = estYieldPieces > 0 ? packagingCostKwd / estYieldPieces : 0;

  return {
    flourTotalG,
    totalG,
    acc,
    per100g,
    perSlice,
    ingredientCostKwd,
    packagingCostKwd,
    totalCostKwd: ingredientCostKwd + packagingCostKwd,
    estYieldPieces,
    costPerKgBatch,
    costPerSliceIngredients,
    packagingPerSlice,
    totalCostPerSlice: costPerSliceIngredients + packagingPerSlice,
    allergens: [...allergenSet],
    additives,
    packagingLines,
  };
}

export interface CostingScaleResult {
  scale: number;
  targetG: number;
  totalBatchCost: number;
  costPerKgBatch: number;
  portionG: number;
  theoreticalPortions: number;
  lossWeightG: number;
  netUsableG: number;
  actualPortions: number;
  costPerPortionTheoretical: number;
  costPerPortionActual: number;
  scaledLines: {
    id: string;
    name: string;
    cat: string;
    packaging: boolean;
    originalG: number;
    scaledG: number;
    unitCost: number;
    lineCost: number;
    hasSupplierOverride: boolean;
  }[];
}

export function computeCostingEngineScale(
  items: BuilderLineItem[],
  targetBatchKg: number,
  portionG: number,
  lossPct: number,
  libraryById: Map<string, LibraryIngredient>,
  supplierPriceMap?: Map<string, number>
): CostingScaleResult {
  const base = computeFormulationTotals(items, portionG, libraryById, supplierPriceMap);
  const safeBatchKg = Math.max(0.05, targetBatchKg || 0.05);
  const targetG = safeBatchKg * 1000;
  const scale = base.totalG > 0 ? targetG / base.totalG : 0;

  const scaledLines = items
    .map((line) => {
      const item = libraryById.get(line.id);
      if (!item) return null;
      const packaging = isPackagingItem(item);
      if (packaging) {
        const scaledQty = (line.g || 0) * scale;
        const unitCost = effectiveCostPerUnit(item);
        return {
          id: line.id,
          name: item.name,
          cat: item.cat,
          packaging: true,
          originalG: line.g || 0,
          scaledG: scaledQty,
          unitCost,
          lineCost: unitCost * scaledQty,
          hasSupplierOverride: false,
        };
      }
      const scaledG = (line.g || 0) * scale;
      const override = supplierPriceMap?.get(item.id);
      const unitCost = override !== undefined ? override : effectiveCostKg(item);
      return {
        id: line.id,
        name: item.name,
        cat: item.cat,
        packaging: false,
        originalG: line.g || 0,
        scaledG,
        unitCost,
        lineCost: (unitCost / 1000) * scaledG,
        hasSupplierOverride: override !== undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const totalBatchCost = scaledLines.reduce((sum, l) => sum + l.lineCost, 0);
  const costPerKgBatch = safeBatchKg > 0 ? totalBatchCost / safeBatchKg : 0;
  const safePortionG = Math.max(1, portionG || 1);
  const theoreticalPortions = Math.floor(targetG / safePortionG);
  const safeLossPct = Math.min(90, Math.max(0, lossPct || 0));
  const lossWeightG = targetG * (safeLossPct / 100);
  const netUsableG = Math.max(0, targetG - lossWeightG);
  const actualPortions = Math.floor(netUsableG / safePortionG);
  const costPerPortionTheoretical =
    theoreticalPortions > 0 ? totalBatchCost / theoreticalPortions : 0;
  const costPerPortionActual = actualPortions > 0 ? totalBatchCost / actualPortions : 0;

  return {
    scale,
    targetG,
    totalBatchCost,
    costPerKgBatch,
    portionG: safePortionG,
    theoreticalPortions,
    lossWeightG,
    netUsableG,
    actualPortions,
    costPerPortionTheoretical,
    costPerPortionActual,
    scaledLines,
  };
}

export function computeBakeTestDerived(
  beforeG: number,
  afterG: number,
  trimG: number,
  unitWeightG: number
): BakeTestResult {
  const before = Math.max(0, beforeG || 0);
  const after = Math.max(0, afterG || 0);
  const trim = Math.max(0, trimG || 0);
  const unitW = Math.max(1, unitWeightG || 1);
  const moistureLossPct = before > 0 ? ((before - after) / before) * 100 : 0;
  const usableWeightG = Math.max(0, after - trim);
  const wastagePct = before > 0 ? ((before - usableWeightG) / before) * 100 : 0;
  const theoreticalYieldPieces = Math.floor(before / unitW);
  const actualYieldPieces = Math.floor(usableWeightG / unitW);
  return {
    beforeG: before,
    afterG: after,
    trimG: trim,
    unitWeightG: unitW,
    moistureLossPct,
    usableWeightG,
    wastagePct,
    theoreticalYieldPieces,
    actualYieldPieces,
    loggedAt: new Date().toISOString(),
  };
}

export function diffVersionPayloads(
  prev: Pick<RecipeVersion, 'targetPieceWeightG' | 'expectedYield' | 'ingredients' | 'method'>,
  next: { unitWeightG: number; items: BuilderLineItem[]; methodNotes: string },
  libraryById: Map<string, LibraryIngredient>
): VersionDiffItem[] {
  const diffs: VersionDiffItem[] = [];
  const prevUnitW = prev.targetPieceWeightG || 90;
  if (Math.abs(prevUnitW - next.unitWeightG) > 0.01) {
    diffs.push({
      field: 'Weight per piece (g)',
      from: prevUnitW,
      to: next.unitWeightG,
    });
  }
  const prevMap = new Map<string, { name: string; amountG: number }>();
  for (const ing of prev.ingredients || []) {
    const key = ing.ingredientId || ing.name.toLowerCase();
    prevMap.set(key, { name: ing.name, amountG: ing.amountG });
  }
  const nextMap = new Map<string, { name: string; amountG: number }>();
  for (const line of next.items) {
    const lib = libraryById.get(line.id);
    const key = line.id;
    nextMap.set(key, { name: lib?.name || line.id, amountG: line.g });
  }

  for (const [key, nv] of nextMap.entries()) {
    const pv = prevMap.get(key) || prevMap.get(nv.name.toLowerCase());
    if (!pv) {
      diffs.push({
        field: 'Ingredient added',
        from: '—',
        to: `${nv.name} (${nv.amountG})`,
      });
    } else if (Math.abs(pv.amountG - nv.amountG) > 0.01) {
      diffs.push({
        field: `${nv.name}`,
        from: pv.amountG,
        to: nv.amountG,
      });
    }
  }
  for (const [key, pv] of prevMap.entries()) {
    const foundByKey = nextMap.has(key);
    const foundByName = Array.from(nextMap.values()).some(
      (n) => n.name.toLowerCase() === pv.name.toLowerCase()
    );
    if (!foundByKey && !foundByName) {
      diffs.push({
        field: 'Ingredient removed',
        from: `${pv.name} (${pv.amountG})`,
        to: '—',
      });
    }
  }
  if ((prev.method || '').trim() !== (next.methodNotes || '').trim()) {
    diffs.push({
      field: 'Method',
      from: (prev.method || '').slice(0, 40) || '—',
      to: (next.methodNotes || '').slice(0, 40) || '—',
    });
  }
  return diffs.slice(0, 40);
}

export function versionToBuilderDraft(
  product: Product,
  version: RecipeVersion,
  library: LibraryIngredient[]
): BuilderDraftState {
  const byId = new Map(library.map((i) => [i.id, i]));
  const byName = new Map(library.map((i) => [i.name.toLowerCase(), i]));

  const items: BuilderLineItem[] = [];
  for (const ing of version.ingredients || []) {
    const matched =
      (ing.ingredientId && byId.get(ing.ingredientId)) ||
      byName.get(ing.name.toLowerCase()) ||
      guessLibraryMatch(ing.name, library);
    if (matched) {
      items.push({
        id: matched.id,
        g: ing.amountG,
        supplier: ing.supplier,
      });
    }
  }

  return {
    name: product.name,
    category: product.category,
    unitWeightG:
      version.targetPieceWeightG ||
      (version.expectedYield > 0 && version.batchSize > 0
        ? Math.max(10, Math.round(version.batchSize / version.expectedYield))
        : 90),
    prepMinutes: version.prepMinutes || 25,
    targetTempC: version.targetTempC || 175,
    methodNotes: version.method || '',
    overheadCostKwd: version.overheadCostKwd || 0,
    markupPct: version.markupPct ?? product.targetMarkupPct ?? 150,
    equipment: version.equipment || [],
    items,
    sourceProductId: product.id,
    sourceVersionNumber: version.versionNumber,
  };
}

export function guessLibraryMatch(
  queryName: string,
  library: LibraryIngredient[] = SEED_LIBRARY
): LibraryIngredient | null {
  const cleanQ = String(queryName || '').trim().toLowerCase();
  if (!cleanQ) return null;
  const exact = library.find((i) => i.name.toLowerCase() === cleanQ);
  if (exact) return exact;
  const words = cleanQ
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  let best: LibraryIngredient | null = null;
  let bestScore = 0;
  for (const item of library) {
    const itemWords = item.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const score = words.filter((w) => itemWords.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore > 0 ? best : null;
}

/* ================= NUTRITION SEARCH (SERVER GEMINI API + LOCAL FALLBACK) ================= */

function estimateByCategory(query: string) {
  const q = query.toLowerCase();
  const rules = [
    { test: /flour|wheat|semolina|oat/, profile: { kcal: 360, fat: 1.5, satFat: 0.3, sugar: 0.5, protein: 10, carbs: 75 }, allergens: ['gluten'], vegan: true },
    { test: /oil|ghee|margarine|shortening/, profile: { kcal: 880, fat: 98, satFat: 15, sugar: 0, protein: 0, carbs: 0 }, allergens: [] as string[], vegan: !/ghee|butter/.test(q) },
    { test: /butter(?!milk)/, profile: { kcal: 717, fat: 81, satFat: 51, sugar: 0.1, protein: 0.9, carbs: 0.1 }, allergens: ['dairy'], vegan: false },
    { test: /sugar|syrup|honey|nectar|molasses|date/, profile: { kcal: 320, fat: 0, satFat: 0, sugar: 72, protein: 0.4, carbs: 78 }, allergens: [] as string[], vegan: !/honey/.test(q) },
    { test: /milk|cream|yogurt|dairy|cheese|labneh|paneer/, profile: { kcal: 180, fat: 11, satFat: 6.5, sugar: 4.5, protein: 6.5, carbs: 5.5 }, allergens: ['dairy'], vegan: false },
    { test: /nut|almond|walnut|hazelnut|pecan|cashew|pistachio/, profile: { kcal: 600, fat: 52, satFat: 6, sugar: 5, protein: 18, carbs: 20 }, allergens: ['tree nuts'], vegan: true },
    { test: /sesame|tahini/, profile: { kcal: 590, fat: 52, satFat: 7.5, sugar: 0.5, protein: 17, carbs: 21 }, allergens: ['sesame'], vegan: true },
    { test: /fruit|berry|banana|apple|mango|orange|lemon|fig|apricot|plum/, profile: { kcal: 60, fat: 0.3, satFat: 0.1, sugar: 12, protein: 0.8, carbs: 15 }, allergens: [] as string[], vegan: true },
    { test: /spice|powder|extract|zest|essence|cardamom|cinnamon|paprika|turmeric/, profile: { kcal: 250, fat: 3, satFat: 0.5, sugar: 2, protein: 6, carbs: 60 }, allergens: [] as string[], vegan: true },
    { test: /egg/, profile: { kcal: 143, fat: 9.5, satFat: 3.1, sugar: 0.4, protein: 12.6, carbs: 0.7 }, allergens: ['egg'], vegan: false },
  ];
  for (const rule of rules) {
    if (rule.test.test(q)) {
      return { ...rule.profile, allergens: rule.allergens, vegan: rule.vegan };
    }
  }
  return { kcal: 300, fat: 5, satFat: 1, sugar: 10, protein: 8, carbs: 55, allergens: [] as string[], vegan: true };
}

interface NutritionDbCandidate {
  name: string;
  aliases: string[];
  kcal: number;
  fat: number;
  satFat: number;
  sugar: number;
  protein: number;
  carbs: number;
  allergens: string[];
  vegan: boolean;
}

function findBestLocalNutritionMatch(q: string): NutritionDbCandidate | null {
  if (!q) return null;
  const seedCandidates: NutritionDbCandidate[] = SEED_LIBRARY.filter(
    (s) => s.cat !== 'Packing Materials' && (s.kcal > 0 || s.carbs > 0 || s.fat > 0 || s.protein > 0)
  ).map((s) => ({
    name: s.name,
    aliases: [s.name.replace(/\s*\([^)]*\)/g, '').trim()],
    kcal: s.kcal,
    fat: s.fat,
    satFat: s.satFat,
    sugar: s.sugar,
    protein: s.protein,
    carbs: s.carbs,
    allergens: s.allergens || [],
    vegan: s.vegan,
  }));

  const allEntries: NutritionDbCandidate[] = [...NUTRITION_REFERENCE_DB, ...seedCandidates];

  let match = allEntries.find((e) => e.name.toLowerCase() === q);
  if (!match) match = allEntries.find((e) => e.aliases.some((a) => a.toLowerCase() === q));
  if (!match) {
    match = allEntries.find(
      (e) => e.name.toLowerCase().includes(q) || q.includes(e.name.toLowerCase())
    );
  }
  if (!match) {
    match = allEntries.find((e) =>
      e.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))
    );
  }
  if (!match) {
    const qTokens = q
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    if (qTokens.length > 0) {
      let bestScore = 0;
      for (const entry of allEntries) {
        const hay = `${entry.name} ${entry.aliases.join(' ')}`
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 3);
        const overlap = qTokens.filter((t) => hay.includes(t)).length;
        if (overlap > bestScore) {
          bestScore = overlap;
          match = entry;
        }
      }
      if (bestScore === 0) match = undefined;
    }
  }
  return match || null;
}

export function searchNutritionLocal(query: string, reasonPrefix?: string): NutritionLookupResult {
  const q = query.trim().toLowerCase();
  const match = findBestLocalNutritionMatch(q);
  const prefix = reasonPrefix ? `${reasonPrefix} — using local reference DB. ` : '';
  if (match) {
    return {
      name: match.name,
      kcal: match.kcal,
      fat: match.fat,
      satFat: match.satFat,
      sugar: match.sugar,
      protein: match.protein,
      carbs: match.carbs,
      allergens: match.allergens,
      vegan: match.vegan,
      source: 'local_reference_database',
      confidence: 'medium',
      note: `${prefix}Matched "${match.name}" in reference composition DB.`,
    };
  }
  const est = estimateByCategory(q);
  return {
    name: query.trim(),
    ...est,
    source: 'local_estimate',
    confidence: 'low',
    note: `${prefix}No exact DB match — category estimate; review values before saving.`,
  };
}

async function parseApiJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!trimmed) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    throw new Error('Empty response from server API');
  }
  if (trimmed.startsWith('<') || contentType.includes('text/html')) {
    throw new Error(
      `API route returned HTML instead of JSON (HTTP ${res.status}). Refresh the app or ensure the Node server is active`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Invalid JSON response from server (HTTP ${res.status})`);
  }
}

export async function searchNutritionViaApi(query: string): Promise<NutritionLookupResult> {
  const q = query.trim();
  if (!q) return searchNutritionLocal('');
  try {
    const res = await fetch('/api/ai/nutrition-lookup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: q }),
    });
    const data = await parseApiJsonResponse<{
      name?: string;
      kcal?: number;
      fat?: number;
      satFat?: number;
      sugar?: number;
      protein?: number;
      carbs?: number;
      allergens?: string[];
      vegan?: boolean;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return {
      name: data.name || q,
      kcal: Number(data.kcal) || 0,
      fat: Number(data.fat) || 0,
      satFat: Number(data.satFat) || 0,
      sugar: Number(data.sugar) || 0,
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      allergens: Array.isArray(data.allergens) ? data.allergens : [],
      vegan: Boolean(data.vegan),
      source: 'live_api',
      confidence: 'high',
      note: `Live AI nutrition lookup for "${q}".`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Service unavailable';
    return searchNutritionLocal(q, `Live lookup unavailable (${msg})`);
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function scanInvoiceViaApi(file: File): Promise<InvoiceExtractedLine[]> {
  const imageBase64 = await fileToBase64(file);
  const res = await fetch('/api/ai/scan-invoice', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      imageBase64,
      mimeType: file.type || 'image/jpeg',
    }),
  });
  const data = await parseApiJsonResponse<{
    items?: Array<{ name?: string; qty?: number; unit?: string; cost?: number }>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data?.error || `Invoice scan failed (${res.status})`);
  }
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return rawItems.map((it) => {
    const u = String(it.unit || 'kg').toLowerCase();
    const unit: 'kg' | 'g' | 'pcs' =
      u === 'pcs' ? 'pcs' : u === 'g' || u === 'ml' ? 'g' : 'kg';
    return {
      name: String(it.name || '').trim(),
      qty: Number(it.qty) || 0,
      unit,
      cost: Number(it.cost) || 0,
    };
  });
}

/* ================= CSV & JSON IMPORT / EXPORT ================= */

export function safeFileName(name: string): string {
  return (name || 'recipe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'recipe';
}

export function downloadBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsvSimple(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        cells.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    cells.push(field);
    return cells.map((c) => c.trim());
  });
}

export function buildRecipeExportObject(
  draft: BuilderDraftState,
  libraryById: Map<string, LibraryIngredient>
) {
  const c = computeFormulationTotals(draft.items, draft.unitWeightG, libraryById);
  const totalWithOverhead = c.totalCostKwd + (draft.overheadCostKwd || 0);
  const perUnitCost = c.estYieldPieces > 0 ? totalWithOverhead / c.estYieldPieces : 0;
  const suggestedSellKwd = perUnitCost * (1 + (draft.markupPct || 0) / 100);
  return {
    name: draft.name,
    category: draft.category,
    unitWeightG: draft.unitWeightG,
    methodNotes: draft.methodNotes,
    overheadCostKwd: draft.overheadCostKwd,
    markupPct: draft.markupPct,
    suggestedSellPricePerPieceKwd: Number(suggestedSellKwd.toFixed(3)),
    currency: 'KWD',
    ingredients: draft.items
      .map((r) => {
        const item = libraryById.get(r.id);
        if (!item) return null;
        const packaging = isPackagingItem(item);
        const cost = packaging
          ? effectiveCostPerUnit(item) * r.g
          : (effectiveCostKg(item) / 1000) * r.g;
        return {
          ingredientId: item.id,
          name: item.name,
          category: item.cat,
          quantity: r.g,
          quantityUnit: packaging ? 'pieces' : 'g',
          costKwd: Number(cost.toFixed(4)),
          supplier: r.supplier || '',
          allergens: item.allergens || [],
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    totalFoodWeightG: c.totalG,
    estimatedYieldPieces: c.estYieldPieces,
    ingredientCostKwd: Number(c.ingredientCostKwd.toFixed(3)),
    packagingCostKwd: Number(c.packagingCostKwd.toFixed(3)),
    totalCostKwd: Number(totalWithOverhead.toFixed(3)),
    per100gNutrition: {
      kcal: Math.round(c.per100g.kcal),
      fatG: Number(c.per100g.fat.toFixed(1)),
      satFatG: Number(c.per100g.satFat.toFixed(1)),
      carbsG: Number(c.per100g.carbs.toFixed(1)),
      sugarG: Number(c.per100g.sugar.toFixed(1)),
      proteinG: Number(c.per100g.protein.toFixed(1)),
    },
    allergens: c.allergens,
    additives: c.additives.map((a) => ({ code: a.ecode, name: a.name })),
    exportedAt: new Date().toISOString(),
  };
}

export function exportCurrentRecipeJSON(
  draft: BuilderDraftState,
  libraryById: Map<string, LibraryIngredient>
): void {
  const data = buildRecipeExportObject(draft, libraryById);
  downloadBlob(
    JSON.stringify(data, null, 2),
    'application/json',
    `${safeFileName(data.name)}.json`
  );
}

export function exportCurrentRecipeCSV(
  draft: BuilderDraftState,
  libraryById: Map<string, LibraryIngredient>
): void {
  const data = buildRecipeExportObject(draft, libraryById);
  const rows: (string | number)[][] = [
    ['Ingredient', 'Category', 'Quantity', 'Unit', 'Cost (KWD)', 'Supplier', 'Allergens'],
  ];
  for (const ing of data.ingredients) {
    rows.push([
      ing.name,
      ing.category,
      ing.quantity,
      ing.quantityUnit,
      ing.costKwd.toFixed(3),
      ing.supplier,
      ing.allergens.join('; '),
    ]);
  }
  rows.push([]);
  rows.push(['Total ingredient cost (KWD)', '', '', '', data.ingredientCostKwd.toFixed(3)]);
  rows.push(['Total packaging cost (KWD)', '', '', '', data.packagingCostKwd.toFixed(3)]);
  rows.push(['Overhead (KWD)', '', '', '', (data.overheadCostKwd || 0).toFixed(3)]);
  rows.push(['Grand total (KWD)', '', '', '', data.totalCostKwd.toFixed(3)]);
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadBlob(csv, 'text/csv', `${safeFileName(data.name)}.csv`);
}

export function exportCurrentRecipeText(
  draft: BuilderDraftState,
  libraryById: Map<string, LibraryIngredient>
): void {
  const data = buildRecipeExportObject(draft, libraryById);
  let txt = `${data.name} (${data.category})\nExported ${new Date(data.exportedAt).toLocaleString()}\n\n`;
  txt += `Weight per piece: ${data.unitWeightG}g · Estimated yield: ${data.estimatedYieldPieces} pieces\n\n`;
  txt += `INGREDIENTS\n`;
  for (const i of data.ingredients) {
    txt += `- ${i.name}: ${i.quantity}${i.quantityUnit === 'pieces' ? ' pcs' : 'g'} (KWD ${i.costKwd.toFixed(3)})${i.supplier ? ` — ${i.supplier}` : ''}\n`;
  }
  txt += `\nALLERGENS: ${data.allergens.length ? data.allergens.join(', ') : 'None detected'}\n`;
  txt += `ADDITIVES: ${data.additives.length ? data.additives.map((a) => `${a.code} (${a.name})`).join(', ') : 'None — clean label'}\n\n`;
  txt += `Ingredient cost: KWD ${data.ingredientCostKwd.toFixed(3)}\n`;
  txt += `Packaging cost: KWD ${data.packagingCostKwd.toFixed(3)}\n`;
  txt += `Overhead cost: KWD ${(data.overheadCostKwd || 0).toFixed(3)}\n`;
  txt += `Grand total cost: KWD ${data.totalCostKwd.toFixed(3)}\n`;
  txt += `Suggested selling price (${data.markupPct}% markup): KWD ${data.suggestedSellPricePerPieceKwd.toFixed(3)} / piece\n\n`;
  txt += `METHOD\n${data.methodNotes}\n`;
  downloadBlob(txt, 'text/plain', `${safeFileName(data.name)}.txt`);
}

export function serializeIngredientForBackup(item: LibraryIngredient) {
  const base = {
    id: item.id,
    name: item.name,
    cat: item.cat,
    custom: Boolean(item.custom),
    costUnit: item.costUnit || 'weight',
    vegan: item.vegan,
    allergens: item.allergens || [],
    wastagePct: item.wastagePct || 0,
    kcal: item.kcal || 0,
    fat: item.fat || 0,
    satFat: item.satFat || 0,
    sugar: item.sugar || 0,
    protein: item.protein || 0,
    carbs: item.carbs || 0,
    bulkCurrency: item.bulkCurrency || 'KWD',
    ecode: item.ecode,
    dosage: item.dosage,
    func: item.func,
    note: item.note,
  };
  if (item.costUnit === 'piece') {
    return {
      ...base,
      costKg: rawCostKg(item),
      pieceWeightG: item.pieceWeightG,
      bulkPieces: item.bulkPieces,
      bulkCost: item.bulkCost,
    };
  }
  if (item.costUnit === 'unit') {
    return {
      ...base,
      costPerUnit: effectiveCostPerUnit(item),
      bulkUnitQty: item.bulkUnitQty,
      bulkCost: item.bulkCost,
    };
  }
  if (item.costUnit === 'roll') {
    return {
      ...base,
      rollLengthM: item.rollLengthM,
      rollWidthMM: item.rollWidthMM,
      gsm: item.gsm,
      costPerRoll: item.costPerRoll,
      wrapLengthCmPerUnit: item.wrapLengthCmPerUnit,
    };
  }
  return {
    ...base,
    costKg: rawCostKg(item),
    bulkQty: item.bulkQty,
    bulkUnit: item.bulkUnit,
    bulkCost: item.bulkCost,
  };
}

export function exportMasterPricingJSON(library: LibraryIngredient[]): void {
  const data = {
    exportedAt: new Date().toISOString(),
    ingredientCount: library.length,
    currency: 'KWD',
    ingredients: library.map(serializeIngredientForBackup),
  };
  downloadBlob(
    JSON.stringify(data, null, 2),
    'application/json',
    'master-pricing-database.json'
  );
}

export function exportAllSavedJSON(products: Product[], versions: RecipeVersion[]): void {
  const versionsByProd = new Map<string, RecipeVersion[]>();
  for (const v of versions) {
    const arr = versionsByProd.get(v.productId) || [];
    arr.push(v);
    versionsByProd.set(v.productId, arr);
  }
  const data = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    status: p.status,
    versions: (versionsByProd.get(p.id) || [])
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map((v) => ({
        versionNumber: v.versionNumber,
        validationStatus: v.validationStatus,
        score: v.score ?? null,
        scoreNotes: v.scoreNotes || '',
        changeReason: v.changeReason,
        expectedEffect: v.expectedEffect,
        actualOutcome: v.actualOutcome,
        targetPieceWeightG: v.targetPieceWeightG || 90,
        expectedCostKwd: v.expectedCost,
        markupPct: v.markupPct ?? p.targetMarkupPct ?? 0,
        suggestedPriceKwd: v.suggestedPriceKwd ?? 0,
        method: v.method,
        ingredients: v.ingredients,
        bakeTest: v.bakeTest || null,
        diffs: v.diffs || [],
      })),
  }));
  downloadBlob(JSON.stringify(data, null, 2), 'application/json', 'all-saved-recipes.json');
}

export function exportAllSavedCSV(products: Product[], versions: RecipeVersion[]): void {
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const rows: (string | number)[][] = [
    [
      'Recipe',
      'Version',
      'Status',
      'Score',
      'Rationale',
      'Batch Cost (KWD)',
      'Suggested Sell/Unit (KWD)',
      'Moisture Loss %',
      'Wastage %',
      'Actual Yield (pcs)',
    ],
  ];
  for (const v of versions) {
    const p = prodMap.get(v.productId);
    rows.push([
      p?.name || v.productId,
      `v${v.versionNumber}.0`,
      v.validationStatus,
      v.score ?? '',
      v.changeReason || '',
      (v.expectedCost || 0).toFixed(3),
      (v.suggestedPriceKwd || 0).toFixed(3),
      v.bakeTest ? v.bakeTest.moistureLossPct.toFixed(1) : '',
      v.bakeTest ? v.bakeTest.wastagePct.toFixed(1) : '',
      v.bakeTest ? v.bakeTest.actualYieldPieces : '',
    ]);
  }
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadBlob(csv, 'text/csv', 'all-saved-recipes.csv');
}

export function exportFullBackupJSON(
  library: LibraryIngredient[],
  stockMap: Map<string, number>,
  products: Product[],
  versions: RecipeVersion[],
  draft: BuilderDraftState
): void {
  const invObj: Record<string, { qty: number }> = {};
  for (const [id, qty] of stockMap.entries()) {
    invObj[id] = { qty };
  }
  const data = {
    exportedAt: new Date().toISOString(),
    currency: 'KWD',
    ingredients: library.map(serializeIngredientForBackup),
    inventory: invObj,
    products,
    versions,
    currentDraft: draft,
  };
  downloadBlob(JSON.stringify(data, null, 2), 'application/json', 'full-session-backup.json');
}

export function downloadGoodsReceivedTemplate(): void {
  const csv =
    'Ingredient,Quantity,Unit,Cost,Supplier\nAll-Purpose Flour,50,kg,4.5,Kuwait Flour Mills\n"Whole Eggs (fresh, ~50g each)",360,pcs,16.5,Local Market Supplier\n';
  downloadBlob(csv, 'text/csv', 'goods-received-template.csv');
}

export function downloadBulkRecipeTemplate(): void {
  const csv = [
    'Recipe,Code,BaseCode,Ingredient,Quantity,Unit,Supplier,PieceWeightG',
    'Ice Cream Base,B1,,Granulated White Sugar,1000,g,,',
    'Ice Cream Base,B1,,"Whole Eggs (fresh, ~50g each)",500,g,,',
    'Ice Cream Base,B1,,Canola Oil,300,g,,',
    'Vanilla Ice Cream,,B1,Pure Vanilla Extract,20,g,,90',
    'Chocolate Ice Cream,,B1,Chocolate Chips (semi-sweet),150,g,,90',
    'Cinnamon Ice Cream,,B1,Ground Cinnamon,15,g,,90',
    '',
  ].join('\n');
  downloadBlob(csv, 'text/csv', 'bulk-recipe-template.csv');
}

export interface ParsedBulkRecipeGroup {
  recipeName: string;
  unitWeightG: number;
  rationale: string;
  items: BuilderLineItem[];
}

export function parseBulkRecipesCsv(
  csvText: string,
  library: LibraryIngredient[]
): {
  groups: ParsedBulkRecipeGroup[];
  missingBases: { recipe: string; baseRef: string }[];
  unmatchedIngredients: { recipe: string; ingredient: string }[];
} {
  const rows = parseCsvSimple(csvText);
  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one ingredient row.');
  }
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = {
    recipe: header.indexOf('recipe'),
    code: header.indexOf('code'),
    baseCode: header.indexOf('basecode'),
    ing: header.indexOf('ingredient'),
    qty: header.indexOf('quantity'),
    unit: header.indexOf('unit'),
    supplier: header.indexOf('supplier'),
    pieceW: header.indexOf('pieceweightg'),
  };
  if (idx.recipe < 0) {
    throw new Error('CSV needs at least a "Recipe" column.');
  }

  const order: string[] = [];
  const grouped = new Map<string, string[][]>();
  for (const row of rows.slice(1)) {
    const name = (row[idx.recipe] || '').trim();
    if (!name) continue;
    if (!grouped.has(name)) {
      grouped.set(name, []);
      order.push(name);
    }
    grouped.get(name)!.push(row);
  }

  const resolvedByName = new Map<string, { name: string; items: BuilderLineItem[] }>();
  const resolvedByCode = new Map<string, { name: string; items: BuilderLineItem[] }>();
  const groups: ParsedBulkRecipeGroup[] = [];
  const missingBases: { recipe: string; baseRef: string }[] = [];
  const unmatchedIngredients: { recipe: string; ingredient: string }[] = [];

  for (const recipeName of order) {
    const groupRows = grouped.get(recipeName) || [];
    const codeRow = groupRows.find((r) => idx.code >= 0 && r[idx.code]?.trim());
    const code = codeRow ? codeRow[idx.code].trim() : null;
    const baseRow = groupRows.find((r) => idx.baseCode >= 0 && r[idx.baseCode]?.trim());
    const baseRef = baseRow ? baseRow[idx.baseCode].trim() : null;
    const pwRow = groupRows.find((r) => idx.pieceW >= 0 && r[idx.pieceW]?.trim());
    const unitWeightG = pwRow ? Math.max(1, parseFloat(pwRow[idx.pieceW]) || 90) : 90;

    let items: BuilderLineItem[] = [];
    let baseName: string | null = null;
    if (baseRef) {
      const base =
        resolvedByCode.get(baseRef) || resolvedByName.get(baseRef.toLowerCase());
      if (base) {
        items = base.items.map((i) => ({ ...i }));
        baseName = base.name;
      } else {
        missingBases.push({ recipe: recipeName, baseRef });
      }
    }

    for (const row of groupRows) {
      const ingName = idx.ing >= 0 ? (row[idx.ing] || '').trim() : '';
      if (!ingName) continue;
      const qty = idx.qty >= 0 ? parseFloat(row[idx.qty]) || 0 : 0;
      const unit = (idx.unit >= 0 ? (row[idx.unit] || 'g').trim().toLowerCase() : 'g') || 'g';
      const supplier = idx.supplier >= 0 ? (row[idx.supplier] || '').trim() : '';
      if (qty <= 0) continue;

      const matched =
        library.find((i) => i.name.toLowerCase() === ingName.toLowerCase()) ||
        guessLibraryMatch(ingName, library);
      if (!matched) {
        unmatchedIngredients.push({ recipe: recipeName, ingredient: ingName });
        continue;
      }
      const isPkg = isPackagingItem(matched);
      const g = isPkg ? qty : unit === 'kg' ? qty * 1000 : qty;
      const existing = items.find((i) => i.id === matched.id);
      if (existing) existing.g += g;
      else items.push({ id: matched.id, g, supplier });
    }

    resolvedByName.set(recipeName.toLowerCase(), { name: recipeName, items });
    if (code) resolvedByCode.set(code, { name: recipeName, items });

    const rationale = baseName
      ? `Bulk imported — built from base "${baseName}"`
      : code
      ? `Bulk imported — base recipe (code ${code})`
      : 'Bulk imported';

    groups.push({
      recipeName,
      unitWeightG,
      rationale,
      items,
    });
  }

  return { groups, missingBases, unmatchedIngredients };
}

export { CATEGORY_ORDER };
