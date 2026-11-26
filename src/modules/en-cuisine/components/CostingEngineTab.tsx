import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Flame, Scale } from 'lucide-react';
import {
  IngredientLibraryDoc,
  Product,
  RecipeVersion,
} from '../../../types';
import {
  BuilderDraftState,
  EnCuisineIngredientLink,
} from '../types';
import {
  computeCostingEngineScale,
  effectiveCostKg,
  effectiveCostPerUnit,
  formatKwd,
  formatWeightText,
  guessLibraryMatch,
  isPackagingItem,
  rawCostKg,
  versionToBuilderDraft,
} from '../utils/formulationEngine';
import {
  MergedLibraryState,
  saveIngredientLibraryItem,
} from '../utils/libraryPersistence';

interface CostingEngineTabProps {
  uid: string;
  userName: string;
  readOnly: boolean;
  draft: BuilderDraftState;
  mergedLibrary: MergedLibraryState;
  ingredientDocsByIngredientId: Map<string, IngredientLibraryDoc>;
  products: Product[];
  recipeVersions: RecipeVersion[];
  ingredientLinks: EnCuisineIngredientLink[];
  onOpenDiscoverSupplierHub: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function CostingEngineTab({
  uid,
  userName,
  readOnly,
  draft,
  mergedLibrary,
  ingredientDocsByIngredientId,
  products,
  recipeVersions,
  ingredientLinks,
  onOpenDiscoverSupplierHub,
  onNotify,
}: CostingEngineTabProps) {
  const { library, libraryById, stockMap, historyMap } = mergedLibrary;

  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('draft');
  const [targetBatchKg, setTargetBatchKg] = useState<number>(1.2);
  const [portionG, setPortionG] = useState<number>(draft.unitWeightG || 90);
  const [lossPct, setLossPct] = useState<number>(10);
  const [markupPct, setMarkupPct] = useState<number>(draft.markupPct ?? 150);

  // Inline price edits before clicking Save Rate
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const versionOptions = useMemo(() => {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    return recipeVersions.map((v) => ({
      key: v.id,
      product: prodMap.get(v.productId),
      version: v,
      label: `${prodMap.get(v.productId)?.name || v.productId} · v${v.versionNumber}.0`,
    }));
  }, [products, recipeVersions]);

  const activeSource = useMemo(() => {
    if (selectedSourceKey !== 'draft') {
      const found = versionOptions.find((o) => o.key === selectedSourceKey);
      if (found && found.product) {
        const converted = versionToBuilderDraft(found.product, found.version, library);
        return {
          title: found.label,
          productId: found.product.id,
          items: converted.items,
          defaultUnitWeightG: converted.unitWeightG,
          defaultMarkupPct: converted.markupPct,
        };
      }
    }
    return {
      title: `${draft.name || 'Active Builder Draft'} (Live Draft)`,
      productId: draft.sourceProductId || 'all',
      items: draft.items,
      defaultUnitWeightG: draft.unitWeightG || 90,
      defaultMarkupPct: draft.markupPct ?? 150,
    };
  }, [selectedSourceKey, versionOptions, library, draft]);

  // Sync default batch kg, portion size, markup whenever source switches
  useEffect(() => {
    const baseFoodG = activeSource.items
      .filter((l) => {
        const item = libraryById.get(l.id);
        return item && !isPackagingItem(item);
      })
      .reduce((s, l) => s + (l.g || 0), 0);
    setTargetBatchKg(Math.max(0.1, Number((baseFoodG / 1000).toFixed(2))));
    setPortionG(activeSource.defaultUnitWeightG);
    setMarkupPct(activeSource.defaultMarkupPct);
  }, [selectedSourceKey, activeSource.defaultUnitWeightG, activeSource.defaultMarkupPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // Average bake-test moisture loss across matching product or all saved tests
  const bakeTestAvgLoss = useMemo(() => {
    const relevant = recipeVersions.filter(
      (v) =>
        v.bakeTest &&
        (activeSource.productId === 'all' || v.productId === activeSource.productId)
    );
    const pool =
      relevant.length > 0 ? relevant : recipeVersions.filter((v) => Boolean(v.bakeTest));
    if (pool.length === 0) return null;
    const avg =
      pool.reduce((s, v) => s + (v.bakeTest?.moistureLossPct || 0), 0) / pool.length;
    return Number(avg.toFixed(1));
  }, [recipeVersions, activeSource.productId]);

  // Build Discover Supplier Hub price override map keyed by library item id
  const supplierPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of activeSource.items) {
      const lib = libraryById.get(line.id);
      if (!lib || isPackagingItem(lib)) continue;
      const link = ingredientLinks.find(
        (l) =>
          (l.recipeId === activeSource.productId || l.recipeId === 'all') &&
          (l.ingredientName.trim().toLowerCase() === lib.name.trim().toLowerCase() ||
            guessLibraryMatch(l.ingredientName, [lib]) !== null)
      );
      if (link) map.set(lib.id, link.costPerKgKwd);
    }
    return map;
  }, [activeSource.items, activeSource.productId, ingredientLinks, libraryById]);

