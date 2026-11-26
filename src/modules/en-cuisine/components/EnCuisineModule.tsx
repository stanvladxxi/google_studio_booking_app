import { useCallback, useEffect, useMemo, useState } from 'react';
import { Languages, Shield } from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { MenuPlaceholderView } from '../../../components/AggregatorPlaceholders';
import { MenuErrorBoundary } from '../../../components/MenuErrorBoundary';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  AvailabilitySlot,
  Booking,
  BookingPrefillRequest,
  IngredientLibraryDoc,
  KitchenEquipment,
  KitchenSpace,
  MaterialOrder,
  Product,
  ProductionBatchPrefillRequest,
  RawMaterial,
  RecipeExperiment,
  RecipeTest,
  RecipeVersion,
  SupplierQuote,
  SupplierRfq,
  UserProfile,
  UserRole,
  clampStr,
} from '../../../types';
import { BANANA_CAKE_TEMPLATE } from '../data/ingredientLibrarySeed';
import {
  BuilderDraftState,
  EnCuisineAnalyticsEvent,
  EnCuisineCatalogDoc,
  EnCuisineIngredientLink,
  EnCuisineTab,
  RfqPrefillRequest,
} from '../types';
import {
  computeBakeTestDerived,
  computeFormulationTotals,
  versionToBuilderDraft,
} from '../utils/formulationEngine';
import { mergeIngredientLibrary } from '../utils/libraryPersistence';
import { saveBakeTestToVersion } from '../utils/versionPersistence';
import { CostingEngineTab } from './CostingEngineTab';
import { DiscoverAdminPanel } from './DiscoverAdminPanel';
import { DiscoverTab } from './DiscoverTab';
import { EnCuisineInventoryTab } from './EnCuisineInventoryTab';
import { RecipeBookView } from './RecipeBookView';
import { RecipeBuilderStudio } from './RecipeBuilderStudio';
import { SupplierPortalTab } from './SupplierPortalTab';
import { SupplierRfqModal } from './SupplierRfqModal';
import { VersionsAndBakeTestsTab } from './VersionsAndBakeTestsTab';

