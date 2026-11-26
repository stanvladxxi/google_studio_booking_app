import { useMemo, useState } from 'react';
import {
  Award,
  Building2,
  Check,
  CheckCircle2,
  Filter,
  FolderTree,
  MessageSquarePlus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  SupplierQuote,
  SupplierRfq,
  SupplierRfqRequestType,
} from '../../../types';
import {
  CulinaryProcessScope,
  RFQ_CATEGORY_TREE,
  SUPPLIER_SPECIALTY_OPTIONS,
  getSupplierTargetLabel,
  rfqMatchesSupplierSpecialties,
} from '../data/rfqCategoryTree';
import { RfqPrefillRequest } from '../types';
import { formatKwd } from '../utils/formulationEngine';
import {
  addQuotedIngredientToLibrary,
  awardSupplierQuote,
  closeSupplierRfq,
  createPoFromAwardedQuote,
  deleteSupplierRfq,
  setQuoteReviewStatus,
  submitSupplierQuote,
  updateSupplierQuoteOffer,
} from '../utils/rfqPersistence';
import { SupplierRfqModal } from './SupplierRfqModal';

interface SupplierPortalTabProps {
  uid: string;
  userName: string;
  isAdmin: boolean;
  rfqs: SupplierRfq[];
  quotes: SupplierQuote[];
  prefillRfq?: RfqPrefillRequest | null;
  onConsumePrefill?: () => void;
  onOpenMaterialsOrders?: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

type PortalViewMode = 'marketplace' | 'my-rfqs' | 'my-quotes';

const STATUS_TEXT_COLORS: Record<string, string> = {
  open: 'text-emerald-700',
  quoted: 'text-teal-700',
  awarded: 'text-orange-700',
  closed: 'text-slate-500',
  submitted: 'text-slate-700',
  shortlisted: 'text-amber-700',
  accepted: 'text-emerald-700',
  declined: 'text-red-600',
};

export function SupplierPortalTab({
  uid,
  userName,
  isAdmin,
  rfqs,
  quotes,
  prefillRfq,
  onConsumePrefill,
  onOpenMaterialsOrders,
  onNotify,
}: SupplierPortalTabProps) {
  const [viewMode, setViewMode] = useState<PortalViewMode>('marketplace');
  const [typeFilter, setTypeFilter] = useState<'all' | SupplierRfqRequestType>('all');
  const [processFilter, setProcessFilter] = useState<CulinaryProcessScope>('all');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [showAllSubcategories, setShowAllSubcategories] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRfqId, setSelectedRfqId] = useState<string>('');

