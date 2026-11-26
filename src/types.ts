export type SpaceZone = 'Pastry' | 'Hot Line' | 'Cold Prep' | 'R&D Lab';
export type EquipmentCategory = 'Thermal' | 'Mixing' | 'Cooling' | 'Packaging' | 'Precision';
export type BookingStatus = 'confirmed' | 'in-progress' | 'completed' | 'cancelled';
export type QueueStatus = 'waiting' | 'promoted' | 'cancelled';
export type MaterialCategory = 'Flour & Dry' | 'Dairy & Fats' | 'Produce' | 'Proteins' | 'Specialty' | 'Packaging';
export type MaterialUnit = 'kg' | 'g' | 'L' | 'mL' | 'units';
export type StorageZone = 'Dry Pantry' | 'Walk-In Cooler' | 'Deep Freezer' | 'Prep Bench';
export type RecipeCategory = 'Bakery' | 'Sauce & Emulsion' | 'Fermentation' | 'Plant-Based' | 'Confectionery' | 'Savory Prep';
export type RecipeOutcome = 'approved' | 'iterate' | 'archived';
export type StaffRole = 'Sous Chef' | 'Prep Cook' | 'Sanitation Lead' | 'Facility Tech' | 'R&D Baker';
export type StaffShift = 'Morning' | 'Midday' | 'Evening';
export type DutyPriority = 'low' | 'normal' | 'urgent';
export type DutyStatus = 'pending' | 'in-progress' | 'completed';
export type LogEventType = 'booking' | 'material' | 'recipe' | 'duty' | 'sanitation' | 'equipment' | 'incident' | 'production';
export type LogSeverity = 'info' | 'warn' | 'critical';
export type ProductionUnit = 'units' | 'kg' | 'g' | 'L' | 'trays';
export type QcStatus = 'passed' | 'hold' | 'failed';
export type FormProcessType = 'hot' | 'cold';
export type CustomFormQuestionType = 'scale' | 'choice' | 'text';
export type ProductStatus = 'active' | 'testing' | 'archived';
export type ValidationStatus =
  | 'draft'
  | 'testing'
  | 'consumer_validated'
  | 'production_validated'
  | 'approved';
export type ExperimentDecision = 'adopt' | 'reject' | 'continue';
export type MaterialOrderStatus = 'ordered' | 'in-transit' | 'received' | 'cancelled';

export type UserRole =
  | 'member'
  | 'recipe_dev'
  | 'kitchen_manager'
  | 'kitchen_worker'
  | 'aggregator'
  | 'admin';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  member: 'Normal User',
  recipe_dev: 'Recipe Developer',
  kitchen_manager: 'Kitchen Manager',
  kitchen_worker: 'Kitchen Worker',
  aggregator: 'Aggregator',
  admin: 'Admin',
};

export type ActiveSection =
  | 'booking'
  | 'en-cuisine'
  | 'production'
  | 'surveys'
  | 'materials'
  | 'recipes'
  | 'logs'
  | 'duties'
  | 'orders'
  | 'menu'
  | 'admin-lite'
  | 'admin';

export const ROLE_NAV_MAP: Record<UserRole, ActiveSection[]> = {
  member: ['booking', 'en-cuisine'],
  recipe_dev: ['en-cuisine', 'production', 'surveys', 'materials', 'booking', 'logs'],
  kitchen_manager: ['production', 'materials', 'en-cuisine', 'duties', 'logs', 'admin-lite'],
  kitchen_worker: ['production', 'duties', 'en-cuisine'],
  aggregator: ['orders', 'en-cuisine'],
  admin: [
    'booking',
    'en-cuisine',
    'production',
    'surveys',
    'materials',
    'logs',
    'duties',
    'orders',
    'admin',
  ],
};

export const POINTS_PER_HOUR = 100;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  loyaltyPoints: number;
  totalHoursBooked: number;
  businessType?: string;
  discoverInterests?: string[];
  newsletterSubscribed?: boolean;
  newsletterTopics?: string[];
  followedInfluencerIds?: string[];
  preferredDir?: 'ltr' | 'rtl';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookingPrefillRequest {
  key: number;
  spaceId?: string;
  durationHours?: number;
  notes?: string;
  equipmentNames?: string[];
}

