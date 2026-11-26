import { useMemo, useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { SUPPLIER_OPTIONS } from '../data/ingredientLibrarySeed';
import { BuilderLineItem, LibraryIngredient } from '../types';
import {
  effectiveCostKg,
  effectiveCostPerUnit,
  formatWeightText,
  isPackagingItem,
} from '../utils/formulationEngine';
import { createPurchaseOrderFromFormulation } from '../utils/versionPersistence';

interface OrderMaterialsModalProps {
  uid: string;
  userName: string;
  sourceProductId: string;
  sourceVersionLabel: string;
  items: BuilderLineItem[];
  libraryById: Map<string, LibraryIngredient>;
  stockMap: Map<string, number>;
  onClose: () => void;
  onSuccess: (orderCode: string) => void;
  onOpenMaterialsOrders?: () => void;
}

export function OrderMaterialsModal({
  uid,
  userName,
  sourceProductId,
  sourceVersionLabel,
  items,
  libraryById,
  stockMap,
  onClose,
  onSuccess,
  onOpenMaterialsOrders,
}: OrderMaterialsModalProps) {
  const [multiplier, setMultiplier] = useState(1);
  const [onlyShortfall, setOnlyShortfall] = useState(true);
  const [supplier, setSupplier] = useState(SUPPLIER_OPTIONS[0]);
  const [deliveryFeeKwd, setDeliveryFeeKwd] = useState(2.5);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const previewRows = useMemo(() => {
    return items
      .map((line) => {
        const lib = libraryById.get(line.id);
        if (!lib) return null;
        const pkg = isPackagingItem(lib);
        const needed = line.g * multiplier;
        const have = stockMap.get(line.id) || 0;
        const orderRaw = onlyShortfall ? Math.max(0, needed - have) : needed;
        const estCost = pkg
          ? Math.ceil(orderRaw) * effectiveCostPerUnit(lib)
          : (orderRaw / 1000) * effectiveCostKg(lib);
        return {
          lib,
          pkg,
          needed,
          have,
          orderRaw,
          estCost,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [items, multiplier, onlyShortfall, libraryById, stockMap]);

  const activeOrderLines = previewRows.filter((r) => r.orderRaw > 0);
  const subtotalKwd = activeOrderLines.reduce((s, r) => s + r.estCost, 0);

  const handleSubmit = async () => {
    if (activeOrderLines.length === 0) {
      setError('No shortfall to order — stock covers this batch. Switch to "Order Full Batch" to order anyway.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const code = await createPurchaseOrderFromFormulation({
        uid,
        userName,
        supplier,
        sourceProductId,
        sourceVersionLabel,
        multiplier,
        draftItems: items,
        libraryById,
        stockMap,
        onlyShortfall,
        deliveryFeeKwd,
        notes,
      });
      onSuccess(code);
      onClose();
      onOpenMaterialsOrders?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit purchase order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Order Raw Materials — {sourceVersionLabel}
            </h3>
            <p className="text-xs text-slate-500">
              Creates a real Purchase Order in KWD inside Raw Materials &amp; Orders.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Batch Multiplier
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={multiplier}
              onChange={(e) => setMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Order Scope
            </label>
            <select
              value={onlyShortfall ? 'shortfall' : 'full'}
              onChange={(e) => setOnlyShortfall(e.target.value === 'shortfall')}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            >
              <option value="shortfall">Order Shortfall Only (vs Stock)</option>
              <option value="full">Order Full Batch Quantities</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Primary Supplier
            </label>
            <input
              type="text"
              list="ec-po-suppliers"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
            <datalist id="ec-po-suppliers">
              {SUPPLIER_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="border border-slate-200 rounded-md max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Material</th>
                <th className="text-right px-3 py-2">Needed</th>
                <th className="text-right px-3 py-2">In Stock</th>
                <th className="text-right px-3 py-2">To Order</th>
                <th className="text-right px-3 py-2">Est. KWD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {previewRows.map((r) => (
                <tr key={r.lib.id} className={r.orderRaw === 0 ? 'opacity-45' : ''}>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.lib.name}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {r.pkg ? `${Math.ceil(r.needed)} pcs` : formatWeightText(r.needed)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {r.pkg ? `${r.have} pcs` : formatWeightText(r.have)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-orange-700">
                    {r.orderRaw > 0
                      ? r.pkg
                        ? `${Math.ceil(r.orderRaw)} pcs`
                        : formatWeightText(r.orderRaw)
                      : 'Covered'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {r.estCost.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              PO Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery dock instructions or lot requirements..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Delivery Fee (KWD)
            </label>
            <input
              type="number"
              step="0.25"
              min={0}
              value={deliveryFeeKwd}
              onChange={(e) => setDeliveryFeeKwd(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
            />
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5 text-xs">
          <span className="text-slate-600">
            Ordering {activeOrderLines.length} line{activeOrderLines.length === 1 ? '' : 's'}
          </span>
          <span className="font-mono tabular-nums font-bold text-[#0B3B2B]">
            Total PO: KWD {(subtotalKwd + deliveryFeeKwd).toFixed(3)}
          </span>
        </div>

        {error && <div className="text-xs text-red-600 font-medium">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {submitting ? 'Placing PO...' : 'Place Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
