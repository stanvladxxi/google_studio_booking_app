import { useMemo, useState } from 'react';
import { BarChart3, Edit3, Plus, Trash2, X } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import { clampStr, LIMITS } from '../../../types';
import { formatKwd } from '../../../utils/costing';
import {
  DiscoverPlacementType,
  EnCuisineAnalyticsEvent,
  EnCuisineBadgeType,
  EnCuisineCatalogDoc,
} from '../types';

interface DiscoverAdminPanelProps {
  uid: string;
  isAdmin: boolean;
  customItems: EnCuisineCatalogDoc[];
  analyticsEvents: EnCuisineAnalyticsEvent[];
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const SECTION_LABELS: Record<DiscoverPlacementType, string> = {
  equipment: 'Featured Equipment',
  supplier_product: 'Supplier Hub Product',
  influencer: 'Featured Influencer',
  brand: 'New Brand',
  editorial: 'F&B News & Editorial',
};

const DEFAULT_CATEGORIES: Record<DiscoverPlacementType, string> = {
  equipment: "Chef's Tools & Gadgets",
  supplier_product: 'Specialty Vinegars',
  influencer: 'Culinary Innovators',
  brand: 'Artisanal Foodservice',
  editorial: 'News Article',
};

export function DiscoverAdminPanel({
  uid,
  isAdmin,
  customItems,
  analyticsEvents,
  onNotify,
}: DiscoverAdminPanelProps) {
  const [sectionType, setSectionType] = useState<DiscoverPlacementType>('equipment');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES.equipment);
  const [description, setDescription] = useState('');
  const [priceKwd, setPriceKwd] = useState('120.000');
  const [badgeType, setBadgeType] = useState<EnCuisineBadgeType>('featured');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setCategory(DEFAULT_CATEGORIES[sectionType]);
    setDescription('');
    setPriceKwd('120.000');
    setBadgeType('featured');
  };

  const handleSelectEdit = (item: EnCuisineCatalogDoc) => {
    setEditingId(item.id);
    setSectionType(item.sectionType);
    setTitle(item.title);
    setSubtitle(item.subtitle);
    setCategory(item.category);
    setDescription(item.description);
    setPriceKwd(item.priceKwd !== undefined ? String(item.priceKwd) : '0');
    setBadgeType(item.badgeType);
    setStartDate(item.startDate || '2026-11-01');
    setEndDate(item.endDate || '2026-12-31');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onNotify('Admin privileges required to modify Discover catalog placements.', 'error');
      return;
    }
    const cleanTitle = clampStr(title, 160);
    if (!cleanTitle) {
      onNotify('Enter an item title.', 'error');
      return;
    }

    const docId = editingId || `ec_${sectionType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = serverTimestamp();
    setSaving(true);
    try {
      const payload = {
        id: docId,
        ownerId: uid,
        sectionType,
        title: cleanTitle,
        subtitle: clampStr(subtitle || 'Kuwait Culinary Partner', 160),
        category: clampStr(category || DEFAULT_CATEGORIES[sectionType], 100),
        description: clampStr(description || 'Verified Kuwait & GCC partner placement.', LIMITS.METHOD_MAX),
        priceKwd: Math.max(0, Number(priceKwd) || 0),
        badgeType,
        startDate: clampStr(startDate, 32),
        endDate: clampStr(endDate, 32),
        isActive: true,
        updatedAt: now,
      };

      if (editingId) {
        await updateDoc(doc(db, 'enCuisineItems', docId), payload);
        onNotify(`Updated Discover placement "${cleanTitle}".`);
      } else {
        await setDoc(doc(db, 'enCuisineItems', docId), {
          ...payload,
          createdAt: now,
        });
        onNotify(`Published Discover placement "${cleanTitle}" (${badgeType}).`);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `enCuisineItems/${docId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: EnCuisineCatalogDoc) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'enCuisineItems', item.id));
      if (editingId === item.id) resetForm();
      onNotify(`Deleted placement "${item.title}".`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `enCuisineItems/${item.id}`);
    }
  };

  const analyticsSummary = useMemo(() => {
    const grouped: Record<string, { placement: string; itemTitle: string; impressions: number; clicks: number }> = {};
    for (const ev of analyticsEvents) {
      const k = `${ev.placement}::${ev.itemId}`;
      if (!grouped[k]) {
        grouped[k] = {
          placement: ev.placement,
          itemTitle: ev.itemTitle || ev.itemId,
          impressions: 0,
          clicks: 0,
        };
      }
      if (ev.eventType === 'impression') grouped[k].impressions += 1;
      else grouped[k].clicks += 1;
    }
    return Object.values(grouped).sort((a, b) => b.clicks + b.impressions - (a.clicks + a.impressions));
  }, [analyticsEvents]);

  return (
    <div className="bg-white border border-emerald-900/20 rounded-lg p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="text-xs font-semibold text-orange-700">
            En Cuisine Discover Admin Console
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Manage Featured &amp; Sponsored Placements + Placement Analytics
          </h3>
        </div>
        {!isAdmin && (
          <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded">
            Read-only preview · Admin role needed to publish global changes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form */}
        <form onSubmit={handleSaveItem} className="lg:col-span-5 space-y-4 bg-slate-50 border border-slate-200 rounded-md p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              {editingId ? 'Edit Discover Item' : 'Add Featured / Sponsored Item'}
            </span>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Section</span>
              <select
                value={sectionType}
                onChange={(e) => {
                  const next = e.target.value as DiscoverPlacementType;
                  setSectionType(next);
                  setCategory(DEFAULT_CATEGORIES[next]);
                }}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
              >
                {Object.entries(SECTION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Placement Flag</span>
              <select
                value={badgeType}
                onChange={(e) => setBadgeType(e.target.value as EnCuisineBadgeType)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="featured">Featured</option>
                <option value="sponsored">Sponsored</option>
                <option value="none">Standard (No Flag)</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Title / Name</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rational SelfCooking Center 6-Tray"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Supplier / Country / Author</span>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g. Al-Yasra Foodservice"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Category / Sub-tab</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Price (KWD)</span>
              <input
                type="number"
                step="0.001"
                min={0}
                value={priceKwd}
                onChange={(e) => setPriceKwd(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Pitch / Spec / Summary</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Concise Kuwait & GCC enterprise summary..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !isAdmin}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : editingId ? 'Update Placement' : 'Publish Placement'}
          </button>
        </form>

        {/* Managed Items + Analytics */}
        <div className="lg:col-span-7 space-y-5">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">
              Custom &amp; Submitted Discover Items ({customItems.length})
            </h4>
            {customItems.length === 0 ? (
              <div className="p-4 border border-slate-200 rounded-md text-xs text-slate-500">
                No custom Discover placements published yet. Add one on the left or accept brand submissions via &ldquo;Add your brand&rdquo;.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-md divide-y divide-slate-200 max-h-56 overflow-y-auto">
                {customItems.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {item.title}
                        {item.badgeType !== 'none' && (
                          <span className="ml-2 uppercase text-[10px] font-mono text-orange-700">
                            [{item.badgeType}]
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 truncate">
                        {SECTION_LABELS[item.sectionType]} · {item.category}
                        {item.priceKwd !== undefined && item.priceKwd > 0 && ` · ${formatKwd(item.priceKwd)}`}
                        {item.startDate && item.endDate && ` · ${item.startDate} to ${item.endDate}`}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectEdit(item)}
                          className="p-1.5 text-slate-600 hover:text-[#0B3B2B] border border-slate-200 rounded"
                          aria-label={`Edit ${item.title}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded"
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analytics Stub View */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-[#0B3B2B]" />
              Placement Impressions &amp; Clicks Analytics ({analyticsEvents.length} logged events)
            </h4>
            <div className="border border-slate-200 rounded-md overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Placement</th>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3 text-right">Impressions</th>
                    <th className="py-2 px-3 text-right">Clicks</th>
                    <th className="py-2 px-3 text-right">CTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analyticsSummary.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center text-slate-500">
                        Interact with Discover cards to record live placement impressions and clicks.
                      </td>
                    </tr>
                  ) : (
                    analyticsSummary.map((row) => {
                      const ctr =
                        row.impressions > 0
                          ? `${((row.clicks / row.impressions) * 100).toFixed(1)}%`
                          : '—';
                      return (
                        <tr key={`${row.placement}_${row.itemTitle}`}>
                          <td className="py-2 px-3 text-slate-600">{row.placement}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{row.itemTitle}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {row.impressions}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-[#0B3B2B]">
                            {row.clicks}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                            {ctr}
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
      </div>
    </div>
  );
}
