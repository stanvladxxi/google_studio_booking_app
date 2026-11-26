import { ChangeEvent, Fragment, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  Download,
  FileSpreadsheet,
  Flame,
  FlaskConical,
  FolderOpen,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BookingPrefillRequest,
  IngredientLibraryDoc,
  KitchenEquipment,
  Product,
  ProductionBatchPrefillRequest,
  RecipeCategory,
  RecipeVersion,
} from '../../../types';
import {
  BANANA_CAKE_TEMPLATE,
  PARENT_GROUPS,
  SUPPLIER_OPTIONS,
} from '../data/ingredientLibrarySeed';
import {
  getRecentProductQueries,
  guessRfqPresetForQuery,
  recordRecentProductQuery,
} from '../data/rfqCategoryTree';
import {
  BuilderDraftState,
  EnCuisineIngredientLink,
  LibraryIngredient,
  RfqPrefillRequest,
} from '../types';
import {
  buildRecipeExportObject,
  computeBakeTestDerived,
  computeFormulationTotals,
  effectiveCostKg,
  effectiveCostPerUnit,
  effectivePricePerPiece,
  exportAllSavedCSV,
  exportAllSavedJSON,
  exportCurrentRecipeCSV,
  exportCurrentRecipeJSON,
  exportCurrentRecipeText,
  exportFullBackupJSON,
  exportMasterPricingJSON,
  formatKwd,
  formatWeightText,
  guessLibraryMatch,
  isPackagingItem,
  isPieceOrCountStock,
  parseWeightInput,
  rawCostKg,
} from '../utils/formulationEngine';
import {
  MergedLibraryState,
  saveIngredientLibraryItem,
} from '../utils/libraryPersistence';
import {
  ALL_RECIPE_CATEGORIES,
  saveBakeTestToVersion,
  saveFormulationAsVersion,
} from '../utils/versionPersistence';
import {
  AddCustomIngredientModal,
  EditIngredientModal,
  ViewRecipeSpecModal,
} from './IngredientModals';
import { OrderMaterialsModal } from './OrderMaterialsModal';

interface RecipeBuilderStudioProps {
  uid: string;
  userName: string;
  readOnly: boolean;
  canSaveVersions: boolean;
  draft: BuilderDraftState;
  onChangeDraft: (
    updater: BuilderDraftState | ((prev: BuilderDraftState) => BuilderDraftState)
  ) => void;
  mergedLibrary: MergedLibraryState;
  ingredientDocsByIngredientId: Map<string, IngredientLibraryDoc>;
  products: Product[];
  recipeVersions: RecipeVersion[];
  equipmentCatalog: KitchenEquipment[];
  ingredientLinks: EnCuisineIngredientLink[];
  canBookKitchen: boolean;
  onBackToRecipeBook?: () => void;
  onOpenCostingTab: () => void;
  onSavedVersion: (productId: string, versionId: string, versionNumber: number) => void;
  onBookKitchenFromDraft?: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
  onOpenMaterialsOrders?: () => void;
  onRequestSupplierQuote?: (prefill: Omit<RfqPrefillRequest, 'key'>) => void;
  onSendToTestBatch?: (prefill: Omit<ProductionBatchPrefillRequest, 'key'>) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function RecipeBuilderStudio({
  uid,
  userName,
  readOnly,
  canSaveVersions,
  draft,
  onChangeDraft,
  mergedLibrary,
  ingredientDocsByIngredientId,
  products,
  recipeVersions,
  equipmentCatalog,
  ingredientLinks,
  canBookKitchen,
  onBackToRecipeBook,
  onOpenCostingTab,
  onSavedVersion,
  onBookKitchenFromDraft,
  onOpenMaterialsOrders,
  onRequestSupplierQuote,
  onSendToTestBatch,
  onNotify,
}: RecipeBuilderStudioProps) {
  const { library, libraryById, categories, stockMap, historyMap } = mergedLibrary;

  // Library Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    getRecentProductQueries(uid)
  );

