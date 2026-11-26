import { Fragment, useMemo, useState } from 'react';
import { Loader2, PackageCheck, Search, Sparkles, X } from 'lucide-react';
import { LibraryIngredient, NutritionLookupResult } from '../types';
import {
  effectiveCostKg,
  effectiveCostPerUnit,
  formatWeightText,
  isPackagingItem,
  isPieceOrCountStock,
  rawCostKg,
  searchNutritionViaApi,
} from '../utils/formulationEngine';

interface AddCustomIngredientModalProps {
  category: string;
  categories: string[];
  onClose: () => void;
  onSave: (
    item: LibraryIngredient,
    initialStockQty: number,
    bulkNote: string,
    addToDraft: boolean
  ) => Promise<void>;
}

export function AddCustomIngredientModal({
  category,
  categories,
  onClose,
  onSave,
}: AddCustomIngredientModalProps) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState(category || categories[0] || 'Salt & Misc');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryTouched, setSearchQueryTouched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<NutritionLookupResult | null>(null);

  const [kcal, setKcal] = useState(0);
  const [fat, setFat] = useState(0);
  const [satFat, setSatFat] = useState(0);
  const [sugar, setSugar] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [allergensText, setAllergensText] = useState('');
  const [vegan, setVegan] = useState(true);

  const [bulkQty, setBulkQty] = useState(50);
  const [bulkUnit, setBulkUnit] = useState<'kg' | 'g'>('kg');
  const [bulkCost, setBulkCost] = useState(4.5);
  const [currency, setCurrency] = useState('KWD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const qtyKg = bulkUnit === 'kg' ? bulkQty : bulkQty / 1000;
  const perKg = qtyKg > 0 ? bulkCost / qtyKg : 0;

  const handleSearch = async () => {
    const q = (searchQuery || name).trim();
    if (!q) return;
    setSearching(true);
    setLookupResult(null);
    const res = await searchNutritionViaApi(q);
    setSearching(false);
    setLookupResult(res);
    setKcal(res.kcal);
    setFat(res.fat);
    setSatFat(res.satFat);
    setSugar(res.sugar);
    setProtein(res.protein);
    setCarbs(res.carbs);
    setAllergensText(res.allergens.join(', '));
    setVegan(res.vegan);
    if (!name.trim()) setName(res.name);
  };

  const handleSubmit = async (addToDraft: boolean) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Ingredient name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const slug = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '')
        .slice(0, 28);
      const id = `custom_${slug || 'ing'}_${Math.floor(100 + Math.random() * 899)}`;
      const allergens = allergensText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const newItem: LibraryIngredient = {
        id,
        name: cleanName,
        cat,
        custom: true,
        vegan,
        allergens,
        costKg: Number(perKg.toFixed(4)),
        wastagePct: 0,
        bulkQty,
        bulkUnit,
        bulkCost,
        bulkCurrency: currency || 'KWD',
        kcal: Number(kcal) || 0,
        fat: Number(fat) || 0,
        satFat: Number(satFat) || 0,
        sugar: Number(sugar) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        note: 'Custom ingredient — nutrition & bulk cost persisted',
      };
      const stockG = Math.max(0, qtyKg * 1000);
      await onSave(
        newItem,
        stockG,
        `New ingredient added: ${bulkQty}${bulkUnit} for ${bulkCost} ${currency || 'KWD'}`,
        addToDraft
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save custom ingredient.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Add Custom Ingredient</h3>
            <p className="text-xs text-slate-500">
              AI-assisted nutrition lookup + bulk KWD unit cost calculator
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Ingredient Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                const val = e.target.value;
                setName(val);
                if (!searchQueryTouched) setSearchQuery(val);
              }}
              placeholder="e.g. Medjool Date Paste"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Category
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchQueryTouched(e.target.value.trim().length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                placeholder="Search nutrition database (e.g. tahini, date paste, almond butter)..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              )}
              AI Lookup
            </button>
          </div>
          {lookupResult && (
            <div
              className={`text-xs ${
                lookupResult.source === 'live_api'
                  ? 'text-emerald-700'
                  : lookupResult.source === 'local_reference_database'
                  ? 'text-[#0B3B2B]'
                  : 'text-amber-700'
              }`}
            >
              {lookupResult.note}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {[
            ['kcal /100g', kcal, setKcal],
            ['Fat g', fat, setFat],
            ['Sat. fat g', satFat, setSatFat],
            ['Sugar g', sugar, setSugar],
            ['Protein g', protein, setProtein],
            ['Carbs g', carbs, setCarbs],
          ].map(([label, val, setter]) => (
            <div key={String(label)}>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {String(label)}
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={val as number}
                onChange={(e) =>
                  (setter as (v: number) => void)(parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Allergens (comma-separated)
            </label>
            <input
              type="text"
              value={allergensText}
              onChange={(e) => setAllergensText(e.target.value)}
              placeholder="e.g. gluten, dairy, sesame"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Vegan?
            </label>
            <select
              value={String(vegan)}
              onChange={(e) => setVegan(e.target.value === 'true')}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3 space-y-2.5">
          <div className="text-xs text-slate-600">
            Bulk Purchase Calculator — e.g. <span className="font-mono font-semibold">50 kg</span> for{' '}
            <span className="font-mono font-semibold">4.500 KWD</span> automatically derives per-kg &amp; per-gram pricing and logs opening stock.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Bulk Quantity
              </label>
              <input
                type="number"
                min={0.001}
                step="0.001"
                value={bulkQty}
                onChange={(e) => setBulkQty(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Unit
              </label>
              <select
                value={bulkUnit}
                onChange={(e) => setBulkUnit(e.target.value as 'kg' | 'g')}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Total Cost Paid
              </label>
              <input
                type="number"
                min={0}
                step="0.001"
                value={bulkCost}
                onChange={(e) => setBulkCost(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Currency
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div className="font-mono tabular-nums text-xs font-bold text-[#0B3B2B]">
            = {perKg.toFixed(3)} {currency || 'KWD'} / kg ({(perKg / 1000).toFixed(5)} {currency || 'KWD'} / g)
          </div>
        </div>

        {error && <div className="text-xs text-red-600 font-medium">{error}</div>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(false)}
            className="px-3.5 py-2 text-xs font-semibold text-[#0B3B2B] border border-[#0B3B2B] rounded-md hover:bg-emerald-50 disabled:opacity-50"
          >
            Save to Library Only
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Add to Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditIngredientModalProps {
  item: LibraryIngredient;
  stockQty: number;
  categories: string[];
  onClose: () => void;
  onSave: (
    updated: LibraryIngredient,
    receiveStockQty: number,
    stockNote: string
  ) => Promise<void>;
}

export function EditIngredientModal({
  item,
  stockQty,
  categories,
  onClose,
  onSave,
}: EditIngredientModalProps) {
  const [name, setName] = useState(item.name);
  const [cat, setCat] = useState(item.cat);
  const [searchQuery, setSearchQuery] = useState(item.name);
  const [searching, setSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<NutritionLookupResult | null>(null);

  const [kcal, setKcal] = useState(item.kcal || 0);
  const [fat, setFat] = useState(item.fat || 0);
  const [satFat, setSatFat] = useState(item.satFat || 0);
  const [sugar, setSugar] = useState(item.sugar || 0);
  const [protein, setProtein] = useState(item.protein || 0);
  const [carbs, setCarbs] = useState(item.carbs || 0);
  const [allergensText, setAllergensText] = useState((item.allergens || []).join(', '));
  const [vegan, setVegan] = useState(item.vegan);

  const [costKg, setCostKg] = useState(rawCostKg(item));
  const [wastagePct, setWastagePct] = useState(item.wastagePct || 0);

  // Piece fields (eggs)
  const [bulkPieces, setBulkPieces] = useState(item.bulkPieces ?? 360);
  const [pieceWeightG, setPieceWeightG] = useState(item.pieceWeightG ?? 50);

  // Unit fields (boxes, labels)
  const [costPerUnit, setCostPerUnit] = useState(effectiveCostPerUnit(item));
  const [bulkUnitQty, setBulkUnitQty] = useState(item.bulkUnitQty ?? 1000);

  // Roll fields (film)
  const [rollLengthM, setRollLengthM] = useState(item.rollLengthM ?? 4000);
  const [rollWidthMM, setRollWidthMM] = useState(item.rollWidthMM ?? 280);
  const [gsm, setGsm] = useState(item.gsm ?? 20);
  const [costPerRoll, setCostPerRoll] = useState(item.costPerRoll ?? 45);
  const [wrapLengthCmPerUnit, setWrapLengthCmPerUnit] = useState(
    item.wrapLengthCmPerUnit ?? 18
  );

  // Bulk weight fields
  const [bulkQty, setBulkQty] = useState(item.bulkQty ?? 50);
  const [bulkUnit, setBulkUnit] = useState<'kg' | 'g'>(item.bulkUnit || 'kg');
  const [bulkCost, setBulkCost] = useState(
    item.bulkCost !== undefined
      ? item.bulkCost
      : item.costUnit === 'unit'
      ? Number((effectiveCostPerUnit(item) * 1000).toFixed(3))
      : item.costUnit === 'piece'
      ? 15
      : Number((rawCostKg(item) * 50).toFixed(3))
  );
  const [currency, setCurrency] = useState(item.bulkCurrency || 'KWD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveFactor = 1 - Math.min(99, Math.max(0, wastagePct)) / 100;
  const effectiveKgPreview = effectiveFactor > 0 ? costKg / effectiveFactor : costKg;
  const perPiecePreview = effectiveKgPreview * (pieceWeightG / 1000);
  const packsPerRoll =
    wrapLengthCmPerUnit > 0 ? (rollLengthM * 100) / wrapLengthCmPerUnit : 0;
  const rollCostPerPack = packsPerRoll > 0 ? costPerRoll / packsPerRoll : 0;
  const rollWeightKg = (rollLengthM * (rollWidthMM / 1000) * gsm) / 1000;

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    const res = await searchNutritionViaApi(q);
    setSearching(false);
    setLookupResult(res);
    setKcal(res.kcal);
    setFat(res.fat);
    setSatFat(res.satFat);
    setSugar(res.sugar);
    setProtein(res.protein);
    setCarbs(res.carbs);
    setAllergensText(res.allergens.join(', '));
    setVegan(res.vegan);
  };

  const handleBulkWeightChange = (nextQty: number, nextUnit: 'kg' | 'g', nextCost: number) => {
    setBulkQty(nextQty);
    setBulkUnit(nextUnit);
    setBulkCost(nextCost);
    const kg = nextUnit === 'kg' ? nextQty : nextQty / 1000;
    if (kg > 0) setCostKg(Number((nextCost / kg).toFixed(4)));
  };

  const handlePieceBulkChange = (pieces: number, weightG: number, cost: number) => {
    setBulkPieces(pieces);
    setPieceWeightG(weightG);
    setBulkCost(cost);
    const totalKg = (pieces * weightG) / 1000;
    if (totalKg > 0) setCostKg(Number((cost / totalKg).toFixed(4)));
  };

  const handleUnitBulkChange = (qty: number, cost: number) => {
    setBulkUnitQty(qty);
    setBulkCost(cost);
    if (qty > 0) setCostPerUnit(Number((cost / qty).toFixed(4)));
  };

  const handleSave = async (receiveStock: boolean) => {
    setSaving(true);
    setError('');
    try {
      const allergens = allergensText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated: LibraryIngredient = {
        ...item,
        name: item.custom ? name.trim() || item.name : item.name,
        cat,
        vegan,
        allergens,
        kcal: Number(kcal) || 0,
        fat: Number(fat) || 0,
        satFat: Number(satFat) || 0,
        sugar: Number(sugar) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        bulkCurrency: currency || 'KWD',
      };

      let addQty = 0;
      let note = '';
      if (item.costUnit === 'piece') {
        updated.costKg = Number(costKg) || 0;
        updated.bulkPieces = bulkPieces;
        updated.pieceWeightG = pieceWeightG;
        updated.bulkCost = bulkCost;
        if (receiveStock) {
          addQty = bulkPieces;
          note = `Bulk purchase: ${bulkPieces} pcs for ${bulkCost} ${currency}`;
        }
      } else if (item.costUnit === 'unit') {
        updated.costPerUnit = Number(costPerUnit) || 0;
        updated.bulkUnitQty = bulkUnitQty;
        updated.bulkCost = bulkCost;
        if (receiveStock) {
          addQty = bulkUnitQty;
          note = `Bulk purchase: ${bulkUnitQty} units for ${bulkCost} ${currency}`;
        }
      } else if (item.costUnit === 'roll') {
        updated.rollLengthM = rollLengthM;
        updated.rollWidthMM = rollWidthMM;
        updated.gsm = gsm;
        updated.costPerRoll = costPerRoll;
        updated.wrapLengthCmPerUnit = wrapLengthCmPerUnit;
        if (receiveStock) {
          addQty = Math.floor(packsPerRoll);
          note = `1 roll received (~${Math.floor(packsPerRoll)} packs) for ${costPerRoll} ${currency}`;
        }
      } else {
        updated.costKg = Number(costKg) || 0;
        updated.wastagePct = Math.min(95, Math.max(0, Number(wastagePct) || 0));
        updated.bulkQty = bulkQty;
        updated.bulkUnit = bulkUnit;
        updated.bulkCost = bulkCost;
        if (receiveStock) {
          const kg = bulkUnit === 'kg' ? bulkQty : bulkQty / 1000;
          addQty = kg * 1000;
          note = `Bulk purchase: ${bulkQty}${bulkUnit} for ${bulkCost} ${currency}`;
        }
      }

      await onSave(updated, addQty, note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save ingredient changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Edit Ingredient</h3>
            <p className="text-xs text-slate-500">
              Changes persist in Firestore and recalculate recipes, costing &amp; stock value immediately.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Name {item.custom ? '' : '(Built-in)'}
            </label>
            <input
              type="text"
              value={name}
              disabled={!item.custom}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Category
            </label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isPackagingItem(item) && (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  placeholder="Re-search nutrition data..."
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] rounded-md whitespace-nowrap"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-orange-400" />}
                  AI Re-Search
                </button>
              </div>
              {lookupResult && <div className="text-xs text-[#0B3B2B]">{lookupResult.note}</div>}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {[
                ['kcal /100g', kcal, setKcal],
                ['Fat g', fat, setFat],
                ['Sat. fat g', satFat, setSatFat],
                ['Sugar g', sugar, setSugar],
                ['Protein g', protein, setProtein],
                ['Carbs g', carbs, setCarbs],
              ].map(([label, val, setter]) => (
                <div key={String(label)}>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {String(label)}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={val as number}
                    onChange={(e) =>
                      (setter as (v: number) => void)(parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Allergens (comma-separated)
                </label>
                <input
                  type="text"
                  value={allergensText}
                  onChange={(e) => setAllergensText(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Vegan?
                </label>
                <select
                  value={String(vegan)}
                  onChange={(e) => setVegan(e.target.value === 'true')}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Cost Section Based on costUnit */}
        {item.costUnit === 'unit' ? (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Cost per unit ({currency})
              </label>
              <input
                type="number"
                step="0.001"
                min={0}
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Bulk Units
                </label>
                <input
                  type="number"
                  min={1}
                  value={bulkUnitQty}
                  onChange={(e) =>
                    handleUnitBulkChange(parseFloat(e.target.value) || 0, bulkCost)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Total Paid
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={bulkCost}
                  onChange={(e) =>
                    handleUnitBulkChange(bulkUnitQty, parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>
        ) : item.costUnit === 'roll' ? (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Roll Length (m)
                </label>
                <input
                  type="number"
                  min={1}
                  value={rollLengthM}
                  onChange={(e) => setRollLengthM(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Roll Width (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  value={rollWidthMM}
                  onChange={(e) => setRollWidthMM(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Film GSM (g/m²)
                </label>
                <input
                  type="number"
                  min={1}
                  value={gsm}
                  onChange={(e) => setGsm(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Cost per Roll ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={costPerRoll}
                  onChange={(e) => setCostPerRoll(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Wrap / Pack (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  value={wrapLengthCmPerUnit}
                  onChange={(e) =>
                    setWrapLengthCmPerUnit(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="font-mono text-xs font-bold text-[#0B3B2B]">
              = {Math.floor(packsPerRoll)} packs/roll → {rollCostPerPack.toFixed(4)} {currency}/pack · est. roll weight {rollWeightKg.toFixed(1)} kg
            </div>
          </div>
        ) : item.costUnit === 'piece' ? (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Cost per kg ({currency})
              </label>
              <input
                type="number"
                step="0.001"
                min={0}
                value={costKg}
                onChange={(e) => setCostKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Pieces
                </label>
                <input
                  type="number"
                  min={1}
                  value={bulkPieces}
                  onChange={(e) =>
                    handlePieceBulkChange(
                      parseFloat(e.target.value) || 0,
                      pieceWeightG,
                      bulkCost
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Avg g/pc
                </label>
                <input
                  type="number"
                  min={1}
                  value={pieceWeightG}
                  onChange={(e) =>
                    handlePieceBulkChange(
                      bulkPieces,
                      parseFloat(e.target.value) || 0,
                      bulkCost
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Total Paid
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={bulkCost}
                  onChange={(e) =>
                    handlePieceBulkChange(
                      bulkPieces,
                      pieceWeightG,
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="font-mono text-xs font-bold text-[#0B3B2B]">
              = {costKg.toFixed(3)} {currency}/kg and {perPiecePreview.toFixed(3)} {currency}/piece
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Cost per kg (raw, as purchased)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={costKg}
                  onChange={(e) => setCostKg(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Wastage / Trim Loss % (peel, core)
                </label>
                <input
                  type="number"
                  min={0}
                  max={95}
                  step={1}
                  value={wastagePct}
                  onChange={(e) => setWastagePct(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div className="font-mono text-xs font-bold text-[#0B3B2B]">
              {wastagePct > 0
                ? `= ${effectiveKgPreview.toFixed(3)} ${currency}/kg effective for recipe costing (raw ${costKg.toFixed(3)} ÷ ${(effectiveFactor * 100).toFixed(0)}% usable)`
                : `No wastage set — effective cost = ${costKg.toFixed(3)} ${currency}/kg`}
            </div>
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Bulk Qty
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={0.001}
                  value={bulkQty}
                  onChange={(e) =>
                    handleBulkWeightChange(
                      parseFloat(e.target.value) || 0,
                      bulkUnit,
                      bulkCost
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Unit
                </label>
                <select
                  value={bulkUnit}
                  onChange={(e) =>
                    handleBulkWeightChange(
                      bulkQty,
                      e.target.value as 'kg' | 'g',
                      bulkCost
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Total Paid
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={bulkCost}
                  onChange={(e) =>
                    handleBulkWeightChange(
                      bulkQty,
                      bulkUnit,
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md text-xs">
          <span className="text-slate-500">Current stock on hand</span>
          <span className="font-mono font-bold text-slate-900">
            {isPieceOrCountStock(item) ? `${stockQty} pcs` : formatWeightText(stockQty)}
          </span>
        </div>

        {error && <div className="text-xs text-red-600 font-medium">{error}</div>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md disabled:opacity-50"
          >
            Save Changes
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            Save &amp; Log Stock Received
          </button>
        </div>
      </div>
    </div>
  );
}

interface ViewRecipeSpecModalProps {
  title: string;
  items: { id: string; g: number; supplier?: string }[];
  categories: string[];
  libraryById: Map<string, LibraryIngredient>;
  onClose: () => void;
}

export function ViewRecipeSpecModal({
  title,
  items,
  categories,
  libraryById,
  onClose,
}: ViewRecipeSpecModalProps) {
  const grouped = useMemo(() => {
    let grandTotal = 0;
    const sections: {
      cat: string;
      rows: {
        name: string;
        qtyLabel: string;
        priceLabel: string;
        lineCost: number;
      }[];
    }[] = [];

    for (const cat of categories) {
      const catLines = items.filter((l) => libraryById.get(l.id)?.cat === cat);
      if (catLines.length === 0) continue;
      const rows = catLines.map((l) => {
        const lib = libraryById.get(l.id)!;
        const pkg = isPackagingItem(lib);
        let lineCost = 0;
        let priceLabel = '';
        if (pkg) {
          const perU = effectiveCostPerUnit(lib);
          lineCost = perU * l.g;
          priceLabel = `KWD ${perU.toFixed(3)} /pack`;
        } else {
          const raw = rawCostKg(lib);
          const eff = effectiveCostKg(lib);
          lineCost = (eff / 1000) * l.g;
          priceLabel = lib.wastagePct
            ? `KWD ${eff.toFixed(3)} /kg eff. (raw ${raw.toFixed(3)}, ${lib.wastagePct}% loss)`
            : `KWD ${eff.toFixed(3)} /kg`;
        }
        grandTotal += lineCost;
        return {
          name: lib.name,
          qtyLabel: pkg ? `${l.g} pcs` : formatWeightText(l.g),
          priceLabel,
          lineCost,
        };
      });
      sections.push({ cat, rows });
    }
    return { sections, grandTotal };
  }, [items, categories, libraryById]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-lg max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title} — Recipe Spec Sheet</h3>
            <p className="text-xs text-slate-500">
              Auto-formatted weights &amp; wastage-adjusted effective KWD prices
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {grouped.sections.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            No ingredients in this formulation yet.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Ingredient</th>
                  <th className="text-left px-3 py-2">Actual Quantity</th>
                  <th className="text-left px-3 py-2">Price Basis</th>
                  <th className="text-right px-3 py-2">Line Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {grouped.sections.map((sec) => (
                  <Fragment key={`sec-${sec.cat}`}>
                    <tr className="bg-emerald-950/5">
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#0B3B2B]"
                      >
                        {sec.cat}
                      </td>
                    </tr>
                    {sec.rows.map((r, i) => (
                      <tr key={`${sec.cat}-${i}`}>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                          {r.qtyLabel}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.priceLabel}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                          KWD {r.lineCost.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td colSpan={3} className="px-3 py-2.5 text-right font-bold text-slate-900">
                    Total Formulation Cost
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-[#0B3B2B]">
                    KWD {grouped.grandTotal.toFixed(3)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
