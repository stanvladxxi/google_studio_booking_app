import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  Plus,
  Printer,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  AvailabilitySlot,
  BookingPrefillRequest,
  KitchenEquipment,
  KitchenSpace,
  Product,
  RecipeTest,
  RecipeVersion,
  UserProfile,
  clampStr,
} from '../../../types';
import { formatKwd, roundKwd } from '../../../utils/costing';
import {
  BUSINESS_TYPES,
  DISCOVER_INTERESTS,
  EDITORIAL_ITEMS_DATA,
  EDITORIAL_TABS,
  FEATURED_EQUIPMENT_DATA,
  FEATURED_INFLUENCERS_DATA,
  INFLUENCER_SPECIALTIES,
  KWD_PRICE_MOVEMENTS,
  NEW_BRANDS_DATA,
  SAMPLE_EN_CUISINE_RECIPES,
  SUPPLIER_HUB_PRODUCTS_DATA,
} from '../data/discoverSeed';
import {
  DiscoverBrand,
  DiscoverEditorialItem,
  DiscoverEquipmentItem,
  DiscoverInfluencer,
  DiscoverSupplierProduct,
  EditorialTabType,
  EnCuisineCatalogDoc,
  EnCuisineIngredientLink,
  InfluencerSpecialty,
} from '../types';
import { BrandEmblem, EnCuisineMedia } from './EnCuisineMedia';

interface DiscoverTabProps {
  uid: string;
  userProfile: UserProfile | null;
  spaces: KitchenSpace[];
  equipmentCatalog: KitchenEquipment[];
  availabilitySlots: AvailabilitySlot[];
  products: Product[];
  recipeVersions: RecipeVersion[];
  legacyRecipes: RecipeTest[];
  customItems: EnCuisineCatalogDoc[];
  ingredientLinks: EnCuisineIngredientLink[];
  canBookKitchen: boolean;
  isRtl: boolean;
  onBookKitchen: (prefill: Omit<BookingPrefillRequest, 'key'>) => void;
  onTrackAnalytics: (placement: string, itemId: string, itemTitle: string, eventType: 'impression' | 'click') => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenCostingTab: () => void;
}

function isWithinActiveDateWindow(startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return true;
  const today = new Date().toISOString().slice(0, 10);
  if (startDate && today < startDate) return false;
  if (endDate && today > endDate) return false;
  return true;
}

