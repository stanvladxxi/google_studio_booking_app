import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  GitCompare,
  Layers,
  Package,
  Scale,
  Upload,
} from 'lucide-react';
import {
  BookingPrefillRequest,
  KitchenSpace,
  Product,
  RawMaterial,
  RecipeTest,
  RecipeVersion,
} from '../../../types';
import { formatKwd, roundKwd } from '../../../utils/costing';
import { SAMPLE_EN_CUISINE_RECIPES } from '../data/discoverSeed';
import { EnCuisineIngredientLink, EnCuisineTab } from '../types';

interface CoreShellTabsProps {
  activeTab: Exclude<EnCuisineTab, 'discover' | 'menu'>;
  products: Product[];
  recipeVersions: RecipeVersion[];
  legacyRecipes: RecipeTest[];
  materials: RawMaterial[];
  spaces: KitchenSpace[];
  ingredientLinks: EnCuisineIngredientLink[];
  canBookKitchen: boolean;
  onBookKitchenFromRecipe: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
  onOpenDiscoverSupplierHub: () => void;
  onOpenMaterialsOrders?: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function CoreShellTabs({
  activeTab,
  products,
  recipeVersions,
  legacyRecipes,
  materials,
  spaces,
  ingredientLinks,
  canBookKitchen,
  onBookKitchenFromRecipe,
  onOpenDiscoverSupplierHub,
  onOpenMaterialsOrders,
  onNotify,
}: CoreShellTabsProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(SAMPLE_EN_CUISINE_RECIPES[0].id);
  const [cookingLossOverridePct, setCookingLossOverridePct] = useState<number>(10);
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);
  const [selectedCsvPreview, setSelectedCsvPreview] = useState<boolean>(false);

  // Merge user-saved Firestore products/versions with En Cuisine sample shells
  const combinedRecipes = useMemo(() => {
    const syncedFromDb = products.map((prod) => {
      const ver =
        recipeVersions.find((v) => v.id === prod.currentRecipeVersionId) ||
        recipeVersions.find((v) => v.productId === prod.id);
      const totalFlour =
        ver?.ingredients.find((i) => i.name.toLowerCase().includes('flour'))?.amountG ||
        ver?.ingredients[0]?.amountG ||
        1000;

      return {
        id: prod.id,
        title: prod.name,
        arabicTitle: 'وصفة مسجلة',
        category: prod.category,
        version: ver ? `v${ver.versionNumber}` : 'v1.0',
        yieldUnits: ver?.expectedYield || 20,
        yieldUnit: ver?.yieldUnit || 'units',
        estimatedHours: Math.max(1, Math.ceil((ver?.prepMinutes || 120) / 60)),
        bakersHydrationPct: 65,
        cookingLossPct: 8,
        requiredEquipment: ver?.equipment?.length ? ver.equipment : ['Rational iCombi Pro 10-Pan'],
        recommendedSpaceId: spaces[0]?.id || 'space_pastry_suite',
        methodSummary: ver?.method || 'Synced formulation from Hearthline Recipe Creator.',
        ingredients: (ver?.ingredients || []).map((ing) => ({
          name: ing.name,
          grams: ing.amountG,
          baseCostPerKgKwd: ing.unitCostKwd || 1.25,
          bakersPct: totalFlour > 0 ? Math.round((ing.amountG / totalFlour) * 1000) / 10 : 0,
        })),
        isSyncedFromHost: true,
      };
    });

    return [
      ...syncedFromDb,
      ...SAMPLE_EN_CUISINE_RECIPES.map((r) => ({ ...r, isSyncedFromHost: false })),
    ];
  }, [products, recipeVersions, spaces]);

  const activeRecipe = useMemo(
    () => combinedRecipes.find((r) => r.id === selectedRecipeId) || combinedRecipes[0],
    [combinedRecipes, selectedRecipeId]
  );

