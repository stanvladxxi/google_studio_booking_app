import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  LIMITS,
  MaterialCategory,
  MaterialOrder,
  MaterialOrderItem,
  MaterialOrderStatus,
  MaterialUnit,
  RawMaterial,
  StorageZone,
  clampStr,
} from '../types';
import { formatKwd, roundKwd, toGrams } from '../utils/costing';

interface MaterialsViewProps {
  uid: string;
  userName: string;
  materials: RawMaterial[];
  materialOrders?: MaterialOrder[];
  bookings: Booking[];
  loading: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const CATEGORIES: MaterialCategory[] = [
  'Flour & Dry',
  'Dairy & Fats',
  'Produce',
  'Proteins',
  'Specialty',
  'Packaging',
];
const UNITS: MaterialUnit[] = ['kg', 'g', 'L', 'mL', 'units'];
const STORAGE_ZONES: StorageZone[] = ['Dry Pantry', 'Walk-In Cooler', 'Deep Freezer', 'Prep Bench'];

const ORDER_STATUS_TEXT_CLASS: Record<MaterialOrderStatus, string> = {
  ordered: 'text-amber-700 font-semibold',
  'in-transit': 'text-sky-700 font-semibold',
  received: 'text-emerald-700 font-semibold',
  cancelled: 'text-slate-400 font-medium',
};

export function MaterialsView({
  uid,
  userName,
  materials,
  materialOrders = [],
  bookings,
  loading,
  onNotify,
}: MaterialsViewProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders'>('inventory');

  // Stock lot entry state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('Flour & Dry');
  const [quantity, setQuantity] = useState('50');
  const [unit, setUnit] = useState<MaterialUnit>('kg');
  const [pricingMode, setPricingMode] = useState<'bulk' | 'unit'>('bulk');
  const [bulkQty, setBulkQty] = useState('50');
  const [bulkUnit, setBulkUnit] = useState<MaterialUnit>('kg');
  const [bulkTotalPrice, setBulkTotalPrice] = useState('4.500');
  const [syncQtyWithBulk, setSyncQtyWithBulk] = useState(true);
  const [unitCost, setUnitCost] = useState('0.090');
  const [lotCode, setLotCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [storageZone, setStorageZone] = useState<StorageZone>('Dry Pantry');
  const [bookingId, setBookingId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string>('All');

  // Raw Material Purchase Order form state
  const [poSupplier, setPoSupplier] = useState('Al-Yasra Culinary Supply');
  const [poExpectedDate, setPoExpectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [poDeliveryFee, setPoDeliveryFee] = useState('2.000');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<MaterialOrderItem[]>([
    {
      materialName: '',
      category: 'Flour & Dry',
      quantity: 50,
      unit: 'kg',
      gramsTotal: 50000,
      unitCostKwd: 0.09,
      lineTotalKwd: 4.5,
      storageZone: 'Dry Pantry',
    },
  ]);
  const [submittingPo, setSubmittingPo] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);

  // Derive unit pricing in KWD from bulk pack inputs (e.g. 50 kg @ 4.500 KWD -> 1 kg = 0.090 KWD)
  const bulkPricingCalc = useMemo(() => {
    const bQty = Math.max(0, Number(bulkQty) || 0);
    const bTotal = Math.max(0, Number(bulkTotalPrice) || 0);
    const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);

    let perBaseGOrUnit = 0; // KWD per g, mL, or discrete unit
    let perPrimaryDisplay = 0; // KWD per kg, L, or discrete unit
    let primaryLabel = '1 kg';

    if (bulkUnit === 'units') {
      perBaseGOrUnit = safeDiv(bTotal, bQty);
      perPrimaryDisplay = perBaseGOrUnit;
      primaryLabel = '1 unit';
    } else if (bulkUnit === 'kg' || bulkUnit === 'L') {
      const baseUnits = toGrams(bQty, bulkUnit);
      perBaseGOrUnit = safeDiv(bTotal, baseUnits);
      perPrimaryDisplay = safeDiv(bTotal, bQty);
      primaryLabel = bulkUnit === 'kg' ? '1 kg' : '1 L';
    } else {
      // 'g' or 'mL'
      perBaseGOrUnit = safeDiv(bTotal, bQty);
      perPrimaryDisplay = perBaseGOrUnit * 1000;
      primaryLabel = bulkUnit === 'g' ? '1 kg' : '1 L';
    }

    // Cost per selected inventory stock unit
    let perStockUnit = 0;
    if (unit === 'units') {
      perStockUnit = bulkUnit === 'units' ? perBaseGOrUnit : perPrimaryDisplay;
    } else if (unit === 'kg' || unit === 'L') {
      perStockUnit = perBaseGOrUnit * 1000;
    } else {
      perStockUnit = perBaseGOrUnit;
    }

    const precisionMultiplier = unit === 'g' || unit === 'mL' ? 1_000_000 : 1000;
    const roundedStockUnitCost = Math.round(perStockUnit * precisionMultiplier) / precisionMultiplier;

    return {
      perBaseGOrUnit,
      perPrimaryDisplay: roundKwd(perPrimaryDisplay),
      per100gOrMl: roundKwd(perBaseGOrUnit * 100),
      primaryLabel,
      perStockUnit: roundedStockUnitCost,
      isWeightOrVolume: bulkUnit !== 'units',
    };
  }, [bulkQty, bulkUnit, bulkTotalPrice, unit]);

  const effectiveUnitCost = useMemo(() => {
    if (pricingMode === 'bulk') {
      return bulkPricingCalc.perStockUnit;
    }
    const raw = Math.max(0, Number(unitCost) || 0);
    return unit === 'g' || unit === 'mL'
      ? Math.round(raw * 1_000_000) / 1_000_000
      : roundKwd(raw);
  }, [pricingMode, bulkPricingCalc.perStockUnit, unitCost, unit]);

  const handleBulkQtyChange = (val: string) => {
    setBulkQty(val);
    if (syncQtyWithBulk) {
      setQuantity(val);
    }
  };

  const handleBulkUnitChange = (nextUnit: MaterialUnit) => {
    setBulkUnit(nextUnit);
    if (syncQtyWithBulk) {
      setUnit(nextUnit);
    }
  };

  const handleStockQuantityChange = (val: string) => {
    setQuantity(val);
    if (syncQtyWithBulk) {
      setBulkQty(val);
    }
  };

  const handleStockUnitChange = (nextUnit: MaterialUnit) => {
    setUnit(nextUnit);
    if (syncQtyWithBulk) {
      setBulkUnit(nextUnit);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(name, LIMITS.NAME_MAX);
    if (!cleanName) {
      onNotify('Enter an ingredient or material name.', 'error');
      return;
    }

    const qtyNum = Math.max(0, Number(quantity) || 0);
    const costNum = Math.max(0, effectiveUnitCost);
    const lotTotalKwd = roundKwd(qtyNum * costNum);
    const matId = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    const rateLabel =
      unit === 'g' || unit === 'mL'
        ? `${formatKwd(costNum * 1000)}/${unit === 'g' ? 'kg' : 'L'}`
        : `${formatKwd(costNum)}/${unit}`;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'rawMaterials', matId), {
        ownerId: uid,
        name: cleanName,
        category,
        quantity: qtyNum,
        unit,
        unitCost: costNum,
        lotCode: clampStr(lotCode || `LOT-${Date.now().toString().slice(-6)}`, LIMITS.LOT_MAX),
        supplier: clampStr(supplier || 'Direct Bring-In', LIMITS.NAME_MAX),
        storageZone,
        bookingId: clampStr(bookingId, 128),
        notes: clampStr(
          notes ||
            (pricingMode === 'bulk' && Number(bulkTotalPrice) > 0
              ? `Bulk rate: ${bulkQty} ${bulkUnit} @ ${formatKwd(Number(bulkTotalPrice))} (${bulkPricingCalc.primaryLabel} = ${formatKwd(bulkPricingCalc.perPrimaryDisplay)})`
              : ''),
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
        station: storageZone,
        tempReadingC:
          storageZone === 'Walk-In Cooler' ? '3.5' : storageZone === 'Deep Freezer' ? '-18.0' : '',
        message: clampStr(
          `Logged raw material: ${qtyNum} ${unit} of ${cleanName} (${rateLabel} · Total ${formatKwd(lotTotalKwd)}) stored in ${storageZone}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: clampStr(bookingId, 128),
        createdAt: now,
      });

      await batch.commit();
      setName('');
      setLotCode('');
      setSupplier('');
      setNotes('');
      onNotify(`Added ${qtyNum} ${unit} of ${cleanName} (${rateLabel}) to inventory.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rawMaterials/${matId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustQuantity = async (mat: RawMaterial, delta: number) => {
    const nextQty = Math.max(0, Number((mat.quantity + delta).toFixed(2)));
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'rawMaterials', mat.id), {
        quantity: nextQty,
        updatedAt: now,
      });
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'material',
        severity: nextQty === 0 ? 'warn' : 'info',
        station: mat.storageZone,
        tempReadingC: '',
        message: clampStr(
          `Adjusted ${mat.name} stock from ${mat.quantity} ${mat.unit} to ${nextQty} ${mat.unit}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: mat.bookingId || '',
        createdAt: now,
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rawMaterials/${mat.id}`);
    }
  };

  const handleDeleteMaterial = async (mat: RawMaterial) => {
    try {
      await deleteDoc(doc(db, 'rawMaterials', mat.id));
      onNotify(`Removed ${mat.name} from ledger.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rawMaterials/${mat.id}`);
    }
  };

  const updatePoItem = (
    idx: number,
    patch: Partial<MaterialOrderItem> & { lineTotalOverride?: number }
  ) => {
    setPoItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const { lineTotalOverride, ...restPatch } = patch;
        const merged = { ...row, ...restPatch };
        const qty = Math.max(0, Number(merged.quantity) || 0);

        const precisionMult = merged.unit === 'g' || merged.unit === 'mL' ? 1_000_000 : 1000;

        if (lineTotalOverride !== undefined) {
          const safeTotal = Math.max(0, roundKwd(Number(lineTotalOverride) || 0));
          const derivedUnitCost =
            qty > 0 ? Math.round((safeTotal / qty) * precisionMult) / precisionMult : 0;
          return {
            ...merged,
            quantity: qty,
            unitCostKwd: derivedUnitCost,
            gramsTotal: merged.unit === 'units' ? qty : toGrams(qty, merged.unit),
            lineTotalKwd: safeTotal,
          };
        }

        const rawUnitCost = Math.max(0, Number(merged.unitCostKwd) || 0);
        const unitCostVal = Math.round(rawUnitCost * precisionMult) / precisionMult;
        return {
          ...merged,
          quantity: qty,
          unitCostKwd: unitCostVal,
          gramsTotal: merged.unit === 'units' ? qty : toGrams(qty, merged.unit),
          lineTotalKwd: roundKwd(qty * unitCostVal),
        };
      })
    );
  };

  const addPoItemRow = () => {
    if (poItems.length >= 40) return;
    setPoItems((prev) => [
      ...prev,
      {
        materialName: '',
        category: 'Specialty',
        quantity: 5,
        unit: 'kg',
        gramsTotal: 5000,
        unitCostKwd: 1.0,
        lineTotalKwd: 5.0,
        storageZone: 'Dry Pantry',
      },
    ]);
  };

  const removePoItemRow = (idx: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const poSubtotalKwd = useMemo(
    () => roundKwd(poItems.reduce((sum, it) => sum + it.lineTotalKwd, 0)),
    [poItems]
  );
  const poDeliveryNum = Math.max(0, roundKwd(Number(poDeliveryFee) || 0));
  const poTotalKwd = roundKwd(poSubtotalKwd + poDeliveryNum);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = poItems
      .filter((it) => it.materialName.trim().length > 0 && it.quantity > 0)
      .slice(0, 40)
      .map((it) => ({
        ...it,
        materialName: clampStr(it.materialName, LIMITS.NAME_MAX),
      }));

    if (validItems.length === 0) {
      onNotify('Add at least one valid ingredient line to place an order.', 'error');
      return;
    }

    const cleanSupplier = clampStr(poSupplier || 'Kuwait Culinary Supply', LIMITS.NAME_MAX);
    const orderId = `po_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderCode = `PO-${Date.now().toString().slice(-6)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const subtotalKwd = roundKwd(validItems.reduce((s, it) => s + it.lineTotalKwd, 0));
    const totalKwd = roundKwd(subtotalKwd + poDeliveryNum);
    const now = serverTimestamp();

    setSubmittingPo(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'materialOrders', orderId), {
        id: orderId,
        ownerId: uid,
        orderedByName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        orderCode,
        supplier: cleanSupplier,
        sourceProductId: '',
        sourceVersionLabel: '',
        items: validItems,
        subtotalKwd,
        deliveryFeeKwd: poDeliveryNum,
        totalKwd,
        status: 'ordered',
        expectedDate: clampStr(poExpectedDate, 32),
        notes: clampStr(poNotes, 400),
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
          `Placed raw material PO ${orderCode} to ${cleanSupplier} (${validItems.length} lines, ${formatKwd(totalKwd)}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: '',
        createdAt: now,
      });

      await batch.commit();
      setPoNotes('');
      setPoItems([
        {
          materialName: '',
          category: 'Flour & Dry',
          quantity: 10,
          unit: 'kg',
          gramsTotal: 10000,
          unitCostKwd: 0.65,
          lineTotalKwd: 6.5,
          storageZone: 'Dry Pantry',
        },
      ]);
      onNotify(`Placed purchase order ${orderCode} (${formatKwd(totalKwd)}).`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `materialOrders/${orderId}`);
    } finally {
      setSubmittingPo(false);
    }
  };

  const handleMarkOrderInTransit = async (order: MaterialOrder) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'materialOrders', order.id), {
        status: 'in-transit',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(`${order.orderCode} marked In Transit.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `materialOrders/${order.id}`);
    }
  };

  const handleReceiveOrderIntoStock = async (order: MaterialOrder) => {
    if (order.status === 'received' || order.status === 'cancelled') return;
    setReceivingOrderId(order.id);
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'materialOrders', order.id), {
        status: 'received',
        updatedAt: now,
      });