interface EnCuisineModuleProps {
  uid: string;
  userName: string;
  isAdmin: boolean;
  effectiveRole: UserRole;
  userProfile: UserProfile | null;
  spaces: KitchenSpace[];
  equipmentCatalog: KitchenEquipment[];
  availabilitySlots: AvailabilitySlot[];
  bookings: Booking[];
  products: Product[];
  recipeVersions: RecipeVersion[];
  experiments: RecipeExperiment[];
  legacyRecipes: RecipeTest[];
  materials: RawMaterial[];
  materialOrders: MaterialOrder[];
  ingredientLibraryDocs: IngredientLibraryDoc[];
  customItems: EnCuisineCatalogDoc[];
  ingredientLinks: EnCuisineIngredientLink[];
  analyticsEvents: EnCuisineAnalyticsEvent[];
  supplierRfqs: SupplierRfq[];
  supplierQuotes: SupplierQuote[];
  canBookKitchen: boolean;
  canReadRecipes: boolean;
  recipesReadOnly: boolean;
  dataLoading: boolean;
  requestedTab?: EnCuisineTab | null;
  onTabChange?: (tab: EnCuisineTab) => void;
  onBookKitchen: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
  onOpenMaterialsOrders?: () => void;
  onSendToTestBatch?: (prefill: Omit<ProductionBatchPrefillRequest, 'key'>) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const SUB_NAV_TABS: { id: EnCuisineTab; label: string; arLabel: string }[] = [
  { id: 'recipes', label: 'Recipes', arLabel: 'الوصفات' },
  { id: 'menu', label: 'Master Menu', arLabel: 'القائمة الرئيسية' },
  { id: 'costing', label: 'Costing', arLabel: 'التكلفة' },
  { id: 'versions', label: 'Bake Tests', arLabel: 'الإصدارات والاختبارات' },
  { id: 'inventory', label: 'Inventory', arLabel: 'المخزون' },
  { id: 'supplier-portal', label: 'Suppliers', arLabel: 'بوابة الموردين' },
  { id: 'discover', label: 'Discover', arLabel: 'استكشف' },
];

export function EnCuisineModule({
  uid,
  userName,
  isAdmin,
  effectiveRole,
  userProfile,
  spaces,
  equipmentCatalog,
  availabilitySlots,
  products,
  recipeVersions,
  experiments,
  legacyRecipes,
  materials,
  materialOrders,
  ingredientLibraryDocs,
  customItems,
  ingredientLinks,
  analyticsEvents,
  supplierRfqs,
  supplierQuotes,
  canBookKitchen,
  canReadRecipes,
  recipesReadOnly,
  requestedTab,
  onTabChange,
  onBookKitchen,
  onOpenMaterialsOrders,
  onSendToTestBatch,
  onNotify,
}: EnCuisineModuleProps) {
  const visibleTabs = useMemo(() => {
    if (effectiveRole === 'aggregator') {
      return SUB_NAV_TABS.filter(
        (t) => t.id === 'menu' || t.id === 'supplier-portal' || t.id === 'discover'
      );
    }
    if (effectiveRole === 'kitchen_worker') {
      return SUB_NAV_TABS.filter(
        (t) => t.id === 'inventory' || t.id === 'costing' || t.id === 'discover'
      );
    }
    if (effectiveRole === 'member') {
      return SUB_NAV_TABS.filter((t) => t.id !== 'menu' && t.id !== 'versions');
    }
    return SUB_NAV_TABS;
  }, [effectiveRole]);

  const defaultTab: EnCuisineTab =
    effectiveRole === 'aggregator'
      ? 'menu'
      : effectiveRole === 'kitchen_worker'
      ? 'inventory'
      : visibleTabs.some((t) => t.id === 'recipes')
      ? 'recipes'
      : 'discover';

  const [activeTab, setActiveTab] = useState<EnCuisineTab>(() => {
    if (requestedTab && visibleTabs.some((t) => t.id === requestedTab)) {
      return requestedTab;
    }
    return defaultTab;
  });
  const [adminModeOpen, setAdminModeOpen] = useState(false);
  const [isRtl, setIsRtl] = useState<boolean>(userProfile?.preferredDir === 'rtl');
  const [recipesViewMode, setRecipesViewMode] = useState<'book' | 'builder'>('book');
  const [inlineRfqPrefill, setInlineRfqPrefill] = useState<RfqPrefillRequest | null>(null);
  const [portalRfqPrefill, setPortalRfqPrefill] = useState<RfqPrefillRequest | null>(null);

  // Shared 3-Column Builder Draft & Merged Ingredient Library State
  const [draft, setDraft] = useState<BuilderDraftState>(() => ({
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
  }));
  const [localCustomCategories, setLocalCustomCategories] = useState<string[]>([]);

  const mergedLibrary = useMemo(
    () => mergeIngredientLibrary(ingredientLibraryDocs, localCustomCategories),
    [ingredientLibraryDocs, localCustomCategories]
  );

  const ingredientDocsByIngredientId = useMemo(
    () => new Map(ingredientLibraryDocs.map((d) => [d.ingredientId, d])),
    [ingredientLibraryDocs]
  );

  const draftTotals = useMemo(
    () => computeFormulationTotals(draft.items, draft.unitWeightG, mergedLibrary.libraryById),
    [draft.items, draft.unitWeightG, mergedLibrary.libraryById]
  );

  useEffect(() => {
    if (requestedTab && visibleTabs.some((t) => t.id === requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    } else if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [requestedTab, visibleTabs, activeTab, defaultTab]);

  useEffect(() => {
    if (userProfile?.preferredDir) {
      setIsRtl(userProfile.preferredDir === 'rtl');
    }
  }, [userProfile?.preferredDir]);

  const handleSelectTab = (tab: EnCuisineTab) => {
    if (!visibleTabs.some((t) => t.id === tab)) return;
    setActiveTab(tab);
    onTabChange?.(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = `#/en-cuisine/${tab}`;
    }
  };

  const handleToggleRtl = async () => {
    const nextRtl = !isRtl;
    setIsRtl(nextRtl);
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        preferredDir: nextRtl ? 'rtl' : 'ltr',
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Keep local RTL switch working even if offline/unverified
    }
  };

  const trackAnalytics = useCallback(
    async (placement: string, itemId: string, itemTitle: string, eventType: 'impression' | 'click') => {
      if (!uid) return;
      const eventId = `ec_ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        await setDoc(doc(db, 'enCuisineAnalytics', eventId), {
          id: eventId,
          ownerId: uid,
          placement: clampStr(placement, 80),
          itemId: clampStr(itemId, 128),
          itemTitle: clampStr(itemTitle, 160),
          eventType,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('permission')) {
          handleFirestoreError(err, OperationType.CREATE, `enCuisineAnalytics/${eventId}`);
        }
      }
    },
    [uid]
  );

  const canManageAdminMode =
    isAdmin || effectiveRole === 'recipe_dev' || effectiveRole === 'kitchen_manager';

  const libraryReadOnly = recipesReadOnly || effectiveRole === 'kitchen_worker';

  const activeTabMeta = useMemo(
    () => visibleTabs.find((t) => t.id === activeTab) || visibleTabs[0] || SUB_NAV_TABS[0],
    [visibleTabs, activeTab]
  );

  const tabFallbackActions = useMemo(
    () =>
      visibleTabs
        .filter((t) => t.id !== activeTab)
        .slice(0, 4)
        .map((t) => ({
          label: `Switch to ${t.label}`,
          onClick: () => handleSelectTab(t.id),
        })),
    [visibleTabs, activeTab]
  );

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-5">
      {/* Compact En Cuisine Sub-Navigation Bar */}
      <div className="bg-[#08291E] text-white rounded-lg border border-emerald-950 px-3 py-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-2.5">
        <nav aria-label="En Cuisine sub-navigation" className="flex flex-wrap items-center gap-1 min-w-0">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-600 text-white'
                    : 'text-emerald-100/90 hover:bg-[#0B3B2B] hover:text-white'
                }`}
              >
                {isRtl ? `${tab.label} · ${tab.arLabel}` : tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleRtl}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#0B3B2B] hover:bg-emerald-900 text-emerald-100 border border-emerald-800 rounded-md whitespace-nowrap"
          >
            <Languages className="w-3.5 h-3.5 text-orange-400" />
            {isRtl ? 'LTR (EN)' : 'RTL'}
          </button>

          {canManageAdminMode && (
            <button
              type="button"
              onClick={() => setAdminModeOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                adminModeOpen
                  ? 'bg-orange-600 border-orange-500 text-white'
                  : 'bg-[#0B3B2B] border-emerald-800 text-emerald-100 hover:bg-emerald-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              {adminModeOpen ? 'Close Admin' : 'Admin Mode'}
            </button>
          )}
        </div>
      </div>

      {/* Admin Mode Drawer for Featured / Sponsored CRUD + Placement Analytics */}
      {canManageAdminMode && adminModeOpen && (
        <DiscoverAdminPanel
          uid={uid}
          isAdmin={isAdmin}
          customItems={customItems}
          analyticsEvents={analyticsEvents}
          onNotify={onNotify}
        />
      )}

      {/* Active Sub-Tab Viewport with Fallback Error Boundary */}
      <MenuErrorBoundary
        menuLabel={`En Cuisine · ${activeTabMeta.label}`}
        resetKey={`${activeTab}_${recipesViewMode}`}
        fallbackActions={tabFallbackActions}
      >
      {activeTab === 'discover' ? (
        <DiscoverTab
          uid={uid}
          userProfile={userProfile}
          spaces={spaces}
          equipmentCatalog={equipmentCatalog}
          availabilitySlots={availabilitySlots}
          products={products}
          recipeVersions={recipeVersions}
          legacyRecipes={legacyRecipes}
          customItems={customItems}
          ingredientLinks={ingredientLinks}
          canBookKitchen={canBookKitchen}
          isRtl={isRtl}
          onBookKitchen={onBookKitchen}
          onTrackAnalytics={trackAnalytics}
          onNotify={onNotify}
          onOpenCostingTab={() => handleSelectTab('costing')}
        />
      ) : activeTab === 'menu' ? (
        <MenuPlaceholderView
          products={canReadRecipes ? products : []}
          versions={canReadRecipes ? recipeVersions : []}
          onNotify={onNotify}
        />
      ) : activeTab === 'recipes' ? (
        recipesViewMode === 'book' ? (
          <RecipeBookView
            products={canReadRecipes ? products : []}
            recipeVersions={canReadRecipes ? recipeVersions : []}
            draft={draft}
            draftTotalG={draftTotals.totalG}
            draftTotalCostKwd={draftTotals.totalCostKwd + (Number(draft.overheadCostKwd) || 0)}
            readOnly={libraryReadOnly}
            onCreateNewRecipe={() => {
              setDraft({
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
              setRecipesViewMode('builder');
            }}
            onLoadBananaCake={() => {
              const rawWeight = BANANA_CAKE_TEMPLATE.items.reduce((s, i) => s + i.g, 0) || 1000;
              const scale1Kg = 1000 / rawWeight;
              setDraft({
                name: 'Banana Cake (1 kg Batch)',
                category: BANANA_CAKE_TEMPLATE.category,
                unitWeightG: 100,
                prepMinutes: BANANA_CAKE_TEMPLATE.prepMinutes,
                targetTempC: BANANA_CAKE_TEMPLATE.targetTempC,
                methodNotes: BANANA_CAKE_TEMPLATE.methodNotes,
                overheadCostKwd: BANANA_CAKE_TEMPLATE.overheadCostKwd,
                markupPct: BANANA_CAKE_TEMPLATE.markupPct,
                equipment: [...BANANA_CAKE_TEMPLATE.equipment],
                items: BANANA_CAKE_TEMPLATE.items.map((i) => ({
                  ...i,
                  g: Number((i.g * scale1Kg).toFixed(1)),
                })),
              });
              setRecipesViewMode('builder');
              onNotify('Opened 1 kg Banana Cake formulation in Recipe Builder.');
            }}
            onResumeWorkspace={() => setRecipesViewMode('builder')}
            onOpenProductInBuilder={(product, latestVersion) => {
              if (latestVersion) {
                setDraft(versionToBuilderDraft(product, latestVersion, mergedLibrary.library));
              } else {
                setDraft({
                  name: product.name,
                  category: product.category,
                  unitWeightG: 90,
                  prepMinutes: 25,
                  targetTempC: 175,
                  methodNotes: '',
                  overheadCostKwd: 0,
                  markupPct: product.targetMarkupPct || 150,
                  equipment: [],
                  items: [],
                  sourceProductId: product.id,
                });
              }
              setRecipesViewMode('builder');
            }}
            onSendProductToTestBatch={async (product, latestVersion) => {
              if (!libraryReadOnly && !latestVersion.bakeTest) {
                const beforeG = Math.max(1, Math.round(latestVersion.batchSize || 1000));
                const derivedBake = computeBakeTestDerived(
                  beforeG,
                  Math.max(1, Math.round(beforeG * 0.9)),
                  0,
                  Math.max(1, latestVersion.targetPieceWeightG || 90)
                );
                try {
                  await saveBakeTestToVersion({
                    version: latestVersion,
                    bakeTest: {
                      ...derivedBake,
                      loggedAt: new Date().toISOString(),
                    },
                  });
                } catch {
                  // Continue launching production prefill even if version bake-test update is skipped
                }
              }
              onSendToTestBatch?.({
                productName: product.name,
                quantityProduced: Math.max(1, latestVersion.expectedYield || 10),
                unit: 'units',
                bakeTempC: latestVersion.targetTempC || 175,
                productionNotes: `Test batch from Recipe Book (${product.name} v${latestVersion.versionNumber}.0 · ${(latestVersion.batchSize || 0).toFixed(0)}g batch · ${latestVersion.targetPieceWeightG || 90}g portions)`,
                sourceProductId: product.id,
                sourceVersionNumber: latestVersion.versionNumber,
              });
            }}
          />
        ) : (
          <RecipeBuilderStudio
            uid={uid}
            userName={userName}
            readOnly={libraryReadOnly}
            canSaveVersions={canReadRecipes && !recipesReadOnly}
            draft={draft}
            onChangeDraft={setDraft}
            mergedLibrary={mergedLibrary}
            ingredientDocsByIngredientId={ingredientDocsByIngredientId}
            products={products}
            recipeVersions={recipeVersions}
            equipmentCatalog={equipmentCatalog}
            ingredientLinks={ingredientLinks}
            canBookKitchen={canBookKitchen}
            onBackToRecipeBook={() => setRecipesViewMode('book')}
            onOpenCostingTab={() => handleSelectTab('costing')}
            onSavedVersion={() => {
              if (visibleTabs.some((t) => t.id === 'versions')) {
                handleSelectTab('versions');
              }
            }}
            onBookKitchenFromDraft={canBookKitchen ? onBookKitchen : undefined}
            onOpenMaterialsOrders={onOpenMaterialsOrders}
            onRequestSupplierQuote={(prefill) =>
              setInlineRfqPrefill({ ...prefill, key: Date.now() })
            }
            onSendToTestBatch={onSendToTestBatch}
            onNotify={onNotify}
          />
        )
      ) : activeTab === 'costing' ? (
        <CostingEngineTab
          uid={uid}
          userName={userName}
          readOnly={libraryReadOnly}
          draft={draft}
          mergedLibrary={mergedLibrary}
          ingredientDocsByIngredientId={ingredientDocsByIngredientId}
          products={canReadRecipes ? products : []}
          recipeVersions={canReadRecipes ? recipeVersions : []}
          ingredientLinks={ingredientLinks}
          onOpenDiscoverSupplierHub={() => handleSelectTab('supplier-portal')}
          onNotify={onNotify}
        />
      ) : activeTab === 'versions' && canReadRecipes ? (
        <VersionsAndBakeTestsTab
          uid={uid}
          userName={userName}
          readOnly={recipesReadOnly}
          products={products}
          recipeVersions={recipeVersions}
          experiments={experiments}
          legacyRecipes={legacyRecipes}
          mergedLibrary={mergedLibrary}
          canBookKitchen={canBookKitchen}
          onLoadVersionIntoBuilder={(loadedDraft) => {
            setDraft(loadedDraft);
            setRecipesViewMode('builder');
            handleSelectTab('recipes');
            onNotify(`Loaded "${loadedDraft.name}" v${loadedDraft.sourceVersionNumber || 1}.0 into Recipe Builder.`);
          }}
          onBookKitchenFromVersion={onBookKitchen}
          onOpenMaterialsOrders={onOpenMaterialsOrders}
          onNotify={onNotify}
        />
      ) : activeTab === 'supplier-portal' ? (
        <SupplierPortalTab
          uid={uid}
          userName={userName}
          isAdmin={isAdmin}
          rfqs={supplierRfqs}
          quotes={supplierQuotes}
          prefillRfq={portalRfqPrefill}
          onConsumePrefill={() => setPortalRfqPrefill(null)}
          onOpenMaterialsOrders={onOpenMaterialsOrders}
          onNotify={onNotify}
        />
      ) : (
        <EnCuisineInventoryTab
          uid={uid}
          userName={userName}
          readOnly={libraryReadOnly}
          draft={draft}
          mergedLibrary={mergedLibrary}
          ingredientDocsByIngredientId={ingredientDocsByIngredientId}
          products={canReadRecipes ? products : []}
          recipeVersions={canReadRecipes ? recipeVersions : []}
          materials={materials}
          materialOrders={materialOrders}
          localCustomCategories={localCustomCategories}
          onChangeLocalCategories={setLocalCustomCategories}
          onOpenMaterialsOrders={onOpenMaterialsOrders}
          onNotify={onNotify}
        />
      )}
      </MenuErrorBoundary>

      {inlineRfqPrefill && (
        <SupplierRfqModal
          buyerUid={uid}
          buyerName={userName}
          prefill={inlineRfqPrefill}
          recentRfqNames={supplierRfqs.map((r) => r.itemName)}
          onClose={() => setInlineRfqPrefill(null)}
          onCreated={() => {
            setInlineRfqPrefill(null);
            onNotify('Posted Alibaba-format RFQ. Track and compare supplier responses in Supplier Portal.');
          }}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
