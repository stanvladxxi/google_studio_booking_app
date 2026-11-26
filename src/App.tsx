import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarClock,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  User,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  auth,
  clearWorkspaceAccessToken,
  db,
  handleFirestoreError,
  signInWithGoogleWorkspace,
  testFirestoreConnection,
} from './firebase';
import {
  ActiveSection,
  AttachedGoogleForm,
  AvailabilitySlot,
  Booking,
  BookingPrefillRequest,
  BookingQueueEntry,
  IngredientLibraryDoc,
  KitchenEquipment,
  KitchenSpace,
  LIMITS,
  MaterialOrder,
  Product,
  ProductionBatch,
  ProductionBatchPrefillRequest,
  ROLE_NAV_MAP,
  RawMaterial,
  RecipeExperiment,
  RecipeTest,
  RecipeVersion,
  SessionLogEntry,
  StaffDuty,
  StaffMember,
  SupplierQuote,
  SupplierRfq,
  USER_ROLE_LABELS,
  UserProfile,
  UserRole,
  clampStr,
} from './types';
import {
  DEFAULT_EQUIPMENT,
  DEFAULT_SPACES,
  DEFAULT_STAFF,
  seedFacilityCatalogIfEmpty,
} from './data/seedCatalog';
import { SpaceImage } from './components/SpaceImage';
import { BookingView } from './components/BookingView';
import { MaterialsView } from './components/MaterialsView';
import { LogsView } from './components/LogsView';
import { DutiesView } from './components/DutiesView';
import { ProductionLogView } from './components/ProductionLogView';
import { SurveyHistoryView } from './components/SurveyHistoryView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { OrdersPlaceholderView } from './components/AggregatorPlaceholders';
import { LoyaltyDetailsModal } from './components/LoyaltyDetailsModal';
import { MenuErrorBoundary } from './components/MenuErrorBoundary';
import { EnCuisineModule } from './modules/en-cuisine/components/EnCuisineModule';
import { GlobalSearchBar } from './modules/en-cuisine/components/GlobalSearchBar';
import {
  EnCuisineAnalyticsEvent,
  EnCuisineCatalogDoc,
  EnCuisineIngredientLink,
  EnCuisineTab,
} from './modules/en-cuisine/types';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

const VALID_ROLES = new Set<UserRole>([
  'member',
  'recipe_dev',
  'kitchen_manager',
  'kitchen_worker',
  'aggregator',
  'admin',
]);

function normalizeRole(role: unknown): UserRole {
  return typeof role === 'string' && VALID_ROLES.has(role as UserRole)
    ? (role as UserRole)
    : 'member';
}

const SECTION_META: Record<ActiveSection, { label: string; icon: typeof CalendarClock }> = {
  booking: { label: 'Hourly Booking', icon: CalendarClock },
  'en-cuisine': { label: 'En Cuisine', icon: ChefHat },
  production: { label: 'Production & Forms', icon: ClipboardCheck },
  surveys: { label: 'Survey History', icon: FileSpreadsheet },
  materials: { label: 'Raw Materials & Orders', icon: Package },
  recipes: { label: 'En Cuisine · Recipes', icon: ChefHat },
  logs: { label: 'Session Log File', icon: FileText },
  duties: { label: 'Staff Duties', icon: ClipboardList },
  orders: { label: 'Order Center', icon: ShoppingBag },
  menu: { label: 'En Cuisine · Master Menu', icon: ChefHat },
  'admin-lite': { label: 'Kitchen Settings', icon: SlidersHorizontal },
  admin: { label: 'Admin Console', icon: ShieldCheck },
};

const VALID_EN_CUISINE_TABS = new Set<EnCuisineTab>([
  'recipes',
  'menu',
  'costing',
  'versions',
  'inventory',
  'supplier-portal',
  'discover',
]);

function parseHashSection(): ActiveSection | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return null;
  const top = raw.split('/')[0];
  if (top === 'recipes' || top === 'menu') return 'en-cuisine';
  return top in SECTION_META ? (top as ActiveSection) : null;
}

function parseHashEnCuisineTab(): EnCuisineTab | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  const parts = raw.split('/');
  if (parts[0] === 'recipes') return 'recipes';
  if (parts[0] === 'menu') return 'menu';
  if (parts[0] === 'en-cuisine' && parts[1] && VALID_EN_CUISINE_TABS.has(parts[1] as EnCuisineTab)) {
    return parts[1] as EnCuisineTab;
  }
  return null;
}

function getTimestampMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loyaltyModalOpen, setLoyaltyModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    () => parseHashSection() || 'booking'
  );
  const [toast, setToast] = useState<ToastState | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [spaces, setSpaces] = useState<KitchenSpace[]>([]);
  const [equipment, setEquipment] = useState<KitchenEquipment[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [queueEntries, setQueueEntries] = useState<BookingQueueEntry[]>([]);
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
  const [attachedForms, setAttachedForms] = useState<AttachedGoogleForm[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialOrders, setMaterialOrders] = useState<MaterialOrder[]>([]);
  const [recipes, setRecipes] = useState<RecipeTest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeVersions, setRecipeVersions] = useState<RecipeVersion[]>([]);
  const [experiments, setExperiments] = useState<RecipeExperiment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [duties, setDuties] = useState<StaffDuty[]>([]);
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
  const [enCuisineItems, setEnCuisineItems] = useState<EnCuisineCatalogDoc[]>([]);
  const [enCuisineLinks, setEnCuisineLinks] = useState<EnCuisineIngredientLink[]>([]);
  const [enCuisineAnalytics, setEnCuisineAnalytics] = useState<EnCuisineAnalyticsEvent[]>([]);
  const [ingredientLibraryDocs, setIngredientLibraryDocs] = useState<IngredientLibraryDoc[]>([]);
  const [supplierRfqs, setSupplierRfqs] = useState<SupplierRfq[]>([]);
  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuote[]>([]);
  const [enCuisineTab, setEnCuisineTab] = useState<EnCuisineTab | null>(
    () => parseHashEnCuisineTab()
  );
  const [bookingPrefill, setBookingPrefill] = useState<BookingPrefillRequest | null>(null);
  const [productionPrefill, setProductionPrefill] = useState<ProductionBatchPrefillRequest | null>(
    null
  );
  const [preselectedProdBookingId, setPreselectedProdBookingId] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Boot connection check & Auth state listener
  useEffect(() => {
    testFirestoreConnection();

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setHasAdminDoc(false);
        setUserProfile(null);
        setAllUsers([]);
        setAuthReady(true);
        return;
      }

      const bootstrapped =
        Boolean(firebaseUser.emailVerified) &&
        firebaseUser.email === BOOTSTRAPPED_ADMIN_EMAIL;

      let adminFlag = bootstrapped;
      try {
        if (!adminFlag) {
          const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
          adminFlag = adminDoc.exists();
        }
      } catch {
        adminFlag = bootstrapped;
      }
      setHasAdminDoc(adminFlag);

      // Ensure user profile doc exists and hydrate initial role before authReady=true
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const existingUser = await getDoc(userRef);
        if (!existingUser.exists() && firebaseUser.emailVerified) {
          const now = serverTimestamp();
          const initialProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: clampStr(firebaseUser.displayName || 'Kitchen Member', LIMITS.NAME_MAX),
            email: clampStr(firebaseUser.email || '', 160),
            role: 'member',
            loyaltyPoints: 0,
            totalHoursBooked: 0,
          };
          await setDoc(userRef, {
            ...initialProfile,
            createdAt: now,
            updatedAt: now,
          });
          setUserProfile(initialProfile);
        } else if (existingUser.exists()) {
          const d = existingUser.data() as Partial<UserProfile>;
          if (
            firebaseUser.emailVerified &&
            (d.loyaltyPoints === undefined || d.totalHoursBooked === undefined)
          ) {
            await updateDoc(userRef, {
              loyaltyPoints: typeof d.loyaltyPoints === 'number' ? d.loyaltyPoints : 0,
              totalHoursBooked: typeof d.totalHoursBooked === 'number' ? d.totalHoursBooked : 0,
              updatedAt: serverTimestamp(),
            });
          }
          setUserProfile({
            uid: d.uid || firebaseUser.uid,
            displayName: d.displayName || firebaseUser.displayName || 'Kitchen Member',
            email: d.email || firebaseUser.email || '',
            role: normalizeRole(d.role),
            loyaltyPoints: typeof d.loyaltyPoints === 'number' ? d.loyaltyPoints : 0,
            totalHoursBooked: typeof d.totalHoursBooked === 'number' ? d.totalHoursBooked : 0,
            businessType: typeof d.businessType === 'string' ? d.businessType : undefined,
            discoverInterests: Array.isArray(d.discoverInterests) ? d.discoverInterests : undefined,
            newsletterSubscribed: typeof d.newsletterSubscribed === 'boolean' ? d.newsletterSubscribed : undefined,
            newsletterTopics: Array.isArray(d.newsletterTopics) ? d.newsletterTopics : undefined,
            followedInfluencerIds: Array.isArray(d.followedInfluencerIds) ? d.followedInfluencerIds : undefined,
            preferredDir: d.preferredDir === 'rtl' || d.preferredDir === 'ltr' ? d.preferredDir : undefined,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        }
      } catch (err) {
        console.error('Profile sync skipped:', err);
      }

      if (bootstrapped) {
        try {
          await seedFacilityCatalogIfEmpty();
        } catch (err) {
          console.error('Initial catalog check failed:', err);
        }
      }

      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  const isAdmin = useMemo(
    () => hasAdminDoc || userProfile?.role === 'admin',
    [hasAdminDoc, userProfile?.role]
  );

  const effectiveRole: UserRole = useMemo(
    () => (isAdmin ? 'admin' : userProfile?.role || 'member'),
    [isAdmin, userProfile?.role]
  );

  const allowedSections = useMemo(() => {
    const mapped = ROLE_NAV_MAP[effectiveRole];
    return Array.isArray(mapped) && mapped.length > 0
      ? mapped
      : (['booking', 'en-cuisine'] as ActiveSection[]);
  }, [effectiveRole]);

  const navigateSection = useCallback(
    (section: ActiveSection) => {
      const target = allowedSections.includes(section)
        ? section
        : allowedSections[0] || 'booking';
      setActiveSection(target);
      if (typeof window !== 'undefined' && window.location.hash !== `#/${target}`) {
        window.location.hash = `#/${target}`;
      }
    },
    [allowedSections]
  );

  // Route guard: redirect away from any section disallowed for the active role
  useEffect(() => {
    if (!authReady || !user) return;
    if (!allowedSections.includes(activeSection)) {
      const fallback = allowedSections[0];
      setActiveSection(fallback);
      if (typeof window !== 'undefined') {
        window.location.hash = `#/${fallback}`;
      }
    }
  }, [authReady, user, allowedSections, activeSection]);

  // Guard manual URL hash edits against disallowed routes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      if (!authReady || !user) return;
      const hashSection = parseHashSection();
      if (!hashSection) return;
      if (allowedSections.includes(hashSection)) {
        setActiveSection(hashSection);
        const subTab = parseHashEnCuisineTab();
        if (subTab) setEnCuisineTab(subTab);
      } else {
        const fallback = allowedSections[0];
        setActiveSection(fallback);
        window.location.hash = `#/${fallback}`;
        notify('Access restricted for your assigned role.', 'error');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [authReady, user, allowedSections, notify]);

  // Attach role-scoped Firestore listeners only after authReady & user is signed in
  useEffect(() => {
    if (!authReady || !user) {
      setUserProfile(null);
      setAllUsers([]);
      setSpaces([]);
      setEquipment([]);
      setAvailabilitySlots([]);
      setBookings([]);
      setQueueEntries([]);
      setProductionBatches([]);
      setAttachedForms([]);
      setMaterials([]);
      setMaterialOrders([]);
      setRecipes([]);
      setProducts([]);
      setRecipeVersions([]);
      setExperiments([]);
      setStaff([]);
      setDuties([]);
      setLogs([]);
      setEnCuisineItems([]);
      setEnCuisineLinks([]);
      setEnCuisineAnalytics([]);
      setIngredientLibraryDocs([]);
      setSupplierRfqs([]);
      setSupplierQuotes([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const canSeeFacilityOps = effectiveRole === 'admin' || effectiveRole === 'kitchen_manager';
    const canBook = allowedSections.includes('booking');
    const canViewProduction =
      allowedSections.includes('production') || allowedSections.includes('surveys');
    const canReadRecipes =
      effectiveRole === 'admin' ||
      effectiveRole === 'recipe_dev' ||
      effectiveRole === 'kitchen_manager';
    const canViewMaterials = allowedSections.includes('materials') || canReadRecipes;
    const canViewDuties = allowedSections.includes('duties');
    const canViewLogs = allowedSections.includes('logs') || effectiveRole === 'admin';

    const spacesQ = canSeeFacilityOps
      ? collection(db, 'spaces')
      : query(collection(db, 'spaces'), where('isActive', '==', true));

    const equipQ = canSeeFacilityOps
      ? collection(db, 'equipment')
      : query(collection(db, 'equipment'), where('isActive', '==', true));

    const staffQ = canSeeFacilityOps
      ? collection(db, 'staff')
      : query(collection(db, 'staff'), where('isActive', '==', true));

    const unsubs: Array<() => void> = [
      onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          if (snap.exists()) {
            const raw = snap.data() as Partial<UserProfile>;
            setUserProfile({
              uid: raw.uid || user.uid,
              displayName: raw.displayName || user.displayName || 'Kitchen Member',
              email: raw.email || user.email || '',
              role: normalizeRole(raw.role),
              loyaltyPoints: typeof raw.loyaltyPoints === 'number' ? raw.loyaltyPoints : 0,
              totalHoursBooked: typeof raw.totalHoursBooked === 'number' ? raw.totalHoursBooked : 0,
              businessType: typeof raw.businessType === 'string' ? raw.businessType : undefined,
              discoverInterests: Array.isArray(raw.discoverInterests) ? raw.discoverInterests : undefined,
              newsletterSubscribed: typeof raw.newsletterSubscribed === 'boolean' ? raw.newsletterSubscribed : undefined,
              newsletterTopics: Array.isArray(raw.newsletterTopics) ? raw.newsletterTopics : undefined,
              followedInfluencerIds: Array.isArray(raw.followedInfluencerIds) ? raw.followedInfluencerIds : undefined,
              preferredDir: raw.preferredDir === 'rtl' || raw.preferredDir === 'ltr' ? raw.preferredDir : undefined,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
      ),
      onSnapshot(
        spacesQ,
        (snap) => {
          setSpaces(snap.docs.map((d) => ({ ...(d.data() as KitchenSpace), id: d.id })));
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'spaces')
      ),
      onSnapshot(
        equipQ,
        (snap) => {
          setEquipment(snap.docs.map((d) => ({ ...(d.data() as KitchenEquipment), id: d.id })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'equipment')
      ),
      onSnapshot(
        staffQ,
        (snap) => {
          setStaff(snap.docs.map((d) => ({ ...(d.data() as StaffMember), id: d.id })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
      ),
    ];

    if (effectiveRole === 'admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const items = snap.docs
              .map((d) => {
                const raw = d.data() as Partial<UserProfile>;
                return {
                  uid: raw.uid || d.id,
                  displayName: raw.displayName || 'Kitchen User',
                  email: raw.email || '',
                  role: normalizeRole(raw.role),
                  loyaltyPoints: typeof raw.loyaltyPoints === 'number' ? raw.loyaltyPoints : 0,
                  totalHoursBooked: typeof raw.totalHoursBooked === 'number' ? raw.totalHoursBooked : 0,
                  createdAt: raw.createdAt,
                  updatedAt: raw.updatedAt,
                };
              })
              .sort((a, b) => a.displayName.localeCompare(b.displayName));
            setAllUsers(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
    } else {
      setAllUsers([]);
    }

    if (canBook) {
      const slotsQ = query(
        collection(db, 'availabilitySlots'),
        where('status', 'in', ['confirmed', 'in-progress', 'completed'])
      );
      const bookingsQ =
        effectiveRole === 'admin'
          ? collection(db, 'bookings')
          : query(collection(db, 'bookings'), where('ownerId', '==', user.uid));
      const queueQ =
        effectiveRole === 'admin'
          ? collection(db, 'bookingQueue')
          : query(collection(db, 'bookingQueue'), where('ownerId', '==', user.uid));

      unsubs.push(
        onSnapshot(
          slotsQ,
          (snap) => {
            setAvailabilitySlots(snap.docs.map((d) => ({ ...(d.data() as AvailabilitySlot), id: d.id })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'availabilitySlots')
        ),
        onSnapshot(
          bookingsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as Booking), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setBookings(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
        ),
        onSnapshot(
          queueQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as BookingQueueEntry), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setQueueEntries(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'bookingQueue')
        )
      );
    } else {
      setAvailabilitySlots([]);
      setBookings([]);
      setQueueEntries([]);
    }

    if (canViewProduction) {
      const batchesQ = canSeeFacilityOps
        ? collection(db, 'productionBatches')
        : query(collection(db, 'productionBatches'), where('ownerId', '==', user.uid));
      const formsQ = canSeeFacilityOps
        ? collection(db, 'attachedForms')
        : query(collection(db, 'attachedForms'), where('ownerId', '==', user.uid));

      unsubs.push(
        onSnapshot(
          batchesQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as ProductionBatch), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setProductionBatches(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'productionBatches')
        ),
        onSnapshot(
          formsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as AttachedGoogleForm), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setAttachedForms(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'attachedForms')
        )
      );
    } else {
      setProductionBatches([]);
      setAttachedForms([]);
    }

    if (canViewMaterials) {
      const materialsQ = canSeeFacilityOps
        ? collection(db, 'rawMaterials')
        : query(collection(db, 'rawMaterials'), where('ownerId', '==', user.uid));
      const ordersQ = canSeeFacilityOps
        ? collection(db, 'materialOrders')
        : query(collection(db, 'materialOrders'), where('ownerId', '==', user.uid));

      unsubs.push(
        onSnapshot(
          materialsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as RawMaterial), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
            setMaterials(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'rawMaterials')
        ),
        onSnapshot(
          ordersQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as MaterialOrder), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setMaterialOrders(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'materialOrders')
        )
      );
    } else {
      setMaterials([]);
      setMaterialOrders([]);
    }

    if (canReadRecipes) {
      const recipesQ = canSeeFacilityOps
        ? collection(db, 'recipes')
        : query(collection(db, 'recipes'), where('ownerId', '==', user.uid));
      const productsQ = canSeeFacilityOps
        ? collection(db, 'products')
        : query(collection(db, 'products'), where('ownerId', '==', user.uid));
      const versionsQ = canSeeFacilityOps
        ? collection(db, 'recipeVersions')
        : query(collection(db, 'recipeVersions'), where('ownerId', '==', user.uid));
      const experimentsQ = canSeeFacilityOps
        ? collection(db, 'experiments')
        : query(collection(db, 'experiments'), where('ownerId', '==', user.uid));

      unsubs.push(
        onSnapshot(
          recipesQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as RecipeTest), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
            setRecipes(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'recipes')
        ),
        onSnapshot(
          productsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as Product), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
            setProducts(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'products')
        ),
        onSnapshot(
          versionsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as RecipeVersion), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setRecipeVersions(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'recipeVersions')
        ),
        onSnapshot(
          experimentsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as RecipeExperiment), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setExperiments(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'experiments')
        )
      );
    } else {
      setRecipes([]);
      setProducts([]);
      setRecipeVersions([]);
      setExperiments([]);
    }

    if (canViewDuties) {
      const dutiesQ = canSeeFacilityOps
        ? collection(db, 'duties')
        : query(collection(db, 'duties'), where('assigneeUid', '==', user.uid));

      unsubs.push(
        onSnapshot(
          dutiesQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as StaffDuty), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setDuties(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'duties')
        )
      );
    } else {
      setDuties([]);
    }

    if (canViewLogs) {
      const logsQ = canSeeFacilityOps
        ? collection(db, 'logs')
        : query(collection(db, 'logs'), where('ownerId', '==', user.uid));

      unsubs.push(
        onSnapshot(
          logsQ,
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as SessionLogEntry), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setLogs(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'logs')
        )
      );
    } else {
      setLogs([]);
    }

    // En Cuisine Discover items, Supplier Hub ingredient price links & Analytics listeners
    const ecItemsQ =
      effectiveRole === 'admin'
        ? collection(db, 'enCuisineItems')
        : query(collection(db, 'enCuisineItems'), where('isActive', '==', true));
    const ecLinksQ = query(
      collection(db, 'enCuisineIngredientLinks'),
      where('ownerId', '==', user.uid)
    );
    const ecAnalyticsQ =
      effectiveRole === 'admin'
        ? collection(db, 'enCuisineAnalytics')
        : query(collection(db, 'enCuisineAnalytics'), where('ownerId', '==', user.uid));

    unsubs.push(
      onSnapshot(
        ecItemsQ,
        (snap) => {
          setEnCuisineItems(snap.docs.map((d) => ({ ...(d.data() as EnCuisineCatalogDoc), id: d.id })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'enCuisineItems')
      ),
      onSnapshot(
        ecLinksQ,
        (snap) => {
          setEnCuisineLinks(snap.docs.map((d) => ({ ...(d.data() as EnCuisineIngredientLink), id: d.id })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'enCuisineIngredientLinks')
      ),
      onSnapshot(
        ecAnalyticsQ,
        (snap) => {
          setEnCuisineAnalytics(
            snap.docs
              .map((d) => ({ ...(d.data() as EnCuisineAnalyticsEvent), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'enCuisineAnalytics')
      )
    );

    if (effectiveRole !== 'aggregator') {
      const ingLibQ = canSeeFacilityOps
        ? collection(db, 'ingredientLibrary')
        : query(collection(db, 'ingredientLibrary'), where('ownerId', '==', user.uid));
      unsubs.push(
        onSnapshot(
          ingLibQ,
          (snap) => {
            setIngredientLibraryDocs(
              snap.docs.map((d) => ({ ...(d.data() as IngredientLibraryDoc), id: d.id }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'ingredientLibrary')
        )
      );
    } else {
      setIngredientLibraryDocs([]);
    }

    // Supplier Portal RFQs & Competitive Quotes (role-scoped per firestore.rules)
    if (canSeeFacilityOps) {
      unsubs.push(
        onSnapshot(
          collection(db, 'supplierRfqs'),
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as SupplierRfq), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setSupplierRfqs(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierRfqs')
        ),
        onSnapshot(
          collection(db, 'supplierQuotes'),
          (snap) => {
            const items = snap.docs
              .map((d) => ({ ...(d.data() as SupplierQuote), id: d.id }))
              .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
            setSupplierQuotes(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierQuotes')
        )
      );
    } else {
      let openRfqs: SupplierRfq[] = [];
      let myBuyerRfqs: SupplierRfq[] = [];
      const syncMergedRfqs = () => {
        const merged = new Map<string, SupplierRfq>();
        for (const r of openRfqs) merged.set(r.id, r);
        for (const r of myBuyerRfqs) merged.set(r.id, r);
        setSupplierRfqs(
          Array.from(merged.values()).sort(
            (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
          )
        );
      };

      let buyerQuotes: SupplierQuote[] = [];
      let mySubmittedQuotes: SupplierQuote[] = [];
      const syncMergedQuotes = () => {
        const merged = new Map<string, SupplierQuote>();
        for (const q of buyerQuotes) merged.set(q.id, q);
        for (const q of mySubmittedQuotes) merged.set(q.id, q);
        setSupplierQuotes(
          Array.from(merged.values()).sort(
            (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
          )
        );
      };

      unsubs.push(
        onSnapshot(
          query(collection(db, 'supplierRfqs'), where('status', 'in', ['open', 'quoted'])),
          (snap) => {
            openRfqs = snap.docs.map((d) => ({ ...(d.data() as SupplierRfq), id: d.id }));
            syncMergedRfqs();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierRfqs')
        ),
        onSnapshot(
          query(collection(db, 'supplierRfqs'), where('buyerUid', '==', user.uid)),
          (snap) => {
            myBuyerRfqs = snap.docs.map((d) => ({ ...(d.data() as SupplierRfq), id: d.id }));
            syncMergedRfqs();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierRfqs')
        ),
        onSnapshot(
          query(collection(db, 'supplierQuotes'), where('buyerUid', '==', user.uid)),
          (snap) => {
            buyerQuotes = snap.docs.map((d) => ({ ...(d.data() as SupplierQuote), id: d.id }));
            syncMergedQuotes();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierQuotes')
        ),
        onSnapshot(
          query(collection(db, 'supplierQuotes'), where('supplierUid', '==', user.uid)),
          (snap) => {
            mySubmittedQuotes = snap.docs.map((d) => ({ ...(d.data() as SupplierQuote), id: d.id }));
            syncMergedQuotes();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierQuotes')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [authReady, user, effectiveRole, allowedSections]);

  // Always expose the 4 landing-page kitchen spaces and default catalog even before admin seeding
  const mergedSpaces = useMemo(() => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    const defaults = DEFAULT_SPACES.map((d) => byId.get(d.id) || (d as KitchenSpace));
    const extras = spaces.filter((s) => !DEFAULT_SPACES.some((d) => d.id === s.id));
    return [...defaults, ...extras];
  }, [spaces]);

  const mergedEquipment = useMemo(() => {
    const byId = new Map(equipment.map((e) => [e.id, e]));
    const defaults = DEFAULT_EQUIPMENT.map((d) => byId.get(d.id) || (d as KitchenEquipment));
    const extras = equipment.filter((e) => !DEFAULT_EQUIPMENT.some((d) => d.id === e.id));
    return [...defaults, ...extras];
  }, [equipment]);

  const mergedStaff = useMemo(() => {
    const byId = new Map(staff.map((m) => [m.id, m]));
    const defaults = DEFAULT_STAFF.map((d) => byId.get(d.id) || (d as StaffMember));
    const extras = staff.filter((m) => !DEFAULT_STAFF.some((d) => d.id === m.id));
    return [...defaults, ...extras];
  }, [staff]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogleWorkspace();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to sign in with Google.';
      notify(msg, 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    clearWorkspaceAccessToken();
    await signOut(auth);
    if (typeof window !== 'undefined' && window.location.hash) {
      window.location.hash = '';
    }
    setActiveSection('booking');
  };

  const navItems = useMemo(
    () =>
      allowedSections
        .filter((id) => Boolean(SECTION_META[id]))
        .map((id) => ({
          id,
          label: SECTION_META[id].label,
          icon: SECTION_META[id].icon,
        })),
    [allowedSections]
  );

  const navGroups = useMemo(() => {
    const groupDefs: { label: string; ids: ActiveSection[] }[] = [
      { label: 'Kitchen & R&D', ids: ['booking', 'en-cuisine', 'materials'] },
      { label: 'Floor & QA', ids: ['production', 'surveys', 'duties', 'logs'] },
      { label: 'Operations', ids: ['orders', 'admin-lite', 'admin'] },
    ];
    const byId = new Map(navItems.map((n) => [n.id, n]));
    const assigned = new Set<ActiveSection>();
    const grouped = groupDefs
      .map((g) => {
        const items = g.ids
          .map((id) => byId.get(id))
          .filter((x): x is (typeof navItems)[number] => Boolean(x));
        items.forEach((x) => assigned.add(x.id));
        return { label: g.label, items };
      })
      .filter((g) => g.items.length > 0);
    const extras = navItems.filter((n) => !assigned.has(n.id));
    if (extras.length > 0) {
      grouped.push({ label: 'More', items: extras });
    }
    return grouped;
  }, [navItems]);

  const currentTitle = useMemo(() => {
    return navItems.find((n) => n.id === activeSection)?.label || navItems[0]?.label || 'Workspace';
  }, [navItems, activeSection]);

  const fallbackNavActions = useMemo(
    () =>
      navItems
        .filter((n) => n.id !== activeSection)
        .slice(0, 4)
        .map((n) => ({
          label: `Open ${n.label}`,
          onClick: () => navigateSection(n.id),
        })),
    [navItems, activeSection, navigateSection]
  );

  const hasMatchedSection =
    (allowedSections.includes('booking') && activeSection === 'booking') ||
    (allowedSections.includes('en-cuisine') && activeSection === 'en-cuisine') ||
    (allowedSections.includes('production') && activeSection === 'production') ||
    (allowedSections.includes('surveys') && activeSection === 'surveys') ||
    (allowedSections.includes('materials') && activeSection === 'materials') ||
    (allowedSections.includes('logs') && activeSection === 'logs') ||
    (allowedSections.includes('duties') && activeSection === 'duties') ||
    (allowedSections.includes('orders') && activeSection === 'orders') ||
    (allowedSections.includes('admin-lite') && activeSection === 'admin-lite') ||
    (allowedSections.includes('admin') && activeSection === 'admin');

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Loading Hearthline Kitchen...</div>
      </div>
    );
  }

  // Unauthenticated Landing / Facility Preview
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 lg:px-10 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Hearthline Kitchen
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#spaces" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Kitchen Spaces
            </a>
            <a href="#equipment" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Equipment
            </a>
            <a href="#operations" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Operations
            </a>
          </nav>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 space-y-16">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-medium text-slate-500">
                Commercial Commissary · Hourly Rental & Culinary R&D
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                Book commercial kitchen bays and equipment by the hour.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                Reserve dedicated pastry, hot-line, cold-prep, and sensory R&D stations, track raw material lots, record tested recipe formulations, assign staff duties, and export HACCP-ready .LOG files.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap"
                >
                  {signingIn ? 'Connecting...' : 'Sign in to Book Kitchen'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-lg overflow-hidden border border-slate-200 bg-white">
              <SpaceImage
                imagePath="hotline_bay"
                alt="Hot Line & Convection Bay"
                className="w-full h-full min-h-72 object-cover"
              />
            </div>
          </section>

          <section id="spaces" className="space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold text-slate-900">01. Hourly Kitchen Stations</h2>
              <span className="text-xs font-mono text-slate-500">4 commercial suites</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {DEFAULT_SPACES.map((space) => (
                <div
                  key={space.id}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
                >
                  <div className="h-40 bg-slate-100">
                    <SpaceImage imagePath={space.imagePath} alt={space.name} />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{space.name}</h3>
                        <span className="font-mono tabular-nums text-xs font-semibold text-teal-800 shrink-0">
                          ${space.hourlyRate}/hr
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {space.zone} · {space.sqFt} sq ft
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{space.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="equipment" className="space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold text-slate-900">02. Commercial Equipment Add-Ons</h2>
              <span className="text-xs font-mono text-slate-500">Hourly unit pricing</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              {DEFAULT_EQUIPMENT.map((eq) => (
                <div key={eq.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-slate-900">{eq.name}</span>
                    <span className="text-xs text-slate-500 ml-2">· {eq.category}</span>
                    <p className="text-xs text-slate-600">{eq.spec}</p>
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 shrink-0">
                    ${eq.hourlyRate}/hr
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="operations" className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-8">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Raw Material & Lot Ledger</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Track incoming ingredient weights, suppliers, storage zones, and batch costs across every kitchen session.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Recipe Trial Versioning</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record formulation weights, target baking temperatures, yields, and sensory notes with instant version iteration.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Staff Duties & .LOG Export</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Assign prep and sanitation duties to staff and export chronological operational logs as .LOG or .CSV files.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-slate-200 shrink-0">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Hearthline Kitchen
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Chef at Work · {USER_ROLE_LABELS[effectiveRole]}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {navGroups.length > 1 && (
                <div className="px-3 pt-1 text-[11px] font-semibold text-slate-400">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          {allowedSections.includes('booking') && (
            <div className="bg-teal-50/70 border border-teal-200 rounded-md p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-teal-900">
                  <Award className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>Points</span>
                </div>
                <div className="text-right">
                  <div className="font-mono tabular-nums text-xs font-bold text-teal-900">
                    {userProfile?.loyaltyPoints ?? 0} pts
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-teal-700">
                    {userProfile?.totalHoursBooked ?? 0}h booked
                  </div>
                </div>
              </div>
              <div className="pt-1.5 border-t border-teal-200/80 flex items-center justify-between">
                <span className="text-[11px] text-teal-700">Loyalty ledger</span>
                <button
                  type="button"
                  onClick={() => setLoyaltyModalOpen(true)}
                  className="text-[11px] font-semibold text-teal-800 hover:text-teal-950 underline underline-offset-2 whitespace-nowrap"
                >
                  View Details
                </button>
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-slate-900 truncate">
              {user.displayName || 'Kitchen User'}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-white h-full flex flex-col border-r border-slate-200 z-50">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-slate-900">Hearthline Kitchen</div>
                <div className="text-[11px] text-slate-500">
                  Chef at Work · {USER_ROLE_LABELS[effectiveRole]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  {navGroups.length > 1 && (
                    <div className="px-3 pt-1 text-[11px] font-semibold text-slate-400">
                      {group.label}
                    </div>
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          navigateSection(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap ${
                          active ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              {allowedSections.includes('booking') && (
                <div className="bg-teal-50/70 border border-teal-200 rounded-md p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-teal-900">
                      <Award className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Points</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono tabular-nums text-xs font-bold text-teal-900">
                        {userProfile?.loyaltyPoints ?? 0} pts
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-teal-700">
                        {userProfile?.totalHoursBooked ?? 0}h booked
                      </div>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-teal-200/80 flex items-center justify-between">
                    <span className="text-[11px] text-teal-700">Loyalty ledger</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLoyaltyModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-teal-800 hover:text-teal-950 underline underline-offset-2 whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 border border-slate-200 rounded-md"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 hidden sm:inline">Hearthline</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
            <GlobalSearchBar
              effectiveRole={effectiveRole}
              allowedSections={allowedSections}
              spaces={mergedSpaces}
              equipment={mergedEquipment}
              products={products}
              customItems={enCuisineItems}
              onNavigateResult={({ section, enCuisineTab: nextEcTab, spaceId }) => {
                if (section === 'booking' && spaceId) {
                  setBookingPrefill({ key: Date.now(), spaceId });
                }
                if (section === 'en-cuisine' && nextEcTab) {
                  setEnCuisineTab(nextEcTab);
                }
                navigateSection(section);
              }}
            />

            {allowedSections.includes('booking') && (
              <button
                type="button"
                onClick={() => navigateSection('booking')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                New Hourly Booking
              </button>
            )}
          </div>
        </header>

        {/* Toast Feedback */}
        {toast && (
          <div className="px-6 pt-4">
            <div
              role="status"
              className={`px-4 py-3 rounded-md border text-sm flex items-center justify-between gap-3 ${
                toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-xs font-medium opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <MenuErrorBoundary
            menuLabel={currentTitle}
            resetKey={activeSection}
            fallbackActions={fallbackNavActions}
          >
          {allowedSections.includes('booking') && activeSection === 'booking' && (
            <BookingView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              userProfile={userProfile}
              spaces={mergedSpaces}
              equipment={mergedEquipment}
              availabilitySlots={availabilitySlots}
              bookings={bookings}
              queueEntries={queueEntries}
              loading={dataLoading}
              prefillRequest={bookingPrefill}
              onNotify={notify}
              onOpenProductionForBooking={
                allowedSections.includes('production')
                  ? (id) => {
                      setPreselectedProdBookingId(id);
                      navigateSection('production');
                    }
                  : undefined
              }
            />
          )}

          {allowedSections.includes('en-cuisine') && activeSection === 'en-cuisine' && (
            <EnCuisineModule
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              isAdmin={isAdmin}
              effectiveRole={effectiveRole}
              userProfile={userProfile}
              spaces={mergedSpaces}
              equipmentCatalog={mergedEquipment}
              availabilitySlots={availabilitySlots}
              bookings={bookings}
              products={products}
              recipeVersions={recipeVersions}
              experiments={experiments}
              legacyRecipes={recipes}
              materials={materials}
              materialOrders={materialOrders}
              ingredientLibraryDocs={ingredientLibraryDocs}
              customItems={enCuisineItems}
              ingredientLinks={enCuisineLinks}
              analyticsEvents={enCuisineAnalytics}
              supplierRfqs={supplierRfqs}
              supplierQuotes={supplierQuotes}
              canBookKitchen={allowedSections.includes('booking')}
              canReadRecipes={
                effectiveRole === 'admin' ||
                effectiveRole === 'recipe_dev' ||
                effectiveRole === 'kitchen_manager'
              }
              recipesReadOnly={effectiveRole === 'kitchen_manager'}
              dataLoading={dataLoading}
              requestedTab={enCuisineTab}
              onTabChange={setEnCuisineTab}
              onBookKitchen={(prefill) => {
                setBookingPrefill({ ...prefill, key: Date.now() });
                navigateSection('booking');
                notify('Opened Hourly Booking with En Cuisine recipe/equipment pre-filled.');
              }}
              onOpenMaterialsOrders={
                allowedSections.includes('materials')
                  ? () => navigateSection('materials')
                  : undefined
              }
              onSendToTestBatch={(prefill) => {
                if (allowedSections.includes('production')) {
                  setProductionPrefill({ ...prefill, key: Date.now() });
                  navigateSection('production');
                  notify(
                    `Sent "${prefill.productName}" to Test Batch and prefilled Production Log.`
                  );
                } else {
                  notify(
                    `Test batch saved for "${prefill.productName}". Contact a kitchen manager or developer to log floor QC.`,
                    'success'
                  );
                }
              }}
              onNotify={notify}
            />
          )}

          {allowedSections.includes('production') && activeSection === 'production' && (
            <ProductionLogView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              bookings={bookings}
              batches={productionBatches}
              attachedForms={attachedForms}
              preselectedBookingId={preselectedProdBookingId}
              prefillBatch={productionPrefill}
              loading={dataLoading}
              myBatchesOnly={effectiveRole === 'kitchen_worker'}
              canOpenSurveyHistory={allowedSections.includes('surveys')}
              onNotify={notify}
              onOpenSurveyHistory={() => navigateSection('surveys')}
            />
          )}

          {allowedSections.includes('surveys') && activeSection === 'surveys' && (
            <SurveyHistoryView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              batches={productionBatches}
              attachedForms={attachedForms}
              loading={dataLoading}
              onNotify={notify}
              onOpenProduction={() => navigateSection('production')}
            />
          )}

          {allowedSections.includes('materials') && activeSection === 'materials' && (
            <MaterialsView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              materials={materials}
              materialOrders={materialOrders}
              bookings={bookings}
              loading={dataLoading}
              onNotify={notify}
            />
          )}

          {allowedSections.includes('logs') && activeSection === 'logs' && (
            <LogsView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              logs={logs}
              spaces={mergedSpaces}
              bookings={bookings}
              loading={dataLoading}
              onNotify={notify}
            />
          )}

          {allowedSections.includes('duties') && activeSection === 'duties' && (
            <DutiesView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              duties={duties}
              staff={mergedStaff}
              spaces={mergedSpaces}
              bookings={bookings}
              loading={dataLoading}
              mineOnly={effectiveRole === 'kitchen_worker'}
              onNotify={notify}
            />
          )}

          {allowedSections.includes('orders') && activeSection === 'orders' && (
            <OrdersPlaceholderView onNotify={notify} />
          )}

          {allowedSections.includes('admin-lite') && activeSection === 'admin-lite' && (
            <AdminConsoleView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Manager'}
              isAdmin={false}
              mode="lite"
              spaces={mergedSpaces}
              equipment={mergedEquipment}
              bookings={bookings}
              availabilitySlots={availabilitySlots}
              queueEntries={queueEntries}
              staff={mergedStaff}
              duties={duties}
              logs={logs}
              onNotify={notify}
            />
          )}

          {allowedSections.includes('admin') && activeSection === 'admin' && (
            <AdminConsoleView
              uid={user.uid}
              userName={user.displayName || user.email || 'Facility Admin'}
              isAdmin={isAdmin}
              mode="full"
              users={allUsers}
              spaces={mergedSpaces}
              equipment={mergedEquipment}
              bookings={bookings}
              availabilitySlots={availabilitySlots}
              queueEntries={queueEntries}
              staff={mergedStaff}
              duties={duties}
              logs={logs}
              onNotify={notify}
            />
          )}

          {!hasMatchedSection && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-xl mx-auto my-8 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Menu view unavailable — select a fallback workspace
              </h2>
              <p className="text-xs text-slate-600">
                The requested menu section could not be opened. Choose an available section below to continue.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateSection(item.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3B2B] hover:bg-[#08291E] rounded-md whitespace-nowrap"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          </MenuErrorBoundary>
        </main>
      </div>

      {loyaltyModalOpen && (
        <LoyaltyDetailsModal
          onClose={() => setLoyaltyModalOpen(false)}
          userId={user.uid}
          userName={user.displayName || user.email || 'Kitchen Member'}
          userProfile={userProfile}
          bookings={bookings}
          productionBatches={productionBatches}
          recipeVersions={recipeVersions}
          logs={logs}
        />
      )}
    </div>
  );
}
