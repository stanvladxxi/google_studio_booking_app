import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FolderCog,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  IngredientLibraryDoc,
  MaterialOrder,
  Product,
  RawMaterial,
  RecipeVersion,
} from '../../../types';
import { SUPPLIER_OPTIONS } from '../data/ingredientLibrarySeed';
import {
  BuilderDraftState,
  InvoiceExtractedLine,
  LibraryIngredient,
} from '../types';
import {
  downloadGoodsReceivedTemplate,
  effectiveCostKg,
  effectiveCostPerUnit,
  formatKwd,
  formatWeightText,
  guessLibraryMatch,
  isPackagingItem,
  isPieceOrCountStock,
  parseCsvSimple,
  rawCostKg,
  scanInvoiceViaApi,
} from '../utils/formulationEngine';
import {
  MergedLibraryState,
  batchDeductRecipeFromStock,
  renameCategoryAcrossLibrary,
  saveIngredientLibraryItem,
  softDeleteIngredientLibraryItem,
} from '../utils/libraryPersistence';
import { EditIngredientModal } from './IngredientModals';

interface EnCuisineInventoryTabProps {
  uid: string;
  userName: string;
  readOnly: boolean;
  draft: BuilderDraftState;
  mergedLibrary: MergedLibraryState;
  ingredientDocsByIngredientId: Map<string, IngredientLibraryDoc>;
  products: Product[];
  recipeVersions: RecipeVersion[];
  materials: RawMaterial[];
  materialOrders: MaterialOrder[];
  localCustomCategories: string[];
  onChangeLocalCategories: (cats: string[]) => void;
  onOpenMaterialsOrders?: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

interface ParsedCsvStockRow {
  selected: boolean;
  rawName: string;
  matchedId: string;
  qty: number;
  unit: 'kg' | 'g' | 'pcs';
  costPaid: number;
  supplier: string;
}

interface InvoiceReviewRow {
  selected: boolean;
  rawName: string;
  matchedId: string;
  qty: number;
  unit: 'kg' | 'g' | 'pcs';
  costPaid: number;
}

export function EnCuisineInventoryTab({
  uid,
  userName,
  readOnly,
  draft,
  mergedLibrary,
  ingredientDocsByIngredientId,
  recipeVersions,
  materials,
  materialOrders,
  localCustomCategories,
  onChangeLocalCategories,
  onOpenMaterialsOrders,
  onNotify,
}: EnCuisineInventoryTabProps) {
  const { library, libraryById, categories, stockMap, historyMap } = mergedLibrary;

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Add Stock Modal
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addCatMode, setAddCatMode] = useState<'existing' | 'new'>('existing');
  const [addCatExisting, setAddCatExisting] = useState(categories[0] || 'Flours');
  const [addCatNew, setAddCatNew] = useState('');
  const [addIngMode, setAddIngMode] = useState<'existing' | 'new'>('existing');
  const [addIngId, setAddIngId] = useState('');
  const [addIngNewName, setAddIngNewName] = useState('');
  const [addQty, setAddQty] = useState(50);
  const [addUnit, setAddUnit] = useState<'kg' | 'g' | 'pcs'>('kg');
  const [addTotalCost, setAddTotalCost] = useState(4.5);
  const [addSupplier, setAddSupplier] = useState(SUPPLIER_OPTIONS[4] || 'Kuwait Flour Mills');
  const [savingAddStock, setSavingAddStock] = useState(false);

  // CSV Goods Received Modal
  const csvFileRef = useRef<HTMLInputElement | null>(null);
  const [csvRows, setCsvRows] = useState<ParsedCsvStockRow[] | null>(null);
  const [savingCsv, setSavingCsv] = useState(false);

