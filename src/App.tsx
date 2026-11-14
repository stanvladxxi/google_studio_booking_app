import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
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
  AttachedGoogleForm,
  AvailabilitySlot,
  Booking,
  BookingQueueEntry,
  KitchenEquipment,
  KitchenSpace,
  LIMITS,
  ProductionBatch,
  RawMaterial,
  RecipeTest,
  SessionLogEntry,
  StaffDuty,
  StaffMember,
  UserProfile,
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
import { RecipesView } from './components/RecipesView';
import { LogsView } from './components/LogsView';
import { DutiesView } from './components/DutiesView';
import { ProductionLogView } from './components/ProductionLogView';
import { SurveyHistoryView } from './components/SurveyHistoryView';
import { AdminConsoleView } from './components/AdminConsoleView';

type ActiveSection =
  | 'booking'
  | 'production'
  | 'surveys'
  | 'materials'
  | 'recipes'
  | 'logs'
  | 'duties'
  | 'admin';

interface ToastState {
  message: string;
  type: 'success' | 'error';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('booking');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<KitchenSpace[]>([]);
  const [equipment, setEquipment] = useState<KitchenEquipment[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [queueEntries, setQueueEntries] = useState<BookingQueueEntry[]>([]);
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
  const [attachedForms, setAttachedForms] = useState<AttachedGoogleForm[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [recipes, setRecipes] = useState<RecipeTest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [duties, setDuties] = useState<StaffDuty[]>([]);
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
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
        setIsAdmin(false);
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
      setIsAdmin(adminFlag);

      // Ensure user profile doc exists with loyaltyPoints & totalHoursBooked
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const existingUser = await getDoc(userRef);
        if (!existingUser.exists() && firebaseUser.emailVerified) {
          const now = serverTimestamp();
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            displayName: clampStr(firebaseUser.displayName || 'Kitchen Member', LIMITS.NAME_MAX),
            email: clampStr(firebaseUser.email || '', 160),
            role: 'member',
            loyaltyPoints: 0,
            totalHoursBooked: 0,
            createdAt: now,
            updatedAt: now,
          });
        } else if (existingUser.exists() && firebaseUser.emailVerified) {
          const d = existingUser.data();
          if (d.loyaltyPoints === undefined || d.totalHoursBooked === undefined) {
            await updateDoc(userRef, {
              loyaltyPoints: typeof d.loyaltyPoints === 'number' ? d.loyaltyPoints : 0,
              totalHoursBooked: typeof d.totalHoursBooked === 'number' ? d.totalHoursBooked : 0,
              updatedAt: serverTimestamp(),
            });
          }
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

  // Attach Firestore listeners only after authReady & user is signed in
  useEffect(() => {
    if (!authReady || !user) {
      setUserProfile(null);
      setSpaces([]);
      setEquipment([]);
      setAvailabilitySlots([]);
      setBookings([]);
      setQueueEntries([]);
      setProductionBatches([]);
      setAttachedForms([]);
      setMaterials([]);
      setRecipes([]);
      setStaff([]);
      setDuties([]);
      setLogs([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const bootstrappedAdmin =
      Boolean(user.emailVerified) && user.email === BOOTSTRAPPED_ADMIN_EMAIL;

    const spacesQ = bootstrappedAdmin
      ? collection(db, 'spaces')
      : query(collection(db, 'spaces'), where('isActive', '==', true));

    const equipQ = bootstrappedAdmin
      ? collection(db, 'equipment')
      : query(collection(db, 'equipment'), where('isActive', '==', true));

    const staffQ = bootstrappedAdmin
      ? collection(db, 'staff')
      : query(collection(db, 'staff'), where('isActive', '==', true));

    const slotsQ = query(
      collection(db, 'availabilitySlots'),
      where('status', 'in', ['confirmed', 'in-progress', 'completed'])
    );

    const bookingsQ = bootstrappedAdmin
      ? collection(db, 'bookings')
      : query(collection(db, 'bookings'), where('ownerId', '==', user.uid));

    const queueQ = bootstrappedAdmin
      ? collection(db, 'bookingQueue')
      : query(collection(db, 'bookingQueue'), where('ownerId', '==', user.uid));

    const batchesQ = bootstrappedAdmin
      ? collection(db, 'productionBatches')
      : query(collection(db, 'productionBatches'), where('ownerId', '==', user.uid));

    const formsQ = bootstrappedAdmin
      ? collection(db, 'attachedForms')
      : query(collection(db, 'attachedForms'), where('ownerId', '==', user.uid));

    const materialsQ = bootstrappedAdmin
      ? collection(db, 'rawMaterials')
      : query(collection(db, 'rawMaterials'), where('ownerId', '==', user.uid));

    const recipesQ = bootstrappedAdmin
      ? collection(db, 'recipes')
      : query(collection(db, 'recipes'), where('ownerId', '==', user.uid));

    const dutiesQ = bootstrappedAdmin
      ? collection(db, 'duties')
      : query(collection(db, 'duties'), where('ownerId', '==', user.uid));

    const logsQ = bootstrappedAdmin
      ? collection(db, 'logs')
      : query(collection(db, 'logs'), where('ownerId', '==', user.uid));

    const unsubs = [
      onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          if (snap.exists()) {
            const raw = snap.data() as Partial<UserProfile>;
            setUserProfile({
              uid: raw.uid || user.uid,
              displayName: raw.displayName || user.displayName || 'Kitchen Member',
              email: raw.email || user.email || '',
              role: raw.role === 'admin' ? 'admin' : 'member',
              loyaltyPoints: typeof raw.loyaltyPoints === 'number' ? raw.loyaltyPoints : 0,
              totalHoursBooked: typeof raw.totalHoursBooked === 'number' ? raw.totalHoursBooked : 0,
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
      ),
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
      ),
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
        dutiesQ,
        (snap) => {
          const items = snap.docs
            .map((d) => ({ ...(d.data() as StaffDuty), id: d.id }))
            .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
          setDuties(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'duties')
      ),
      onSnapshot(
        logsQ,
        (snap) => {
          const items = snap.docs
            .map((d) => ({ ...(d.data() as SessionLogEntry), id: d.id }))
            .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
          setLogs(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'logs')
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [authReady, user]);

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
    setActiveSection('booking');
  };

  const navItems = useMemo(
    () => [
      { id: 'booking' as const, label: 'Hourly Booking', icon: CalendarClock },
      { id: 'production' as const, label: 'Production & Forms', icon: ClipboardCheck },
      { id: 'surveys' as const, label: 'Survey History', icon: FileSpreadsheet },
      { id: 'materials' as const, label: 'Raw Materials', icon: Package },
      { id: 'recipes' as const, label: 'Recipe Trials', icon: FlaskConical },
      { id: 'logs' as const, label: 'Session Log File', icon: FileText },
      { id: 'duties' as const, label: 'Staff Duties', icon: ClipboardList },
      { id: 'admin' as const, label: 'Admin Console', icon: ShieldCheck },
    ],
    []
  );

  const currentTitle = useMemo(() => {
    return navItems.find((n) => n.id === activeSection)?.label || 'Hourly Booking';
  }, [navItems, activeSection]);

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
            {isAdmin ? 'Facility Admin Workspace' : 'Chef & Staff Portal'}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
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
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="bg-teal-50/70 border border-teal-200 rounded-md p-2.5 flex items-center justify-between gap-2">
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
              <span className="text-base font-bold text-slate-900">Hearthline Kitchen</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md ${
                      active ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="bg-teal-50/70 border border-teal-200 rounded-md p-2.5 flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('booking')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              New Hourly Booking
            </button>
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
          {activeSection === 'booking' && (
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
              onNotify={notify}
              onOpenProductionForBooking={(id) => {
                setPreselectedProdBookingId(id);
                setActiveSection('production');
              }}
            />
          )}

          {activeSection === 'production' && (
            <ProductionLogView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              bookings={bookings}
              batches={productionBatches}
              attachedForms={attachedForms}
              preselectedBookingId={preselectedProdBookingId}
              loading={dataLoading}
              onNotify={notify}
              onOpenSurveyHistory={() => setActiveSection('surveys')}
            />
          )}

          {activeSection === 'surveys' && (
            <SurveyHistoryView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              batches={productionBatches}
              attachedForms={attachedForms}
              loading={dataLoading}
              onNotify={notify}
              onOpenProduction={() => setActiveSection('production')}
            />
          )}

          {activeSection === 'materials' && (
            <MaterialsView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              materials={materials}
              bookings={bookings}
              loading={dataLoading}
              onNotify={notify}
            />
          )}

          {activeSection === 'recipes' && (
            <RecipesView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              recipes={recipes}
              materials={materials}
              bookings={bookings}
              loading={dataLoading}
              onNotify={notify}
            />
          )}

          {activeSection === 'logs' && (
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

          {activeSection === 'duties' && (
            <DutiesView
              uid={user.uid}
              userName={user.displayName || user.email || 'Kitchen Member'}
              duties={duties}
              staff={mergedStaff}
              spaces={mergedSpaces}
              bookings={bookings}
              loading={dataLoading}
              onNotify={notify}
            />
          )}

          {activeSection === 'admin' && (
            <AdminConsoleView
              uid={user.uid}
              userName={user.displayName || user.email || 'Facility Admin'}
              isAdmin={isAdmin}
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
        </main>
      </div>
    </div>
  );
}