  // Local text drafts for weight inputs (prevents cursor jumps on "0.25", "60g", etc.)
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});

  // Modals
  const [addModalCat, setAddModalCat] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<LibraryIngredient | null>(null);
  const [specOpen, setSpecOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [skippedImportNames, setSkippedImportNames] = useState<string[] | null>(null);

  // Save Version Modal State
  const [targetProductId, setTargetProductId] = useState<string>(
    () => draft.sourceProductId || '__new__'
  );
  const [rationale, setRationale] = useState('');
  const [expectedEffect, setExpectedEffect] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [saveVersionError, setSaveVersionError] = useState('');

  // Send to Test Batch Modal State
  const [testBatchOpen, setTestBatchOpen] = useState(false);
  const [testBatchNotes, setTestBatchNotes] = useState('');
  const [sendingTestBatch, setSendingTestBatch] = useState(false);

  // Target Batch Scaling Input
  const [targetScaleG, setTargetScaleG] = useState('1000');

  // File Inputs
  const recipeImportRef = useRef<HTMLInputElement | null>(null);
  const pricingImportRef = useRef<HTMLInputElement | null>(null);
  const backupImportRef = useRef<HTMLInputElement | null>(null);

  // Build supplier override map for active product or 'all' from Discover Supplier Hub
  const supplierOverrideMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of draft.items) {
      const lib = libraryById.get(line.id);
      if (!lib || isPackagingItem(lib)) continue;
      const link = ingredientLinks.find(
        (l) =>
          (l.recipeId === draft.sourceProductId || l.recipeId === 'all') &&
          l.ingredientName.trim().toLowerCase() === lib.name.trim().toLowerCase()
      );
      if (link) {
        map.set(lib.id, link.costPerKgKwd);
      }
    }
    return map;
  }, [draft.items, draft.sourceProductId, ingredientLinks, libraryById]);

  const totals = useMemo(
    () =>
      computeFormulationTotals(
        draft.items,
        draft.unitWeightG,
        libraryById,
        supplierOverrideMap
      ),
    [draft.items, draft.unitWeightG, libraryById, supplierOverrideMap]
  );

  const overheadKwd = Math.max(0, Number(draft.overheadCostKwd) || 0);
  const grandTotalKwd = totals.totalCostKwd + overheadKwd;
  const safePortionG = Math.max(1, Number(draft.unitWeightG) || 1);
  const exactPortions = totals.totalG > 0 ? totals.totalG / safePortionG : 0;
  const costPerGramKwd = totals.totalG > 0 ? grandTotalKwd / totals.totalG : 0;
  const costPer100gKwd = costPerGramKwd * 100;
  const costPerPortionExactKwd =
    exactPortions > 0 ? grandTotalKwd / exactPortions : 0;
  const costPerPieceTotal =
    totals.estYieldPieces > 0
      ? grandTotalKwd / totals.estYieldPieces
      : costPerPortionExactKwd;
  const suggestedSellKwd =
    costPerPortionExactKwd * (1 + Math.max(0, draft.markupPct || 0) / 100);

  // Build filtered ingredient library grouped by Parent Group & Category
  const filteredLibrary = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return library.filter((item) => {
      if (selectedCat !== 'ALL' && item.cat !== selectedCat) return false;
      if (!q) return true;
      const hay = [
        item.name,
        item.cat,
        item.ecode || '',
        item.func || '',
        item.note || '',
        ...(item.allergens || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [library, searchTerm, selectedCat]);

  const groupedLibrary = useMemo(() => {
    const assignedCats = new Set(PARENT_GROUPS.flatMap((g) => g.categories));
    const customCats = categories.filter((c) => !assignedCats.has(c));
    const groups = [
      ...PARENT_GROUPS.map((g) => ({
        name: g.name,
        key: g.key,
        cats: g.categories.filter((c) => categories.includes(c)),
      })),
      ...(customCats.length > 0
        ? [
            {
              name: 'Custom Categories',
              key: 'custom',
              cats: customCats,
            },
          ]
        : []),
    ];

    return groups
      .map((g) => ({
        ...g,
        sections: g.cats
          .map((cat) => ({
            cat,
            items: filteredLibrary.filter((i) => i.cat === cat),
          }))
          .filter((sec) => sec.items.length > 0 || (selectedCat === 'ALL' && !searchTerm.trim())),
      }))
      .filter((g) => g.sections.length > 0);
  }, [categories, filteredLibrary, selectedCat, searchTerm]);

  const draftItemIds = useMemo(() => new Set(draft.items.map((i) => i.id)), [draft.items]);

  // Actions on Builder Draft
  const handleAddIngredientToDraft = (item: LibraryIngredient) => {
    const pkg = isPackagingItem(item);
    const defaultAmount = pkg ? 10 : item.costUnit === 'piece' ? item.pieceWeightG || 50 : 50;
    onChangeDraft((prev) => {
      const existing = prev.items.find((l) => l.id === item.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((l) =>
            l.id === item.id ? { ...l, g: Number((l.g + defaultAmount).toFixed(2)) } : l
          ),
        };
      }
      return {
        ...prev,
        items: [...prev.items, { id: item.id, g: defaultAmount, supplier: '' }],
      };
    });
    setWeightInputs((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const handleCommitWeightInput = (id: string, rawVal: string, pkg: boolean) => {
    const parsed = pkg
      ? Math.max(0, Math.round(parseFloat(rawVal) || 0))
      : Math.max(0, parseWeightInput(rawVal));
    onChangeDraft((prev) => ({
      ...prev,
      items: prev.items.map((l) => (l.id === id ? { ...l, g: parsed } : l)),
    }));
    setWeightInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdateLineSupplier = (id: string, supplier: string) => {
    onChangeDraft((prev) => ({
      ...prev,
      items: prev.items.map((l) => (l.id === id ? { ...l, supplier } : l)),
    }));
  };

  const handleRemoveLine = (id: string) => {
    onChangeDraft((prev) => ({
      ...prev,
      items: prev.items.filter((l) => l.id !== id),
    }));
  };

  const handleToggleEquipment = (eqName: string) => {
    onChangeDraft((prev) => {
      const exists = prev.equipment.includes(eqName);
      return {
        ...prev,
        equipment: exists
          ? prev.equipment.filter((e) => e !== eqName)
          : [...prev.equipment, eqName],
      };
    });
  };

  const handleLoadBananaCake = () => {
    onChangeDraft({
      name: BANANA_CAKE_TEMPLATE.name,
      category: BANANA_CAKE_TEMPLATE.category,
      unitWeightG: BANANA_CAKE_TEMPLATE.unitWeightG,
      prepMinutes: BANANA_CAKE_TEMPLATE.prepMinutes,
      targetTempC: BANANA_CAKE_TEMPLATE.targetTempC,
      methodNotes: BANANA_CAKE_TEMPLATE.methodNotes,
      overheadCostKwd: BANANA_CAKE_TEMPLATE.overheadCostKwd,
      markupPct: BANANA_CAKE_TEMPLATE.markupPct,
      equipment: [...BANANA_CAKE_TEMPLATE.equipment],
      items: BANANA_CAKE_TEMPLATE.items.map((i) => ({ ...i })),
    });
    setWeightInputs({});
    onNotify('Loaded Banana Cake formulation template.');
  };

  const handleStartBlank = () => {
    onChangeDraft({
      name: 'New Formulation',
      category: 'Bakery',
      unitWeightG: 90,
      prepMinutes: 25,
      targetTempC: 175,
      methodNotes: '',
      overheadCostKwd: 0,
      markupPct: 150,
      equipment: [],
      items: [],
    });
    setWeightInputs({});
  };

  // Persist New Custom Ingredient
  const handleSaveNewIngredient = async (
    item: LibraryIngredient,
    initialStockQty: number,
    bulkNote: string,
    addToDraft: boolean
  ) => {
    const history =
      initialStockQty > 0
        ? [
            {
              date: new Date().toISOString(),
              type: 'received' as const,
              qty: initialStockQty,
              note: bulkNote,
            },
          ]
        : [];
    await saveIngredientLibraryItem({
      uid,
      userName,
      item,
      stockQty: initialStockQty,
      history,
      logMessage: `Added custom ingredient "${item.name}" (${bulkNote}).`,
    });
    if (addToDraft) {
      onChangeDraft((prev) => ({
        ...prev,
        items: [...prev.items, { id: item.id, g: 50, supplier: '' }],
      }));
    }
    onNotify(`Saved custom ingredient "${item.name}" to library.`);
  };

  // Persist Edited Ingredient
  const handleSaveEditedIngredient = async (
    updated: LibraryIngredient,
    receiveStockQty: number,
    stockNote: string
  ) => {
    const existingDoc = ingredientDocsByIngredientId.get(updated.id);
    const currentStock = stockMap.get(updated.id) || 0;
    const currentHist = historyMap.get(updated.id) || [];
    const nextStock = currentStock + Math.max(0, receiveStockQty);
    const nextHist =
      receiveStockQty > 0
        ? [
            ...currentHist,
            {
              date: new Date().toISOString(),
              type: 'received' as const,
              qty: receiveStockQty,
              note: stockNote,
            },
          ]
        : currentHist;

    await saveIngredientLibraryItem({
      uid,
      userName,
      item: updated,
      stockQty: nextStock,
      history: nextHist,
      existingDoc,
      logMessage:
        receiveStockQty > 0
          ? `Updated "${updated.name}" & logged stock received (${stockNote}).`
          : `Updated formulation cost/nutrition for "${updated.name}".`,
    });
    onNotify(
      receiveStockQty > 0
        ? `Updated "${updated.name}" and added stock.`
        : `Saved changes to "${updated.name}".`
    );
  };

  // Save Immutable Version
  const handleOpenSaveVersion = () => {
    setTargetProductId(draft.sourceProductId || '__new__');
    setRationale('');
    setExpectedEffect('');
    setSaveVersionError('');
    setSaveVersionOpen(true);
  };

  const handleConfirmSaveVersion = async () => {
    if (!draft.name.trim()) {
      setSaveVersionError('Recipe name is required.');
      return;
    }
    if (draft.items.length === 0) {
      setSaveVersionError('Add at least one ingredient before saving a version.');
      return;
    }
    if (!rationale.trim()) {
      setSaveVersionError('Enter a rationale for this formulation version.');
      return;
    }
    setSavingVersion(true);
    setSaveVersionError('');
    try {
      const res = await saveFormulationAsVersion({
        uid,
        userName,
        draft,
        libraryById,
        targetProductId,
        existingProducts: products,
        existingVersions: recipeVersions,
        rationale: rationale.trim(),
        expectedEffect: expectedEffect.trim() || 'Production trial validation',
      });
      onChangeDraft((prev) => ({
        ...prev,
        sourceProductId: res.productId,
        sourceVersionNumber: res.versionNumber,
      }));
      setSaveVersionOpen(false);
      onNotify(`Saved "${draft.name}" v${res.versionNumber}.0 (immutable).`);
      onSavedVersion(res.productId, res.versionId, res.versionNumber);
    } catch (err) {
      setSaveVersionError(
        err instanceof Error ? err.message : 'Unable to save recipe version.'
      );
    } finally {
      setSavingVersion(false);
    }
  };

  // JSON Import: Single Recipe
  const handleRecipeFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        name?: string;
        category?: RecipeCategory;
        unitWeightG?: number;
        methodNotes?: string;
        overheadCostKwd?: number;
        markupPct?: number;
        ingredients?: {
          ingredientId?: string;
          id?: string;
          name?: string;
          quantity?: number;
          g?: number;
          supplier?: string;
        }[];
      };
      const matchedItems: { id: string; g: number; supplier?: string }[] = [];
      const skipped: string[] = [];
      for (const ing of parsed.ingredients || []) {
        const directId = ing.ingredientId || ing.id;
        const found =
          (directId && libraryById.get(directId)) ||
          (ing.name ? guessLibraryMatch(ing.name, library) : null);
        if (found) {
          matchedItems.push({
            id: found.id,
            g: Number(ing.quantity ?? ing.g ?? 0) || 0,
            supplier: ing.supplier || '',
          });
        } else if (ing.name) {
          skipped.push(ing.name);
        }
      }
      onChangeDraft({
        name: parsed.name || file.name.replace(/\.json$/i, ''),
        category: ALL_RECIPE_CATEGORIES.includes(parsed.category as RecipeCategory)
          ? (parsed.category as RecipeCategory)
          : 'Bakery',
        unitWeightG: Number(parsed.unitWeightG) || 90,
        prepMinutes: 25,
        targetTempC: 175,
        methodNotes: parsed.methodNotes || '',
        overheadCostKwd: Number(parsed.overheadCostKwd) || 0,
        markupPct: Number(parsed.markupPct) || 150,
        equipment: [],
        items: matchedItems,
      });
      setWeightInputs({});
      if (skipped.length > 0) {
        setSkippedImportNames(skipped);
      }
      onNotify(`Imported "${parsed.name || 'recipe'}" (${matchedItems.length} ingredients matched).`);
    } catch {
      onNotify('Could not read recipe JSON file.', 'error');
    }
  };

  // JSON Import: Master Pricing DB
  const handleMasterPricingImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { ingredients?: Partial<LibraryIngredient>[] };
      const list = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
      let updatedCount = 0;
      for (const entry of list.slice(0, 60)) {
        if (!entry.id || !entry.name) continue;
        const base = libraryById.get(entry.id);
        const merged: LibraryIngredient = {
          id: entry.id,
          name: entry.name,
          cat: entry.cat || base?.cat || 'Salt & Misc',
          custom: entry.custom ?? base?.custom ?? true,
          vegan: entry.vegan ?? base?.vegan ?? true,
          allergens: entry.allergens || base?.allergens || [],
          costUnit:
            entry.costUnit === 'piece' || entry.costUnit === 'unit' || entry.costUnit === 'roll'
              ? entry.costUnit
              : base?.costUnit,
          costKg: Number(entry.costKg ?? base?.costKg ?? 0),
          wastagePct: Number(entry.wastagePct ?? base?.wastagePct ?? 0),
          costPerUnit: entry.costPerUnit ?? base?.costPerUnit,
          costPerRoll: entry.costPerRoll ?? base?.costPerRoll,
          kcal: Number(entry.kcal ?? base?.kcal ?? 0),
          fat: Number(entry.fat ?? base?.fat ?? 0),
          satFat: Number(entry.satFat ?? base?.satFat ?? 0),
          sugar: Number(entry.sugar ?? base?.sugar ?? 0),
          protein: Number(entry.protein ?? base?.protein ?? 0),
          carbs: Number(entry.carbs ?? base?.carbs ?? 0),
          ecode: entry.ecode ?? base?.ecode,
          func: entry.func ?? base?.func,
          dosage: entry.dosage ?? base?.dosage,
          note: entry.note ?? base?.note,
        };
        await saveIngredientLibraryItem({
          uid,
          userName,
          item: merged,
          stockQty: stockMap.get(entry.id) || 0,
          history: historyMap.get(entry.id) || [],
          existingDoc: ingredientDocsByIngredientId.get(entry.id),
        });
        updatedCount++;
      }
      onNotify(`Imported ${updatedCount} pricing records into Firestore library.`);
    } catch {
      onNotify('Invalid master pricing JSON file.', 'error');
    }
  };

  // JSON Import: Full Session Backup
  const handleFullBackupImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        ingredients?: Partial<LibraryIngredient>[];
        inventory?: Record<string, { qty?: number }>;
        currentDraft?: BuilderDraftState;
      };
      let synced = 0;
      for (const entry of (parsed.ingredients || []).slice(0, 80)) {
        if (!entry.id || !entry.name) continue;
        const base = libraryById.get(entry.id);
        const invQty = parsed.inventory?.[entry.id]?.qty;
        const merged: LibraryIngredient = {
          id: entry.id,
          name: entry.name,
          cat: entry.cat || base?.cat || 'Salt & Misc',
          custom: entry.custom ?? base?.custom ?? false,
          vegan: entry.vegan ?? base?.vegan ?? true,
          allergens: entry.allergens || base?.allergens || [],
          costUnit:
            entry.costUnit === 'piece' || entry.costUnit === 'unit' || entry.costUnit === 'roll'
              ? entry.costUnit
              : base?.costUnit,
          costKg: Number(entry.costKg ?? base?.costKg ?? 0),
          wastagePct: Number(entry.wastagePct ?? base?.wastagePct ?? 0),
          kcal: Number(entry.kcal ?? base?.kcal ?? 0),
          fat: Number(entry.fat ?? base?.fat ?? 0),
          satFat: Number(entry.satFat ?? base?.satFat ?? 0),
          sugar: Number(entry.sugar ?? base?.sugar ?? 0),
          protein: Number(entry.protein ?? base?.protein ?? 0),
          carbs: Number(entry.carbs ?? base?.carbs ?? 0),
        };
        if (entry.custom || invQty !== undefined || (base && merged.costKg !== base.costKg)) {
          await saveIngredientLibraryItem({
            uid,
            userName,
            item: merged,
            stockQty: invQty !== undefined ? Number(invQty) || 0 : stockMap.get(entry.id) || 0,
            history: historyMap.get(entry.id) || [],
            existingDoc: ingredientDocsByIngredientId.get(entry.id),
          });
          synced++;
        }
      }
      if (parsed.currentDraft && Array.isArray(parsed.currentDraft.items)) {
        onChangeDraft(parsed.currentDraft);
      }
      onNotify(`Restored session backup (${synced} library overrides synced).`);
    } catch {
      onNotify('Invalid full backup JSON file.', 'error');
    }
  };

  const handleScaleRecipeToWeight = (targetGrams: number) => {
    if (totals.totalG <= 0 || targetGrams <= 0) {
      onNotify('Add food ingredients before scaling batch weight.', 'error');
      return;
    }
    const factor = targetGrams / totals.totalG;
    onChangeDraft((prev) => ({
      ...prev,
      items: prev.items.map((line) => {
        const lib = libraryById.get(line.id);
        if (lib && isPackagingItem(lib)) return line;
        return {
          ...line,
          g: Number((line.g * factor).toFixed(1)),
        };
      }),
    }));
    setWeightInputs({});
    onNotify(`Scaled recipe food ingredients proportionally to ${formatWeightText(targetGrams)}.`);
  };

  const handleOpenSendToTestBatch = () => {
    if (!draft.name.trim() || draft.items.length === 0) {
      onNotify('Enter a recipe name and add at least one ingredient before sending to a Test Batch.', 'error');
      return;
    }
    setTestBatchNotes(
      `Test batch from Recipe Builder (${formatWeightText(totals.totalG)} batch · ${exactPortions.toFixed(1)} portions @ ${draft.unitWeightG}g · Cost/portion ${formatKwd(costPerPortionExactKwd)})`
    );
    setTestBatchOpen(true);
  };

  const handleConfirmSendToTestBatch = async () => {
    if (!onSendToTestBatch) return;
    setSendingTestBatch(true);
    try {
      let productId = draft.sourceProductId || '';
      let versionNumber = draft.sourceVersionNumber || 1;
      let savedVersionObj: RecipeVersion | undefined;

      if (canSaveVersions && !readOnly) {
        const res = await saveFormulationAsVersion({
          uid,
          userName,
          draft,
          libraryById,
          targetProductId: draft.sourceProductId || '__new__',
          existingProducts: products,
          existingVersions: recipeVersions,
          rationale: testBatchNotes.trim() || 'Test batch formulation launch',
          expectedEffect: `Trial yield ${Math.max(1, Math.round(exactPortions))} portions @ ${draft.unitWeightG}g`,
        });
        productId = res.productId;
        versionNumber = res.versionNumber;
        onChangeDraft((prev) => ({
          ...prev,
          sourceProductId: res.productId,
          sourceVersionNumber: res.versionNumber,
        }));

        const beforeWeight = Math.max(1, Math.round(totals.totalG));
        const estAfter = Math.max(1, Math.round(beforeWeight * 0.9));
        const derivedBake = computeBakeTestDerived(
          beforeWeight,
          estAfter,
          0,
          safePortionG
        );
        savedVersionObj = {
          id: res.versionId,
          productId: res.productId,
          ownerId: uid,
          versionNumber: res.versionNumber,
          ingredients: [],
          batchSize: beforeWeight,
          expectedYield: Math.max(1, Math.round(exactPortions)),
          yieldUnit: 'pieces',
          prepMinutes: draft.prepMinutes,
          targetTempC: draft.targetTempC,
          method: draft.methodNotes,
          equipment: draft.equipment,
          expectedCost: Number(totals.ingredientCostKwd.toFixed(3)),
          changeReason: testBatchNotes.trim(),
          expectedEffect: 'Test batch run',
          actualOutcome: '',
          validationStatus: 'draft',
        };
        await saveBakeTestToVersion({
          version: savedVersionObj,
          bakeTest: {
            ...derivedBake,
            loggedAt: new Date().toISOString(),
          },
        });
      }

      setTestBatchOpen(false);
      onSendToTestBatch({
        productName: draft.name.trim(),
        quantityProduced: Math.max(1, Math.round(exactPortions) || totals.estYieldPieces || 1),
        unit: 'units',
        bakeTempC: draft.targetTempC || 175,
        productionNotes: testBatchNotes.trim(),
        sourceProductId: productId,
        sourceVersionNumber: versionNumber,
      });
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Unable to send recipe to test batch.',
        'error'
      );
    } finally {
      setSendingTestBatch(false);
    }
  };

  const handleBookKitchen = () => {
    if (!onBookKitchenFromDraft) return;
    const eqNames = draft.equipment.length ? draft.equipment : ['Deck Convection Oven (3-Tier)'];
    const hours = Math.max(1, Math.min(12, Math.ceil((draft.prepMinutes || 60) / 60) + 1));
    onBookKitchenFromDraft({
      durationHours: hours,
      equipmentNames: eqNames,
      notes: `En Cuisine Formulation: ${draft.name} · Batch ${(totals.totalG / 1000).toFixed(2)} kg (${totals.estYieldPieces} pcs @ ${draft.unitWeightG}g) · Temp ${draft.targetTempC}°C`,
    });
  };

  const foodLines = draft.items.filter((l) => {
    const item = libraryById.get(l.id);
    return item && !isPackagingItem(item);
  });
  const pkgLines = draft.items.filter((l) => {
    const item = libraryById.get(l.id);
    return item && isPackagingItem(item);
  });

  // Group draft food lines by category in library order
  const draftCatSections = useMemo(() => {
    const order = [...categories];
    const groups: { cat: string; lines: typeof foodLines }[] = [];
    for (const cat of order) {
      const matched = foodLines.filter((l) => libraryById.get(l.id)?.cat === cat);
      if (matched.length > 0) groups.push({ cat, lines: matched });
    }
    return groups;
  }, [categories, foodLines, libraryById]);

  const exportPreview = useMemo(
    () => buildRecipeExportObject(draft, libraryById),
    [draft, libraryById]
  );

  return (
    <div className="space-y-4">
      {/* Top Studio Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {onBackToRecipeBook && (
              <button
                type="button"
                onClick={onBackToRecipeBook}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md whitespace-nowrap"
              >
                ← Recipe Book
              </button>
            )}
            <h2 className="text-base font-bold text-slate-900">
              Professional Recipe Builder &amp; Costing Studio
            </h2>
            {draft.sourceProductId && (
              <span className="font-mono text-[11px] font-semibold text-[#0B3B2B]">
                · Linked v{draft.sourceVersionNumber || 1}.0
              </span>
            )}
            {readOnly && (
              <span className="font-mono text-[11px] font-semibold text-amber-800">
                · Read-Only Mode
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Add ingredients &amp; additives from the library, enter kg (e.g. <span className="font-mono">0.25</span>) or grams (e.g.{' '}
            <span className="font-mono">60g</span>), set any portion weight, or request supplier quotes for unlisted items.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadBananaCake}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#0B3B2B]" />
            Banana Cake Template
          </button>
          <button
            type="button"
            onClick={handleStartBlank}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md whitespace-nowrap shrink-0"
          >
            Start Blank
          </button>
          <button
            type="button"
            onClick={() => recipeImportRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Recipe (.json)
          </button>
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export &amp; Backups
          </button>
          <input
            ref={recipeImportRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRecipeFileImport}
            className="hidden"
          />
          <input
            ref={pricingImportRef}
            type="file"
            accept=".json,application/json"
            onChange={handleMasterPricingImport}
            className="hidden"
          />
          <input
            ref={backupImportRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFullBackupImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Main 3-Column Studio Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Ingredient & Additive Library (4 cols) */}
        <aside className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-[#08291E] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-wide">
                Ingredient &amp; Additive Library
              </div>
              <div className="text-[11px] text-emerald-200/80 font-mono">
                {library.length} items · {categories.length} categories
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setAddModalCat(selectedCat === 'ALL' ? categories[0] : selectedCat)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  Custom
                </button>
              )}
            </div>
          </div>

          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onBlur={() => {
                  if (searchTerm.trim().length >= 2) {
                    setRecentSearches(recordRecentProductQuery(uid, searchTerm));
                  }
                }}
                placeholder="Search flour, E471, cream cheese, supplier..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
              />
            </div>

            {recentSearches.length > 0 && !searchTerm.trim() && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-medium text-slate-500 mr-0.5">
                  Recent:
                </span>
                {recentSearches.slice(0, 5).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSearchTerm(term)}
                    className="px-1.5 py-0.5 text-[10px] font-medium bg-white text-slate-600 border border-slate-200 rounded hover:bg-emerald-50 hover:text-[#0B3B2B]"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedCat('ALL')}
                className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                  selectedCat === 'ALL'
                    ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                All ({library.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                    selectedCat === cat
                      ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto divide-y divide-slate-200">
            {groupedLibrary.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <div className="text-xs font-semibold text-slate-800">
                  &ldquo;{searchTerm}&rdquo; is not available in the library
                </div>
                <p className="text-[11px] text-slate-500">
                  Add it as a custom ingredient with nutrition lookup or post an Alibaba-style Supplier Quotation Request to source it.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {onRequestSupplierQuote && (
                    <button
                      type="button"
                      onClick={() => {
                        const q = searchTerm.trim();
                        if (q.length >= 2) {
                          setRecentSearches(recordRecentProductQuery(uid, q));
                        }
                        onRequestSupplierQuote({
                          itemName: q,
                          ...guessRfqPresetForQuery(q, draft.category),
                          quantity: 1,
                          sourceRecipeName: draft.name,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Request Supplier Quote
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setAddModalCat(selectedCat === 'ALL' ? categories[0] : selectedCat)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Custom Item
                    </button>
                  )}
                </div>
              </div>
            ) : (
              groupedLibrary.map((group) => (
                <div key={group.key}>
                  <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                    {group.name}
                  </div>
                  {group.sections.map((sec) => (
                    <div key={sec.cat} className="border-b border-slate-100 last:border-b-0">
                      <div className="px-3 py-1.5 bg-emerald-950/[0.03] flex items-center justify-between border-b border-slate-100">
                        <span className="text-[11px] font-bold text-[#0B3B2B]">
                          {sec.cat}{' '}
                          <span className="font-mono font-normal text-slate-500">
                            ({sec.items.length})
                          </span>
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setAddModalCat(sec.cat)}
                            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap"
                          >
                            + Add ingredient
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {sec.items.map((item) => {
                          const inRecipe = draftItemIds.has(item.id);
                          const pkg = isPackagingItem(item);
                          const stockVal = stockMap.get(item.id) || 0;
                          const effKg = effectiveCostKg(item);
                          const rawKg = rawCostKg(item);
                          const perUnit = effectiveCostPerUnit(item);
                          const perPiece = effectivePricePerPiece(item);

                          return (
                            <div
                              key={item.id}
                              className={`px-3 py-2 flex items-start justify-between gap-2 text-xs ${
                                inRecipe ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="font-semibold text-slate-900 leading-snug">
                                  {item.name}
                                  {item.custom && (
                                    <span className="ml-1.5 font-mono text-[10px] uppercase text-orange-700">
                                      [Custom]
                                    </span>
                                  )}
                                  {item.ecode && (
                                    <span className="ml-1.5 font-mono text-[10px] font-bold text-[#0B3B2B]">
                                      [{item.ecode}]
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono tabular-nums text-[11px] text-slate-600">
                                  {pkg
                                    ? `KWD ${perUnit.toFixed(4)} /pack`
                                    : item.wastagePct
                                    ? `KWD ${effKg.toFixed(3)}/kg eff. (raw ${rawKg.toFixed(2)}, ${item.wastagePct}% loss)`
                                    : `KWD ${rawKg.toFixed(3)} /kg`}
                                  {perPiece !== null && (
                                    <span className="text-slate-500">
                                      {' '}
                                      · {perPiece.toFixed(3)}/pc
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                                  {!pkg && <span>{item.kcal} kcal/100g</span>}
                                  {item.allergens.length > 0 && (
                                    <span className="text-amber-700 font-medium">
                                      Allergen: {item.allergens.join(', ')}
                                    </span>
                                  )}
                                  {stockVal > 0 && (
                                    <span className="text-emerald-700 font-mono">
                                      Stock:{' '}
                                      {isPieceOrCountStock(item)
                                        ? `${stockVal} pcs`
                                        : formatWeightText(stockVal)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingItem(item)}
                                    title="Edit nutrition, KWD cost & wastage"
                                    className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded bg-white"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleAddIngredientToDraft(item)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded border whitespace-nowrap ${
                                    inRecipe
                                      ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                                      : 'bg-white text-[#0B3B2B] border-[#0B3B2B]/40 hover:bg-emerald-50'
                                  }`}
                                >
                                  {inRecipe ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      +More
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3 h-3" />
                                      Add
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* CENTER COLUMN: Active Recipe Formulation & Markup Workspace (5 cols) */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Recipe Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => onChangeDraft((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm font-semibold border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Category
              </label>
              <select
                value={draft.category}
                onChange={(e) =>
                  onChangeDraft((p) => ({ ...p, category: e.target.value as RecipeCategory }))
                }
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              >
                {ALL_RECIPE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Piece Weight (g)
              </label>
              <input
                type="number"
                min={1}
                value={draft.unitWeightG}
                onChange={(e) =>
                  onChangeDraft((p) => ({
                    ...p,
                    unitWeightG: Math.max(1, parseFloat(e.target.value) || 1),
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Prep Time (min)
              </label>
              <input
                type="number"
                min={0}
                value={draft.prepMinutes}
                onChange={(e) =>
                  onChangeDraft((p) => ({
                    ...p,
                    prepMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Target Temp (°C)
              </label>
              <input
                type="number"
                min={-40}
                max={400}
                value={draft.targetTempC}
                onChange={(e) =>
                  onChangeDraft((p) => ({
                    ...p,
                    targetTempC: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
          </div>

          {/* Formulation Ingredients Table */}
          <div className="border border-slate-200 rounded-md overflow-x-auto">
            <datalist id="ec-builder-suppliers">
              {SUPPLIER_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                <tr>
                  <th className="text-left px-2.5 py-2">Ingredient</th>
                  <th className="text-left px-2 py-2 w-24">Qty (kg / g)</th>
                  <th className="text-right px-2 py-2">Baker%</th>
                  <th className="text-right px-2 py-2">Batch%</th>
                  <th className="text-right px-2 py-2">Cost (KWD)</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draft.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Click <span className="font-semibold text-[#0B3B2B]">+ Add</span> on ingredients in the left panel or load the Banana Cake Template.
                    </td>
                  </tr>
                ) : (
                  <>
                    {draftCatSections.map((sec) => (
                      <Fragment key={`sec-${sec.cat}`}>
                        <tr className="bg-emerald-950/[0.04]">
                          <td
                            colSpan={6}
                            className="px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0B3B2B]"
                          >
                            {sec.cat}
                          </td>
                        </tr>
                        {sec.lines.map((line) => {
                          const item = libraryById.get(line.id)!;
                          const override = supplierOverrideMap.get(item.id);
                          const kgCost =
                            override !== undefined ? override : effectiveCostKg(item);
                          const lineCost = (kgCost / 1000) * line.g;
                          const bakersPct =
                            totals.flourTotalG > 0
                              ? `${((line.g / totals.flourTotalG) * 100).toFixed(1)}%`
                              : '—';
                          const batchPct =
                            totals.totalG > 0
                              ? `${((line.g / totals.totalG) * 100).toFixed(1)}%`
                              : '0.0%';
                          const displayWeightStr =
                            weightInputs[line.id] ?? (line.g / 1000).toFixed(3);

                          return (
                            <tr key={line.id} className="hover:bg-slate-50/70">
                              <td className="px-2.5 py-2">
                                <div className="font-semibold text-slate-900 leading-tight">
                                  {item.name}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <input
                                    type="text"
                                    list="ec-builder-suppliers"
                                    value={line.supplier || ''}
                                    onChange={(e) =>
                                      handleUpdateLineSupplier(line.id, e.target.value)
                                    }
                                    placeholder="Supplier..."
                                    className="w-32 px-1.5 py-0.5 text-[10px] border border-slate-200 rounded text-slate-600"
                                  />
                                  {override !== undefined && (
                                    <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                                      Hub Override
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="text"
                                  value={displayWeightStr}
                                  onChange={(e) =>
                                    setWeightInputs((p) => ({
                                      ...p,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={(e) =>
                                    handleCommitWeightInput(line.id, e.target.value, false)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleCommitWeightInput(
                                        line.id,
                                        (e.target as HTMLInputElement).value,
                                        false
                                      );
                                    }
                                  }}
                                  title="Enter kg (e.g. 0.25) or grams with g (e.g. 60g)"
                                  className="w-20 px-2 py-1 text-xs font-mono tabular-nums border border-slate-300 rounded bg-white"
                                />
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  {line.g.toFixed(0)} g
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-600 align-top">
                                {bakersPct}
                              </td>
                              <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-600 align-top">
                                {batchPct}
                              </td>
                              <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-slate-900 align-top">
                                <div>{lineCost.toFixed(3)}</div>
                                <div className="text-[10px] font-normal text-slate-400">
                                  {(kgCost / 1000).toFixed(4)}/g
                                </div>
                              </td>
                              <td className="px-1.5 py-2 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(line.id)}
                                  className="p-1 text-slate-400 hover:text-red-600"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}

                    {pkgLines.length > 0 && (
                      <>
                        <tr className="bg-amber-50/70">
                          <td
                            colSpan={6}
                            className="px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900"
                          >
                            Packing Materials (Counted by Pieces / Packs)
                          </td>
                        </tr>
                        {pkgLines.map((line) => {
                          const item = libraryById.get(line.id)!;
                          const perU = effectiveCostPerUnit(item);
                          const lineCost = perU * line.g;
                          return (
                            <tr key={line.id}>
                              <td className="px-2.5 py-2 font-semibold text-slate-900">
                                {item.name}
                                <div className="font-mono text-[10px] font-normal text-slate-500">
                                  KWD {perU.toFixed(4)} / unit
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={line.g}
                                  onChange={(e) =>
                                    handleCommitWeightInput(line.id, e.target.value, true)
                                  }
                                  className="w-20 px-2 py-1 text-xs font-mono tabular-nums border border-slate-300 rounded"
                                />
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  pcs
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">—</td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400">—</td>
                              <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {lineCost.toFixed(3)}
                              </td>
                              <td className="px-1.5 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(line.id)}
                                  className="p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Batch Summary, Flexible Portion Costing & 1 kg Scaler */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <div className="text-[11px] font-medium text-slate-500">Total Recipe Weight</div>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {formatWeightText(totals.totalG)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500">
                  Portions ({draft.unitWeightG}g)
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {exactPortions.toFixed(1)} pcs
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500">Cost / Gram &amp; 100g</div>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {formatKwd(costPerGramKwd, 4)}/g
                </div>
                <div className="font-mono tabular-nums text-[10px] text-slate-500">
                  {formatKwd(costPer100gKwd)} / 100g
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500">Cost / Portion</div>
                <div className="font-mono tabular-nums font-bold text-[#0B3B2B]">
                  {formatKwd(costPerPortionExactKwd)}
                </div>
                <div className="font-mono tabular-nums text-[10px] text-slate-500">
                  Batch: {formatKwd(grandTotalKwd)}
                </div>
              </div>
            </div>

            {/* Flexible Portion Weight Presets + Batch Scaler */}
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 font-medium mr-1">Portion weight:</span>
                {[60, 85, 100, 125, 250].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onChangeDraft((p) => ({ ...p, unitWeightG: w }))}
                    className={`px-2 py-0.5 font-mono tabular-nums rounded border ${
                      draft.unitWeightG === w
                        ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {w}g
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="number"
                  min={50}
                  step={50}
                  value={targetScaleG}
                  onChange={(e) => setTargetScaleG(e.target.value)}
                  className="w-20 px-2 py-0.5 font-mono tabular-nums bg-white border border-slate-300 rounded"
                  aria-label="Target batch weight in grams"
                />
                <button
                  type="button"
                  onClick={() => handleScaleRecipeToWeight(parseFloat(targetScaleG) || 1000)}
                  className="px-2.5 py-0.5 font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 whitespace-nowrap"
                >
                  Scale to g
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetScaleG('1000');
                    handleScaleRecipeToWeight(1000);
                  }}
                  className="px-2 py-0.5 font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 whitespace-nowrap"
                >
                  1 kg
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200 items-end">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Overhead / Utilities (KWD)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.05"
                  value={draft.overheadCostKwd}
                  onChange={(e) =>
                    onChangeDraft((p) => ({
                      ...p,
                      overheadCostKwd: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                  Target Markup (%)
                </label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={draft.markupPct}
                  onChange={(e) =>
                    onChangeDraft((p) => ({
                      ...p,
                      markupPct: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded"
                />
              </div>
              <div className="bg-[#08291E] text-white rounded px-3 py-1.5">
                <div className="text-[10px] font-mono uppercase text-emerald-200">
                  Suggested Sell / Portion
                </div>
                <div className="font-mono tabular-nums text-sm font-bold text-orange-400">
                  {formatKwd(suggestedSellKwd)}
                </div>
              </div>
            </div>
          </div>

          {/* Equipment & Method */}
          {equipmentCatalog.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Required Kitchen Equipment (pre-fills Booking)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {equipmentCatalog.map((eq) => {
                  const selected = draft.equipment.includes(eq.name);
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => handleToggleEquipment(eq.name)}
                      className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                        selected
                          ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {eq.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Method &amp; SOP Notes
            </label>
            <textarea
              rows={3}
              value={draft.methodNotes}
              onChange={(e) => onChangeDraft((p) => ({ ...p, methodNotes: e.target.value }))}
              placeholder="Step-by-step mixing order, resting time, oven temperature & visual cues..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#0B3B2B]"
            />
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSpecOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                View Spec
              </button>
              <button
                type="button"
                onClick={onOpenCostingTab}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
              >
                Live Scale &amp; Loss Costing
              </button>
              <button
                type="button"
                onClick={() => setOrderOpen(true)}
                disabled={draft.items.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Order Materials
              </button>
              {canBookKitchen && onBookKitchenFromDraft && (
                <button
                  type="button"
                  onClick={handleBookKitchen}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-orange-600" />
                  Book Kitchen
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onSendToTestBatch && (
                <button
                  type="button"
                  onClick={handleOpenSendToTestBatch}
                  disabled={draft.items.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-300 rounded-md disabled:opacity-50 whitespace-nowrap"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Send to Test Batch
                </button>
              )}
              {canSaveVersions && !readOnly && (
                <button
                  type="button"
                  onClick={handleOpenSaveVersion}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Recipe Version
                </button>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Formulation Compliance Ticket (3 cols) */}
        <aside className="xl:col-span-3 space-y-4">
          <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-[#08291E] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">
                  FORMULATION TICKET
                </div>
                <div className="text-sm font-bold truncate max-w-[190px]">
                  {draft.name || 'Untitled'}
                </div>
              </div>
              <FlaskConical className="w-4 h-4 text-orange-400 shrink-0" />
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* Per Piece Nutrition */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                  <span className="font-bold text-slate-900">Per Piece ({draft.unitWeightG}g)</span>
                  <span className="font-mono font-bold text-[#0B3B2B]">
                    {Math.round(totals.perSlice.kcal)} kcal
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 font-mono tabular-nums text-[11px]">
                  <span className="text-slate-500">Total Fat</span>
                  <span className="text-right font-semibold text-slate-900">
                    {totals.perSlice.fat.toFixed(1)} g
                  </span>
                  <span className="text-slate-500">Saturated Fat</span>
                  <span className="text-right font-semibold text-slate-900">
                    {totals.perSlice.satFat.toFixed(1)} g
                  </span>
                  <span className="text-slate-500">Carbohydrates</span>
                  <span className="text-right font-semibold text-slate-900">
                    {totals.perSlice.carbs.toFixed(1)} g
                  </span>
                  <span className="text-slate-500">Sugars</span>
                  <span className="text-right font-semibold text-slate-900">
                    {totals.perSlice.sugar.toFixed(1)} g
                  </span>
                  <span className="text-slate-500">Protein</span>
                  <span className="text-right font-semibold text-slate-900">
                    {totals.perSlice.protein.toFixed(1)} g
                  </span>
                </div>
              </div>

              {/* Per 100g Nutrition */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between pb-1.5 mb-1.5">
                  <span className="font-bold text-slate-700">Per 100g Label Basis</span>
                  <span className="font-mono font-bold text-slate-900">
                    {Math.round(totals.per100g.kcal)} kcal
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono tabular-nums text-[10px] bg-slate-50 border border-slate-200 rounded p-2">
                  <div>
                    <div className="text-slate-400">FAT</div>
                    <div className="font-bold text-slate-800">{totals.per100g.fat.toFixed(1)}g</div>
                  </div>
                  <div>
                    <div className="text-slate-400">SUGAR</div>
                    <div className="font-bold text-slate-800">{totals.per100g.sugar.toFixed(1)}g</div>
                  </div>
                  <div>
                    <div className="text-slate-400">PROT</div>
                    <div className="font-bold text-slate-800">{totals.per100g.protein.toFixed(1)}g</div>
                  </div>
                </div>
              </div>

              {/* Declarable Allergens */}
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900 uppercase font-mono text-[10px] tracking-wider">
                  Declarable Allergens
                </div>
                {totals.allergens.length === 0 ? (
                  <div className="text-emerald-700 font-medium">None detected</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {totals.allergens.map((a) => (
                      <span
                        key={a}
                        className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-900 border border-amber-300 rounded"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* E-Numbers & Additives */}
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900 uppercase font-mono text-[10px] tracking-wider">
                  Additives &amp; E-Numbers
                </div>
                {totals.additives.length === 0 ? (
                  <div className="text-slate-500">None — clean label</div>
                ) : (
                  <ul className="space-y-1 text-[11px]">
                    {totals.additives.map((a) => (
                      <li key={a.id} className="text-slate-700">
                        <span className="font-mono font-bold text-[#0B3B2B]">{a.ecode}</span>{' '}
                        <span>{a.name}</span>
                        {a.func && <span className="block text-[10px] text-slate-400">{a.func}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Unit Economics Summary */}
              <div className="pt-2 border-t border-slate-200 space-y-1 font-mono tabular-nums text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch Cost / kg</span>
                  <span className="font-semibold">{formatKwd(totals.costPerKgBatch)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Food / Piece</span>
                  <span>{formatKwd(totals.costPerSliceIngredients)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pack / Piece</span>
                  <span>{formatKwd(totals.packagingPerSlice)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span>All-In / Piece</span>
                  <span>{formatKwd(costPerPieceTotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-orange-700">
                  <span>Target Sell ({draft.markupPct}%)</span>
                  <span>{formatKwd(suggestedSellKwd)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              GCC Compliance Ready
            </div>
            <p>
              All weights normalized to grams; KWD pricing accounts for peeling/trim wastage % and Discover Supplier Hub price locks.
            </p>
          </div>
        </aside>
      </div>

      {/* Add Custom Ingredient Modal */}
      {addModalCat !== null && (
        <AddCustomIngredientModal
          category={addModalCat}
          categories={categories}
          onClose={() => setAddModalCat(null)}
          onSave={handleSaveNewIngredient}
        />
      )}

      {/* Edit Ingredient Modal */}
      {editingItem && (
        <EditIngredientModal
          item={editingItem}
          stockQty={stockMap.get(editingItem.id) || 0}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveEditedIngredient}
        />
      )}

      {/* View Spec Modal */}
      {specOpen && (
        <ViewRecipeSpecModal
          title={draft.name || 'Formulation'}
          items={draft.items}
          categories={categories}
          libraryById={libraryById}
          onClose={() => setSpecOpen(false)}
        />
      )}

      {/* Order Shortfall Materials Modal */}
      {orderOpen && (
        <OrderMaterialsModal
          uid={uid}
          userName={userName}
          sourceProductId={draft.sourceProductId || ''}
          sourceVersionLabel={`${draft.name || 'Draft'} (Builder)`}
          items={draft.items}
          libraryById={libraryById}
          stockMap={stockMap}
          onClose={() => setOrderOpen(false)}
          onSuccess={(code) =>
            onNotify(`Purchase Order ${code} created in Raw Materials & Orders.`)
          }
          onOpenMaterialsOrders={onOpenMaterialsOrders}
        />
      )}

      {/* Save Immutable Version Modal */}
      {saveVersionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Save Immutable Recipe Version
                </h3>
                <p className="text-xs text-slate-500">
                  Snapshots ingredients, weights, nutrition, E-numbers, and KWD pricing forever.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaveVersionOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Product Target
              </label>
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
              >
                <option value="__new__">
                  + Create New Product: &ldquo;{draft.name || 'Untitled'}&rdquo; (v1.0)
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    Iterate existing: {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Change Rationale (Required)
              </label>
              <input
                type="text"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="e.g. Increased mashed banana +50g, reduced sugar -20g for moist crumb"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Expected Sensory / Cost Effect
              </label>
              <input
                type="text"
                value={expectedEffect}
                onChange={(e) => setExpectedEffect(e.target.value)}
                placeholder="e.g. Lower sugar g/piece while holding target KWD cost"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 font-mono tabular-nums text-[11px] grid grid-cols-2 gap-2">
              <div>
                Batch: <span className="font-bold">{formatWeightText(totals.totalG)}</span>
              </div>
              <div>
                Yield: <span className="font-bold">{totals.estYieldPieces} pcs</span>
              </div>
              <div>
                Total Cost: <span className="font-bold">{formatKwd(grandTotalKwd)}</span>
              </div>
              <div>
                Sell Price: <span className="font-bold text-orange-700">{formatKwd(suggestedSellKwd)}/pc</span>
              </div>
            </div>

            {saveVersionError && (
              <div className="text-xs text-red-600 font-medium">{saveVersionError}</div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSaveVersionOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingVersion}
                onClick={handleConfirmSaveVersion}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                <Layers className="w-3.5 h-3.5" />
                {savingVersion ? 'Saving...' : 'Commit Immutable Version'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export & Backups Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Export Formulations &amp; Master Backups
                </h3>
                <p className="text-xs text-slate-500">
                  Download KWD spec sheets or import master pricing &amp; full session backups.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 border border-slate-200 rounded-md space-y-2">
                <div className="font-bold text-slate-900">
                  Current Draft: {exportPreview.name} ({exportPreview.estimatedYieldPieces} pcs · {formatKwd(exportPreview.totalCostKwd)})
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportCurrentRecipeJSON(draft, libraryById)}
                    className="px-3 py-1.5 font-semibold bg-[#0B3B2B] text-white rounded"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCurrentRecipeCSV(draft, libraryById)}
                    className="px-3 py-1.5 font-semibold border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCurrentRecipeText(draft, libraryById)}
                    className="px-3 py-1.5 font-semibold border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
                  >
                    Export Text SOP
                  </button>
                </div>
              </div>

              <div className="p-3 border border-slate-200 rounded-md space-y-2">
                <div className="font-bold text-slate-900">
                  All Saved Projects &amp; Master Ingredient Pricing (KWD)
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportAllSavedJSON(products, recipeVersions)}
                    className="px-3 py-1.5 font-medium border border-slate-300 rounded hover:bg-slate-50"
                  >
                    All Saved Recipes (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAllSavedCSV(products, recipeVersions)}
                    className="px-3 py-1.5 font-medium border border-slate-300 rounded hover:bg-slate-50"
                  >
                    All Saved Recipes (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => exportMasterPricingJSON(library)}
                    className="px-3 py-1.5 font-medium border border-slate-300 rounded hover:bg-slate-50"
                  >
                    Master Pricing DB (.json)
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => pricingImportRef.current?.click()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium border border-[#0B3B2B] text-[#0B3B2B] rounded hover:bg-emerald-50"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Import Master Pricing
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3 border border-slate-200 rounded-md space-y-2">
                <div className="font-bold text-slate-900">Full Studio Session Backup</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportFullBackupJSON(library, stockMap, products, recipeVersions, draft)
                    }
                    className="px-3 py-1.5 font-semibold bg-orange-600 text-white rounded"
                  >
                    Download Full Backup (.json)
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => backupImportRef.current?.click()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium border border-slate-300 rounded hover:bg-slate-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Restore Backup (.json)
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skipped Import Ingredients Notice */}
      {skippedImportNames && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-md w-full p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Some imported ingredients were not in the library
            </h3>
            <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
              {skippedImportNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Add them via <strong>+ Custom</strong> in the left library panel if needed.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSkippedImportNames(null)}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#0B3B2B] text-white rounded-md"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Test Batch Confirmation Modal */}
      {testBatchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Send Recipe to Test Batch
                </h3>
                <p className="text-xs text-slate-500">
                  Saves this formulation to your Recipe Book, seeds a Bake Test record, and opens Production &amp; Forms with your batch prefilled.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestBatchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 font-mono tabular-nums text-xs grid grid-cols-2 gap-2">
              <div>
                Recipe: <span className="font-bold font-sans text-slate-900">{draft.name}</span>
              </div>
              <div>
                Batch Weight: <span className="font-bold">{formatWeightText(totals.totalG)}</span>
              </div>
              <div>
                Target Portions: <span className="font-bold">{Math.max(1, Math.round(exactPortions))} pcs ({draft.unitWeightG}g)</span>
              </div>
              <div>
                Bake Temp: <span className="font-bold">{draft.targetTempC}°C</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Test Batch Notes &amp; Hypothesis
              </label>
              <textarea
                rows={3}
                value={testBatchNotes}
                onChange={(e) => setTestBatchNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setTestBatchOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingTestBatch}
                onClick={handleConfirmSendToTestBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                {sendingTestBatch ? 'Launching...' : 'Launch Test Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
