import { useMemo, useState } from 'react';
import { PackagePlus, Search, Plus, Minus, Trash2 } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  LIMITS,
  MaterialCategory,
  MaterialUnit,
  RawMaterial,
  StorageZone,
  clampStr,
} from '../types';

interface MaterialsViewProps {
  uid: string;
  userName: string;
  materials: RawMaterial[];
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

export function MaterialsView({
  uid,
  userName,
  materials,
  bookings,
  loading,
  onNotify,
}: MaterialsViewProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('Flour & Dry');
  const [quantity, setQuantity] = useState('10');
  const [unit, setUnit] = useState<MaterialUnit>('kg');
  const [unitCost, setUnitCost] = useState('4.50');
  const [lotCode, setLotCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [storageZone, setStorageZone] = useState<StorageZone>('Dry Pantry');
  const [bookingId, setBookingId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string>('All');

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(name, LIMITS.NAME_MAX);
    if (!cleanName) {
      onNotify('Enter an ingredient or material name.', 'error');
      return;
    }

    const qtyNum = Math.max(0, Number(quantity) || 0);
    const costNum = Math.max(0, Number(unitCost) || 0);
    const matId = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

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
        notes: clampStr(notes, 400),
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'material',
        severity: 'info',
        station: storageZone,
        tempReadingC: storageZone === 'Walk-In Cooler' ? '3.5' : storageZone === 'Deep Freezer' ? '-18.0' : '',
        message: clampStr(
          `Logged raw material: ${qtyNum} ${unit} of ${cleanName} (${category}) stored in ${storageZone}.`,
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
      onNotify(`Added ${qtyNum} ${unit} of ${cleanName} to inventory.`, 'success');
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
    () => materials.reduce((sum, m) => sum + m.quantity * m.unitCost, 0),
    [materials]
  );

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Add Raw Material Form */}
      <form onSubmit={handleAddMaterial} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Log Raw Material Batch</h2>
            <p className="text-sm text-slate-600">
              Register ingredients, packaging, and lot codes brought into commissary storage.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Active Lot Valuation</div>
            <div className="text-lg font-mono tabular-nums font-semibold text-teal-800">
              ${totalInventoryValue.toFixed(2)}
            </div>
          </div>
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
              <span className="text-xs font-medium text-slate-700">Quantity</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">Unit</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MaterialUnit)}
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
            <span className="text-xs font-medium text-slate-700">Unit Cost ($/{unit})</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
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
              placeholder="e.g. Cairnspring Mills"
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
              Log your first ingredient or packaging batch above to track stock levels and lot costs.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Ingredient & Lot</th>
                  <th className="py-3 px-4">Category · Zone</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Stock Level</th>
                  <th className="py-3 px-4 text-right">Lot Value</th>
                  <th className="py-3 px-4 text-right">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredMaterials.map((mat) => (
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
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {mat.quantity} {mat.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      ${(mat.quantity * mat.unitCost).toFixed(2)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
