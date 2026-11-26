import {
  MaterialCategory,
  MaterialOrderItem,
  MaterialUnit,
  RawMaterial,
  RecipeVersionIngredient,
  StorageZone,
} from '../types';

export function formatKwd(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `KWD ${safe.toFixed(3)}`;
}

export function roundKwd(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 1000) / 1000;
}

export function toGrams(amount: number, unit: string): number {
  const safe = Math.max(0, Number(amount) || 0);
  const norm = (unit || 'g').trim().toLowerCase();
  if (norm === 'kg' || norm === 'l' || norm === 'liter' || norm === 'liters') {
    return Math.round(safe * 1000 * 100) / 100;
  }
  return Math.round(safe * 100) / 100;
}

export function fromGrams(grams: number, targetUnit: MaterialUnit): number {
  const safe = Math.max(0, Number(grams) || 0);
  if (targetUnit === 'kg' || targetUnit === 'L') {
    return Math.round((safe / 1000) * 1000) / 1000;
  }
  return Math.round(safe * 100) / 100;
}

export interface StockMatchSummary {
  matchedMaterialName: string | null;
  totalStockGrams: number;
  isDiscreteUnits: boolean;
  costPerGramOrUnitKwd: number;
  costPerKgOrUnitKwd: number;
  preferredUnit: MaterialUnit;
  supplier: string;
  category: MaterialCategory;
  storageZone: StorageZone;
}

export function getStockSummary(
  ingredientName: string,
  materials: RawMaterial[]
): StockMatchSummary {
  const q = ingredientName.trim().toLowerCase();
  if (!q || materials.length === 0) {
    return {
      matchedMaterialName: null,
      totalStockGrams: 0,
      isDiscreteUnits: false,
      costPerGramOrUnitKwd: 0,
      costPerKgOrUnitKwd: 0,
      preferredUnit: 'kg',
      supplier: 'Kuwait Culinary Supply',
      category: 'Specialty',
      storageZone: 'Dry Pantry',
    };
  }

  const exact = materials.filter((m) => m.name.trim().toLowerCase() === q);
  const partial =
    exact.length > 0
      ? exact
      : materials.filter(
          (m) =>
            m.name.trim().toLowerCase().includes(q) ||
            q.includes(m.name.trim().toLowerCase())
        );

  if (partial.length === 0) {
    return {
      matchedMaterialName: null,
      totalStockGrams: 0,
      isDiscreteUnits: false,
      costPerGramOrUnitKwd: 0,
      costPerKgOrUnitKwd: 0,
      preferredUnit: 'kg',
      supplier: 'Kuwait Culinary Supply',
      category: 'Specialty',
      storageZone: 'Dry Pantry',
    };
  }

  const primary = partial[0];
  const isDiscreteUnits = primary.unit === 'units';
  let totalGramsOrUnits = 0;
  let totalValueKwd = 0;

  for (const lot of partial) {
    const qtyInBase = lot.unit === 'units' ? lot.quantity : toGrams(lot.quantity, lot.unit);
    totalGramsOrUnits += qtyInBase;
    totalValueKwd += lot.quantity * lot.unitCost;
  }

  let costPerGramOrUnitKwd = 0;
  if (totalGramsOrUnits > 0 && totalValueKwd > 0) {
    costPerGramOrUnitKwd = totalValueKwd / totalGramsOrUnits;
  } else {
    const primaryBase = primary.unit === 'kg' || primary.unit === 'L' ? 1000 : 1;
    costPerGramOrUnitKwd = primary.unitCost / primaryBase;
  }

  const costPerKgOrUnitKwd = isDiscreteUnits
    ? costPerGramOrUnitKwd
    : costPerGramOrUnitKwd * 1000;

  return {
    matchedMaterialName: primary.name,
    totalStockGrams: Math.round(totalGramsOrUnits * 100) / 100,
    isDiscreteUnits,
    costPerGramOrUnitKwd,
    costPerKgOrUnitKwd: roundKwd(costPerKgOrUnitKwd),
    preferredUnit: primary.unit,
    supplier: primary.supplier || 'Kuwait Culinary Supply',
    category: primary.category,
    storageZone: primary.storageZone,
  };
}