  // Deterministic KWD Costing with real Supplier Hub overrides + cooking-loss costing shell
  const costingComputation = useMemo(() => {
    const mult = Math.max(1, batchMultiplier);
    const rows = activeRecipe.ingredients.map((ing) => {
      const link = ingredientLinks.find(
        (l) =>
          (l.recipeId === activeRecipe.id || l.recipeId === 'all') &&
          l.ingredientName.trim().toLowerCase() === ing.name.trim().toLowerCase()
      );
      const effectiveCostPerKgKwd = link ? link.costPerKgKwd : ing.baseCostPerKgKwd;
      const scaledGrams = ing.grams * mult;
      const lineCostKwd = roundKwd((scaledGrams / 1000) * effectiveCostPerKgKwd);

      return {
        ...ing,
        scaledGrams,
        effectiveCostPerKgKwd,
        lineCostKwd,
        supplierOverride: link || null,
      };
    });

    const totalRawCostKwd = roundKwd(rows.reduce((s, r) => s + r.lineCostKwd, 0));
    const totalRawWeightG = rows.reduce((s, r) => s + r.scaledGrams, 0);
    const lossFactor = Math.max(0.1, 1 - cookingLossOverridePct / 100);
    const netCookedWeightG = Math.round(totalRawWeightG * lossFactor);
    const totalYieldUnits = Math.max(1, Math.round(activeRecipe.yieldUnits * mult));
    const costPerUnitRawKwd = roundKwd(totalRawCostKwd / totalYieldUnits);
    const costPerUsableKgAfterLossKwd =
      netCookedWeightG > 0 ? roundKwd(totalRawCostKwd / (netCookedWeightG / 1000)) : 0;

    return {
      rows,
      totalRawCostKwd,
      totalRawWeightG,
      netCookedWeightG,
      totalYieldUnits,
      costPerUnitRawKwd,
      costPerUsableKgAfterLossKwd,
    };
  }, [activeRecipe, batchMultiplier, cookingLossOverridePct, ingredientLinks]);

  const handleBookFromRecipe = (recipe: typeof activeRecipe) => {
    const matchedSpace =
      spaces.find((s) => s.id === recipe.recommendedSpaceId) ||
      spaces.find((s) =>
        recipe.category.toLowerCase().includes(s.zone.toLowerCase().split(' ')[0])
      ) ||
      spaces[0];

    const notes = `En Cuisine Recipe: ${recipe.title} (${recipe.version}) · Target Yield: ${recipe.yieldUnits} ${recipe.yieldUnit} · Required Equipment: ${recipe.requiredEquipment.join(', ')}`;

    onBookKitchenFromRecipe({
      spaceId: matchedSpace?.id,
      durationHours: Math.min(12, Math.max(1, recipe.estimatedHours)),
      equipmentNames: recipe.requiredEquipment,
      notes,
    });
  };

