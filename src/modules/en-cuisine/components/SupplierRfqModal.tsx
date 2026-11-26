import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock,
  FileText,
  Flame,
  FolderTree,
  Plus,
  Send,
  ShieldCheck,
  Snowflake,
  Sparkles,
  X,
} from 'lucide-react';
import { SupplierRfqRequestType, SupplierRfqTradeTerms } from '../../../types';
import {
  CERT_OPTIONS,
  POPULAR_RFQ_SUGGESTIONS,
  PopularRfqSuggestion,
  RFQ_CATEGORY_TREE,
  buildCategoryPath,
  findCategoryContext,
  getRecentProductQueries,
  getSupplierTargetLabel,
  guessRfqPresetForQuery,
  inferProcessFromPath,
  recordRecentProductQuery,
} from '../data/rfqCategoryTree';
import { RfqPrefillRequest } from '../types';
import { createSupplierRfq } from '../utils/rfqPersistence';

interface SupplierRfqModalProps {
  buyerUid: string;
  buyerName: string;
  prefill?: RfqPrefillRequest | null;
  recentRfqNames?: string[];
  onClose: () => void;
  onCreated: (rfqCode: string, itemName: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const UNITS_BY_TYPE: Record<SupplierRfqRequestType, string[]> = {
  ingredient: ['kg', 'g', 'L', 'mL', 'boxes', 'bags', 'crates'],
  machinery: ['units', 'sets', 'lines'],
  packaging: ['units', 'rolls', 'packs', 'cartons'],
};

const TRADE_TERMS: SupplierRfqTradeTerms[] = [
  'DDP Kitchen Door',
  'CIF Kuwait',
  'FOB',
  'Ex-Works',
];

const PAYMENT_TERMS = [
  'Net 30 Days',
  '50% Advance / 50% on Delivery',
  'Cash on Delivery (COD)',
  'Letter of Credit (LC)',
];

const DELIVERY_CITIES = [
  'Kuwait City',
  'Shuwaikh Industrial',
  'Salmiya',
  'Hawalli',
  'Ardiya Industrial',
  'Fahaheel',
];

export function SupplierRfqModal({
  buyerUid,
  buyerName,
  prefill,
  recentRfqNames = [],
  onClose,
  onCreated,
  onNotify,
}: SupplierRfqModalProps) {
  const defaultPreset = useMemo(() => {
    if (prefill?.categoryPath && prefill?.requestType) {
      return {
        requestType: prefill.requestType,
        categoryPath: prefill.categoryPath,
        unit: prefill.unit || 'kg',
      };
    }
    if (prefill?.itemName) {
      return guessRfqPresetForQuery(prefill.itemName);
    }
    return {
      requestType: 'ingredient' as SupplierRfqRequestType,
      categoryPath:
        'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Flours, Grains, Starches & Baking Mixes',
      unit: 'kg',
    };
  }, [prefill]);

  const [processScope, setProcessScope] = useState<'hot' | 'cold'>(() =>
    inferProcessFromPath(defaultPreset.categoryPath)
  );
  const [requestType, setRequestType] = useState<SupplierRfqRequestType>(
    defaultPreset.requestType
  );
  const [categoryPath, setCategoryPath] = useState<string>(defaultPreset.categoryPath);
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [customLeafInput, setCustomLeafInput] = useState('');
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false);

  const [itemName, setItemName] = useState(prefill?.itemName || '');
  const [quantity, setQuantity] = useState<string>(
    prefill?.quantity ? String(prefill.quantity) : '1'
  );
  const [unit, setUnit] = useState<string>(defaultPreset.unit);
  const [targetUnitPriceKwd, setTargetUnitPriceKwd] = useState<string>('0');
  const [specifications, setSpecifications] = useState<string>(
    prefill?.specifications || ''
  );
  const [certifications, setCertifications] = useState<string[]>(() => {
    const ctx = findCategoryContext(defaultPreset.categoryPath);
    return ctx ? ctx.recommendedCerts.slice(0, 3) : ['Halal'];
  });
  const [tradeTerms, setTradeTerms] =
    useState<SupplierRfqTradeTerms>('DDP Kitchen Door');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [deliveryCity, setDeliveryCity] = useState('Shuwaikh Industrial');
  const [neededByDate, setNeededByDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [sourceRecipeName, setSourceRecipeName] = useState(
    prefill?.sourceRecipeName || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeRoot = useMemo(
    () => RFQ_CATEGORY_TREE.find((r) => r.type === requestType) || RFQ_CATEGORY_TREE[0],
    [requestType]
  );

  const selectedLeafCtx = useMemo(
    () => findCategoryContext(categoryPath),
    [categoryPath]
  );

  const targetSupplierLabel = useMemo(
    () => getSupplierTargetLabel(categoryPath, requestType),
    [categoryPath, requestType]
  );

  const scopedGroups = useMemo(() => {
    if (requestType === 'ingredient') {
      return activeRoot.groups.filter((grp) => grp.processScope === processScope);
    }
    return activeRoot.groups;
  }, [activeRoot, processScope, requestType]);

  // Merge previously typed/searched queries + past RFQ product names
  const previouslyTypedList = useMemo(() => {
    const localRecent = getRecentProductQueries(buyerUid);
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const name of [...localRecent, ...recentRfqNames]) {
      const clean = name.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(clean);
    }
    const q = itemName.trim().toLowerCase();
    return (q
      ? combined.filter((n) => n.toLowerCase().includes(q))
      : combined
    ).slice(0, 8);
  }, [buyerUid, recentRfqNames, itemName]);

  // Popular suggestions matching active domain track (and Hot/Cold strictly for Food)
  const popularSuggestions = useMemo(() => {
    const q = itemName.trim().toLowerCase();
    const pool =
      requestType === 'ingredient'
        ? POPULAR_RFQ_SUGGESTIONS.filter(
            (s) => s.requestType === 'ingredient' && s.processScope === processScope
          )
        : POPULAR_RFQ_SUGGESTIONS.filter((s) => s.requestType === requestType);
    if (!q) return pool.slice(0, 6);
    const matches = POPULAR_RFQ_SUGGESTIONS.filter(
      (s) => s.requestType === requestType && s.name.toLowerCase().includes(q)
    );
    if (matches.length > 0) return matches.slice(0, 6);
    const globalMatches = POPULAR_RFQ_SUGGESTIONS.filter((s) =>
      s.name.toLowerCase().includes(q)
    );
    return (globalMatches.length > 0 ? globalMatches : pool).slice(0, 6);
  }, [itemName, processScope, requestType]);

  const syncDefaultLeaf = (nextType: SupplierRfqRequestType, nextProcess: 'hot' | 'cold') => {
    const root = RFQ_CATEGORY_TREE.find((r) => r.type === nextType) || RFQ_CATEGORY_TREE[0];
    const grp =
      nextType === 'ingredient'
        ? root.groups.find((g) => g.processScope === nextProcess) || root.groups[0]
        : root.groups[0];
    const leaf = grp?.leaves[0];
    if (grp && leaf) {
      setCategoryPath(buildCategoryPath(root.label, grp.name, leaf.name));
      setUnit(leaf.defaultUnit);
      setCertifications(leaf.recommendedCerts.slice(0, 3));
    }
  };

  const handleQuickPickTrack = (
    nextType: SupplierRfqRequestType,
    nextProcess?: 'hot' | 'cold'
  ) => {
    setRequestType(nextType);
    const resolvedProcess = nextProcess ?? processScope;
    if (nextType === 'ingredient' && nextProcess) {
      setProcessScope(nextProcess);
    }
    setCustomCategoryOpen(false);
    syncDefaultLeaf(nextType, resolvedProcess);
  };

  const handleSelectLeaf = (
    rootLabel: string,
    groupName: string,
    leafName: string,
    defaultUnit: string,
    recCerts: string[]
  ) => {
    setCategoryPath(buildCategoryPath(rootLabel, groupName, leafName));
    setUnit(defaultUnit);
    setCertifications(recCerts.slice(0, 3));
    setCustomCategoryOpen(false);
  };

  const handlePickPopularSuggestion = (sugg: PopularRfqSuggestion) => {
    setItemName(sugg.name);
    setRequestType(sugg.requestType);
    if (sugg.requestType === 'ingredient' && sugg.processScope) {
      setProcessScope(sugg.processScope);
    }
    setCategoryPath(sugg.categoryPath);
    setUnit(sugg.unit);
    const ctx = findCategoryContext(sugg.categoryPath);
    if (ctx) setCertifications(ctx.recommendedCerts.slice(0, 3));
    setError('');
  };

  const handlePickRecentName = (name: string) => {
    setItemName(name);
    const inferred = guessRfqPresetForQuery(name);
    setRequestType(inferred.requestType);
    if (inferred.requestType === 'ingredient') {
      setProcessScope(inferProcessFromPath(inferred.categoryPath));
    }
    setCategoryPath(inferred.categoryPath);
    setUnit(inferred.unit);
    const ctx = findCategoryContext(inferred.categoryPath);
    if (ctx) setCertifications(ctx.recommendedCerts.slice(0, 3));
    setError('');
  };

  const handleApplyCustomCategory = () => {
    const leaf = customLeafInput.trim();
    if (!leaf) {
      setError('Enter a specific category name.');
      return;
    }
    const grp = customGroupInput.trim();
    if (requestType === 'ingredient') {
      const scopeLabel = processScope === 'cold' ? 'Cold Process' : 'Hot Process';
      const resolvedGroup = grp ? `${scopeLabel} · ${grp}` : scopeLabel;
      setCategoryPath(buildCategoryPath(activeRoot.label, resolvedGroup, leaf));
    } else {
      const resolvedGroup = grp || activeRoot.drillLabel;
      setCategoryPath(buildCategoryPath(activeRoot.label, resolvedGroup, leaf));
    }
    setCustomCategoryOpen(false);
    setError('');
  };

  const toggleCert = (cert: string) => {
    setCertifications((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert].slice(0, 10)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = itemName.trim();
    const qtyNum = parseFloat(quantity);
    const targetNum = parseFloat(targetUnitPriceKwd) || 0;

    if (!cleanName) {
      setError('Type or select a product or machinery name for your quotation.');
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError('Enter a valid required quantity greater than 0.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      recordRecentProductQuery(buyerUid, cleanName);
      const res = await createSupplierRfq({
        buyerUid,
        buyerName,
        requestType,
        categoryPath,
        itemName: cleanName,
        quantity: qtyNum,
        unit,
        targetUnitPriceKwd: Math.max(0, targetNum),
        specifications: specifications.trim(),
        certifications,
        tradeTerms,
        paymentTerms,
        deliveryCity,
        neededByDate,
        sourceRecipeName: sourceRecipeName.trim(),
      });
      onNotify(
        `Posted ${res.rfqCode} for "${cleanName}" — routed to ${targetSupplierLabel}.`
      );
      onCreated(res.rfqCode, cleanName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post supplier RFQ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-300 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#08291E] text-white px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-emerald-300">
              Alibaba / B2B Trade Format · Food, Machinery &amp; Packaging RFQ
            </div>
            <h3 className="text-base font-bold truncate">
              Post Supplier Quotation Request
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-emerald-100 hover:text-white border border-emerald-800 rounded-md whitespace-nowrap"
            aria-label="Close RFQ form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Step 1: Fast 1-Click Track & Process Selector */}
          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800">
                1. Quick-Select Category Track
              </div>
              <div className="text-[11px] text-slate-500">
                {requestType === 'ingredient'
                  ? `Food · ${processScope === 'cold' ? 'Cold Process' : 'Hot Process'}`
                  : activeRoot.drillLabel}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleQuickPickTrack('ingredient', 'hot')}
                className={`flex items-center gap-2 px-3 py-2 text-left rounded-md border transition-colors ${
                  requestType === 'ingredient' && processScope === 'hot'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Flame className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">Hot Food</div>
                  <div
                    className={`text-[10px] truncate ${
                      requestType === 'ingredient' && processScope === 'hot'
                        ? 'text-orange-100'
                        : 'text-slate-500'
                    }`}
                  >
                    Baked, cooked &amp; pantry
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPickTrack('ingredient', 'cold')}
                className={`flex items-center gap-2 px-3 py-2 text-left rounded-md border transition-colors ${
                  requestType === 'ingredient' && processScope === 'cold'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Snowflake className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">Cold Food</div>
                  <div
                    className={`text-[10px] truncate ${
                      requestType === 'ingredient' && processScope === 'cold'
                        ? 'text-emerald-200'
                        : 'text-slate-500'
                    }`}
                  >
                    Dairy, chilled &amp; bev
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPickTrack('machinery')}
                className={`px-3 py-2 text-left rounded-md border transition-colors ${
                  requestType === 'machinery'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-semibold truncate">Machinery</div>
                <div
                  className={`text-[10px] truncate ${
                    requestType === 'machinery' ? 'text-emerald-200' : 'text-slate-500'
                  }`}
                >
                  Ovens, mixers, chillers
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickPickTrack('packaging')}
                className={`px-3 py-2 text-left rounded-md border transition-colors ${
                  requestType === 'packaging'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-semibold truncate">Packaging</div>
                <div
                  className={`text-[10px] truncate ${
                    requestType === 'packaging' ? 'text-emerald-200' : 'text-slate-500'
                  }`}
                >
                  Boxes, films, cups, labels
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Type Product + Instant Suggestions (Previously Typed + Popular) */}
          <div className="border border-slate-200 rounded-md p-4 space-y-3 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2.{' '}
                  {requestType === 'machinery'
                    ? 'Type Commercial Machinery Name *'
                    : requestType === 'packaging'
                    ? 'Type Packaging or Supply Name *'
                    : 'Type Food / Ingredient Name *'}
                </label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={
                    requestType === 'machinery'
                      ? 'Type e.g. Deck Oven, Planetary Mixer, Blast Chiller...'
                      : requestType === 'packaging'
                      ? 'Type e.g. Window Cake Box, BOPP Film, 500ml Cup, Barcode Label...'
                      : processScope === 'cold'
                      ? 'Type e.g. Cream Cheese, Whipping Cream, Mango Puree...'
                      : 'Type e.g. 00 Flour, Unsalted Butter, Dark Chocolate...'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white"
                >
                  {UNITS_BY_TYPE[requestType].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Price (KWD/{unit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={targetUnitPriceKwd}
                  onChange={(e) => setTargetUnitPriceKwd(e.target.value)}
                  placeholder="0 = Open"
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            </div>

            {/* Quick Select Suggestions: Previously Typed/Searched + Popular */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              {previouslyTypedList.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
                    <Clock className="w-3 h-3" />
                    Recent / Searched:
                  </span>
                  {previouslyTypedList.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handlePickRecentName(name)}
                      className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-[#0B3B2B] border border-emerald-200 rounded hover:bg-emerald-100 whitespace-nowrap"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
                  <Sparkles className="w-3 h-3 text-orange-600" />
                  {requestType === 'ingredient'
                    ? `Popular (${processScope === 'cold' ? 'Cold Process' : 'Hot Process'}):`
                    : requestType === 'machinery'
                    ? 'Popular Machinery:'
                    : 'Popular Packaging:'}
                </span>
                {popularSuggestions.map((sugg) => (
                  <button
                    key={sugg.name}
                    type="button"
                    onClick={() => handlePickPopularSuggestion(sugg)}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded hover:bg-orange-50 hover:text-orange-800 hover:border-orange-200 whitespace-nowrap"
                  >
                    + {sugg.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3: Domain-Specific Category Drill-Down */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <FolderTree className="w-4 h-4 text-[#0B3B2B]" />
                <span>
                  3.{' '}
                  {requestType === 'ingredient'
                    ? `Food Category Routing (${processScope === 'cold' ? 'Cold Process' : 'Hot Process'})`
                    : requestType === 'machinery'
                    ? 'Machinery Category Routing (By Machine Function)'
                    : 'Packaging Category Routing (By Container Type)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomCategoryOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#0B3B2B] bg-white border border-emerald-200 rounded hover:bg-emerald-50 whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                Custom Category
              </button>
            </div>

            <div className="p-3 space-y-3 bg-white">
              {customCategoryOpen && (
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-md p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Group (Optional)
                    </label>
                    <input
                      type="text"
                      value={customGroupInput}
                      onChange={(e) => setCustomGroupInput(e.target.value)}
                      placeholder={
                        requestType === 'machinery'
                          ? 'e.g. Thermal Baking / Prep Line'
                          : requestType === 'packaging'
                          ? 'e.g. Cartons / Flexible Films'
                          : 'e.g. Chilled Dairy / Dry Pantry'
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Custom Subcategory Name *
                    </label>
                    <input
                      type="text"
                      value={customLeafInput}
                      onChange={(e) => setCustomLeafInput(e.target.value)}
                      placeholder={
                        requestType === 'machinery'
                          ? 'e.g. Rotary Tunnel Ovens'
                          : requestType === 'packaging'
                          ? 'e.g. Custom Printed Mylar Pouches'
                          : 'e.g. Cultured Butter & Specialty Cheeses'
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      onClick={handleApplyCustomCategory}
                      className="w-full px-3 py-1.5 font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded whitespace-nowrap"
                    >
                      Use Category
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="text-slate-600 flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-slate-500">Selected:</span>
                  {categoryPath.split(' > ').map((seg, idx) => (
                    <span
                      key={`${seg}_${idx}`}
                      className="inline-flex items-center gap-1 font-semibold text-[#0B3B2B]"
                    >
                      {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                      <span>{seg}</span>
                    </span>
                  ))}
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Routed only to: {targetSupplierLabel}
                </div>
              </div>

              {scopedGroups.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded p-4 text-center space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Category presets unavailable — using fallback custom routing
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomCategoryOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] rounded"
                    >
                      Enter Custom Category
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickPickTrack('ingredient', 'hot')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded"
                    >
                      Reset to General Food
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {scopedGroups.map((grp) => (
                    <div
                      key={grp.id}
                      className="border border-slate-200 rounded p-2 space-y-1 bg-slate-50/40"
                    >
                      <div className="text-[11px] font-semibold text-slate-800 border-b border-slate-200 pb-1">
                        {grp.name}
                      </div>
                      <div className="space-y-1">
                        {grp.leaves.map((leaf) => {
                          const fullPath = buildCategoryPath(
                            activeRoot.label,
                            grp.name,
                            leaf.name
                          );
                          const selected = categoryPath === fullPath;
                          return (
                            <button
                              key={leaf.id}
                              type="button"
                              onClick={() =>
                                handleSelectLeaf(
                                  activeRoot.label,
                                  grp.name,
                                  leaf.name,
                                  leaf.defaultUnit,
                                  leaf.recommendedCerts
                                )
                              }
                              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${
                                selected
                                  ? 'bg-orange-600 text-white font-semibold'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {leaf.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Technical Specs & Trade Terms */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Technical Specifications, Grade &amp; Packaging Requirements</span>
                </label>
                <textarea
                  rows={3}
                  value={specifications}
                  onChange={(e) => setSpecifications(e.target.value)}
                  placeholder={
                    selectedLeafCtx?.specHint ||
                    'Specify grade, pack weight, shelf life, chilled/frozen temp, voltage, capacity...'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1.5">
                  Required Certifications &amp; Compliance
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CERT_OPTIONS.map((cert) => {
                    const active = certifications.includes(cert);
                    return (
                      <button
                        key={cert}
                        type="button"
                        onClick={() => toggleCert(cert)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-emerald-50 text-[#0B3B2B] border-[#0B3B2B] font-semibold'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cert}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3 text-xs">
              <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                Trade, Delivery &amp; Recipe Reference
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Incoterm / Trade Terms
                  </label>
                  <select
                    value={tradeTerms}
                    onChange={(e) =>
                      setTradeTerms(e.target.value as SupplierRfqTradeTerms)
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    {TRADE_TERMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    {PAYMENT_TERMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Delivery Destination
                  </label>
                  <select
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    {DELIVERY_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Needed By Date
                  </label>
                  <input
                    type="date"
                    value={neededByDate}
                    onChange={(e) => setNeededByDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Linked Recipe / Project (Optional)
                </label>
                <input
                  type="text"
                  value={sourceRecipeName}
                  onChange={(e) => setSourceRecipeName(e.target.value)}
                  placeholder="e.g. Banana Cake (1 kg)"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded">
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Only suppliers matching{' '}
              <span className="font-semibold text-slate-700">{targetSupplierLabel}</span>{' '}
              receive this RFQ.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Posting RFQ...' : 'Post Quotation Request'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