export interface IngredientCostLine {
  name: string;
  amountG: number;
  unit: string;
  matchedMaterialName: string | null;
  costPerKgOrUnitKwd: number;
  lineCostKwd: number;
  stockAvailableG: number;
  shortfallG: number;
  preferredOrderUnit: MaterialUnit;
  supplier: string;
  category: MaterialCategory;
  storageZone: StorageZone;
}

export interface BatchCostingResult {
  lines: IngredientCostLine[];
  totalBatchWeightG: number;
  ingredientCostKwd: number;
  packagingCostKwd: number;
  overheadCostKwd: number;
  totalBatchCostKwd: number;
  expectedYield: number;
  costPerUnitKwd: number;
  markupPct: number;
  suggestedPriceKwd: number;
  activeSellingPriceKwd: number;
  impliedMarkupPct: number;
  grossProfitPerUnitKwd: number;
  grossMarginPct: number;
  foodCostPct: number;
  batchRevenueKwd: number;
  batchProfitKwd: number;
  shortfallCount: number;
}

export function computeBatchCosting(params: {
  ingredients: RecipeVersionIngredient[];
  materials: RawMaterial[];
  expectedYield: number;
  packagingCostKwd?: number;
  overheadCostKwd?: number;
  markupPct?: number;
  sellingPriceOverrideKwd?: number | null;
}): BatchCostingResult {
  const {
    ingredients,
    materials,
    expectedYield: rawYield,
    packagingCostKwd: rawPkg = 0,
    overheadCostKwd: rawOverhead = 0,
    markupPct: rawMarkup = 180,
    sellingPriceOverrideKwd = null,
  } = params;

  const expectedYield = Math.max(1, Number(rawYield) || 1);
  const packagingCostKwd = Math.max(0, Number(rawPkg) || 0);
  const overheadCostKwd = Math.max(0, Number(rawOverhead) || 0);
  const markupPct = Math.max(0, Number(rawMarkup) || 0);

  const lines: IngredientCostLine[] = ingredients
    .filter((ing) => ing.name.trim().length > 0)
    .map((ing) => {
      const amountG = Math.max(0, Number(ing.amountG) || 0);
      const stock = getStockSummary(ing.name, materials);
      const isDiscrete = ing.unit.trim().toLowerCase() === 'units' || stock.isDiscreteUnits;

      // Manual unitCostKwd is stored as KWD per kg (or KWD per unit when unit === 'units')
      const manualPerKgOrUnit = Math.max(0, Number(ing.unitCostKwd) || 0);
      const costPerKgOrUnitKwd =
        manualPerKgOrUnit > 0 ? manualPerKgOrUnit : stock.costPerKgOrUnitKwd;

      const costPerBase = isDiscrete
        ? costPerKgOrUnitKwd
        : costPerKgOrUnitKwd / 1000;

      const lineCostKwd = roundKwd(amountG * costPerBase);
      const shortfallG = Math.max(0, Math.round((amountG - stock.totalStockGrams) * 100) / 100);

      return {
        name: ing.name.trim(),
        amountG,
        unit: ing.unit || 'g',
        matchedMaterialName: stock.matchedMaterialName,
        costPerKgOrUnitKwd: roundKwd(costPerKgOrUnitKwd),
        lineCostKwd,
        stockAvailableG: stock.totalStockGrams,
        shortfallG,
        preferredOrderUnit: isDiscrete ? 'units' : stock.preferredUnit === 'L' ? 'L' : 'kg',
        supplier: stock.supplier,
        category: stock.category,
        storageZone: stock.storageZone,
      };
    });

  const totalBatchWeightG = Math.round(
    lines.reduce((s, l) => s + (l.unit.toLowerCase() === 'units' ? 0 : l.amountG), 0) * 100
  ) / 100;

  const ingredientCostKwd = roundKwd(lines.reduce((s, l) => s + l.lineCostKwd, 0));
  const totalBatchCostKwd = roundKwd(ingredientCostKwd + packagingCostKwd + overheadCostKwd);
  const costPerUnitKwd = roundKwd(totalBatchCostKwd / expectedYield);
  const suggestedPriceKwd = roundKwd(costPerUnitKwd * (1 + markupPct / 100));

  const activeSellingPriceKwd =
    sellingPriceOverrideKwd !== null &&
    Number.isFinite(sellingPriceOverrideKwd) &&
    sellingPriceOverrideKwd > 0
      ? roundKwd(sellingPriceOverrideKwd)
      : suggestedPriceKwd;

  const impliedMarkupPct =
    costPerUnitKwd > 0
      ? Math.round(((activeSellingPriceKwd - costPerUnitKwd) / costPerUnitKwd) * 1000) / 10
      : 0;

  const grossProfitPerUnitKwd = roundKwd(activeSellingPriceKwd - costPerUnitKwd);
  const grossMarginPct =
    activeSellingPriceKwd > 0
      ? Math.round((grossProfitPerUnitKwd / activeSellingPriceKwd) * 1000) / 10
      : 0;
  const foodCostPct =
    activeSellingPriceKwd > 0
      ? Math.round((costPerUnitKwd / activeSellingPriceKwd) * 1000) / 10
      : 0;
  const batchRevenueKwd = roundKwd(activeSellingPriceKwd * expectedYield);
  const batchProfitKwd = roundKwd(batchRevenueKwd - totalBatchCostKwd);
  const shortfallCount = lines.filter((l) => l.shortfallG > 0).length;

  return {
    lines,
    totalBatchWeightG,
    ingredientCostKwd,
    packagingCostKwd,
    overheadCostKwd,
    totalBatchCostKwd,
    expectedYield,
    costPerUnitKwd,
    markupPct,
    suggestedPriceKwd,
    activeSellingPriceKwd,
    impliedMarkupPct,
    grossProfitPerUnitKwd,
    grossMarginPct,
    foodCostPct,
    batchRevenueKwd,
    batchProfitKwd,
    shortfallCount,
  };
}