  if (activeTab === 'recipes') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#0B3B2B]">
              Core Shell · Baker&apos;s Percentages Prototype Hook
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Enterprise Formulations & Production Readiness
            </h2>
            <p className="text-sm text-slate-600 max-w-3xl">
              Displays host workspace products alongside En Cuisine sample recipes. Full baker&apos;s percentage scaling and hydration solvers connect at the marked integration hook below.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 shrink-0">
            Synced: {products.length} host products · {legacyRecipes.length} trials
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Recipe Directory */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Formulation Library</span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {combinedRecipes.length} items
              </span>
            </div>
            {combinedRecipes.map((rec) => {
              const selected = rec.id === activeRecipe.id;
              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => setSelectedRecipeId(rec.id)}
                  className={`w-full text-start p-4 transition-colors ${
                    selected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{rec.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {rec.category} · {rec.version} · {rec.yieldUnits} {rec.yieldUnit}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#0B3B2B] font-semibold shrink-0">
                      {rec.estimatedHours}h prep
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Recipe Detail + Integration Hook + Book a Kitchen CTA */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {activeRecipe.category} · {activeRecipe.version} · {activeRecipe.arabicTitle}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{activeRecipe.title}</h3>
              </div>
              {canBookKitchen && (
                <button
                  type="button"
                  onClick={() => handleBookFromRecipe(activeRecipe)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <CalendarClock className="w-4 h-4" />
                  Book a Kitchen ({activeRecipe.estimatedHours}h)
                </button>
              )}
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">{activeRecipe.methodSummary}</p>

            {/* Required Equipment for Booking Pre-fill */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">
                Required Kitchen Equipment (pre-filled into booking on click)
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                {activeRecipe.requiredEquipment.map((eq) => (
                  <span
                    key={eq}
                    className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 font-medium"
                  >
                    {eq}
                  </span>
                ))}
              </div>
            </div>

            {/* Baker's Percentages Table + Explicit Integration Boundary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-[#0B3B2B]" />
                  Gram & Baker&apos;s Percentage Formula Shell
                </span>
                <span className="text-xs font-mono tabular-nums text-[#0B3B2B]">
                  Hydration: {activeRecipe.bakersHydrationPct || '—'}%
                </span>
              </div>

              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Ingredient</th>
                      <th className="py-2.5 px-3 text-right">Weight (g)</th>
                      <th className="py-2.5 px-3 text-right">Baker&apos;s %</th>
                      <th className="py-2.5 px-3 text-right">Rate (KWD/kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeRecipe.ingredients.map((ing) => (
                      <tr key={ing.name}>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{ing.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {ing.grams.toLocaleString()} g
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          {ing.bakersPct > 0 ? `${ing.bakersPct}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                          {formatKwd(ing.baseCostPerKgKwd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 rounded-md p-3 text-xs text-[#0B3B2B]">
                <strong>Integration Point — Baker&apos;s Percentage Engine:</strong> Replace this static ratio column with your En Cuisine dough hydration solver & flour-weight multi-blend calculator.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'costing') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#0B3B2B]">
              Core Shell · Live KWD & Cooking-Loss Costing Hook
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Batch Costing in KWD with Supplier Hub Price Overrides
            </h2>
            <p className="text-sm text-slate-600">
              Any ingredient matched in <strong>Discover → Supplier Hub Products</strong> automatically overrides baseline costs below.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDiscoverSupplierHub}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Match Supplier Hub Prices
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Active Formulation</span>
              <select
                value={activeRecipe.id}
                onChange={(e) => setSelectedRecipeId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {combinedRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.version})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Batch Multiplier</span>
              <select
                value={batchMultiplier}
                onChange={(e) => setBatchMultiplier(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              >
                {[1, 2, 5, 10].map((m) => (
                  <option key={m} value={m}>
                    {m}× Batch ({activeRecipe.yieldUnits * m} {activeRecipe.yieldUnit})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Cooking / Baking Loss ({cookingLossOverridePct}%)
              </span>
              <input
                type="range"
                min={0}
                max={45}
                value={cookingLossOverridePct}
                onChange={(e) => setCookingLossOverridePct(Number(e.target.value))}
                className="w-full accent-[#0B3B2B] mt-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-slate-200 py-4">
            <div>
              <div className="text-xs text-slate-500">Total Batch Cost</div>
              <div className="text-lg font-mono tabular-nums font-bold text-[#0B3B2B]">
                {formatKwd(costingComputation.totalRawCostKwd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Cost / Unit ({costingComputation.totalYieldUnits} {activeRecipe.yieldUnit})</div>
              <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                {formatKwd(costingComputation.costPerUnitRawKwd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Net Cooked Weight</div>
              <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
                {(costingComputation.netCookedWeightG / 1000).toFixed(2)} kg
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Cost / Usable kg (Post-Loss)</div>
              <div className="text-lg font-mono tabular-nums font-bold text-orange-700">
                {formatKwd(costingComputation.costPerUsableKgAfterLossKwd)}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Ingredient</th>
                  <th className="py-2.5 px-3">Price Source</th>
                  <th className="py-2.5 px-3 text-right">Batch Weight</th>
                  <th className="py-2.5 px-3 text-right">KWD / kg</th>
                  <th className="py-2.5 px-3 text-right">Line Cost (KWD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {costingComputation.rows.map((row) => (
                  <tr key={row.name}>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{row.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {row.supplierOverride ? (
                        <span className="text-[#0B3B2B] font-semibold">
                          Supplier Hub · {row.supplierOverride.supplierName}
                        </span>
                      ) : (
                        'Baseline Catalog'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {row.scaledGrams.toLocaleString()} g
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatKwd(row.effectiveCostPerKgKwd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatKwd(row.lineCostKwd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded-md p-3 text-xs text-[#0B3B2B]">
            <strong>Integration Point — Live & Cooking-Loss Costing Engine:</strong> Wire your En Cuisine prototype yield curves, trimming waste factors, and utility overhead allocations directly to these KWD cost rows.
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'versions') {
    const sampleDiffs = [
      {
        ingredient: 'Cultured Normandy Butter',
        v1: '1,600 g',
        v2: '1,750 g',
        delta: '+150 g (+0.428 KWD)',
      },
      {
        ingredient: 'Green Cardamom Powder',
        v1: '50 g',
        v2: '65 g',
        delta: '+15 g (+0.171 KWD)',
      },
      {
        ingredient: 'Bake Profile · Polin Hearth',
        v1: '205°C · 22 min',
        v2: '195°C · 25 min',
        delta: '-10°C / +3 min steam',
      },
    ];

    const sampleBakeTests = [
      {
        id: 'bt_1',
        code: 'BT-2026-114',
        version: 'v2.4',
        bakeTemp: '195°C',
        lossPct: '9.2%',
        sensory: '94 / 100 · Golden sheen, open honeycomb crumb',
        status: 'Approved for Commissary',
      },
      {
        id: 'bt_2',
        code: 'BT-2026-109',
        version: 'v2.3',
        bakeTemp: '205°C',
        lossPct: '11.8%',
        sensory: '82 / 100 · Crust darkens before core sets',
        status: 'Iterated',
      },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1">
          <div className="text-xs font-semibold text-[#0B3B2B]">
            Core Shell · Version Diff & Bake Test Logger Hook
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Versions & Bake Tests ({recipeVersions.length} synced versions in host workspace)
          </h2>
          <p className="text-sm text-slate-600">
            Side-by-side formulation deltas and oven bake-test sensory logs. Immutable version enforcement remains governed by Hearthline R&amp;D storage.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-[#0B3B2B]" />
                Version Comparison Shell (v2.3 → v2.4)
              </h3>
              <span className="text-xs font-mono text-slate-500">Brioche Trial</span>
            </div>
            <div className="divide-y divide-slate-200 text-xs">
              {sampleDiffs.map((row) => (
                <div key={row.ingredient} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{row.ingredient}</div>
                    <div className="font-mono text-slate-500 mt-0.5">
                      {row.v1} → {row.v2}
                    </div>
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-[#0B3B2B] shrink-0">
                    {row.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-600" />
                Bake Test Sensory Log Shell
              </h3>
              <button
                type="button"
                onClick={() =>
                  onNotify('Bake Test logger shell connected — ready for full En Cuisine prototype engine.')
                }
                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded transition-colors"
              >
                + Log Bake Test (Shell)
              </button>
            </div>
            <div className="space-y-3">
              {sampleBakeTests.map((bt) => (
                <div
                  key={bt.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-900">
                      {bt.code} · {bt.version}
                    </span>
                    <span className="font-mono tabular-nums text-[#0B3B2B] font-semibold">
                      {bt.bakeTemp} · Loss {bt.lossPct}
                    </span>
                  </div>
                  <div className="text-slate-700">{bt.sensory}</div>
                  <div className="text-slate-500 font-medium">{bt.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inventory Tab
  const sampleInventoryRows = [
    {
      name: 'Aged Balsamic Vinegar IGP',
      supplier: 'Al-Yasra Foodservice Kuwait',
      stock: '12 L',
      costKwd: 9.5,
      zone: 'Dry Pantry',
    },
    {
      name: 'Levantine Pomegranate Molasses',
      supplier: 'Mezzan Horizon Trading',
      stock: '16 kg',
      costKwd: 2.45,
      zone: 'Dry Pantry',
    },
    {
      name: 'Cultured Normandy Butter',
      supplier: 'Gulf Cold Chain Supply',
      stock: '45 kg',
      costKwd: 2.85,
      zone: 'Walk-In Cooler',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#0B3B2B]">
            Core Shell · CSV &amp; AI Invoice Inventory Ingestion Hook
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Inventory Ledger ({materials.length} live host lots + sample commissary stock)
          </h2>
          <p className="text-sm text-slate-600">
            Unified with Hearthline Raw Materials (`rawMaterials`). Drop supplier invoices or bulk CSV files at the marked integration hook.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenMaterialsOrders && (
            <button
              type="button"
              onClick={onOpenMaterialsOrders}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              Open Raw Materials &amp; Orders
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedCsvPreview((v) => !v);
              onNotify('Toggled CSV / AI Invoice ingestion preview shell.');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {selectedCsvPreview ? 'Hide Invoice Parser Shell' : 'CSV / AI Invoice Import (Shell)'}
          </button>
        </div>
      </div>

      {selectedCsvPreview && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 space-y-2 text-xs text-[#0B3B2B]">
          <div className="font-semibold flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            Integration Hook — En Cuisine CSV &amp; AI Invoice Ingestion Pipeline
          </div>
          <p className="text-slate-700">
            Ready to map extracted supplier SKU lines (`item`, `qty`, `unit`, `kwd_unit_price`, `lot_code`) directly into `rawMaterials` and update ingredient prices across Costing.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-3 px-4">Material / Lot</th>
              <th className="py-3 px-4">Supplier</th>
              <th className="py-3 px-4">Storage Zone</th>
              <th className="py-3 px-4 text-right">On Hand</th>
              <th className="py-3 px-4 text-right">Unit Cost (KWD)</th>
              <th className="py-3 px-4 text-right">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {materials.map((m) => (
              <tr key={m.id}>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {m.name}
                  <span className="block font-mono text-[11px] font-normal text-slate-500">
                    {m.lotCode || 'Host Lot'}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">{m.supplier}</td>
                <td className="py-3 px-4 text-slate-600">{m.storageZone}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {m.quantity} {m.unit}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B3B2B] font-semibold">
                  {formatKwd(m.unitCost)}
                </td>
                <td className="py-3 px-4 text-right text-emerald-700 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Live Host
                  </span>
                </td>
              </tr>
            ))}
            {sampleInventoryRows.map((row) => (
              <tr key={row.name} className="bg-slate-50/40">
                <td className="py-3 px-4 font-medium text-slate-800">{row.name}</td>
                <td className="py-3 px-4 text-slate-600">{row.supplier}</td>
                <td className="py-3 px-4 text-slate-600">{row.zone}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{row.stock}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-800">
                  {formatKwd(row.costKwd)}
                </td>
                <td className="py-3 px-4 text-right text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Sample Shell
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