      for (const item of order.items) {
        const matId = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        batch.set(doc(db, 'rawMaterials', matId), {
          ownerId: uid,
          name: clampStr(item.materialName, LIMITS.NAME_MAX),
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          unitCost: item.unitCostKwd,
          lotCode: clampStr(`${order.orderCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`, LIMITS.LOT_MAX),
          supplier: clampStr(order.supplier, LIMITS.NAME_MAX),
          storageZone: item.storageZone,
          bookingId: '',
          notes: clampStr(`Received from ${order.orderCode}${order.sourceVersionLabel ? ` (${order.sourceVersionLabel})` : ''}`, 400),
          createdAt: now,
          updatedAt: now,
        });
      }

      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'material',
        severity: 'info',
        station: 'Receiving',
        tempReadingC: '',
        message: clampStr(
          `Received ${order.orderCode} from ${order.supplier} (${order.items.length} lots, ${formatKwd(order.totalKwd)}) into stock.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: '',
        createdAt: now,
      });

      await batch.commit();
      onNotify(`Received ${order.orderCode} and added ${order.items.length} lots to stock.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `materialOrders/${order.id}`);
    } finally {
      setReceivingOrderId(null);
    }
  };

  const handleCancelOrder = async (order: MaterialOrder) => {
    if (order.status === 'received' || order.status === 'cancelled') return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'materialOrders', order.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(`Cancelled ${order.orderCode}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `materialOrders/${order.id}`);
    }
  };

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      const matchesZone = zoneFilter === 'All' || m.storageZone === zoneFilter;
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.lotCode.toLowerCase().includes(q) ||
        m.supplier.toLowerCase().includes(q);
      return matchesZone && matchesSearch;
    });
  }, [materials, searchQuery, zoneFilter]);

  const totalInventoryValue = useMemo(
    () => roundKwd(materials.reduce((sum, m) => sum + m.quantity * m.unitCost, 0)),
    [materials]
  );

  const openOrderCount = useMemo(
    () => materialOrders.filter((o) => o.status === 'ordered' || o.status === 'in-transit').length,
    [materialOrders]
  );

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'inventory'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Ledger ({materials.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Order Raw Materials ({openOrderCount} open · {materialOrders.length})
          </button>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-500">Active Inventory Valuation</div>
          <div className="text-lg font-mono tabular-nums font-semibold text-teal-800">
            {formatKwd(totalInventoryValue)}
          </div>
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <>
          {/* Add Raw Material Form */}
          <form onSubmit={handleAddMaterial} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Log Raw Material Batch</h2>
              <p className="text-sm text-slate-600">
                Register ingredients and packaging in KWD; stock automatically converts to grams for recipe costing.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Ingredient / Material Name</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. T55 Bread Flour"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MaterialCategory)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Stock Quantity</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quantity}
                    onChange={(e) => handleStockQuantityChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Unit</span>
                  <select
                    value={unit}
                    onChange={(e) => handleStockUnitChange(e.target.value as MaterialUnit)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  {pricingMode === 'bulk'
                    ? `Derived Unit Cost (KWD / ${unit})`
                    : `Unit Cost (KWD / ${unit})`}
                </span>
                {pricingMode === 'bulk' ? (
                  <div className="px-3 py-2 text-sm font-mono tabular-nums bg-teal-50/70 border border-teal-200 rounded-md text-teal-900 font-semibold">
                    {unit === 'g' || unit === 'mL'
                      ? `${formatKwd(bulkPricingCalc.perPrimaryDisplay)} / ${unit === 'g' ? 'kg' : 'L'}`
                      : formatKwd(effectiveUnitCost)}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                )}
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Lot / Batch Code</span>
                <input
                  type="text"
                  maxLength={LIMITS.LOT_MAX}
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  placeholder="e.g. LOT-2026-88B"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Supplier</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. Al-Yasra Culinary Supply"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Storage Zone</span>
                <select
                  value={storageZone}
                  onChange={(e) => setStorageZone(e.target.value as StorageZone)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {STORAGE_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Linked Session (Optional)</span>
                <select
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="">General Stock</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.date} · {b.spaceName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Bulk Pricing Calculator Area */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Bulk Pricing Area (Auto-Compute 1 kg / 1 L / 1 Unit Rate)
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Enter a bulk pack size and total KWD price (e.g. 50 kg for 4.500 KWD) to automatically find the 1 kg rate.
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-md self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPricingMode('bulk')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      pricingMode === 'bulk'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bulk Pack Price
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUnitCost(effectiveUnitCost.toFixed(unit === 'g' || unit === 'mL' ? 6 : 3));
                      setPricingMode('unit');
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      pricingMode === 'unit'
                        ? 'bg-teal-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Manual Unit Cost
                  </button>
                </div>
              </div>

              {pricingMode === 'bulk' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-slate-700">Bulk Pack Size</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bulkQty}
                        onChange={(e) => handleBulkQtyChange(e.target.value)}
                        placeholder="50"
                        className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-slate-700">Pack Unit</span>
                      <select
                        value={bulkUnit}
                        onChange={(e) => handleBulkUnitChange(e.target.value as MaterialUnit)}
                        className="w-full px-2 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="lg:col-span-3 block space-y-1">
                    <span className="text-[11px] font-medium text-slate-700">
                      Bulk Total Price (KWD)
                    </span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={bulkTotalPrice}
                      onChange={(e) => setBulkTotalPrice(e.target.value)}
                      placeholder="4.500"
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </label>

                  <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white border border-slate-200 rounded-md p-2.5">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Derived {bulkPricingCalc.primaryLabel} Price
                      </div>
                      <div className="text-sm font-mono tabular-nums font-bold text-teal-800">
                        {formatKwd(bulkPricingCalc.perPrimaryDisplay)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {bulkPricingCalc.isWeightOrVolume
                          ? `Per 100 ${bulkUnit === 'L' || bulkUnit === 'mL' ? 'mL' : 'g'}`
                          : 'Per 1 unit'}
                      </div>
                      <div className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                        {bulkPricingCalc.isWeightOrVolume
                          ? formatKwd(bulkPricingCalc.per100gOrMl)
                          : formatKwd(bulkPricingCalc.perPrimaryDisplay)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Logged Lot Value
                      </div>
                      <div className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                        {formatKwd((Number(quantity) || 0) * effectiveUnitCost)}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncQtyWithBulk}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSyncQtyWithBulk(checked);
                          if (checked) {
                            setQuantity(bulkQty);
                            setUnit(bulkUnit);
                          }
                        }}
                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                      />
                      <span>Match stock quantity &amp; unit to bulk pack ({bulkQty || 0} {bulkUnit})</span>
                    </label>
                    {!syncQtyWithBulk && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuantity(bulkQty);
                          setUnit(bulkUnit);
                        }}
                        className="text-xs font-medium text-teal-700 hover:text-teal-800"
                      >
                        Copy {bulkQty || 0} {bulkUnit} into Stock Quantity
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-md px-3 py-2">
                  <span>
                    Logging{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {Number(quantity) || 0} {unit}
                    </span>{' '}
                    at manual rate{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {formatKwd(effectiveUnitCost)}/{unit}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-teal-800">
                    Lot Total: {formatKwd((Number(quantity) || 0) * effectiveUnitCost)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <input
                type="text"
                maxLength={400}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergen note, expiry date, or receiving condition..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <PackagePlus className="w-4 h-4" />
                {submitting ? 'Saving Lot...' : 'Add Raw Material'}
              </button>
            </div>
          </form>

          {/* Inventory Table */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search material, lot code, or supplier..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {['All', ...STORAGE_ZONES].map((zone) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => setZoneFilter(zone)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      zoneFilter === zone
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {zone}
                  </button>
                ))}
              </div>
            </div>

            {filteredMaterials.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">No raw materials recorded</p>
                <p className="text-xs text-slate-500">
                  Log your first ingredient lot above or place a supplier Purchase Order.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                      <th className="py-3 px-4">Ingredient &amp; Lot</th>
                      <th className="py-3 px-4">Category · Zone</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4 text-right">Stock Level</th>
                      <th className="py-3 px-4 text-right">Unit Rate (KWD)</th>
                      <th className="py-3 px-4 text-right">Lot Value</th>
                      <th className="py-3 px-4 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredMaterials.map((mat) => {
                      const gramsEq = mat.unit === 'units' ? null : toGrams(mat.quantity, mat.unit);
                      return (
                        <tr key={mat.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{mat.name}</div>
                            <div className="text-xs font-mono text-slate-500">
                              {mat.lotCode}
                              {mat.notes ? ` · ${mat.notes}` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            <span>{mat.category}</span>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="font-medium text-slate-800">{mat.storageZone}</span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{mat.supplier}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono tabular-nums font-medium text-slate-900">
                              {mat.quantity} {mat.unit}
                            </div>
                            {gramsEq !== null && mat.unit !== 'g' && (
                              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                {gramsEq.toLocaleString()} g
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                            {mat.unit === 'g' || mat.unit === 'mL'
                              ? `${formatKwd(mat.unitCost * 1000)}/${mat.unit === 'g' ? 'kg' : 'L'}`
                              : `${formatKwd(mat.unitCost)}/${mat.unit}`}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                            {formatKwd(mat.quantity * mat.unitCost)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAdjustQuantity(mat, -1)}
                                title="Consume 1 unit"
                                className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustQuantity(mat, 1)}
                                title="Add 1 unit"
                                className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMaterial(mat)}
                                title="Delete lot"
                                className="p-1.5 border border-slate-200 rounded hover:bg-red-50 text-red-600 ml-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="space-y-8">
          {/* Place Raw Material Purchase Order */}
          <form onSubmit={handlePlaceOrder} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Raw Material Purchase Order</h2>
                <p className="text-sm text-slate-600">
                  Order ingredients in bulk (KWD) and receive delivered lots directly into your stock ledger.
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Order Total (inc. delivery)</div>
                <div className="text-lg font-mono tabular-nums font-semibold text-teal-800">
                  {formatKwd(poTotalKwd)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Supplier Name</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={poSupplier}
                  onChange={(e) => setPoSupplier(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Expected Delivery Date</span>
                <input
                  type="date"
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Delivery Fee (KWD)</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={poDeliveryFee}
                  onChange={(e) => setPoDeliveryFee(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </label>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Order Line Items</span>
                <button
                  type="button"
                  onClick={addPoItemRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Order Line
                </button>
              </div>

              <datalist id="po-materials-suggestions">
                {materials.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>

              <div className="space-y-2">
                <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-slate-500">
                  <span className="col-span-4">Ingredient</span>
                  <span className="col-span-2">Bulk Qty</span>
                  <span className="col-span-1">Unit</span>
                  <span className="col-span-2">Derived Rate / Unit</span>
                  <span className="col-span-2">Bulk Total (KWD)</span>
                  <span className="col-span-1 text-center">Del</span>
                </div>
                {poItems.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      list="po-materials-suggestions"
                      value={row.materialName}
                      onChange={(e) => updatePoItem(idx, { materialName: e.target.value })}
                      placeholder="Ingredient name"
                      className="col-span-12 md:col-span-4 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => updatePoItem(idx, { quantity: Number(e.target.value) })}
                      className="col-span-4 md:col-span-2 px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                    <select
                      value={row.unit}
                      onChange={(e) => updatePoItem(idx, { unit: e.target.value as MaterialUnit })}
                      className="col-span-3 md:col-span-1 px-2 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.unitCostKwd}
                      onChange={(e) => updatePoItem(idx, { unitCostKwd: Number(e.target.value) })}
                      placeholder="KWD/unit"
                      title={`KWD per 1 ${row.unit}`}
                      className="col-span-5 md:col-span-2 px-3 py-1.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.lineTotalKwd}
                      onChange={(e) =>
                        updatePoItem(idx, { lineTotalOverride: Number(e.target.value) })
                      }
                      placeholder="Total KWD"
                      title="Enter bulk total (KWD) to auto-compute 1 unit cost"
                      className="col-span-10 md:col-span-2 px-3 py-1.5 text-sm font-mono tabular-nums bg-teal-50/50 border border-teal-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                    <button
                      type="button"
                      onClick={() => removePoItemRow(idx)}
                      disabled={poItems.length === 1}
                      className="col-span-2 md:col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 flex justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <input
                type="text"
                maxLength={400}
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="Delivery window, receiving dock note, or brand grade..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <button
                type="submit"
                disabled={submittingPo}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="w-4 h-4" />
                {submittingPo ? 'Submitting PO...' : 'Place Material Order'}
              </button>
            </div>
          </form>

          {/* Purchase Orders Queue */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Raw Material Orders</h3>

            {materialOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">No purchase orders yet</p>
                <p className="text-xs text-slate-500">
                  Place an order above or generate a shortfall order directly inside Recipe Creator.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                {materialOrders.map((order) => (
                  <div key={order.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-slate-900">
                            {order.orderCode}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="font-medium text-slate-800">{order.supplier}</span>
                          {order.sourceVersionLabel && (
                            <>
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="text-xs text-slate-600">{order.sourceVersionLabel}</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span>By {order.orderedByName}</span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">ETA {order.expectedDate || 'TBD'}</span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span className={ORDER_STATUS_TEXT_CLASS[order.status]}>
                            {order.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
                        {formatKwd(order.totalKwd)}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-md px-3 py-2 text-xs space-y-1">
                      {order.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-slate-700">
                          <span>
                            {it.materialName} ·{' '}
                            <span className="font-mono tabular-nums font-medium">
                              {it.quantity} {it.unit}
                            </span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-600">
                            {formatKwd(it.lineTotalKwd)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {(order.status === 'ordered' || order.status === 'in-transit') && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {order.status === 'ordered' && (
                          <button
                            type="button"
                            onClick={() => handleMarkOrderInTransit(order)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Mark In Transit
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={receivingOrderId === order.id}
                          onClick={() => handleReceiveOrderIntoStock(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {receivingOrderId === order.id
                            ? 'Receiving...'
                            : 'Receive into Stock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(order)}
                          className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md whitespace-nowrap"
                        >
                          Cancel PO
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