export function DiscoverTab({
  uid,
  userProfile,
  spaces,
  equipmentCatalog,
  availabilitySlots,
  products,
  recipeVersions,
  legacyRecipes,
  customItems,
  ingredientLinks,
  canBookKitchen,
  isRtl,
  onBookKitchen,
  onTrackAnalytics,
  onNotify,
  onOpenCostingTab,
}: DiscoverTabProps) {
  const equipCarouselRef = useRef<HTMLDivElement>(null);
  const supplierCarouselRef = useRef<HTMLDivElement>(null);
  const loggedImpressionsRef = useRef<Set<string>>(new Set());

  // Onboarding & Shared Profile Preferences
  const activeBusinessType = userProfile?.businessType || 'Bakery & Pastry';
  const activeInterests = useMemo(
    () => userProfile?.discoverInterests || ['Bakery & Pastry', 'Supply Chain & KWD Prices'],
    [userProfile?.discoverInterests]
  );
  const followedInfluencers = useMemo(
    () => new Set(userProfile?.followedInfluencerIds || []),
    [userProfile?.followedInfluencerIds]
  );

  // Filters & Modals
  const [selectedInfluencerChip, setSelectedInfluencerChip] = useState<'All' | InfluencerSpecialty>('All');
  const [activeEditorialTab, setActiveEditorialTab] = useState<EditorialTabType>('News Article');

  const [supplierHubModalEquip, setSupplierHubModalEquip] = useState<DiscoverEquipmentItem | null>(null);
  const [matchProductModal, setMatchProductModal] = useState<DiscoverSupplierProduct | null>(null);
  const [matchTargetRecipeId, setMatchTargetRecipeId] = useState<string>(SAMPLE_EN_CUISINE_RECIPES[0].id);
  const [matchTargetIngredient, setMatchTargetIngredient] = useState<string>('');
  const [savingMatch, setSavingMatch] = useState(false);

  const [brandModal, setBrandModal] = useState<DiscoverBrand | null>(null);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCountry, setNewBrandCountry] = useState('Kuwait');
  const [newBrandCategory, setNewBrandCategory] = useState('Artisanal Foodservice');
  const [newBrandPitch, setNewBrandPitch] = useState('');
  const [newBrandStory, setNewBrandStory] = useState('');
  const [submittingBrand, setSubmittingBrand] = useState(false);

  const [readerEditorial, setReaderEditorial] = useState<DiscoverEditorialItem | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [newsletterSubscribed, setNewsletterSubscribed] = useState<boolean>(
    Boolean(userProfile?.newsletterSubscribed)
  );
  const [newsletterTopics, setNewsletterTopics] = useState<string[]>(
    userProfile?.newsletterTopics?.length
      ? userProfile.newsletterTopics
      : ['Bakery & Pastry', 'Supply Chain & KWD Prices']
  );
  const [showBriefPreview, setShowBriefPreview] = useState(true);

  useEffect(() => {
    setNewsletterSubscribed(Boolean(userProfile?.newsletterSubscribed));
    if (userProfile?.newsletterTopics?.length) {
      setNewsletterTopics(userProfile.newsletterTopics);
    }
  }, [userProfile?.newsletterSubscribed, userProfile?.newsletterTopics]);

  // Merge seeded arrays with Firestore Admin/Brand custom items & preserve exact ordering for core slots
  const equipmentItems: DiscoverEquipmentItem[] = useMemo(() => {
    const custom: DiscoverEquipmentItem[] = customItems
      .filter((c) => c.sectionType === 'equipment' && c.isActive && isWithinActiveDateWindow(c.startDate, c.endDate))
      .map((c): DiscoverEquipmentItem => ({
        id: c.id,
        name: c.title,
        category: (c.category as DiscoverEquipmentItem['category']) || "Chef's Tools & Gadgets",
        supplier: c.subtitle,
        supplierCity: 'Kuwait City',
        priceKwd: c.priceKwd || 0,
        warrantyMonths: 24,
        spec: c.description,
        badgeType: c.badgeType,
        startDate: c.startDate,
        endDate: c.endDate,
        imageKey: 'equipment_studio',
        matchKeywords: c.title.toLowerCase().split(' ').slice(0, 3),
        businessTypes: ['Cloud Kitchen', 'Bakery & Pastry'],
        isCustom: true,
        ownerId: c.ownerId,
      }));
    const seeded = FEATURED_EQUIPMENT_DATA.filter((e) =>
      isWithinActiveDateWindow(e.startDate, e.endDate)
    );
    return [...seeded, ...custom];
  }, [customItems]);

  const supplierProducts: DiscoverSupplierProduct[] = useMemo(() => {
    const custom: DiscoverSupplierProduct[] = customItems
      .filter((c) => c.sectionType === 'supplier_product' && c.isActive && isWithinActiveDateWindow(c.startDate, c.endDate))
      .map((c): DiscoverSupplierProduct => ({
        id: c.id,
        name: c.title,
        packSize: '1 Case / Wholesale Pack',
        packGrams: 1000,
        unitLabel: 'Unit',
        pricePerUnitKwd: c.priceKwd || 5,
        supplier: c.subtitle,
        moq: 1,
        origin: 'Kuwait / GCC',
        category: c.category,
        badgeType: c.badgeType,
        startDate: c.startDate,
        endDate: c.endDate,
        imageKey: 'supplier_pantry',
        defaultIngredientMatch: c.title,
        businessTypes: ['Cloud Kitchen', 'Fine Dining'],
        isCustom: true,
        ownerId: c.ownerId,
      }));
    return [...SUPPLIER_HUB_PRODUCTS_DATA, ...custom];
  }, [customItems]);

  const influencers: DiscoverInfluencer[] = useMemo(() => {
    const custom: DiscoverInfluencer[] = customItems
      .filter((c) => c.sectionType === 'influencer' && c.isActive)
      .map((c): DiscoverInfluencer => ({
        id: c.id,
        name: c.title,
        handle: `@${c.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}`,
        city: c.subtitle || 'Kuwait City',
        specialty: (c.category as InfluencerSpecialty) || 'Culinary Innovators',
        bio: c.description,
        followersLabel: 'Verified Creator',
        badgeType: c.badgeType,
        avatarInitials: c.title.slice(0, 2).toUpperCase(),
        businessTypes: ['Cloud Kitchen', 'Fine Dining'],
        isCustom: true,
        ownerId: c.ownerId,
      }));
    const list = [...FEATURED_INFLUENCERS_DATA, ...custom];
    // Personalize ordering by user's businessType after respecting filters
    return [...list].sort((a, b) => {
      const aMatch = a.businessTypes.includes(activeBusinessType as never) ? 1 : 0;
      const bMatch = b.businessTypes.includes(activeBusinessType as never) ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [customItems, activeBusinessType]);

  const brands: DiscoverBrand[] = useMemo(() => {
    const custom: DiscoverBrand[] = customItems
      .filter((c) => c.sectionType === 'brand' && c.isActive)
      .map((c): DiscoverBrand => ({
        id: c.id,
        name: c.title,
        country: c.subtitle || 'Kuwait',
        category: c.category || 'Foodservice Brand',
        pitch: c.description,
        story: c.description,
        foundedYear: 2026,
        retailPresence: 'En Cuisine Partner Directory',
        badgeType: c.badgeType,
        imageKey: 'banabites_brand',
        logoCode: c.title.slice(0, 2).toUpperCase(),
        businessTypes: ['FMCG / Snack Brand'],
        isCustom: true,
        ownerId: c.ownerId,
      }));
    return [...NEW_BRANDS_DATA, ...custom];
  }, [customItems]);

  const editorialItems: DiscoverEditorialItem[] = useMemo(() => {
    const custom: DiscoverEditorialItem[] = customItems
      .filter((c) => c.sectionType === 'editorial' && c.isActive)
      .map((c): DiscoverEditorialItem => ({
        id: c.id,
        tabType: (c.category as EditorialTabType) || 'News Article',
        title: c.title,
        author: c.subtitle || 'En Cuisine Desk',
        publishedDate: c.startDate || new Date().toISOString().slice(0, 10),
        readTime: '4 min read',
        summary: c.description.slice(0, 180),
        body: [c.description],
        topicTag: activeInterests[0] || 'Menu Engineering',
        badgeType: c.badgeType,
        imageKey: 'gcc_editorial',
        businessTypes: ['Cloud Kitchen'],
        isCustom: true,
        ownerId: c.ownerId,
      }));
    return [...EDITORIAL_ITEMS_DATA, ...custom];
  }, [customItems, activeInterests]);

  // Log lightweight impressions once per item per session for Analytics stub
  useEffect(() => {
    if (!uid) return;
    const keyItems = [
      ...equipmentItems.slice(0, 4).map((i) => ({ placement: 'discover_equipment', id: i.id, title: i.name })),
      ...supplierProducts.slice(0, 4).map((i) => ({ placement: 'discover_supplier_products', id: i.id, title: i.name })),
      ...brands.slice(0, 2).map((i) => ({ placement: 'discover_brands', id: i.id, title: i.name })),
    ];
    for (const item of keyItems) {
      const cacheKey = `${item.placement}:${item.id}`;
      if (!loggedImpressionsRef.current.has(cacheKey)) {
        loggedImpressionsRef.current.add(cacheKey);
        onTrackAnalytics(item.placement, item.id, item.title, 'impression');
      }
    }
  }, [uid, equipmentItems, supplierProducts, brands, onTrackAnalytics]);

  // Collect all saved recipe texts & equipment lists for "Used in your recipes" matching
  const savedRecipeCorpus = useMemo(() => {
    const tokens: string[] = [];
    for (const v of recipeVersions) {
      tokens.push(v.method.toLowerCase());
      tokens.push(...v.equipment.map((e) => e.toLowerCase()));
    }
    for (const r of legacyRecipes) {
      tokens.push(r.tastingNotes.toLowerCase(), r.title.toLowerCase());
    }
    for (const sr of SAMPLE_EN_CUISINE_RECIPES) {
      tokens.push(sr.methodSummary.toLowerCase());
      tokens.push(...sr.requiredEquipment.map((e) => e.toLowerCase()));
    }
    return tokens.join(' ');
  }, [recipeVersions, legacyRecipes]);

  const findBookableMatch = (equip: DiscoverEquipmentItem): KitchenSpace | null => {
    if (equip.bookableSpaceHintId) {
      const direct = spaces.find((s) => s.id === equip.bookableSpaceHintId && s.isActive);
      if (direct) return direct;
    }
    for (const sp of spaces) {
      if (!sp.isActive) continue;
      const hay = `${sp.name} ${sp.description} ${sp.zone}`.toLowerCase();
      if (equip.matchKeywords.some((kw) => hay.includes(kw))) return sp;
    }
    const matchingEq = equipmentCatalog.find((eq) =>
      equip.matchKeywords.some((kw) => `${eq.name} ${eq.spec}`.toLowerCase().includes(kw))
    );
    if (matchingEq && spaces.length > 0) return spaces[0];
    return null;
  };

  // All recipes selectable in "Match to recipe ingredient" modal
  const matchableRecipes = useMemo(() => {
    const fromHost = products.map((p) => {
      const ver =
        recipeVersions.find((v) => v.id === p.currentRecipeVersionId) ||
        recipeVersions.find((v) => v.productId === p.id);
      return {
        id: p.id,
        title: p.name,
        ingredients: (ver?.ingredients || []).map((i) => i.name),
      };
    });
    const fromSamples = SAMPLE_EN_CUISINE_RECIPES.map((r) => ({
      id: r.id,
      title: r.title,
      ingredients: r.ingredients.map((i) => i.name),
    }));
    return [...fromHost, ...fromSamples];
  }, [products, recipeVersions]);

  const selectedModalRecipe = useMemo(
    () => matchableRecipes.find((r) => r.id === matchTargetRecipeId) || matchableRecipes[0],
    [matchableRecipes, matchTargetRecipeId]
  );

  // Live Kitchen Availability Highlights for Customized F&B Brief (from booking data)
  const kitchenAvailabilityHighlights = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return spaces
      .filter((s) => s.isActive)
      .map((sp) => {
        const todaysOccupied = availabilitySlots
          .filter((sl) => sl.spaceId === sp.id && sl.date === todayStr && sl.status !== 'cancelled')
          .reduce((sum, sl) => sum + (sl.endHour - sl.startHour), 0);
        const totalOperatingHours = 16; // 06:00–22:00
        const openHours = Math.max(0, totalOperatingHours - todaysOccupied);
        return {
          id: sp.id,
          name: sp.name,
          zone: sp.zone,
          openHours,
          hourlyRate: sp.hourlyRate,
        };
      });
  }, [spaces, availabilitySlots]);

  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, dir: 'prev' | 'next') => {
    if (!ref.current) return;
    const offset = dir === 'next' ? 340 : -340;
    ref.current.scrollBy({ left: isRtl ? -offset : offset, behavior: 'smooth' });
  };

  // Profile preference updaters (shared users/{uid} document)
  const saveProfilePreferences = async (patch: Partial<UserProfile>, successMsg: string) => {
    if (!uid) return;
    setSavingPrefs(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      onNotify(successMsg);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setSavingPrefs(false);
    }
  };

  const toggleFollowInfluencer = async (inf: DiscoverInfluencer) => {
    const next = new Set(followedInfluencers);
    const willFollow = !next.has(inf.id);
    if (willFollow) next.add(inf.id);
    else next.delete(inf.id);

    onTrackAnalytics('discover_influencers', inf.id, inf.name, 'click');
    await saveProfilePreferences(
      { followedInfluencerIds: Array.from(next) },
      willFollow ? `Following ${inf.name}.` : `Unfollowed ${inf.name}.`
    );
  };

  const openMatchModal = (product: DiscoverSupplierProduct) => {
    setMatchProductModal(product);
    const firstRec = matchableRecipes[0];
    setMatchTargetRecipeId(firstRec.id);
    const likelyIng =
      firstRec.ingredients.find((n) =>
        n.toLowerCase().includes(product.defaultIngredientMatch.toLowerCase().split(' ')[0])
      ) ||
      firstRec.ingredients[0] ||
      product.defaultIngredientMatch;
    setMatchTargetIngredient(likelyIng);
    onTrackAnalytics('discover_supplier_products', product.id, product.name, 'click');
  };

  const handleSaveIngredientMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchProductModal || !selectedModalRecipe || !matchTargetIngredient.trim()) return;

    const costPerKgKwd = roundKwd((matchProductModal.pricePerUnitKwd / Math.max(1, matchProductModal.packGrams)) * 1000);
    const linkId = `ec_link_${selectedModalRecipe.id}_${matchTargetIngredient.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`.slice(0, 96);
    setSavingMatch(true);
    try {
      await setDoc(doc(db, 'enCuisineIngredientLinks', linkId), {
        id: linkId,
        ownerId: uid,
        recipeId: selectedModalRecipe.id,
        recipeTitle: clampStr(selectedModalRecipe.title, 140),
        ingredientName: clampStr(matchTargetIngredient, 120),
        supplierProductId: matchProductModal.id,
        supplierProductName: clampStr(matchProductModal.name, 140),
        supplierName: clampStr(matchProductModal.supplier, 120),
        unitPriceKwd: matchProductModal.pricePerUnitKwd,
        costPerKgKwd,
        packSizeLabel: clampStr(matchProductModal.packSize, 60),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotify(
        `Matched "${matchProductModal.name}" (${formatKwd(costPerKgKwd)}/kg) to "${matchTargetIngredient}" in ${selectedModalRecipe.title}. Costing updated!`
      );
      setMatchProductModal(null);
      onOpenCostingTab();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `enCuisineIngredientLinks/${linkId}`);
    } finally {
      setSavingMatch(false);
    }
  };

  const handleSubmitNewBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(newBrandName, 160);
    if (!cleanName || !newBrandPitch.trim()) {
      onNotify('Enter your brand name and one-line pitch.', 'error');
      return;
    }
    const brandId = `ec_brand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = serverTimestamp();
    setSubmittingBrand(true);
    try {
      await setDoc(doc(db, 'enCuisineItems', brandId), {
        id: brandId,
        ownerId: uid,
        sectionType: 'brand',
        title: cleanName,
        subtitle: clampStr(newBrandCountry || 'Kuwait', 160),
        category: clampStr(newBrandCategory || 'Kuwait Artisanal', 100),
        description: clampStr(
          newBrandStory.trim() ? `${newBrandPitch.trim()} — ${newBrandStory.trim()}` : newBrandPitch.trim(),
          1800
        ),
        priceKwd: 0,
        badgeType: 'none',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      onNotify(`Submitted "${cleanName}" to En Cuisine New Brands spotlight.`);
      setNewBrandName('');
      setNewBrandPitch('');
      setNewBrandStory('');
      setAddBrandOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `enCuisineItems/${brandId}`);
    } finally {
      setSubmittingBrand(false);
    }
  };

  const handleSaveNewsletterPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfilePreferences(
      {
        newsletterSubscribed,
        newsletterTopics,
      },
      newsletterSubscribed
        ? 'Newsletter preferences saved to your profile.'
        : 'Newsletter preference updated.'
    );
  };

  const visibleInfluencers = useMemo(() => {
    if (selectedInfluencerChip === 'All') return influencers;
    return influencers.filter((i) => i.specialty === selectedInfluencerChip);
  }, [influencers, selectedInfluencerChip]);

  const visibleEditorial = useMemo(
    () => editorialItems.filter((item) => item.tabType === activeEditorialTab),
    [editorialItems, activeEditorialTab]
  );

  return (
    <div className="space-y-10">
      {/* Personalization / Onboarding Preference Strip (Drives ordering & reports) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#0B3B2B]">
              Personalize Your Kuwait &amp; GCC Feed
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Business Profile &amp; Discovery Focus
            </h2>
            <p className="text-xs text-slate-600">
              Saved directly to your shared user profile — reorders Featured Influencers and tailors your Monthly F&amp;B Brief.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-slate-500">Operation Type</span>
              <select
                value={activeBusinessType}
                disabled={savingPrefs}
                onChange={(e) =>
                  saveProfilePreferences(
                    { businessType: e.target.value },
                    `Feed tailored for ${e.target.value}.`
                  )
                }
                className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900"
              >
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-medium text-slate-500 mr-1">Focus Topics:</span>
          {DISCOVER_INTERESTS.map((topic) => {
            const active = activeInterests.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                disabled={savingPrefs}
                onClick={() => {
                  const next = active
                    ? activeInterests.filter((t) => t !== topic)
                    : [...activeInterests, topic];
                  saveProfilePreferences(
                    { discoverInterests: next },
                    'Updated Discover interests.'
                  );
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#0B3B2B] border-[#0B3B2B] text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-[#0B3B2B]'
                }`}
              >
                {active && <Check className="w-3 h-3 inline mr-1" />}
                {topic}
              </button>
            );
          })}
        </div>
      </section>

      {/* 3a. Featured Equipment Carousel */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="text-xs font-semibold text-[#0B3B2B]">3a. Commercial Hardware</div>
            <h2 className="text-xl font-bold text-slate-900">Featured Equipment</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Chef&apos;s Tools &amp; Gadgets · Commercial Refrigerators &amp; Freezers · Food Processors &amp; Blenders · Sous Vide Machines
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollContainer(equipCarouselRef, 'prev')}
              aria-label="Scroll equipment left"
              className="p-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollContainer(equipCarouselRef, 'next')}
              aria-label="Scroll equipment right"
              className="p-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={equipCarouselRef}
          className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory"
        >
          {equipmentItems.map((item) => {
            const usedInRecipe = item.matchKeywords.some((kw) => savedRecipeCorpus.includes(kw));
            const bookableSpace = findBookableMatch(item);

            return (
              <article
                key={item.id}
                className="min-w-[290px] max-w-[310px] snap-start bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col shrink-0"
              >
                <div className="h-44 bg-slate-100 relative">
                  <EnCuisineMedia
                    imageKey={item.imageKey}
                    alt={item.name}
                    fallbackLabel={item.category}
                    kind="equipment"
                  />
                  {item.badgeType !== 'none' && (
                    <span
                      className={`absolute top-2.5 left-2.5 px-2 py-0.5 text-[11px] font-semibold rounded ${
                        item.badgeType === 'sponsored'
                          ? 'bg-orange-600 text-white'
                          : 'bg-[#08291E] text-emerald-100'
                      }`}
                    >
                      {item.badgeType === 'sponsored' ? 'Sponsored' : 'Featured'}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-[#0B3B2B] truncate">
                      {item.category}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {item.name}
                    </h3>
                    <div className="text-xs text-slate-500">
                      {item.supplier}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {item.spec}
                    </p>

                    {(usedInRecipe || bookableSpace) && (
                      <div className="pt-1 flex flex-col gap-1 text-[11px]">
                        {usedInRecipe && (
                          <span className="font-semibold text-[#0B3B2B]">
                            · Used in your recipes
                          </span>
                        )}
                        {bookableSpace && (
                          <button
                            type="button"
                            onClick={() => {
                              onTrackAnalytics('discover_equipment', item.id, item.name, 'click');
                              if (!canBookKitchen) {
                                onNotify(`Available in ${bookableSpace.name} (switch to Member/Chef role to reserve).`);
                                return;
                              }
                              onBookKitchen({
                                spaceId: bookableSpace.id,
                                equipmentNames: [item.name],
                                notes: `Discover Equipment Link: ${item.name} (${item.category})`,
                              });
                            }}
                            className="text-left font-semibold text-orange-700 hover:text-orange-800 underline underline-offset-2 inline-flex items-center gap-1"
                          >
                            Available in bookable kitchens ({bookableSpace.name})
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                      {formatKwd(item.priceKwd)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onTrackAnalytics('discover_equipment', item.id, item.name, 'click');
                        setSupplierHubModalEquip(item);
                      }}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      View in Supplier Hub
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3b. Featured Supplier Hub Products Carousel */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="text-xs font-semibold text-[#0B3B2B]">3b. Wholesale Pantry &amp; Live Costing Sync</div>
            <h2 className="text-xl font-bold text-slate-900">Featured Supplier Hub Products</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Aged Balsamic Vinegar · Pomegranate Molasses · Truffle Oil · Extra Virgin Olive Oil
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollContainer(supplierCarouselRef, 'prev')}
              aria-label="Scroll supplier products left"
              className="p-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollContainer(supplierCarouselRef, 'next')}
              aria-label="Scroll supplier products right"
              className="p-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={supplierCarouselRef}
          className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory"
        >
          {supplierProducts.map((prod) => {
            const perKg = roundKwd((prod.pricePerUnitKwd / Math.max(1, prod.packGrams)) * 1000);
            const matchedCount = ingredientLinks.filter((l) => l.supplierProductId === prod.id).length;

            return (
              <article
                key={prod.id}
                className="min-w-[290px] max-w-[310px] snap-start bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col shrink-0"
              >
                <div className="h-40 bg-slate-100 relative">
                  <EnCuisineMedia
                    imageKey={prod.imageKey}
                    alt={prod.name}
                    fallbackLabel={prod.category}
                    kind="supplier"
                  />
                  {prod.badgeType !== 'none' && (
                    <span
                      className={`absolute top-2.5 left-2.5 px-2 py-0.5 text-[11px] font-semibold rounded ${
                        prod.badgeType === 'sponsored'
                          ? 'bg-orange-600 text-white'
                          : 'bg-[#08291E] text-emerald-100'
                      }`}
                    >
                      {prod.badgeType === 'sponsored' ? 'Sponsored' : 'Featured'}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      {prod.origin} · MOQ {prod.moq}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {prod.name}
                    </h3>
                    <div className="text-xs text-slate-600">
                      Supplier: <span className="font-medium text-slate-800">{prod.supplier}</span>
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-600">
                      Pack: {prod.packSize} · {formatKwd(perKg)}/kg
                    </div>
                    {matchedCount > 0 && (
                      <div className="text-[11px] font-semibold text-[#0B3B2B]">
                        Linked to {matchedCount} recipe ingredient{matchedCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-500">{prod.unitLabel}</span>
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                        {formatKwd(prod.pricePerUnitKwd)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMatchModal(prod)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B3B2B] hover:bg-[#08291E] text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
                    >
                      <Link2 className="w-3.5 h-3.5 text-orange-400" />
                      Match to recipe ingredient
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3c. Featured Influencers */}
      <section className="space-y-4">
        <div className="border-b border-slate-200 pb-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-[#0B3B2B]">3c. Kuwait &amp; GCC Culinary Voices</div>
            <h2 className="text-xl font-bold text-slate-900">Featured Influencers</h2>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['All', ...INFLUENCER_SPECIALTIES] as const).map((chip) => {
              const active = selectedInfluencerChip === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSelectedInfluencerChip(chip)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#08291E] border-[#08291E] text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-[#0B3B2B]'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleInfluencers.map((inf) => {
            const isFollowing = followedInfluencers.has(inf.id);
            return (
              <article
                key={inf.id}
                className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-[#0B3B2B] text-white flex items-center justify-center font-mono text-sm font-bold shrink-0">
                        {inf.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 truncate">{inf.name}</h3>
                        <div className="text-xs text-slate-500 truncate">
                          {inf.handle} · {inf.city}
                        </div>
                      </div>
                    </div>
                    {inf.badgeType !== 'none' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 shrink-0">
                        {inf.badgeType}
                      </span>
                    )}
                  </div>

                  <div className="text-xs font-semibold text-[#0B3B2B]">
                    {inf.specialty} · <span className="font-mono font-normal text-slate-500">{inf.followersLabel}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{inf.bio}</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFollowInfluencer(inf)}
                  className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${
                    isFollowing
                      ? 'bg-emerald-50 border-[#0B3B2B] text-[#0B3B2B]'
                      : 'bg-orange-600 hover:bg-orange-700 border-orange-600 text-white'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      Follow
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3d. New Brands (Seeded with BanaBites Kuwait-made brand) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="text-xs font-semibold text-[#0B3B2B]">3d. Kuwait &amp; Regional Makers</div>
            <h2 className="text-xl font-bold text-slate-900">New Brands Spotlight</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Emerging Kuwaiti and GCC F&amp;B producers ready for wholesale supply and menu collaboration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddBrandOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add your brand
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {brands.map((brand) => (
            <article
              key={brand.id}
              className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <BrandEmblem code={brand.logoCode} name={brand.name} />
                  {brand.badgeType !== 'none' && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                        brand.badgeType === 'sponsored'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-emerald-50 text-[#0B3B2B]'
                      }`}
                    >
                      {brand.badgeType === 'sponsored' ? 'Sponsored' : 'Featured'}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">{brand.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {brand.country} · {brand.category}
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{brand.pitch}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onTrackAnalytics('discover_brands', brand.id, brand.name, 'click');
                  setBrandModal(brand);
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-[#0B3B2B] bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
              >
                View Brand
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* 3e. Innovations, F&B News & Reports */}
      <section className="space-y-6">
        <div className="border-b border-slate-200 pb-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-[#0B3B2B]">3e. Intelligence &amp; Briefings</div>
            <h2 className="text-xl font-bold text-slate-900">Innovations, F&amp;B News &amp; Reports</h2>
          </div>

          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
            {EDITORIAL_TABS.map((tab) => {
              const active = activeEditorialTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveEditorialTab(tab)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#08291E] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editorial Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visibleEditorial.map((item) => (
            <article
              key={item.id}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col sm:flex-row"
            >
              <div className="sm:w-44 h-40 sm:h-auto bg-slate-100 shrink-0">
                <EnCuisineMedia
                  imageKey={item.imageKey}
                  alt={item.title}
                  fallbackLabel={item.tabType}
                  kind="editorial"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-500">
                    {item.topicTag} · {item.publishedDate} · {item.readTime}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onTrackAnalytics('discover_editorial', item.id, item.title, 'click');
                    setReaderEditorial(item);
                  }}
                  className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Open Reader View
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Newsletter Panel + Customized Monthly F&B Brief Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Newsletter Panel */}
          <form
            onSubmit={handleSaveNewsletterPreferences}
            className="lg:col-span-5 bg-[#08291E] text-white rounded-lg p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-400">
              <Mail className="w-4 h-4" />
              Monthly Kuwait F&amp;B Newsletter
            </div>
            <h3 className="text-lg font-bold">
              Supplier Price Alerts &amp; R&amp;D Briefings
            </h3>
            <p className="text-xs text-emerald-100/80 leading-relaxed">
              Dispatched monthly to <span className="font-mono text-white">{userProfile?.email || 'your account email'}</span>. Topic preferences save to your shared profile.
            </p>

            <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer py-1">
              <input
                type="checkbox"
                checked={newsletterSubscribed}
                onChange={(e) => setNewsletterSubscribed(e.target.checked)}
                className="w-4 h-4 accent-orange-500 rounded"
              />
              <span>Subscribe me to the Monthly F&amp;B Dispatch</span>
            </label>

            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-medium text-emerald-200">Select Topic Preferences:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {DISCOVER_INTERESTS.map((topic) => {
                  const checked = newsletterTopics.includes(topic);
                  return (
                    <label
                      key={topic}
                      className="flex items-center gap-2 text-xs text-emerald-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewsletterTopics((prev) =>
                            checked ? prev.filter((t) => t !== topic) : [...prev, topic]
                          )
                        }
                        className="accent-orange-500 rounded"
                      />
                      <span className="truncate">{topic}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPrefs}
              className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors"
            >
              {savingPrefs ? 'Saving Preferences...' : 'Save Newsletter Preferences'}
            </button>
          </form>

          {/* Customized Reports Panel ("Monthly F&B Brief") */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5 print:border-0 print:p-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#0B3B2B] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Customized Report · {activeBusinessType}
                </div>
                <h3 className="text-lg font-bold text-slate-900">Monthly F&amp;B Brief</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0 print:hidden">
                <button
                  type="button"
                  onClick={() => setShowBriefPreview((v) => !v)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  {showBriefPreview ? 'Collapse Brief' : 'Generate Brief'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBriefPreview(true);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print to PDF
                </button>
              </div>
            </div>

            {showBriefPreview && (
              <div className="space-y-5 text-xs">
                {/* 1. Trending Ingredients */}
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-900">
                    1. Trending Ingredients for {activeBusinessType}
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    High buyer velocity in Kuwait this month: Cultured Normandy Butter, Green Cardamom Pods, Grade-A Sargol Saffron, and Cold-Pressed Pomegranate Molasses across {activeInterests.slice(0, 2).join(' & ')}.
                  </p>
                </div>

                {/* 2. Supplier Price Movements in KWD */}
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">
                    2. Supplier Price Movements (KWD)
                  </div>
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
                    {KWD_PRICE_MOVEMENTS.map((mv) => (
                      <div key={mv.ingredient} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-medium text-slate-900">{mv.ingredient}</span>
                          <span className="text-slate-500 ml-2">· {mv.note}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                          <span
                            className={`inline-flex items-center gap-0.5 font-semibold ${
                              mv.direction === 'up' ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {mv.direction === 'up' ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {mv.changePct}
                          </span>
                          <span className="font-bold text-slate-900">{formatKwd(mv.currentKwd)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. New Brands */}
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">3. New Brands to Watch</div>
                  <div className="text-slate-600">
                    {brands.slice(0, 3).map((b) => `${b.name} (${b.country})`).join(' · ')}
                  </div>
                </div>

                {/* 4. Live Kitchen Availability Highlights (Pulled from Existing Booking Data) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      4. Today&apos;s Kitchen Availability Highlights (Live Booking Feed)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date().toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {kitchenAvailabilityHighlights.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          if (!canBookKitchen) return;
                          onBookKitchen({
                            spaceId: sp.id,
                            notes: `Booked from Monthly F&B Brief highlight (${sp.name})`,
                          });
                        }}
                        className="p-3 text-left bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between gap-2 transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{sp.name}</div>
                          <div className="text-[11px] text-slate-500">{sp.zone}</div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="font-bold text-[#0B3B2B]">{sp.openHours}h open</div>
                          <div className="text-[11px] text-slate-500">${sp.hourlyRate}/hr</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MODAL: Equipment -> View in Supplier Hub */}
      {supplierHubModalEquip && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0B3B2B]">
                  Supplier Hub Equipment Listing · {supplierHubModalEquip.supplierCity}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{supplierHubModalEquip.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSupplierHubModalEquip(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <strong>Supplier:</strong> {supplierHubModalEquip.supplier}
              </div>
              <div>
                <strong>Commercial Price:</strong>{' '}
                <span className="font-mono tabular-nums font-bold text-[#0B3B2B]">
                  {formatKwd(supplierHubModalEquip.priceKwd)}
                </span>
              </div>
              <div>
                <strong>Warranty &amp; Service:</strong> {supplierHubModalEquip.warrantyMonths} months Kuwait on-site technician coverage
              </div>
              <p className="text-xs text-slate-600 pt-1">{supplierHubModalEquip.spec}</p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              {canBookKitchen && findBookableMatch(supplierHubModalEquip) && (
                <button
                  type="button"
                  onClick={() => {
                    const matched = findBookableMatch(supplierHubModalEquip);
                    setSupplierHubModalEquip(null);
                    if (matched) {
                      onBookKitchen({
                        spaceId: matched.id,
                        equipmentNames: [supplierHubModalEquip.name],
                        notes: `Test-run booking for ${supplierHubModalEquip.name}`,
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B3B2B] bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Try in Bookable Kitchen
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onNotify(`RFQ sent to ${supplierHubModalEquip.supplier} for ${supplierHubModalEquip.name}.`);
                  setSupplierHubModalEquip(null);
                }}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md"
              >
                Request Supplier Quote (KWD)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Supplier Hub Product -> Match to recipe ingredient */}
      {matchProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveIngredientMatch}
            className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0B3B2B]">
                  Supplier Hub Costing Sync
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Match Product to Recipe Ingredient
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMatchProductModal(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-md p-3 text-xs space-y-1">
              <div className="font-bold text-slate-900">{matchProductModal.name}</div>
              <div className="text-slate-600">
                {matchProductModal.supplier} · {matchProductModal.packSize} ·{' '}
                <span className="font-mono font-semibold text-[#0B3B2B]">
                  {formatKwd(matchProductModal.pricePerUnitKwd)} ({formatKwd(roundKwd((matchProductModal.pricePerUnitKwd / Math.max(1, matchProductModal.packGrams)) * 1000))}/kg)
                </span>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Target Recipe</span>
              <select
                value={selectedModalRecipe?.id || ''}
                onChange={(e) => {
                  const recId = e.target.value;
                  setMatchTargetRecipeId(recId);
                  const found = matchableRecipes.find((r) => r.id === recId);
                  if (found?.ingredients[0]) setMatchTargetIngredient(found.ingredients[0]);
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {matchableRecipes.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {rec.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Ingredient to Override</span>
              {selectedModalRecipe && selectedModalRecipe.ingredients.length > 0 ? (
                <select
                  value={matchTargetIngredient}
                  onChange={(e) => setMatchTargetIngredient(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  {selectedModalRecipe.ingredients.map((ing) => (
                    <option key={ing} value={ing}>
                      {ing}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={matchTargetIngredient}
                  onChange={(e) => setMatchTargetIngredient(e.target.value)}
                  placeholder="Enter ingredient name"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  required
                />
              )}
            </label>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setMatchProductModal(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingMatch}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md"
              >
                {savingMatch ? 'Updating Costing...' : 'Apply Real Supplier Price'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: View Brand */}
      {brandModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full overflow-hidden">
            <div className="h-44 bg-slate-100">
              <EnCuisineMedia
                imageKey={brandModal.imageKey}
                alt={brandModal.name}
                fallbackLabel={brandModal.name}
                kind="brand"
              />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BrandEmblem code={brandModal.logoCode} name={brandModal.name} />
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{brandModal.name}</h3>
                    <div className="text-xs text-slate-500">
                      {brandModal.country} · {brandModal.category} · Est. {brandModal.foundedYear}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBrandModal(null)}
                  className="p-1 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm font-medium text-[#0B3B2B]">{brandModal.pitch}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{brandModal.story}</p>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Distribution: {brandModal.retailPresence}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    onNotify(`Wholesale sample request sent to ${brandModal.name}.`);
                    setBrandModal(null);
                  }}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md"
                >
                  Request B2B Sample Kit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Your Brand */}
      {addBrandOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitNewBrand}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#0B3B2B]">New Brands Directory</div>
                <h3 className="text-lg font-bold text-slate-900">Add Your Brand</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddBrandOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Brand Name</span>
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="e.g. Kuwait Roast & Tahini"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">Country</span>
                <input
                  type="text"
                  value={newBrandCountry}
                  onChange={(e) => setNewBrandCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-700">Category</span>
                <input
                  type="text"
                  value={newBrandCategory}
                  onChange={(e) => setNewBrandCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">One-Line Pitch</span>
              <input
                type="text"
                value={newBrandPitch}
                onChange={(e) => setNewBrandPitch(e.target.value)}
                placeholder="What makes your Kuwait/GCC brand unique for F&B buyers?"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Origin Story &amp; Wholesale Capacity</span>
              <textarea
                rows={2}
                value={newBrandStory}
                onChange={(e) => setNewBrandStory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAddBrandOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingBrand}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md"
              >
                {submittingBrand ? 'Publishing...' : 'Publish Brand Card'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Editorial Reader View */}
      {readerEditorial && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[88vh] overflow-y-auto">
            <div className="h-52 bg-slate-100">
              <EnCuisineMedia
                imageKey={readerEditorial.imageKey}
                alt={readerEditorial.title}
                fallbackLabel={readerEditorial.tabType}
                kind="editorial"
              />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#0B3B2B]">
                    {readerEditorial.tabType} · {readerEditorial.topicTag}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    {readerEditorial.title}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1">
                    {readerEditorial.author} · {readerEditorial.publishedDate} · {readerEditorial.readTime}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReaderEditorial(null)}
                  className="p-1 text-slate-500 hover:text-slate-900 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm font-medium text-slate-800 border-b border-slate-200 pb-3">
                {readerEditorial.summary}
              </p>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                {readerEditorial.body.map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