export function buildMaterialOrderItems(
  lines: IngredientCostLine[],
  batchMultiplier: number,
  onlyShortfalls: boolean
): MaterialOrderItem[] {
  const mult = Math.max(1, Number(batchMultiplier) || 1);
  const items: MaterialOrderItem[] = [];

  for (const line of lines) {
    const neededG = Math.round(line.amountG * mult * 100) / 100;
    const orderG = onlyShortfalls
      ? Math.max(0, Math.round((neededG - line.stockAvailableG) * 100) / 100)
      : neededG;

    if (orderG <= 0) continue;

    const unit: MaterialUnit =
      line.unit.toLowerCase() === 'units'
        ? 'units'
        : line.preferredOrderUnit === 'L'
        ? 'L'
        : orderG >= 500
        ? 'kg'
        : 'g';

    const quantity =
      unit === 'kg' || unit === 'L'
        ? Math.max(0.1, Math.round((orderG / 1000) * 100) / 100)
        : Math.max(1, Math.ceil(orderG));

    const unitCostKwd =
      unit === 'g'
        ? roundKwd(line.costPerKgOrUnitKwd / 1000)
        : roundKwd(line.costPerKgOrUnitKwd);

    const lineTotalKwd = roundKwd(quantity * unitCostKwd);

    items.push({
      materialName: line.matchedMaterialName || line.name,
      category: line.category,
      quantity,
      unit,
      gramsTotal: unit === 'units' ? quantity : toGrams(quantity, unit),
      unitCostKwd,
      lineTotalKwd,
      storageZone: line.storageZone,
    });
  }

  return items;
}