export interface KitchenSpace {
  id: string;
  name: string;
  zone: SpaceZone;
  sqFt: number;
  capacity: number;
  hourlyRate: number;
  description: string;
  imagePath: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KitchenEquipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  spec: string;
  hourlyRate: number;
  totalUnits: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AvailabilitySlot {
  id?: string;
  bookingId: string;
  ownerId: string;
  spaceId: string;
  date: string;
  startHour: number;
  endHour: number;
  status: BookingStatus;
  updatedAt?: unknown;
}

export interface BookedEquipmentItem {
  equipmentId: string;
  name: string;
  quantity: number;
  hourlyRate: number;
}

export interface Booking {
  id: string;
  ownerId: string;
  chefName: string;
  spaceId: string;
  spaceName: string;
  date: string;
  startHour: number;
  durationHours: number;
  endHour: number;
  equipmentItems: BookedEquipmentItem[];
  spaceSubtotal: number;
  equipmentSubtotal: number;
  totalCost: number;
  pointsEarned: number;
  status: BookingStatus;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookingQueueEntry {
  id: string;
  ownerId: string;
  chefName: string;
  spaceId: string;
  spaceName: string;
  date: string;
  startHour: number;
  durationHours: number;
  endHour: number;
  equipmentItems: BookedEquipmentItem[];
  estimatedTotal: number;
  status: QueueStatus;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductionBatch {
  id: string;
  ownerId: string;
  producerName: string;
  bookingId: string;
  date: string;
  batchNumber: string;
  productName: string;
  quantityProduced: number;
  unit: ProductionUnit;
  bakeTempC: number;
  textureScore: number;
  flavorScore: number;
  appearanceScore: number;
  qcScore: number;
  qcStatus: QcStatus;
  productionNotes: string;
  attachedFormId: string;
  formResponseCount: number;
  formAvgRating: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomFormQuestion {
  title: string;
  type: CustomFormQuestionType;
  required: boolean;
  options?: string[];
}

export interface AttachedGoogleForm {
  id: string;
  ownerId: string;
  formId: string;
  title: string;
  responderUri: string;
  date: string;
  bookingId: string;
  batchNumbers: string[];
  productsSummary: string;
  responseCount: number;
  bestBatchNumber: string;
  bestBatchScore: number;
  processType?: FormProcessType;
  testedPricePoint?: number;
  willingToPayPct?: number;
  avgSweetness?: number;
  customQuestions?: CustomFormQuestion[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RawMaterial {
  id: string;
  ownerId: string;
  name: string;
  category: MaterialCategory;
  quantity: number;
  unit: MaterialUnit;
  unitCost: number;
  lotCode: string;
  supplier: string;
  storageZone: StorageZone;
  bookingId: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
}

export interface RecipeTest {
  id: string;
  ownerId: string;
  title: string;
  version: string;
  category: RecipeCategory;
  bookingId: string;
  prepMinutes: number;
  targetTempC: number;
  yieldText: string;
  ingredients: RecipeIngredient[];
  tastingNotes: string;
  outcome: RecipeOutcome;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  ownerId: string;
  name: string;
  category: RecipeCategory;
  status: ProductStatus;
  currentRecipeVersionId: string;
  targetMarkupPct?: number;
  sellingPriceKwd?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NutritionMacros {
  kcal: number;
  fat: number;
  satFat: number;
  sugar: number;
  protein: number;
  carbs: number;
}

export interface BakeTestResult {
  beforeG: number;
  afterG: number;
  trimG: number;
  unitWeightG: number;
  moistureLossPct: number;
  usableWeightG: number;
  wastagePct: number;
  theoreticalYieldPieces: number;
  actualYieldPieces: number;
  loggedAt?: string;
}

export interface VersionDiffItem {
  field: string;
  from: string | number;
  to: string | number;
}

export interface InventoryHistoryEntry {
  date: string;
  type: 'received' | 'consumed' | 'adjusted';
  qty: number;
  note: string;
}

export type IngredientCostUnit = 'weight' | 'piece' | 'unit' | 'roll';

export interface IngredientLibraryDoc {
  id: string;
  ownerId: string;
  ingredientId: string;
  name: string;
  cat: string;
  custom: boolean;
  vegan: boolean;
  allergens: string[];
  costUnit: IngredientCostUnit;
  costKg: number;
  wastagePct: number;
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
  stockQty: number;
  history: InventoryHistoryEntry[];
  isDeleted?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecipeVersionIngredient {
  name: string;
  amountG: number;
  unit: string;
  displayAmount?: number;
  unitCostKwd?: number;
  ingredientId?: string;
  cat?: string;
  supplier?: string;
  isPackaging?: boolean;
}

export interface RecipeVersion {
  id: string;
  productId: string;
  ownerId: string;
  versionNumber: number;
  ingredients: RecipeVersionIngredient[];
  batchSize: number;
  expectedYield: number;
  yieldUnit: string;
  prepMinutes: number;
  targetTempC: number;
  method: string;
  equipment: string[];
  expectedCost: number;
  packagingCostKwd?: number;
  overheadCostKwd?: number;
  markupPct?: number;
  suggestedPriceKwd?: number;
  targetPieceWeightG?: number;
  nutritionPer100g?: NutritionMacros;
  allergens?: string[];
  additives?: string[];
  bakeTest?: BakeTestResult;
  score?: number;
  scoreNotes?: string;
  diffs?: VersionDiffItem[];
  changeReason: string;
  expectedEffect: string;
  actualOutcome: string;
  validationStatus: ValidationStatus;
  legacyRecipeId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecipeExperiment {
  id: string;
  productId: string;
  ownerId: string;
  objective: string;
  baselineVersionId: string;
  variableChanged: string;
  experimentVersionId: string;
  expectedResult: string;
  decision: ExperimentDecision;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MaterialOrderItem {
  materialName: string;
  category: MaterialCategory;
  quantity: number;
  unit: MaterialUnit;
  gramsTotal: number;
  unitCostKwd: number;
  lineTotalKwd: number;
  storageZone: StorageZone;
}

export interface MaterialOrder {
  id: string;
  ownerId: string;
  orderedByName: string;
  orderCode: string;
  supplier: string;
  sourceProductId: string;
  sourceVersionLabel: string;
  items: MaterialOrderItem[];
  subtotalKwd: number;
  deliveryFeeKwd: number;
  totalKwd: number;
  status: MaterialOrderStatus;
  expectedDate: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffMember {
  id: string;
  staffCode: string;
  name: string;
  role: StaffRole;
  station: string;
  shift: StaffShift;
  linkedUid: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffDuty {
  id: string;
  ownerId: string;
  assignedByUid: string;
  assignedByName: string;
  staffId: string;
  staffName: string;
  assigneeUid: string;
  title: string;
  description: string;
  station: string;
  priority: DutyPriority;
  dueDate: string;
  bookingId: string;
  status: DutyStatus;
  completionNotes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SessionLogEntry {
  id: string;
  ownerId: string;
  actorName: string;
  eventType: LogEventType;
  severity: LogSeverity;
  station: string;
  tempReadingC: string;
  message: string;
  bookingId: string;
  createdAt?: unknown;
}

export interface ProductionBatchPrefillRequest {
  key: number;
  productName: string;
  quantityProduced: number;
  unit: ProductionUnit;
  bakeTempC: number;
  productionNotes: string;
  sourceProductId?: string;
  sourceVersionNumber?: number;
}

export type SupplierRfqRequestType = 'ingredient' | 'machinery' | 'packaging';
export type SupplierRfqTradeTerms = 'DDP Kitchen Door' | 'CIF Kuwait' | 'FOB' | 'Ex-Works';
export type SupplierRfqStatus = 'open' | 'quoted' | 'awarded' | 'closed';
export type SupplierQuoteStatus = 'submitted' | 'shortlisted' | 'accepted' | 'declined';

export interface SupplierRfq {
  id: string;
  rfqCode: string;
  buyerUid: string;
  buyerName: string;
  requestType: SupplierRfqRequestType;
  categoryPath: string;
  itemName: string;
  quantity: number;
  unit: string;
  targetUnitPriceKwd: number;
  specifications: string;
  certifications: string[];
  tradeTerms: SupplierRfqTradeTerms;
  paymentTerms: string;
  deliveryCity: string;
  neededByDate: string;
  sourceRecipeName: string;
  status: SupplierRfqStatus;
  awardedQuoteId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupplierQuote {
  id: string;
  rfqId: string;
  buyerUid: string;
  supplierUid: string;
  supplierCompany: string;
  supplierContact: string;
  originCountry: string;
  quotedUnitPriceKwd: number;
  moqQty: number;
  moqUnit: string;
  leadTimeDays: number;
  shippingTerms: string;
  paymentTerms: string;
  validUntilDate: string;
  warrantyOrShelfLife: string;
  notes: string;
  status: SupplierQuoteStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  NAME_MAX: 100,
  TITLE_MAX: 120,
  DUTY_TITLE_MAX: 140,
  DESC_MAX: 500,
  NOTES_MAX: 600,
  TASTING_NOTES_MAX: 1000,
  LOG_MSG_MAX: 600,
  VERSION_MAX: 20,
  YIELD_MAX: 80,
  LOT_MAX: 60,
  BATCH_MAX: 48,
  METHOD_MAX: 2000,
  REASON_MAX: 400,
} as const;

export function sanitizeId(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
  return cleaned || `item_${Date.now()}`;
}

export function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}