  // Supplier Specialty Routing (ensures relevant suppliers see/quote matching cuisine/process RFQs)
  const specialtyStorageKey = `hearthline_supplier_specialties_${uid}`;
  const [supplierSpecialties, setSupplierSpecialties] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(`hearthline_supplier_specialties_${uid}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [matchSpecialtiesOnly, setMatchSpecialtiesOnly] = useState<boolean>(false);
  const [specialtyDrawerOpen, setSpecialtyDrawerOpen] = useState<boolean>(false);

  const toggleSpecialty = (specId: string) => {
    setSupplierSpecialties((prev) => {
      const next = prev.includes(specId)
        ? prev.filter((s) => s !== specId)
        : [...prev, specId];
      try {
        window.localStorage.setItem(specialtyStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      if (next.length > 0) setMatchSpecialtiesOnly(true);
      return next;
    });
  };

  // RFQ Composer Modal
  const [rfqModalOpen, setRfqModalOpen] = useState<boolean>(() => Boolean(prefillRfq));
  const [localPrefill, setLocalPrefill] = useState<RfqPrefillRequest | null>(
    prefillRfq || null
  );

  // Supplier Quote Response Modal
  const [quotingRfq, setQuotingRfq] = useState<SupplierRfq | null>(null);
  const [editingQuote, setEditingQuote] = useState<SupplierQuote | null>(null);
  const [supplierCompany, setSupplierCompany] = useState('');
  const [supplierContact, setSupplierContact] = useState(userName);
  const [originCountry, setOriginCountry] = useState('Kuwait / GCC');
  const [quotedUnitPriceKwd, setQuotedUnitPriceKwd] = useState('');
  const [moqQty, setMoqQty] = useState('');
  const [moqUnit, setMoqUnit] = useState('kg');
  const [leadTimeDays, setLeadTimeDays] = useState('3');
  const [shippingTerms, setShippingTerms] = useState('DDP Kitchen Door');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [validUntilDate, setValidUntilDate] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [warrantyOrShelfLife, setWarrantyOrShelfLife] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);

  // Sync external prefill trigger
  if (prefillRfq && (!localPrefill || prefillRfq.key !== localPrefill.key)) {
    setLocalPrefill(prefillRfq);
    setRfqModalOpen(true);
  }

  const quotesByRfq = useMemo(() => {
    const map = new Map<string, SupplierQuote[]>();
    for (const q of quotes) {
      const list = map.get(q.rfqId) || [];
      list.push(q);
      map.set(q.rfqId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.quotedUnitPriceKwd - b.quotedUnitPriceKwd);
    }
    return map;
  }, [quotes]);

  const myRfqs = useMemo(
    () => rfqs.filter((r) => r.buyerUid === uid),
    [rfqs, uid]
  );

  const myQuotes = useMemo(
    () => quotes.filter((q) => q.supplierUid === uid),
    [quotes, uid]
  );

  const filteredRfqs = useMemo(() => {
    const base =
      viewMode === 'my-rfqs'
        ? myRfqs
        : viewMode === 'my-quotes'
        ? rfqs.filter((r) => myQuotes.some((q) => q.rfqId === r.id))
        : rfqs.filter((r) => r.status === 'open' || r.status === 'quoted' || r.buyerUid === uid);

    const q = searchTerm.trim().toLowerCase();
    return base.filter((r) => {
      if (typeFilter !== 'all' && r.requestType !== typeFilter) return false;
      if (groupFilter !== 'ALL' && !r.categoryPath.includes(groupFilter)) return false;
      if (
        typeFilter === 'ingredient' &&
        processFilter !== 'all'
      ) {
        const pLower = r.categoryPath.toLowerCase();
        if (processFilter === 'hot' && !pLower.includes('hot process')) return false;
        if (processFilter === 'cold' && !pLower.includes('cold process')) return false;
      }
      if (
        viewMode === 'marketplace' &&
        matchSpecialtiesOnly &&
        supplierSpecialties.length > 0 &&
        r.buyerUid !== uid &&
        !rfqMatchesSupplierSpecialties(r.categoryPath, r.requestType, supplierSpecialties)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.itemName.toLowerCase().includes(q) ||
        r.rfqCode.toLowerCase().includes(q) ||
        r.categoryPath.toLowerCase().includes(q) ||
        r.specifications.toLowerCase().includes(q) ||
        r.sourceRecipeName.toLowerCase().includes(q)
      );
    });
  }, [
    groupFilter,
    matchSpecialtiesOnly,
    myQuotes,
    myRfqs,
    processFilter,
    rfqs,
    searchTerm,
    supplierSpecialties,
    typeFilter,
    uid,
    viewMode,
  ]);

  const selectedRfq = useMemo(
    () =>
      filteredRfqs.find((r) => r.id === selectedRfqId) ||
      filteredRfqs[0] ||
      null,
    [filteredRfqs, selectedRfqId]
  );

  const selectedQuotes = useMemo(
    () => (selectedRfq ? quotesByRfq.get(selectedRfq.id) || [] : []),
    [quotesByRfq, selectedRfq]
  );

  const openSubmitQuoteModal = (rfq: SupplierRfq) => {
    if (
      supplierSpecialties.length > 0 &&
      rfq.buyerUid !== uid &&
      !rfqMatchesSupplierSpecialties(rfq.categoryPath, rfq.requestType, supplierSpecialties)
    ) {
      onNotify(
        `This RFQ is routed specifically to "${getSupplierTargetLabel(rfq.categoryPath, rfq.requestType)}". Update your Supplier Specialties if you supply this category.`,
        'error'
      );
      setSpecialtyDrawerOpen(true);
      return;
    }
    setEditingQuote(null);
    setQuotingRfq(rfq);
    setSupplierCompany('');
    setSupplierContact(userName);
    setOriginCountry('Kuwait');
    setQuotedUnitPriceKwd(
      rfq.targetUnitPriceKwd > 0 ? String(rfq.targetUnitPriceKwd) : ''
    );
    setMoqQty(String(rfq.quantity));
    setMoqUnit(rfq.unit);
    setLeadTimeDays('3');
    setShippingTerms(rfq.tradeTerms);
    setPaymentTerms(rfq.paymentTerms || 'Net 30 Days');
    setWarrantyOrShelfLife(
      rfq.requestType === 'machinery'
        ? '12 Months Manufacturer Warranty + Commissioning'
        : '6 Months Chilled / Dry Shelf Life'
    );
    setQuoteNotes('');
  };

  const openEditQuoteModal = (rfq: SupplierRfq, quote: SupplierQuote) => {
    setEditingQuote(quote);
    setQuotingRfq(rfq);
    setSupplierCompany(quote.supplierCompany);
    setSupplierContact(quote.supplierContact);
    setOriginCountry(quote.originCountry);
    setQuotedUnitPriceKwd(String(quote.quotedUnitPriceKwd));
    setMoqQty(String(quote.moqQty));
    setMoqUnit(quote.moqUnit);
    setLeadTimeDays(String(quote.leadTimeDays));
    setShippingTerms(quote.shippingTerms);
    setPaymentTerms(quote.paymentTerms);
    setValidUntilDate(quote.validUntilDate);
    setWarrantyOrShelfLife(quote.warrantyOrShelfLife);
    setQuoteNotes(quote.notes);
  };

  const handleConfirmSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotingRfq) return;
    const price = parseFloat(quotedUnitPriceKwd);
    const moq = parseFloat(moqQty) || quotingRfq.quantity;
    if (!supplierCompany.trim()) {
      onNotify('Enter the supplier company name.', 'error');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      onNotify('Enter a valid quoted unit price in KWD.', 'error');
      return;
    }

    setSubmittingQuote(true);
    try {
      if (editingQuote) {
        await updateSupplierQuoteOffer({
          quoteId: editingQuote.id,
          quotedUnitPriceKwd: price,
          moqQty: moq,
          moqUnit,
          leadTimeDays: parseInt(leadTimeDays, 10) || 3,
          shippingTerms,
          paymentTerms,
          validUntilDate,
          warrantyOrShelfLife,
          notes: quoteNotes,
        });
        onNotify(`Updated supplier quotation from ${supplierCompany}.`);
      } else {
        await submitSupplierQuote({
          rfq: quotingRfq,
          supplierUid: uid,
          supplierCompany,
          supplierContact,
          originCountry,
          quotedUnitPriceKwd: price,
          moqQty: moq,
          moqUnit,
          leadTimeDays: parseInt(leadTimeDays, 10) || 3,
          shippingTerms,
          paymentTerms,
          validUntilDate,
          warrantyOrShelfLife,
          notes: quoteNotes,
        });
        onNotify(`Submitted quotation from ${supplierCompany} for ${quotingRfq.rfqCode}.`);
      }
      setQuotingRfq(null);
      setEditingQuote(null);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Unable to submit quotation.',
        'error'
      );
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleAwardQuote = async (rfq: SupplierRfq, quote: SupplierQuote) => {
    try {
      await awardSupplierQuote({
        rfq,
        quote,
        otherQuotes: selectedQuotes,
        actorUid: uid,
        actorName: userName,
      });
      onNotify(
        `Awarded ${rfq.rfqCode} to ${quote.supplierCompany} (${formatKwd(quote.quotedUnitPriceKwd)}/${rfq.unit}).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to award quote.', 'error');
    }
  };

  const handleCreatePo = async (rfq: SupplierRfq, quote: SupplierQuote) => {
    try {
      const code = await createPoFromAwardedQuote({
        uid,
        userName,
        rfq,
        quote,
      });
      onNotify(`Created Purchase Order ${code} from ${quote.supplierCompany} quote.`);
      if (onOpenMaterialsOrders) onOpenMaterialsOrders();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to create PO.', 'error');
    }
  };

  const handleSyncToLibrary = async (rfq: SupplierRfq, quote: SupplierQuote) => {
    try {
      const ing = await addQuotedIngredientToLibrary({
        uid,
        userName,
        rfq,
        quote,
      });
      onNotify(
        `Added "${ing.name}" (${formatKwd(ing.costKg)}/kg) to Ingredient & Additive Library.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save ingredient.', 'error');
    }
  };

  const openRfqsCount = rfqs.filter((r) => r.status === 'open' || r.status === 'quoted').length;
  const awardedCount = rfqs.filter((r) => r.status === 'awarded').length;
  const machineryCount = rfqs.filter((r) => r.requestType === 'machinery').length;

  return (
    <div className="space-y-5">
      {/* Portal Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            Supplier Quotation Portal (Alibaba &amp; IndiaMART Trade Desk)
          </h2>
          <p className="text-xs text-slate-500">
            Post structured RFQs by Category Tree for missing recipe ingredients, additives, packaging, or commercial kitchen machinery and compare competitive supplier quotes side-by-side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLocalPrefill({
                key: Date.now(),
                itemName: '',
                requestType: 'machinery',
                categoryPath:
                  'Commercial Machinery > Ovens, Ranges & Thermal Baking > Deck, Convection, Rotary & Combi Ovens',
                quantity: 1,
                unit: 'units',
              });
              setRfqModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md whitespace-nowrap shrink-0"
          >
            <Wrench className="w-3.5 h-3.5 text-[#0B3B2B]" />
            Quote Machinery
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalPrefill(null);
              setRfqModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Post Alibaba-Format RFQ
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Open Buyer RFQs</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
            {openRfqsCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Supplier Responses</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-[#0B3B2B]">
            {quotes.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Machinery &amp; Equipment RFQs</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
            {machineryCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3.5">
          <div className="text-xs text-slate-500">Awarded Quotations</div>
          <div className="mt-1 font-mono tabular-nums text-xl font-bold text-orange-600">
            {awardedCount}
          </div>
        </div>
      </div>

      {/* Mode Switch, Process Scope & Supplier Specialty Routing */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'marketplace', label: `Open RFQ Board (${openRfqsCount})` },
                { id: 'my-rfqs', label: `My Posted RFQs (${myRfqs.length})` },
                { id: 'my-quotes', label: `My Supplier Quotes (${myQuotes.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === tab.id
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cream cheese, flour, oven..."
                className="w-56 pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <button
              type="button"
              onClick={() => setSpecialtyDrawerOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap ${
                supplierSpecialties.length > 0
                  ? 'bg-emerald-50 text-[#0B3B2B] border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Supplier Specialties ({supplierSpecialties.length || 'All'})
            </button>
          </div>
        </div>

        {/* Supplier Specialty Selection Drawer */}
        {specialtyDrawerOpen && (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">
                  Relevant Supplier Category Routing
                </div>
                <div className="text-[11px] text-slate-500">
                  Select the Food (Hot/Cold Process), Machinery Function, or Packaging formats you supply so you only see and quote matching RFQs.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {supplierSpecialties.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0B3B2B] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchSpecialtiesOnly}
                      onChange={(e) => setMatchSpecialtiesOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Show Relevant RFQs Only</span>
                  </label>
                )}
                {supplierSpecialties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierSpecialties([]);
                      setMatchSpecialtiesOnly(false);
                      try {
                        window.localStorage.removeItem(specialtyStorageKey);
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {RFQ_CATEGORY_TREE.map((root) => (
                <div key={root.type} className="bg-white border border-slate-200 rounded p-2.5 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-800 border-b border-slate-100 pb-1">
                    {root.label} · {root.drillLabel}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SUPPLIER_SPECIALTY_OPTIONS.filter(
                      (s) => s.requestType === root.type
                    ).map((spec) => {
                      const active = supplierSpecialties.includes(spec.id);
                      return (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => toggleSpecialty(spec.id)}
                          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors text-left ${
                            active
                              ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {spec.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Split Workspace: Category Tree + RFQ List (5 cols) & Quotation Detail/Matrix (7 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: 1-Click Track & Process Selector + Contextual Subcategory Tree + RFQ Feed */}
        <div className="xl:col-span-5 space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-[#0B3B2B]" />
                Quick Process &amp; Category Filter
              </span>
              {(typeFilter !== 'all' || groupFilter !== 'ALL' || processFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setGroupFilter('ALL');
                    setProcessFilter('all');
                  }}
                  className="text-[11px] text-orange-600 hover:underline"
                >
                  Reset filter
                </button>
              )}
            </div>

            {/* 1-Click Track & Process Switch */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setProcessFilter('all');
                  setGroupFilter('ALL');
                }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('ingredient');
                  setProcessFilter('hot');
                  setGroupFilter('ALL');
                }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  typeFilter === 'ingredient' && processFilter === 'hot'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Hot Food
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('ingredient');
                  setProcessFilter('cold');
                  setGroupFilter('ALL');
                }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  typeFilter === 'ingredient' && processFilter === 'cold'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Cold Food
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('machinery');
                  setProcessFilter('all');
                  setGroupFilter('ALL');
                }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  typeFilter === 'machinery'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Machinery
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('packaging');
                  setProcessFilter('all');
                  setGroupFilter('ALL');
                }}
                className={`px-2 py-1.5 text-[11px] font-semibold rounded border whitespace-nowrap transition-colors ${
                  typeFilter === 'packaging'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Packaging
              </button>
            </div>

            {/* Keep subcategory wall collapsed when 'All' is active to prevent clutter */}
            {typeFilter === 'all' && !showAllSubcategories ? (
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                <span>Select a track above to filter subcategories.</span>
                <button
                  type="button"
                  onClick={() => setShowAllSubcategories(true)}
                  className="font-medium text-[#0B3B2B] hover:underline whitespace-nowrap"
                >
                  Browse all
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-slate-100 max-h-40 overflow-y-auto pr-0.5">
                {typeFilter === 'all' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAllSubcategories(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      Collapse subcategories
                    </button>
                  </div>
                )}
                {typeFilter === 'ingredient' && processFilter !== 'all' && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      Showing {processFilter === 'hot' ? 'Hot Process' : 'Cold Process'} food categories
                    </span>
                    <button
                      type="button"
                      onClick={() => setProcessFilter('all')}
                      className="text-[#0B3B2B] font-medium hover:underline"
                    >
                      Show both Hot &amp; Cold
                    </button>
                  </div>
                )}
                {RFQ_CATEGORY_TREE.filter(
                  (r) => typeFilter === 'all' || r.type === typeFilter
                ).map((root) => (
                  <div key={root.type} className="space-y-1">
                    {typeFilter === 'all' && (
                      <div className="text-[10px] font-semibold text-slate-500">
                        {root.label} · {root.drillLabel}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {root.groups
                        .filter(
                          (grp) =>
                            root.type !== 'ingredient' ||
                            processFilter === 'all' ||
                            grp.processScope === processFilter
                        )
                        .map((grp) => {
                          const active = groupFilter === grp.name;
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() => {
                                if (typeFilter === 'all') setTypeFilter(root.type);
                                setGroupFilter(active ? 'ALL' : grp.name);
                              }}
                              className={`px-2 py-1 text-[11px] rounded border transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {grp.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RFQ List */}
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {filteredRfqs.length === 0 ? (
              <div className="p-8 text-center space-y-2.5">
                <Package className="w-7 h-7 text-slate-300 mx-auto" />
                <div className="text-sm font-semibold text-slate-800">
                  No quotation requests match this filter
                </div>
                <p className="text-xs text-slate-500">
                  Reset filters to view all RFQs or post a new Alibaba-format quotation request.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(typeFilter !== 'all' || groupFilter !== 'ALL' || processFilter !== 'all' || searchTerm.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setTypeFilter('all');
                        setProcessFilter('all');
                        setGroupFilter('ALL');
                        setSearchTerm('');
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                    >
                      Show All RFQs
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLocalPrefill(null);
                      setRfqModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Post RFQ
                  </button>
                </div>
              </div>
            ) : (
              filteredRfqs.map((rfq) => {
                const rfqQuotes = quotesByRfq.get(rfq.id) || [];
                const active = selectedRfq?.id === rfq.id;
                const lowest =
                  rfqQuotes.length > 0 ? rfqQuotes[0].quotedUnitPriceKwd : null;
                return (
                  <div
                    key={rfq.id}
                    onClick={() => setSelectedRfqId(rfq.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedRfqId(rfq.id);
                    }}
                    className={`p-3.5 cursor-pointer transition-colors space-y-1.5 ${
                      active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">
                            {rfq.rfqCode}
                          </span>
                          <span>·</span>
                          <span className="capitalize">{rfq.requestType}</span>
                          <span>·</span>
                          <span className={`font-semibold capitalize ${STATUS_TEXT_COLORS[rfq.status] || 'text-slate-600'}`}>
                            {rfq.status}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 truncate mt-0.5">
                          {rfq.itemName}
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-xs font-bold text-slate-900">
                          {rfq.quantity} {rfq.unit}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rfqQuotes.length} quote{rfqQuotes.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 truncate">
                      {rfq.categoryPath}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1">
                      <span>
                        {rfq.tradeTerms} · {rfq.deliveryCity}
                        {rfq.sourceRecipeName ? ` · For ${rfq.sourceRecipeName}` : ''}
                      </span>
                      {lowest !== null && (
                        <span className="font-mono tabular-nums font-semibold text-emerald-700">
                          Best: {formatKwd(lowest)}/{rfq.unit}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Alibaba RFQ Spec + Multi-Supplier Quote Matrix */}
        <div className="xl:col-span-7">
          {!selectedRfq ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-xs text-slate-500">
              Select an RFQ on the left to inspect Alibaba-format trade specifications and compare supplier quotations.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* RFQ Banner */}
              <div className="p-5 border-b border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-800">
                        {selectedRfq.rfqCode}
                      </span>
                      <span>·</span>
                      <span className="capitalize">{selectedRfq.requestType}</span>
                      <span>·</span>
                      <span className={`font-semibold capitalize ${STATUS_TEXT_COLORS[selectedRfq.status] || 'text-slate-700'}`}>
                        {selectedRfq.status}
                      </span>
                      {selectedRfq.sourceRecipeName && (
                        <>
                          <span>·</span>
                          <span>Recipe: {selectedRfq.sourceRecipeName}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedRfq.itemName}
                    </h3>
                    <div className="text-xs text-slate-500">
                      Category: {selectedRfq.categoryPath}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Targeted Suppliers Only: {getSupplierTargetLabel(selectedRfq.categoryPath, selectedRfq.requestType)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(selectedRfq.status === 'open' || selectedRfq.status === 'quoted') && (
                      <button
                        type="button"
                        onClick={() => openSubmitQuoteModal(selectedRfq)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        Submit Supplier Quote
                      </button>
                    )}

                    {(selectedRfq.buyerUid === uid || isAdmin) &&
                      selectedRfq.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={() => closeSupplierRfq(selectedRfq.id)}
                          className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                        >
                          Close RFQ
                        </button>
                      )}

                    {(selectedRfq.buyerUid === uid || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => deleteSupplierRfq(selectedRfq.id)}
                        title="Delete RFQ"
                        className="p-2 text-slate-400 hover:text-red-600 border border-slate-200 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Structured Alibaba Trade Spec Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500">Required Qty</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900">
                      {selectedRfq.quantity} {selectedRfq.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Target Budget</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900">
                      {selectedRfq.targetUnitPriceKwd > 0
                        ? `${formatKwd(selectedRfq.targetUnitPriceKwd)}/${selectedRfq.unit}`
                        : 'Open Market Quote'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Trade &amp; Payment</div>
                    <div className="font-medium text-slate-800">
                      {selectedRfq.tradeTerms} · {selectedRfq.paymentTerms}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Delivery &amp; Deadline</div>
                    <div className="font-mono tabular-nums text-slate-800">
                      {selectedRfq.deliveryCity} · {selectedRfq.neededByDate || 'ASAP'}
                    </div>
                  </div>
                </div>

                {(selectedRfq.specifications || selectedRfq.certifications.length > 0) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1.5">
                    <div className="font-semibold text-slate-800">
                      Technical Specifications &amp; Compliance
                    </div>
                    <p className="text-slate-600 whitespace-pre-wrap">
                      {selectedRfq.specifications || 'Standard commercial food-grade specification.'}
                    </p>
                    {selectedRfq.certifications.length > 0 && (
                      <div className="text-[11px] text-slate-500 pt-1">
                        Required Certs:{' '}
                        <span className="font-semibold text-slate-700">
                          {selectedRfq.certifications.join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Competitive Quotes Matrix */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Supplier Quotations Received ({selectedQuotes.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Sorted lowest unit price first
                  </span>
                </div>

                {selectedQuotes.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-md p-6 text-center space-y-2">
                    <Building2 className="w-6 h-6 text-slate-300 mx-auto" />
                    <div className="text-xs font-semibold text-slate-700">
                      Awaiting supplier quotation responses
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Suppliers reviewing this RFQ can submit competitive pricing, MOQ, lead time, and delivery terms using the button above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedQuotes.map((q) => {
                      const estOrderQty = Math.max(selectedRfq.quantity, q.moqQty);
                      const estTotal = estOrderQty * q.quotedUnitPriceKwd;
                      const isBuyer = selectedRfq.buyerUid === uid || isAdmin;
                      const isSupplier = q.supplierUid === uid;
                      const isAccepted = q.status === 'accepted';

                      return (
                        <div
                          key={q.id}
                          className={`border rounded-md p-3.5 space-y-2.5 ${
                            isAccepted
                              ? 'border-emerald-300 bg-emerald-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {q.supplierCompany}
                                </span>
                                <span className="text-xs text-slate-500">
                                  · {q.originCountry}
                                </span>
                                <span
                                  className={`text-xs font-semibold capitalize ${
                                    STATUS_TEXT_COLORS[q.status] || 'text-slate-600'
                                  }`}
                                >
                                  · {q.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Rep: {q.supplierContact || 'Sales Desk'} · {q.shippingTerms} · {q.paymentTerms}
                              </div>
                            </div>

                            <div className="text-right font-mono tabular-nums shrink-0">
                              <div className="text-sm font-bold text-[#0B3B2B]">
                                {formatKwd(q.quotedUnitPriceKwd)} / {selectedRfq.unit}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Est. Total: {formatKwd(estTotal)}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 border border-slate-100 rounded p-2 font-mono tabular-nums">
                            <div>
                              <span className="text-slate-500 font-sans">MOQ: </span>
                              <span className="font-semibold text-slate-800">
                                {q.moqQty} {q.moqUnit}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-sans">Lead Time: </span>
                              <span className="font-semibold text-slate-800">
                                {q.leadTimeDays} days
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-sans">Valid Until: </span>
                              <span className="font-semibold text-slate-800">
                                {q.validUntilDate || '—'}
                              </span>
                            </div>
                            <div className="font-sans truncate">
                              <span className="text-slate-500">Spec: </span>
                              <span className="font-medium text-slate-800">
                                {q.warrantyOrShelfLife || 'Standard'}
                              </span>
                            </div>
                          </div>

                          {q.notes && (
                            <p className="text-xs text-slate-600">{q.notes}</p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {isBuyer &&
                                selectedRfq.status !== 'awarded' &&
                                q.status !== 'declined' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleAwardQuote(selectedRfq, q)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded whitespace-nowrap"
                                    >
                                      <Award className="w-3.5 h-3.5" />
                                      Accept &amp; Award
                                    </button>
                                    {q.status !== 'shortlisted' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQuoteReviewStatus(q.id, 'shortlisted')
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                                      >
                                        <Check className="w-3 h-3" />
                                        Shortlist
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setQuoteReviewStatus(q.id, 'declined')
                                      }
                                      className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 whitespace-nowrap"
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}

                              {isAccepted && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleCreatePo(selectedRfq, q)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded whitespace-nowrap"
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                    Create Purchase Order
                                  </button>
                                  {selectedRfq.requestType !== 'machinery' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSyncToLibrary(selectedRfq, q)
                                      }
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 whitespace-nowrap"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Add Price to Library
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            {isSupplier &&
                              (q.status === 'submitted' ||
                                q.status === 'shortlisted') && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditQuoteModal(selectedRfq, q)
                                  }
                                  className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                                >
                                  Revise Quote
                                </button>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post RFQ Modal */}
      {rfqModalOpen && (
        <SupplierRfqModal
          buyerUid={uid}
          buyerName={userName}
          prefill={localPrefill}
          recentRfqNames={rfqs.map((r) => r.itemName)}
          onClose={() => {
            setRfqModalOpen(false);
            setLocalPrefill(null);
            onConsumePrefill?.();
          }}
          onCreated={() => {
            setViewMode('my-rfqs');
          }}
          onNotify={onNotify}
        />
      )}

      {/* Submit / Revise Supplier Quote Modal */}
      {quotingRfq && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setQuotingRfq(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white border border-slate-300 rounded-lg max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#08291E] text-white px-5 py-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono text-emerald-300">
                  {quotingRfq.rfqCode} · Buyer Request: {quotingRfq.quantity} {quotingRfq.unit}
                </div>
                <h3 className="text-sm font-bold">
                  {editingQuote ? 'Revise Supplier Quotation' : 'Submit Supplier Quotation'}: {quotingRfq.itemName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuotingRfq(null)}
                className="p-1 text-emerald-100 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmSubmitQuote}
              className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supplier Company Name *
                  </label>
                  <input
                    type="text"
                    value={supplierCompany}
                    onChange={(e) => setSupplierCompany(e.target.value)}
                    placeholder="e.g. Gulf Dairy Imports WLL"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Origin Country / Hub
                  </label>
                  <input
                    type="text"
                    value={originCountry}
                    onChange={(e) => setOriginCountry(e.target.value)}
                    placeholder="e.g. Kuwait / UAE / Italy"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Unit Price (KWD/{quotingRfq.unit}) *
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={quotedUnitPriceKwd}
                    onChange={(e) => setQuotedUnitPriceKwd(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    MOQ Qty
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={moqQty}
                    onChange={(e) => setMoqQty(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    MOQ Unit
                  </label>
                  <input
                    type="text"
                    value={moqUnit}
                    onChange={(e) => setMoqUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Shipping Terms
                  </label>
                  <input
                    type="text"
                    value={shippingTerms}
                    onChange={(e) => setShippingTerms(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Quote Valid Until
                  </label>
                  <input
                    type="date"
                    value={validUntilDate}
                    onChange={(e) => setValidUntilDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sales Contact Person
                  </label>
                  <input
                    type="text"
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Warranty / Shelf-Life Guarantee
                  </label>
                  <input
                    type="text"
                    value={warrantyOrShelfLife}
                    onChange={(e) => setWarrantyOrShelfLife(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Brand, Spec Compliance &amp; Remarks
                </label>
                <textarea
                  rows={3}
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  placeholder="Include brand name, COA/Halal certificate availability, installation or sample details..."
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuotingRfq(null)}
                  className="px-3.5 py-2 font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
                >
                  {submittingQuote
                    ? 'Submitting...'
                    : editingQuote
                    ? 'Save Revised Quote'
                    : 'Submit Supplier Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