  const computed = useMemo(
    () =>
      computeCostingEngineScale(
        activeSource.items,
        targetBatchKg,
        portionG,
        lossPct,
        libraryById,
        supplierPriceMap
      ),
    [activeSource.items, targetBatchKg, portionG, lossPct, libraryById, supplierPriceMap]
  );

  const suggestedSellKwd =
    computed.costPerPortionActual * (1 + Math.max(0, markupPct) / 100);
  const grossMarginKwd = suggestedSellKwd - computed.costPerPortionActual;
  const grossMarginPct =
    suggestedSellKwd > 0 ? (grossMarginKwd / suggestedSellKwd) * 100 : 0;

  const handleSaveInlineRate = async (itemId: string) => {
    const rawStr = rateEdits[itemId];
    if (rawStr === undefined) return;
    const nextVal = Math.max(0, parseFloat(rawStr) || 0);
    const item = libraryById.get(itemId);
    if (!item) return;

    setSavingId(itemId);
    try {
      const updated = isPackagingItem(item)
        ? { ...item, costPerUnit: Number(nextVal.toFixed(4)) }
        : { ...item, costKg: Number(nextVal.toFixed(4)) };
      await saveIngredientLibraryItem({
        uid,
        userName,
        item: updated,
        stockQty: stockMap.get(item.id) || 0,
        history: historyMap.get(item.id) || [],
        existingDoc: ingredientDocsByIngredientId.get(item.id),
        logMessage: `Updated KWD rate for "${item.name}" to ${nextVal.toFixed(3)} in Costing Engine.`,
      });
      setRateEdits((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      onNotify(`Saved new KWD rate for "${item.name}" — Builder & Inventory updated.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save rate.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#0B3B2B] flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Live KWD Scaling, Cooking-Loss &amp; Margin Engine
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Batch Costing &amp; Supplier Hub Rate Synchronization
          </h2>
          <p className="text-xs text-slate-600 max-w-3xl">
            Scale any saved formulation or the active builder draft to a target kg batch, apply measured baking/cooking moisture loss, and save KWD market rates directly back to Firestore.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenDiscoverSupplierHub}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md whitespace-nowrap shrink-0"
        >
          Match Supplier Hub Prices
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Controls Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Source Formulation
            </label>
            <select
              value={selectedSourceKey}
              onChange={(e) => setSelectedSourceKey(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md"
            >
              <option value="draft">
                Active Builder Draft: {draft.name || 'Untitled'} ({draft.items.length} lines)
              </option>
              {versionOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} ({o.version.validationStatus})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Target Batch Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              min={0.05}
              value={targetBatchKg}
              onChange={(e) =>
                setTargetBatchKg(Math.max(0.05, parseFloat(e.target.value) || 0.05))
              }
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Portion Size (g)
            </label>
            <input
              type="number"
              min={1}
              value={portionG}
              onChange={(e) => setPortionG(Math.max(1, parseFloat(e.target.value) || 1))}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Target Markup (%)
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={markupPct}
              onChange={(e) => setMarkupPct(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* Cooking Loss Slider + Bake Test Avg Quick-Apply */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-600" />
                Cooking / Baking Moisture &amp; Trim Loss
              </span>
              <span className="font-mono font-bold text-[#0B3B2B]">{lossPct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              step={0.5}
              value={lossPct}
              onChange={(e) => setLossPct(parseFloat(e.target.value) || 0)}
              className="w-full accent-[#0B3B2B]"
            />
          </div>

          {bakeTestAvgLoss !== null && (
            <button
              type="button"
              onClick={() => {
                setLossPct(bakeTestAvgLoss);
                onNotify(`Applied measured Bake-Test average loss (${bakeTestAvgLoss}%).`);
              }}
              className="px-3 py-2 text-xs font-semibold text-[#0B3B2B] bg-white border border-[#0B3B2B] rounded-md hover:bg-emerald-50 whitespace-nowrap shrink-0"
            >
              Use Bake-Test Avg ({bakeTestAvgLoss}%)
            </button>
          )}
        </div>

        {/* 5 KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-y border-slate-200 py-4">
          <div>
            <div className="text-[11px] text-slate-500">Scaled Batch Cost</div>
            <div className="text-lg font-mono tabular-nums font-bold text-[#0B3B2B]">
              {formatKwd(computed.totalBatchCost)}
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {formatKwd(computed.costPerKgBatch)} / kg raw
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-500">Theoretical Yield</div>
            <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
              {computed.theoreticalPortions} pcs
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              {formatKwd(computed.costPerPortionTheoretical)} / pc
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-500">Net Usable (Post-Loss)</div>
            <div className="text-lg font-mono tabular-nums font-bold text-slate-900">
              {(computed.netUsableG / 1000).toFixed(2)} kg
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              -{formatWeightText(computed.lossWeightG)} lost
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-500">Actual Salable Yield</div>
            <div className="text-lg font-mono tabular-nums font-bold text-orange-700">
              {computed.actualPortions} pcs
            </div>
            <div className="text-[11px] font-mono font-semibold text-orange-700">
              {formatKwd(computed.costPerPortionActual)} / pc real
            </div>
          </div>

          <div className="bg-[#08291E] text-white rounded-md p-3">
            <div className="text-[10px] font-mono uppercase text-emerald-200">
              Sell Price ({markupPct}%)
            </div>
            <div className="text-lg font-mono tabular-nums font-bold text-orange-400">
              {formatKwd(suggestedSellKwd)}
            </div>
            <div className="text-[11px] font-mono text-emerald-200">
              Margin: {formatKwd(grossMarginKwd)} ({grossMarginPct.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* Scaled Ingredient Lines with Inline Editable KWD Rates */}
        <div className="border border-slate-200 rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">Ingredient / Packaging</th>
                <th className="text-left px-3 py-2.5">Price Source</th>
                <th className="text-right px-3 py-2.5">Scaled Qty</th>
                <th className="text-right px-3 py-2.5">Rate (KWD)</th>
                <th className="text-right px-3 py-2.5">Line Total (KWD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {computed.scaledLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No ingredients in the selected formulation.
                  </td>
                </tr>
              ) : (
                computed.scaledLines.map((row) => {
                  const lib = libraryById.get(row.id);
                  const baseRawRate = lib
                    ? row.packaging
                      ? effectiveCostPerUnit(lib)
                      : rawCostKg(lib)
                    : row.unitCost;
                  const editedVal = rateEdits[row.id];
                  const isDirty = editedVal !== undefined;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-[11px] text-slate-500">{row.cat}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {row.hasSupplierOverride ? (
                          <span className="font-semibold text-[#0B3B2B]">
                            Discover Supplier Hub Lock
                          </span>
                        ) : lib?.wastagePct ? (
                          <span>
                            Wastage-Adjusted ({lib.wastagePct}% trim loss)
                          </span>
                        ) : (
                          'Ingredient Library'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.packaging
                          ? `${Math.ceil(row.scaledG)} pcs`
                          : formatWeightText(row.scaledG)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {readOnly || row.hasSupplierOverride ? (
                          <span>
                            {row.unitCost.toFixed(3)} / {row.packaging ? 'unit' : 'kg'}
                          </span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              value={editedVal ?? baseRawRate.toFixed(3)}
                              onChange={(e) =>
                                setRateEdits((p) => ({ ...p, [row.id]: e.target.value }))
                              }
                              className="w-20 px-2 py-1 text-right text-xs font-mono border border-slate-300 rounded bg-white"
                            />
                            <span className="text-[10px] text-slate-400">
                              /{row.packaging ? 'u' : 'kg'}
                            </span>
                            {isDirty && (
                              <button
                                type="button"
                                disabled={savingId === row.id}
                                onClick={() => handleSaveInlineRate(row.id)}
                                title="Save new rate to Firestore"
                                className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold bg-[#0B3B2B] text-white rounded hover:bg-[#08291E]"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                            )}
                          </div>
                        )}
                        {!row.hasSupplierOverride &&
                          lib &&
                          !row.packaging &&
                          (lib.wastagePct || 0) > 0 && (
                            <div className="text-[10px] text-amber-700 font-mono">
                              eff: {effectiveCostKg(lib).toFixed(3)}/kg
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatKwd(row.lineCost)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
