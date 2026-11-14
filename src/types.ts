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

export const POINTS_PER_HOUR = 100;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: 'member' | 'admin';
  loyaltyPoints: number;
  totalHoursBooked: number;
  createdAt?: unknown;
  updatedAt?: unknown;
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
} as const;

export function sanitizeId(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
  return cleaned || `item_${Date.now()}`;
}

export function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}
