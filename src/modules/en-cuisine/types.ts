import type { RecipeCategory, SupplierRfqRequestType } from '../../types';

export type EnCuisineTab =
  | 'recipes'
  | 'menu'
  | 'costing'
  | 'versions'
  | 'inventory'
  | 'supplier-portal'
  | 'discover';

export type DiscoverPlacementType =
  | 'equipment'
  | 'supplier_product'
  | 'influencer'
  | 'brand'
  | 'editorial';

export type EnCuisineBadgeType = 'none' | 'featured' | 'sponsored';

export type EquipmentGroup =
  | "Chef's Tools & Gadgets"
  | 'Commercial Refrigerators & Freezers'
  | 'Food Processors & Blenders'
  | 'Sous Vide Machines';

export type InfluencerSpecialty =
  | 'Culinary Innovators'
  | 'Beverage Connoisseurs'
  | 'Dessert Artists'
  | 'Restaurant Reviewers'
  | 'Health & Wellness Cuisine'
  | 'Food Photography & Styling Experts';

export type EditorialTabType =
  | 'News Article'
  | 'Blog Post'
  | 'Monthly Newsletter'
  | 'Featured Restaurants & Success Stories';

export type BusinessType =
  | 'Cloud Kitchen'
  | 'Bakery & Pastry'
  | 'Fine Dining'
  | 'Cafe & Beverage'
  | 'FMCG / Snack Brand'
  | 'Catering & Commissary';

export interface DiscoverEquipmentItem {
  id: string;
  name: string;
  category: EquipmentGroup;
  supplier: string;
  supplierCity: string;
  priceKwd: number;
  warrantyMonths: number;
  spec: string;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  imageKey: string;
  matchKeywords: string[];
  bookableSpaceHintId?: string;
  businessTypes: BusinessType[];
  isCustom?: boolean;
  ownerId?: string;
}

export interface DiscoverSupplierProduct {
  id: string;
  name: string;
  packSize: string;
  packGrams: number;
  unitLabel: string;
  pricePerUnitKwd: number;
  supplier: string;
  moq: number;
  origin: string;
  category: string;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  imageKey: string;
  defaultIngredientMatch: string;
  businessTypes: BusinessType[];
  isCustom?: boolean;
  ownerId?: string;
}

export interface DiscoverInfluencer {
  id: string;
  name: string;
  handle: string;
  city: string;
  specialty: InfluencerSpecialty;
  bio: string;
  followersLabel: string;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  avatarInitials: string;
  businessTypes: BusinessType[];
  isCustom?: boolean;
  ownerId?: string;
}

export interface DiscoverBrand {
  id: string;
  name: string;
  country: string;
  category: string;
  pitch: string;
  story: string;
  foundedYear: number;
  retailPresence: string;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  imageKey: string;
  logoCode: string;
  businessTypes: BusinessType[];
  isCustom?: boolean;
  ownerId?: string;
}

export interface DiscoverEditorialItem {
  id: string;
  tabType: EditorialTabType;
  title: string;
  author: string;
  publishedDate: string;
  readTime: string;
  summary: string;
  body: string[];
  topicTag: string;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  imageKey: string;
  businessTypes: BusinessType[];
  isCustom?: boolean;
  ownerId?: string;
}

export interface EnCuisineCatalogDoc {
  id: string;
  ownerId: string;
  sectionType: DiscoverPlacementType;
  title: string;
  subtitle: string;
  category: string;
  description: string;
  priceKwd?: number;
  badgeType: EnCuisineBadgeType;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  metadata?: Record<string, string | number | boolean>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EnCuisineIngredientLink {
  id: string;
  ownerId: string;
  recipeId: string;
  recipeTitle: string;
  ingredientName: string;
  supplierProductId: string;
  supplierProductName: string;
  supplierName: string;
  unitPriceKwd: number;
  costPerKgKwd: number;
  packSizeLabel: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EnCuisineAnalyticsEvent {
  id: string;
  ownerId: string;
  placement: string;
  itemId: string;
  itemTitle: string;
  eventType: 'impression' | 'click';
  createdAt?: unknown;
}

export interface CoreRecipeSample {
  id: string;
  title: string;
  arabicTitle: string;
  category: string;
  version: string;
  yieldUnits: number;
  yieldUnit: string;
  estimatedHours: number;
  bakersHydrationPct: number;
  cookingLossPct: number;
  requiredEquipment: string[];
  recommendedSpaceId: string;
  methodSummary: string;
  ingredients: {
    name: string;
    grams: number;
    baseCostPerKgKwd: number;
    bakersPct: number;
  }[];
}

export interface LibraryIngredient {
  id: string;
  name: string;
  cat: string;
  custom?: boolean;
  vegan: boolean;
  allergens: string[];
  costUnit?: 'piece' | 'unit' | 'roll';
  costKg: number;
  wastagePct?: number;
  pieceWeightG?: number;
  bulkPieces?: number;
  costPerUnit?: number;
  bulkUnitQty?: number;
  rollLengthM?: number;
  rollWidthMM?: number;
  gsm?: number;
  costPerRoll?: number;
  wrapLengthCmPerUnit?: number;
  bulkQty?: number;
  bulkUnit?: 'kg' | 'g';
  bulkCost?: number;
  bulkCurrency?: string;
  kcal: number;
  fat: number;
  satFat: number;
  sugar: number;
  protein: number;
  carbs: number;
  ecode?: string;
  dosage?: string;
  func?: string;
  note?: string;
}

export interface BuilderLineItem {
  id: string;
  g: number;
  supplier?: string;
}

export interface BuilderDraftState {
  name: string;
  category: RecipeCategory;
  unitWeightG: number;
  prepMinutes: number;
  targetTempC: number;
  methodNotes: string;
  overheadCostKwd: number;
  markupPct: number;
  equipment: string[];
  items: BuilderLineItem[];
  sourceProductId?: string;
  sourceVersionNumber?: number;
}

export interface NutritionLookupResult {
  name: string;
  kcal: number;
  fat: number;
  satFat: number;
  sugar: number;
  protein: number;
  carbs: number;
  allergens: string[];
  vegan: boolean;
  source: 'live_api' | 'local_reference_database' | 'local_estimate';
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export interface InvoiceExtractedLine {
  name: string;
  qty: number;
  unit: 'kg' | 'g' | 'pcs';
  cost: number;
}

export interface RfqPrefillRequest {
  key: number;
  itemName: string;
  requestType?: SupplierRfqRequestType;
  categoryPath?: string;
  quantity?: number;
  unit?: string;
  sourceRecipeName?: string;
  specifications?: string;
}