  // AI Invoice Scan Modal
  const invoiceFileRef = useRef<HTMLInputElement | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scanningInvoice, setScanningInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceRows, setInvoiceRows] = useState<InvoiceReviewRow[]>([]);
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Deduct Current Recipe Modal
  const [deductOpen, setDeductOpen] = useState(false);
  const [deductMult, setDeductMult] = useState(1);
  const [savingDeduct, setSavingDeduct] = useState(false);

  // Adjust Stock + History Modal
  const [adjustTarget, setAdjustTarget] = useState<LibraryIngredient | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Manage Categories & Ingredients Drawer
  const [manageOpen, setManageOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [renameTargetCat, setRenameTargetCat] = useState<string | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryIngredient | null>(null);
  const [showFacilityLots, setShowFacilityLots] = useState(false);

  // Metrics
  const summary = useMemo(() => {
    let trackedCount = 0;
    let totalValueKwd = 0;
    for (const item of library) {
      const q = stockMap.get(item.id) || 0;
      if (q > 0) {
        trackedCount++;
        totalValueKwd += isPieceOrCountStock(item)
          ? item.costUnit === 'piece'
            ? ((item.pieceWeightG || 50) / 1000) * effectiveCostKg(item) * q
            : effectiveCostPerUnit(item) * q
          : (rawCostKg(item) / 1000) * q;
      }
    }
    let shortfallCount = 0;
    for (const line of draft.items) {
      const q = stockMap.get(line.id) || 0;
      if (q < line.g) shortfallCount++;
    }
    return { trackedCount, totalValueKwd, shortfallCount };
  }, [library, stockMap, draft.items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((item) => {
      const stock = stockMap.get(item.id) || 0;
      if (inStockOnly && stock <= 0) return false;
      if (filterCat !== 'ALL' && item.cat !== filterCat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.cat.toLowerCase().includes(q)
      );
    });
  }, [library, stockMap, inStockOnly, filterCat, search]);

  const categoryItemsForAdd = useMemo(() => {
    const targetCat = addCatMode === 'new' ? addCatNew.trim() : addCatExisting;
    return library.filter((i) => i.cat === targetCat);
  }, [library, addCatMode, addCatExisting, addCatNew]);

  const handleOpenAddStock = () => {
    const defaultCat = categories[0] || 'Flours';
    setAddCatMode('existing');
    setAddCatExisting(defaultCat);
    setAddCatNew('');
    const firstItem = library.find((i) => i.cat === defaultCat);
    setAddIngMode(firstItem ? 'existing' : 'new');
    setAddIngId(firstItem?.id || '');
    setAddIngNewName('');
    setAddQty(50);
    setAddUnit('kg');
    setAddTotalCost(4.5);
    setAddStockOpen(true);
  };

  const handleSaveAddStock = async () => {
    const cat =
      addCatMode === 'new' ? addCatNew.trim() : addCatExisting.trim();
    if (!cat) {
      onNotify('Category name is required.', 'error');
      return;
    }
    if (addCatMode === 'new' && !categories.includes(cat)) {
      onChangeLocalCategories([...localCustomCategories, cat]);
    }
    if (addQty <= 0) {
      onNotify('Received quantity must be greater than zero.', 'error');
      return;
    }
    setSavingAddStock(true);
    try {
      let targetItem: LibraryIngredient | undefined =
        addIngMode === 'existing' ? libraryById.get(addIngId) : undefined;
      if (!targetItem) {
        const cleanName = addIngNewName.trim();
        if (!cleanName) {
          onNotify('Enter an ingredient name.', 'error');
          setSavingAddStock(false);
          return;
        }
        const slug = cleanName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 26);
        targetItem = {
          id: `custom_${slug || 'ing'}_${Math.floor(100 + Math.random() * 899)}`,
          name: cleanName,
          cat,
          custom: true,
          vegan: true,
          allergens: [],
          costUnit: addUnit === 'pcs' ? 'unit' : undefined,
          costKg:
            addUnit === 'kg'
              ? Number((addTotalCost / addQty).toFixed(4))
              : addUnit === 'g'
              ? Number((addTotalCost / (addQty / 1000)).toFixed(4))
              : 0,
          costPerUnit:
            addUnit === 'pcs'
              ? Number((addTotalCost / addQty).toFixed(4))
              : undefined,
          bulkQty: addUnit !== 'pcs' ? addQty : undefined,
          bulkUnit: addUnit !== 'pcs' ? (addUnit as 'kg' | 'g') : undefined,
          bulkUnitQty: addUnit === 'pcs' ? addQty : undefined,
          bulkCost: addTotalCost,
          bulkCurrency: 'KWD',
          kcal: 0,
          fat: 0,
          satFat: 0,
          sugar: 0,
          protein: 0,
          carbs: 0,
          note: `Added via Stock Log (${addSupplier})`,
        };
      } else if (addTotalCost > 0) {
        // Update bulk KWD unit cost automatically (e.g. 50kg @ 4.5 KWD -> 0.090 KWD/kg)
        if (addUnit === 'pcs') {
          if (targetItem.costUnit === 'piece') {
            const totalKg = (addQty * (targetItem.pieceWeightG || 50)) / 1000;
            targetItem = {
              ...targetItem,
              costKg: totalKg > 0 ? Number((addTotalCost / totalKg).toFixed(4)) : targetItem.costKg,
              bulkPieces: addQty,
              bulkCost: addTotalCost,
            };
          } else {
            targetItem = {
              ...targetItem,
              costUnit: 'unit',
              costPerUnit: Number((addTotalCost / addQty).toFixed(4)),
              bulkUnitQty: addQty,
              bulkCost: addTotalCost,
            };
          }
        } else {
          const kg = addUnit === 'kg' ? addQty : addQty / 1000;
          targetItem = {
            ...targetItem,
            costKg: kg > 0 ? Number((addTotalCost / kg).toFixed(4)) : targetItem.costKg,
            bulkQty: addQty,
            bulkUnit: addUnit,
            bulkCost: addTotalCost,
          };
        }
      }

      const qtyInStockUnits =
        isPieceOrCountStock(targetItem) || addUnit === 'pcs'
          ? addQty
          : addUnit === 'kg'
          ? addQty * 1000
          : addQty;

      const currentStock = stockMap.get(targetItem.id) || 0;
      const currentHist = historyMap.get(targetItem.id) || [];
      await saveIngredientLibraryItem({
        uid,
        userName,
        item: targetItem,
        stockQty: currentStock + qtyInStockUnits,
        history: [
          ...currentHist,
          {
            date: new Date().toISOString(),
            type: 'received',
            qty: qtyInStockUnits,
            note: `Received ${addQty} ${addUnit} @ KWD ${addTotalCost.toFixed(3)} (${addSupplier})`,
          },
        ],
        existingDoc: ingredientDocsByIngredientId.get(targetItem.id),
        logMessage: `Logged stock: +${addQty} ${addUnit} of "${targetItem.name}" (KWD ${addTotalCost.toFixed(3)}).`,
      });
      setAddStockOpen(false);
      onNotify(`Logged +${addQty} ${addUnit} of "${targetItem.name}" & updated KWD unit rate.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to log stock.', 'error');
    } finally {
      setSavingAddStock(false);
    }
  };

  // Bulk Pricing Quick Preview inside Add Stock Modal
  const addDerivedPerKg = useMemo(() => {
    if (addQty <= 0) return 0;
    if (addUnit === 'kg') return addTotalCost / addQty;
    if (addUnit === 'g') return addTotalCost / (addQty / 1000);
    return addTotalCost / addQty;
  }, [addQty, addUnit, addTotalCost]);

  const handleCsvUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsvSimple(text);
      if (rows.length < 2) {
        onNotify('CSV requires a header row and at least one item row.', 'error');
        return;
      }
      const hdr = rows[0].map((h) => h.toLowerCase());
      const iName = hdr.findIndex((h) => h.includes('ingredient') || h.includes('item') || h.includes('name'));
      const iQty = hdr.findIndex((h) => h.includes('qty') || h.includes('quantity'));
      const iUnit = hdr.findIndex((h) => h.includes('unit'));
      const iCost = hdr.findIndex((h) => h.includes('cost') || h.includes('price'));
      const iSup = hdr.findIndex((h) => h.includes('supplier'));

      const parsed: ParsedCsvStockRow[] = [];
      for (const r of rows.slice(1)) {
        const rawName = (r[iName >= 0 ? iName : 0] || '').trim();
        if (!rawName) continue;
        const qty = parseFloat(r[iQty >= 0 ? iQty : 1] || '0') || 0;
        const rawUnit = (r[iUnit >= 0 ? iUnit : 2] || 'kg').trim().toLowerCase();
        const unit: 'kg' | 'g' | 'pcs' =
          rawUnit.startsWith('pc') || rawUnit.startsWith('unit')
            ? 'pcs'
            : rawUnit === 'g'
            ? 'g'
            : 'kg';
        const costPaid = parseFloat(r[iCost >= 0 ? iCost : 3] || '0') || 0;
        const supplier = (iSup >= 0 ? r[iSup] : '') || 'CSV Import';
        const matched = guessLibraryMatch(rawName, library);
        parsed.push({
          selected: Boolean(matched) && qty > 0,
          rawName,
          matchedId: matched?.id || '',
          qty,
          unit,
          costPaid,
          supplier,
        });
      }
      setCsvRows(parsed);
    } catch {
      onNotify('Unable to parse goods-received CSV file.', 'error');
    }
  };

  const applyStockBatchRows = async (rows: { matchedId: string; qty: number; unit: 'kg' | 'g' | 'pcs'; costPaid: number; note: string }[]) => {
    let saved = 0;
    for (const r of rows) {
      const lib = libraryById.get(r.matchedId);
      if (!lib || r.qty <= 0) continue;
      let updatedLib = lib;
      if (r.costPaid > 0) {
        if (r.unit === 'pcs' || isPieceOrCountStock(lib)) {
          if (lib.costUnit === 'piece') {
            const kg = (r.qty * (lib.pieceWeightG || 50)) / 1000;
            if (kg > 0) updatedLib = { ...lib, costKg: Number((r.costPaid / kg).toFixed(4)) };
          } else {
            updatedLib = { ...lib, costPerUnit: Number((r.costPaid / r.qty).toFixed(4)) };
          }
        } else {
          const kg = r.unit === 'kg' ? r.qty : r.qty / 1000;
          if (kg > 0) updatedLib = { ...lib, costKg: Number((r.costPaid / kg).toFixed(4)) };
        }
      }
      const stockAdd =
        r.unit === 'pcs' || isPieceOrCountStock(lib)
          ? r.qty
          : r.unit === 'kg'
          ? r.qty * 1000
          : r.qty;
      const curStock = stockMap.get(lib.id) || 0;
      const curHist = historyMap.get(lib.id) || [];
      await saveIngredientLibraryItem({
        uid,
        userName,
        item: updatedLib,
        stockQty: curStock + stockAdd,
        history: [
          ...curHist,
          {
            date: new Date().toISOString(),
            type: 'received',
            qty: stockAdd,
            note: r.note,
          },
        ],
        existingDoc: ingredientDocsByIngredientId.get(lib.id),
      });
      saved++;
    }
    return saved;
  };

  const handleCommitCsv = async () => {
    if (!csvRows) return;
    setSavingCsv(true);
    try {
      const chosen = csvRows.filter((r) => r.selected && r.matchedId);
      const count = await applyStockBatchRows(
        chosen.map((r) => ({
          matchedId: r.matchedId,
          qty: r.qty,
          unit: r.unit,
          costPaid: r.costPaid,
          note: `CSV Goods Received (${r.supplier}): ${r.qty} ${r.unit} @ KWD ${r.costPaid.toFixed(3)}`,
        }))
      );
      setCsvRows(null);
      onNotify(`Imported ${count} stock line${count === 1 ? '' : 's'} into Firestore inventory.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'CSV import failed.', 'error');
    } finally {
      setSavingCsv(false);
    }
  };

  const handleInvoiceImageSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanningInvoice(true);
    setInvoiceError('');
    setInvoiceRows([]);
    try {
      const extracted: InvoiceExtractedLine[] = await scanInvoiceViaApi(file);
      if (extracted.length === 0) {
        setInvoiceError('No ingredient line items were detected on this invoice.');
      } else {
        setInvoiceRows(
          extracted.map((line) => {
            const match = guessLibraryMatch(line.name, library);
            return {
              selected: Boolean(match),
              rawName: line.name,
              matchedId: match?.id || '',
              qty: Number(line.qty) || 0,
              unit: line.unit || 'kg',
              costPaid: Number(line.cost) || 0,
            };
          })
        );
      }
    } catch (err) {
      setInvoiceError(
        err instanceof Error
          ? err.message
          : 'AI invoice scan failed. Verify GEMINI_API_KEY on server.'
      );
    } finally {
      setScanningInvoice(false);
    }
  };

  const handleCommitInvoice = async () => {
    setSavingInvoice(true);
    try {
      const chosen = invoiceRows.filter((r) => r.selected && r.matchedId);
      const count = await applyStockBatchRows(
        chosen.map((r) => ({
          matchedId: r.matchedId,
          qty: r.qty,
          unit: r.unit,
          costPaid: r.costPaid,
          note: `AI Invoice Scan: ${r.rawName} (${r.qty} ${r.unit} @ KWD ${r.costPaid.toFixed(3)})`,
        }))
      );
      setInvoiceOpen(false);
      setInvoiceRows([]);
      onNotify(`Saved ${count} scanned invoice line${count === 1 ? '' : 's'} to inventory.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save invoice rows.', 'error');
    } finally {
      setSavingInvoice(false);
    }
  };

  const deductPreview = useMemo(() => {
    return draft.items
      .map((line) => {
        const item = libraryById.get(line.id);
        if (!item) return null;
        const need = line.g * deductMult;
        const have = stockMap.get(line.id) || 0;
        return { item, need, have, after: have - need };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [draft.items, deductMult, libraryById, stockMap]);

  const handleConfirmDeduct = async () => {
    if (deductPreview.length === 0) return;
    setSavingDeduct(true);
    try {
      await batchDeductRecipeFromStock({
        uid,
        userName,
        recipeName: `${draft.name || 'Draft'} (×${deductMult})`,
        deductions: deductPreview.map((d) => ({
          item: d.item,
          deductQty: d.need,
          currentStock: d.have,
          currentHistory: historyMap.get(d.item.id) || [],
          existingDoc: ingredientDocsByIngredientId.get(d.item.id),
        })),
      });
      setDeductOpen(false);
      onNotify(`Deducted ×${deductMult} batch of "${draft.name}" from stock.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Deduction failed.', 'error');
    } finally {
      setSavingDeduct(false);
    }
  };

  const handleQuickReorder = async (item: LibraryIngredient) => {
    const qtyAdd = isPieceOrCountStock(item)
      ? item.bulkUnitQty || item.bulkPieces || 50
      : (item.bulkQty ? (item.bulkUnit === 'g' ? item.bulkQty : item.bulkQty * 1000) : 5000);
    const curStock = stockMap.get(item.id) || 0;
    const curHist = historyMap.get(item.id) || [];
    try {
      await saveIngredientLibraryItem({
        uid,
        userName,
        item,
        stockQty: curStock + qtyAdd,
        history: [
          ...curHist,
          {
            date: new Date().toISOString(),
            type: 'received',
            qty: qtyAdd,
            note: `Quick reorder restock`,
          },
        ],
        existingDoc: ingredientDocsByIngredientId.get(item.id),
      });
      onNotify(
        `Reordered +${isPieceOrCountStock(item) ? `${qtyAdd} pcs` : formatWeightText(qtyAdd)} of "${item.name}".`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Reorder failed.', 'error');
    }
  };

  const handleCommitAdjust = async () => {
    if (!adjustTarget) return;
    setSavingAdjust(true);
    try {
      const cur = stockMap.get(adjustTarget.id) || 0;
      const next = Math.max(0, cur + adjustDelta);
      const hist = historyMap.get(adjustTarget.id) || [];
      await saveIngredientLibraryItem({
        uid,
        userName,
        item: adjustTarget,
        stockQty: next,
        history: [
          ...hist,
          {
            date: new Date().toISOString(),
            type: 'adjusted',
            qty: Math.abs(adjustDelta),
            note: adjustNote.trim() || `Manual stock adjustment (${adjustDelta >= 0 ? '+' : ''}${adjustDelta})`,
          },
        ],
        existingDoc: ingredientDocsByIngredientId.get(adjustTarget.id),
      });
      setAdjustTarget(null);
      onNotify(`Adjusted stock for "${adjustTarget.name}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Adjustment failed.', 'error');
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleCreateCustomCategory = () => {
    const clean = newCatInput.trim();
    if (!clean) return;
    if (categories.includes(clean)) {
      onNotify(`Category "${clean}" already exists.`, 'error');
      return;
    }
    onChangeLocalCategories([...localCustomCategories, clean]);
    setNewCatInput('');
    onNotify(`Created category "${clean}".`);
  };

  const handleCommitRenameCategory = async () => {
    if (!renameTargetCat || !renameNewName.trim() || renameNewName.trim() === renameTargetCat) {
      setRenameTargetCat(null);
      return;
    }
    const oldName = renameTargetCat;
    const nextName = renameNewName.trim();
    const itemsInCat = library.filter((i) => i.cat === oldName);
    try {
      await renameCategoryAcrossLibrary({
        uid,
        oldName,
        newName: nextName,
        itemsInCategory: itemsInCat,
        existingDocsByIngredientId: ingredientDocsByIngredientId,
        stockMap,
        historyMap,
      });
      if (localCustomCategories.includes(oldName)) {
        onChangeLocalCategories(
          localCustomCategories.map((c) => (c === oldName ? nextName : c))
        );
      } else {
        onChangeLocalCategories([...localCustomCategories, nextName]);
      }
      setRenameTargetCat(null);
      onNotify(`Renamed category "${oldName}" → "${nextName}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Category rename failed.', 'error');
    }
  };

  const handleSoftDeleteIngredient = async (item: LibraryIngredient) => {
    const usedInDraft = draft.items.some((l) => l.id === item.id);
    const usedInVersions = recipeVersions.some((v) =>
      v.ingredients.some((i) => i.ingredientId === item.id || i.name === item.name)
    );
    if (usedInDraft || usedInVersions) {
      onNotify(
        `Cannot delete "${item.name}" — it is used in the active draft or a saved version.`,
        'error'
      );
      return;
    }
    try {
      await softDeleteIngredientLibraryItem({
        uid,
        item,
        existingDoc: ingredientDocsByIngredientId.get(item.id),
      });
      onNotify(`Removed "${item.name}" from active library.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Header Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Ingredients In Stock
          </div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 mt-1">
            {summary.trackedCount}{' '}
            <span className="text-xs font-normal text-slate-400">/ {library.length}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Stock Valuation
          </div>
          <div className="text-2xl font-mono tabular-nums font-bold text-[#0B3B2B] mt-1">
            {formatKwd(summary.totalValueKwd)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Draft Batch Shortfalls
          </div>
          <div className="text-2xl font-mono tabular-nums font-bold text-orange-700 mt-1">
            {summary.shortfallCount} lines
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Active Purchase Orders
          </div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 mt-1">
            {materialOrders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={handleOpenAddStock}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                + Add Stock / Bulk Pricing
              </button>
              <button
                type="button"
                onClick={() => csvFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Goods CSV
              </button>
              <button
                type="button"
                onClick={() => downloadGoodsReceivedTemplate()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                CSV Template
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvoiceError('');
                  setInvoiceRows([]);
                  setInvoiceOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5 text-orange-400" />
                Scan Invoice (Gemini AI)
              </button>
              <button
                type="button"
                onClick={() => setDeductOpen(true)}
                disabled={draft.items.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                <PackageMinus className="w-3.5 h-3.5 text-orange-600" />
                Deduct Recipe Batch
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setManageOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              <FolderCog className="w-3.5 h-3.5" />
              Manage Categories &amp; Items
            </button>
          )}
          {onOpenMaterialsOrders && (
            <button
              type="button"
              onClick={onOpenMaterialsOrders}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              Open POs &amp; Lots
            </button>
          )}
        </div>
        <input
          ref={csvFileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvUpload}
          className="hidden"
        />
      </div>

      {/* Manage Categories & Ingredients Sub-Drawer */}
      {manageOpen && !readOnly && (
        <div className="bg-white border border-slate-300 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Manage Categories &amp; Ingredient Catalog
            </h3>
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              placeholder="New category name (e.g. Arabic Pastries)..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md w-64"
            />
            <button
              type="button"
              onClick={handleCreateCustomCategory}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] rounded-md"
            >
              + Create Category
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {categories.map((cat) => {
              const count = library.filter((i) => i.cat === cat).length;
              return (
                <div
                  key={cat}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{cat}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-slate-500">({count})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTargetCat(cat);
                        setRenameNewName(cat);
                      }}
                      className="p-1 text-slate-500 hover:text-slate-900"
                      title="Rename category"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {count === 0 && localCustomCategories.includes(cat) && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeLocalCategories(
                            localCustomCategories.filter((c) => c !== cat)
                          )
                        }
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Remove empty category"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filter Row */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter inventory by name..."
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md w-56"
            />
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="accent-[#0B3B2B]"
              />
              In Stock Only
            </label>
          </div>
          <div className="text-xs font-mono text-slate-500">
            Showing {filteredItems.length} items
          </div>
        </div>

        {/* Main Inventory Table */}
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">Ingredient</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">On Hand</th>
                <th className="py-2.5 px-3 text-right">KWD Rate</th>
                <th className="py-2.5 px-3 text-right">Value (KWD)</th>
                {!readOnly && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item) => {
                const qty = stockMap.get(item.id) || 0;
                const countBased = isPieceOrCountStock(item);
                const pkg = isPackagingItem(item);
                const rate = pkg ? effectiveCostPerUnit(item) : rawCostKg(item);
                const val = countBased
                  ? item.costUnit === 'piece'
                    ? ((item.pieceWeightG || 50) / 1000) * effectiveCostKg(item) * qty
                    : effectiveCostPerUnit(item) * qty
                  : (rawCostKg(item) / 1000) * qty;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {item.name}
                      {item.wastagePct ? (
                        <span className="block font-mono text-[10px] font-normal text-amber-700">
                          {item.wastagePct}% trim loss (eff {effectiveCostKg(item).toFixed(3)}/kg)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.cat}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                      {qty > 0 ? (
                        <span className="text-[#0B3B2B]">
                          {countBased ? `${qty} pcs` : formatWeightText(qty)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {rate.toFixed(3)} /{pkg ? 'u' : 'kg'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {val.toFixed(3)}
                    </td>
                    {!readOnly && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickReorder(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#0B3B2B] border border-emerald-200 bg-emerald-50 rounded hover:bg-emerald-100"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reorder
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget(item);
                              setAdjustDelta(0);
                              setAdjustNote('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="p-1 text-slate-500 hover:text-slate-900 border border-slate-200 rounded"
                            title="Edit ingredient pricing"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {manageOpen && (
                            <button
                              type="button"
                              onClick={() => handleSoftDeleteIngredient(item)}
                              className="p-1 text-slate-400 hover:text-red-600 border border-slate-200 rounded"
                              title="Soft delete ingredient"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Host Facility Lots Collapsible */}
      {materials.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFacilityLots((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left bg-slate-50 hover:bg-slate-100"
          >
            <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#0B3B2B]" />
              Facility Raw Material Lots (rawMaterials · {materials.length})
            </span>
            {showFacilityLots ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>
          {showFacilityLots && (
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Lot Material</th>
                    <th className="py-2.5 px-4">Supplier</th>
                    <th className="py-2.5 px-4">Zone</th>
                    <th className="py-2.5 px-4 text-right">Quantity</th>
                    <th className="py-2.5 px-4 text-right">Unit Cost (KWD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {materials.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {m.name}
                        <span className="block font-mono text-[10px] text-slate-500">
                          {m.lotCode || 'Lot'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{m.supplier}</td>
                      <td className="py-2.5 px-4 text-slate-600">{m.storageZone}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {m.quantity} {m.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#0B3B2B]">
                        {formatKwd(m.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Stock & Bulk Pricing Modal */}
      {addStockOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Log Raw Material Stock &amp; Bulk KWD Pricing
                </h3>
                <p className="text-xs text-slate-500">
                  e.g. 50 kg for 4.500 KWD automatically computes 0.090 KWD/kg across all recipes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddStockOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Category
                  </label>
                  <select
                    value={addCatMode === 'new' ? '__new__' : addCatExisting}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setAddCatMode('new');
                        setAddIngMode('new');
                      } else {
                        setAddCatMode('existing');
                        setAddCatExisting(e.target.value);
                        const first = library.find((i) => i.cat === e.target.value);
                        setAddIngId(first?.id || '');
                        setAddIngMode(first ? 'existing' : 'new');
                      }
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-md bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__new__">+ New Category...</option>
                  </select>
                </div>
                {addCatMode === 'new' ? (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                      New Category Name
                    </label>
                    <input
                      type="text"
                      value={addCatNew}
                      onChange={(e) => setAddCatNew(e.target.value)}
                      placeholder="e.g. Spices & Saffron"
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                      Supplier
                    </label>
                    <input
                      type="text"
                      list="ec-inv-suppliers"
                      value={addSupplier}
                      onChange={(e) => setAddSupplier(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-md"
                    />
                    <datalist id="ec-inv-suppliers">
                      {SUPPLIER_OPTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Ingredient
                  </label>
                  <select
                    value={addIngMode === 'new' ? '__new__' : addIngId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setAddIngMode('new');
                      } else {
                        setAddIngMode('existing');
                        setAddIngId(e.target.value);
                      }
                    }}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-md bg-white"
                  >
                    {categoryItemsForAdd.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                    <option value="__new__">+ New Ingredient...</option>
                  </select>
                </div>
                {addIngMode === 'new' && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                      New Ingredient Name
                    </label>
                    <input
                      type="text"
                      value={addIngNewName}
                      onChange={(e) => setAddIngNewName(e.target.value)}
                      placeholder="e.g. Kashmiri Saffron"
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Quantity Received
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={addQty}
                    onChange={(e) => setAddQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Unit
                  </label>
                  <select
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value as 'kg' | 'g' | 'pcs')}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="pcs">pcs / units</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                    Bulk Cost Paid (KWD)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={addTotalCost}
                    onChange={(e) => setAddTotalCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 font-mono tabular-nums text-xs text-[#0B3B2B]">
                Derived unit rate:{' '}
                <span className="font-bold">
                  {addDerivedPerKg.toFixed(3)} KWD / {addUnit === 'pcs' ? 'pc' : 'kg'}
                </span>
                {addUnit !== 'pcs' && (
                  <span className="text-slate-600">
                    {' '}
                    ({(addDerivedPerKg / 1000).toFixed(5)} KWD/g)
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAddStockOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAddStock}
                onClick={handleSaveAddStock}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                {savingAddStock ? 'Logging...' : 'Log Stock & Update Price'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Goods Received Review Modal */}
      {csvRows && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Review Goods Received CSV ({csvRows.length} rows)
                </h3>
                <p className="text-xs text-slate-500">
                  Verify matched ingredients before updating stock &amp; unit KWD costs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCsvRows(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-md overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Save</th>
                    <th className="p-2 text-left">CSV Name</th>
                    <th className="p-2 text-left">Matched Library Item</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2 text-right">Cost KWD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {csvRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) =>
                            setCsvRows((prev) =>
                              prev
                                ? prev.map((r, i) =>
                                    i === idx ? { ...r, selected: e.target.checked } : r
                                  )
                                : null
                            )
                          }
                        />
                      </td>
                      <td className="p-2 font-medium text-slate-900">{row.rawName}</td>
                      <td className="p-2">
                        <select
                          value={row.matchedId}
                          onChange={(e) =>
                            setCsvRows((prev) =>
                              prev
                                ? prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          matchedId: e.target.value,
                                          selected: Boolean(e.target.value),
                                        }
                                      : r
                                  )
                                : null
                            )
                          }
                          className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          <option value="">-- Skip / Unmatched --</option>
                          {library.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right font-mono">{row.qty}</td>
                      <td className="p-2 font-mono">{row.unit}</td>
                      <td className="p-2 text-right font-mono">{row.costPaid.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCsvRows(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingCsv}
                onClick={handleCommitCsv}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B2B] rounded-md disabled:opacity-50"
              >
                {savingCsv ? 'Importing...' : 'Commit Stock Received'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini AI Invoice Scanner Modal */}
      {invoiceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  Scan Supplier Invoice (Server-Side Gemini AI)
                </h3>
                <p className="text-xs text-slate-500">
                  Upload a supplier receipt or invoice photo; review &amp; edit every line before saving to Firestore.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={scanningInvoice}
                onClick={() => invoiceFileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md disabled:opacity-50"
              >
                {scanningInvoice ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-orange-400" />
                )}
                {scanningInvoice ? 'Scanning Invoice with Gemini AI...' : 'Choose Invoice Photo'}
              </button>
              <input
                ref={invoiceFileRef}
                type="file"
                accept="image/*"
                onChange={handleInvoiceImageSelected}
                className="hidden"
              />
            </div>

            {invoiceError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium">
                {invoiceError}
              </div>
            )}

            {invoiceRows.length > 0 && (
              <div className="border border-slate-200 rounded-md overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                    <tr>
                      <th className="p-2">Save</th>
                      <th className="p-2 text-left">Extracted Item</th>
                      <th className="p-2 text-left">Map to Library</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2 text-right">Total Cost (KWD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoiceRows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) =>
                              setInvoiceRows((p) =>
                                p.map((x, i) =>
                                  i === idx ? { ...x, selected: e.target.checked } : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className="p-2 font-medium text-slate-900">{r.rawName}</td>
                        <td className="p-2">
                          <select
                            value={r.matchedId}
                            onChange={(e) =>
                              setInvoiceRows((p) =>
                                p.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        matchedId: e.target.value,
                                        selected: Boolean(e.target.value),
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                          >
                            <option value="">-- Unmatched --</option>
                            {library.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={r.qty}
                            onChange={(e) =>
                              setInvoiceRows((p) =>
                                p.map((x, i) =>
                                  i === idx ? { ...x, qty: parseFloat(e.target.value) || 0 } : x
                                )
                              )
                            }
                            className="w-20 px-2 py-1 text-right font-mono border border-slate-300 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={r.unit}
                            onChange={(e) =>
                              setInvoiceRows((p) =>
                                p.map((x, i) =>
                                  i === idx
                                    ? { ...x, unit: e.target.value as 'kg' | 'g' | 'pcs' }
                                    : x
                                )
                              )
                            }
                            className="px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                          >
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="pcs">pcs</option>
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            value={r.costPaid}
                            onChange={(e) =>
                              setInvoiceRows((p) =>
                                p.map((x, i) =>
                                  i === idx
                                    ? { ...x, costPaid: parseFloat(e.target.value) || 0 }
                                    : x
                                )
                              )
                            }
                            className="w-24 px-2 py-1 text-right font-mono border border-slate-300 rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setInvoiceOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Close
              </button>
              {invoiceRows.length > 0 && (
                <button
                  type="button"
                  disabled={savingInvoice}
                  onClick={handleCommitInvoice}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
                >
                  {savingInvoice ? 'Saving...' : 'Save Selected Lines to Inventory'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deduct Recipe Batch Modal */}
      {deductOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Deduct Production Batch — {draft.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Consumes active builder ingredients from Firestore stock with movement audit logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeductOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="font-semibold text-slate-700">Batches Produced:</label>
              <input
                type="number"
                min={1}
                max={100}
                value={deductMult}
                onChange={(e) => setDeductMult(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 px-2.5 py-1.5 font-mono border border-slate-300 rounded-md"
              />
            </div>

            <div className="border border-slate-200 rounded-md max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="p-2 text-left">Ingredient</th>
                    <th className="p-2 text-right">To Deduct</th>
                    <th className="p-2 text-right">On Hand</th>
                    <th className="p-2 text-right">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {deductPreview.map((d) => {
                    const cnt = isPieceOrCountStock(d.item);
                    return (
                      <tr key={d.item.id}>
                        <td className="p-2 font-medium text-slate-900">{d.item.name}</td>
                        <td className="p-2 text-right font-mono">
                          {cnt ? `${d.need} pcs` : formatWeightText(d.need)}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-500">
                          {cnt ? `${d.have} pcs` : formatWeightText(d.have)}
                        </td>
                        <td
                          className={`p-2 text-right font-mono font-semibold ${
                            d.after < 0 ? 'text-red-600' : 'text-[#0B3B2B]'
                          }`}
                        >
                          {d.after < 0
                            ? 'Short (clamped 0)'
                            : cnt
                            ? `${d.after} pcs`
                            : formatWeightText(d.after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeductOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDeduct}
                onClick={handleConfirmDeduct}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                {savingDeduct ? 'Deducting...' : 'Confirm Production Deduction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock & History Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Adjust Stock — {adjustTarget.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Current:{' '}
                  {isPieceOrCountStock(adjustTarget)
                    ? `${stockMap.get(adjustTarget.id) || 0} pcs`
                    : formatWeightText(stockMap.get(adjustTarget.id) || 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Delta ({isPieceOrCountStock(adjustTarget) ? 'pcs' : 'grams, +/-'})
                </label>
                <input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Audit Note
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Cycle count / spoilage / correction"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Recent Movement History
              </div>
              {(historyMap.get(adjustTarget.id) || []).length === 0 ? (
                <div className="text-xs text-slate-400">No recorded stock movements yet.</div>
              ) : (
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                  {[...(historyMap.get(adjustTarget.id) || [])]
                    .reverse()
                    .map((h, i) => (
                      <div key={i} className="py-1.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono uppercase font-semibold text-[#0B3B2B] mr-1.5">
                            {h.type}
                          </span>
                          <span className="text-slate-700">{h.note}</span>
                        </div>
                        <span className="font-mono text-slate-500 shrink-0">
                          {new Date(h.date).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAdjust}
                onClick={handleCommitAdjust}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B2B] rounded-md disabled:opacity-50"
              >
                {savingAdjust ? 'Saving...' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Category Modal */}
      {renameTargetCat && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-sm w-full p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Rename Category &ldquo;{renameTargetCat}&rdquo;
            </h3>
            <input
              type="text"
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTargetCat(null)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitRenameCategory}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#0B3B2B] text-white rounded-md"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <EditIngredientModal
          item={editingItem}
          stockQty={stockMap.get(editingItem.id) || 0}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onSave={async (updated, addQty, note) => {
            const cur = stockMap.get(updated.id) || 0;
            const hist = historyMap.get(updated.id) || [];
            await saveIngredientLibraryItem({
              uid,
              userName,
              item: updated,
              stockQty: cur + Math.max(0, addQty),
              history:
                addQty > 0
                  ? [
                      ...hist,
                      {
                        date: new Date().toISOString(),
                        type: 'received',
                        qty: addQty,
                        note,
                      },
                    ]
                  : hist,
              existingDoc: ingredientDocsByIngredientId.get(updated.id),
            });
            onNotify(`Updated "${updated.name}".`);
          }}
        />
      )}
    </div>
  );
}
