import { useMemo, useState } from 'react';
import { ShieldCheck, Plus, Download, RefreshCw } from 'lucide-react';
import { doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AvailabilitySlot,
  Booking,
  BookingQueueEntry,
  BookingStatus,
  EquipmentCategory,
  KitchenEquipment,
  KitchenSpace,
  LIMITS,
  POINTS_PER_HOUR,
  SessionLogEntry,
  SpaceZone,
  StaffDuty,
  StaffMember,
  StaffRole,
  StaffShift,
  clampStr,
  sanitizeId,
} from '../types';
import { seedFacilityCatalogIfEmpty } from '../data/seedCatalog';
import { buildLogFileContent, downloadTextFile } from '../utils/logExporter';

interface AdminConsoleViewProps {
  uid: string;
  userName: string;
  isAdmin: boolean;
  spaces: KitchenSpace[];
  equipment: KitchenEquipment[];
  bookings: Booking[];
  availabilitySlots: AvailabilitySlot[];
  queueEntries: BookingQueueEntry[];
  staff: StaffMember[];
  duties: StaffDuty[];
  logs: SessionLogEntry[];
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

type AdminTab = 'overview' | 'spaces' | 'equipment' | 'staff';

export function AdminConsoleView({
  uid,
  userName,
  isAdmin,
  spaces,
  equipment,
  bookings,
  availabilitySlots,
  queueEntries,
  staff,
  duties,
  logs,
  onNotify,
}: AdminConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [seeding, setSeeding] = useState(false);
  const [promotingQueueId, setPromotingQueueId] = useState<string | null>(null);

  // Add Space form
  const [spaceName, setSpaceName] = useState('');
  const [spaceZone, setSpaceZone] = useState<SpaceZone>('Hot Line');
  const [spaceSqFt, setSpaceSqFt] = useState('750');
  const [spaceCapacity, setSpaceCapacity] = useState('6');
  const [spaceRate, setSpaceRate] = useState('90');
  const [spaceDesc, setSpaceDesc] = useState('');

  // Add Equipment form
  const [eqName, setEqName] = useState('');
  const [eqCategory, setEqCategory] = useState<EquipmentCategory>('Thermal');
  const [eqSpec, setEqSpec] = useState('');
  const [eqRate, setEqRate] = useState('22');
  const [eqUnits, setEqUnits] = useState('2');

  // Add Staff form
  const [staffCode, setStaffCode] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('Sous Chef');
  const [staffStation, setStaffStation] = useState('Hot Line & Convection Bay');
  const [staffShift, setStaffShift] = useState<StaffShift>('Morning');

  const kpis = useMemo(() => {
    const activeBookings = bookings.filter(
      (b) => b.status === 'confirmed' || b.status === 'in-progress'
    );
    const totalBookedHours = bookings
      .filter((b) => b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.durationHours, 0);
    const totalRevenue = bookings
      .filter((b) => b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.totalCost, 0);
    const openDuties = duties.filter((d) => d.status !== 'completed').length;
    return {
      activeCount: activeBookings.length,
      totalBookedHours,
      totalRevenue,
      openDuties,
    };
  }, [bookings, duties]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const seeded = await seedFacilityCatalogIfEmpty();
      onNotify(
        seeded
          ? 'Initialized default kitchen spaces, equipment, and staff roster.'
          : 'Facility catalog already populated.',
        'success'
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleBookingStatusChange = async (booking: Booking, nextStatus: BookingStatus) => {
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), {
        status: nextStatus,
        updatedAt: now,
      });
      batch.update(doc(db, 'availabilitySlots', booking.id), {
        status: nextStatus,
        updatedAt: now,
      });
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Facility Admin', LIMITS.NAME_MAX),
        eventType: 'booking',
        severity: nextStatus === 'cancelled' ? 'warn' : 'info',
        station: clampStr(booking.spaceName, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Admin updated booking ${booking.id} (${booking.chefName}) to ${nextStatus.toUpperCase()}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: booking.id,
        createdAt: now,
      });
      await batch.commit();
      onNotify(`Booking ${booking.id} updated to ${nextStatus}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const waitingQueue = useMemo(
    () => queueEntries.filter((q) => q.status === 'waiting'),
    [queueEntries]
  );

  const isQueueSlotOpen = (entry: BookingQueueEntry): boolean => {
    return !availabilitySlots.some(
      (slot) =>
        slot.spaceId === entry.spaceId &&
        slot.date === entry.date &&
        slot.status !== 'cancelled' &&
        entry.startHour < slot.endHour &&
        entry.endHour > slot.startHour
    );
  };

  const handlePromoteQueueEntry = async (entry: BookingQueueEntry) => {
    if (!isQueueSlotOpen(entry)) {
      onNotify('Cannot promote yet — the requested kitchen hours are still occupied.', 'error');
      return;
    }
    setPromotingQueueId(entry.id);
    const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();
    const earnedPts = entry.durationHours * POINTS_PER_HOUR;

    const matchedSpace = spaces.find((s) => s.id === entry.spaceId);
    const spaceSub = matchedSpace
      ? matchedSpace.hourlyRate * entry.durationHours
      : entry.estimatedTotal;
    const equipSub = entry.equipmentItems.reduce(
      (sum, item) => sum + item.hourlyRate * item.quantity * entry.durationHours,
      0
    );

    try {
      const userDocSnap = await getDoc(doc(db, 'users', entry.ownerId));
      const batch = writeBatch(db);

      batch.set(doc(db, 'bookings', bookingId), {
        ownerId: entry.ownerId,
        chefName: entry.chefName,
        spaceId: entry.spaceId,
        spaceName: entry.spaceName,
        date: entry.date,
        startHour: entry.startHour,
        durationHours: entry.durationHours,
        endHour: entry.endHour,
        equipmentItems: entry.equipmentItems,
        spaceSubtotal: Math.max(0, entry.estimatedTotal - equipSub) || spaceSub,
        equipmentSubtotal: equipSub,
        totalCost: entry.estimatedTotal,
        pointsEarned: earnedPts,
        status: 'confirmed',
        notes: entry.notes,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'availabilitySlots', bookingId), {
        bookingId,
        ownerId: entry.ownerId,
        spaceId: entry.spaceId,
        date: entry.date,
        startHour: entry.startHour,
        endHour: entry.endHour,
        status: 'confirmed',
        updatedAt: now,
      });

      batch.update(doc(db, 'bookingQueue', entry.id), {
        status: 'promoted',
        updatedAt: now,
      });

      if (userDocSnap.exists()) {
        batch.update(doc(db, 'users', entry.ownerId), {
          loyaltyPoints: increment(earnedPts),
          totalHoursBooked: increment(entry.durationHours),
          updatedAt: now,
        });
      }

      batch.set(doc(db, 'logs', logId), {
        ownerId: entry.ownerId,
        actorName: clampStr(userName || 'Facility Admin', LIMITS.NAME_MAX),
        eventType: 'booking',
        severity: 'info',
        station: clampStr(entry.spaceName, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Admin promoted waitlist ticket ${entry.id} for ${entry.chefName} into confirmed booking ${bookingId} (+${earnedPts} pts).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId,
        createdAt: now,
      });

      await batch.commit();
      onNotify(`Promoted ${entry.chefName}'s waitlist ticket into booking ${bookingId}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookingQueue/${entry.id}`);
    } finally {
      setPromotingQueueId(null);
    }
  };

  const handleDismissQueueEntry = async (entry: BookingQueueEntry) => {
    try {
      await updateDoc(doc(db, 'bookingQueue', entry.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      onNotify(`Dismissed waitlist ticket ${entry.id}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookingQueue/${entry.id}`);
    }
  };

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(spaceName, LIMITS.NAME_MAX);
    if (!cleanName) return;
    const id = sanitizeId(`space_${cleanName.toLowerCase()}_${Date.now().toString().slice(-4)}`);
    const now = serverTimestamp();
    const imageMap: Record<SpaceZone, string> = {
      Pastry: 'pastry_suite',
      'Hot Line': 'hotline_bay',
      'Cold Prep': 'cold_prep',
      'R&D Lab': 'sensory_rd',
    };

    try {
      await setDoc(doc(db, 'spaces', id), {
        id,
        name: cleanName,
        zone: spaceZone,
        sqFt: Math.max(50, Number(spaceSqFt) || 500),
        capacity: Math.max(1, Number(spaceCapacity) || 4),
        hourlyRate: Math.max(0, Number(spaceRate) || 75),
        description: clampStr(spaceDesc || 'Commercial hourly culinary station.', LIMITS.DESC_MAX),
        imagePath: imageMap[spaceZone],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      setSpaceName('');
      setSpaceDesc('');
      onNotify(`Added space "${cleanName}" at $${spaceRate}/hr.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `spaces/${id}`);
    }
  };

  const handleToggleSpaceActive = async (space: KitchenSpace) => {
    try {
      await updateDoc(doc(db, 'spaces', space.id), {
        isActive: !space.isActive,
        updatedAt: serverTimestamp(),
      });
      onNotify(`${space.name} marked ${!space.isActive ? 'active' : 'inactive'}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `spaces/${space.id}`);
    }
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(eqName, LIMITS.NAME_MAX);
    if (!cleanName) return;
    const id = sanitizeId(`eq_${cleanName.toLowerCase()}_${Date.now().toString().slice(-4)}`);
    const now = serverTimestamp();
    try {
      await setDoc(doc(db, 'equipment', id), {
        id,
        name: cleanName,
        category: eqCategory,
        spec: clampStr(eqSpec || 'Commercial NSF-certified unit', 160),
        hourlyRate: Math.max(0, Number(eqRate) || 15),
        totalUnits: Math.max(1, Number(eqUnits) || 1),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      setEqName('');
      setEqSpec('');
      onNotify(`Added equipment "${cleanName}".`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `equipment/${id}`);
    }
  };

  const handleToggleEquipmentActive = async (item: KitchenEquipment) => {
    try {
      await updateDoc(doc(db, 'equipment', item.id), {
        isActive: !item.isActive,
        updatedAt: serverTimestamp(),
      });
      onNotify(`${item.name} marked ${!item.isActive ? 'available' : 'offline'}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `equipment/${item.id}`);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(staffName, LIMITS.NAME_MAX);
    if (!cleanName) return;
    const code = sanitizeId(staffCode || `STF-${Date.now().toString().slice(-3)}`).slice(0, 24);
    const id = sanitizeId(`staff_${cleanName.toLowerCase()}_${Date.now().toString().slice(-4)}`);
    const now = serverTimestamp();

    try {
      await setDoc(doc(db, 'staff', id), {
        staffCode: code,
        name: cleanName,
        role: staffRole,
        station: clampStr(staffStation, 80),
        shift: staffShift,
        linkedUid: '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      setStaffCode('');
      setStaffName('');
      onNotify(`Added ${cleanName} (${staffRole}) to staff roster.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `staff/${id}`);
    }
  };

  const handleToggleStaffActive = async (member: StaffMember) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), {
        isActive: !member.isActive,
        updatedAt: serverTimestamp(),
      });
      onNotify(`${member.name} marked ${!member.isActive ? 'active' : 'inactive'}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `staff/${member.id}`);
    }
  };

  const handleDownloadMasterLog = () => {
    const content = buildLogFileContent(logs, 'HEARTHLINE ADMIN MASTER AUDIT');
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(`hearthline-master-${dateTag}.log`, content, 'text/plain;charset=utf-8');
    onNotify(`Downloaded master log file (${logs.length} entries).`, 'success');
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
        <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-semibold text-slate-900">Facility Admin Access Required</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Catalog pricing, all-member reservation overrides, and staff roster management are restricted to verified facility administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Admin Header & Sub-navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Bookings & Overview' },
              { id: 'spaces', label: 'Kitchen Spaces' },
              { id: 'equipment', label: 'Equipment Catalog' },
              { id: 'staff', label: 'Staff Roster' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            Sync Default Catalog
          </button>
          <button
            type="button"
            onClick={handleDownloadMasterLog}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Master .LOG
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Active Reservations</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.activeCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Booked Kitchen Hours</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.totalBookedHours}h
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Gross Booking Value</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-teal-800">
            ${kpis.totalRevenue.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Open Staff Duties</div>
          <div className="mt-1 text-2xl font-mono tabular-nums font-bold text-slate-900">
            {kpis.openDuties}
          </div>
        </div>
      </div>

      {/* Tab 1: All Bookings & Waitlist Queue */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {waitingQueue.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Waitlist Queue ({waitingQueue.length} waiting)
                </h2>
                <p className="text-sm text-slate-600">
                  Promote queued chefs into confirmed bookings as soon as their requested bay hours open up.
                </p>
              </div>
              <div className="bg-white border border-amber-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-amber-200 text-xs font-semibold text-amber-900 bg-amber-50/70">
                      <th className="py-3 px-4">Chef / Member</th>
                      <th className="py-3 px-4">Requested Bay & Hours</th>
                      <th className="py-3 px-4 text-right">Est. Total</th>
                      <th className="py-3 px-4">Slot Availability</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {waitingQueue.map((q) => {
                      const slotOpen = isQueueSlotOpen(q);
                      return (
                        <tr key={q.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{q.chefName}</div>
                            <div className="text-xs font-mono text-slate-500">{q.id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-900">{q.spaceName}</div>
                            <div className="text-xs font-mono tabular-nums text-slate-500">
                              {q.date} · {String(q.startHour).padStart(2, '0')}:00–
                              {String(q.endHour).padStart(2, '0')}:00 ({q.durationHours}h)
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                            ${q.estimatedTotal.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            <span className={slotOpen ? 'text-emerald-700' : 'text-amber-700'}>
                              {slotOpen ? 'Window Open' : 'Currently Occupied'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={!slotOpen || promotingQueueId === q.id}
                              onClick={() => handlePromoteQueueEntry(q)}
                              className="px-3 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-md whitespace-nowrap"
                            >
                              {promotingQueueId === q.id ? 'Promoting...' : 'Promote to Booking'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissQueueEntry(q)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                            >
                              Dismiss
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Facility Booking Control Queue</h2>
              <p className="text-sm text-slate-600">
                Review all member reservations, start active kitchen sessions, or complete/cancel bookings.
              </p>
            </div>

          {bookings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-600">
              No facility bookings have been submitted yet.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                    <th className="py-3 px-4">Chef / Member</th>
                    <th className="py-3 px-4">Station & Hours</th>
                    <th className="py-3 px-4">Equipment</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{b.chefName}</div>
                        <div className="text-xs font-mono text-slate-500">{b.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{b.spaceName}</div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          {b.date} · {String(b.startHour).padStart(2, '0')}:00–
                          {String(b.endHour).padStart(2, '0')}:00 ({b.durationHours}h)
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {b.equipmentItems.length === 0
                          ? 'None'
                          : b.equipmentItems.map((e) => `${e.quantity}× ${e.name}`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        ${b.totalCost.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold capitalize ${
                            b.status === 'confirmed'
                              ? 'text-teal-700'
                              : b.status === 'in-progress'
                              ? 'text-amber-700'
                              : b.status === 'completed'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <select
                          value={b.status}
                          onChange={(e) =>
                            handleBookingStatusChange(b, e.target.value as BookingStatus)
                          }
                          className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        </div>
      )}

      {/* Tab 2: Manage Kitchen Spaces */}
      {activeTab === 'spaces' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateSpace} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Add Commercial Kitchen Space</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <label className="block space-y-1.5 lg:col-span-2">
                <span className="text-xs font-medium text-slate-700">Space Name</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  placeholder="e.g. Fermentation & Koji Room"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Zone</span>
                <select
                  value={spaceZone}
                  onChange={(e) => setSpaceZone(e.target.value as SpaceZone)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  <option value="Pastry">Pastry</option>
                  <option value="Hot Line">Hot Line</option>
                  <option value="Cold Prep">Cold Prep</option>
                  <option value="R&D Lab">R&D Lab</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Sq Ft / Capacity</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="50"
                    value={spaceSqFt}
                    onChange={(e) => setSpaceSqFt(e.target.value)}
                    className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                  />
                  <input
                    type="number"
                    min="1"
                    value={spaceCapacity}
                    onChange={(e) => setSpaceCapacity(e.target.value)}
                    className="w-full px-2 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Hourly Rate ($/hr)</span>
                <input
                  type="number"
                  min="0"
                  value={spaceRate}
                  onChange={(e) => setSpaceRate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                maxLength={LIMITS.DESC_MAX}
                value={spaceDesc}
                onChange={(e) => setSpaceDesc(e.target.value)}
                placeholder="Station equipment inclusions, ventilation specs, and utility hookups..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-md whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Space
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Space Name</th>
                  <th className="py-3 px-4">Zone · Footprint</th>
                  <th className="py-3 px-4 text-right">Hourly Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {spaces.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.description}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {s.zone} · <span className="font-mono tabular-nums">{s.sqFt} sq ft</span> ·{' '}
                      <span className="font-mono tabular-nums">{s.capacity} max</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      ${s.hourlyRate}/hr
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={s.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                        {s.isActive ? 'Active' : 'Maintenance'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleSpaceActive(s)}
                        className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                      >
                        {s.isActive ? 'Set Maintenance' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Equipment Catalog */}
      {activeTab === 'equipment' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateEquipment} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Add Commercial Equipment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Equipment Name</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={eqName}
                  onChange={(e) => setEqName(e.target.value)}
                  placeholder="e.g. Robot Coupe R602"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Category</span>
                <select
                  value={eqCategory}
                  onChange={(e) => setEqCategory(e.target.value as EquipmentCategory)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  <option value="Thermal">Thermal</option>
                  <option value="Mixing">Mixing</option>
                  <option value="Cooling">Cooling</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Precision">Precision</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Hourly Rate ($/hr)</span>
                <input
                  type="number"
                  min="0"
                  value={eqRate}
                  onChange={(e) => setEqRate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Available Units</span>
                <input
                  type="number"
                  min="1"
                  value={eqUnits}
                  onChange={(e) => setEqUnits(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                maxLength={160}
                value={eqSpec}
                onChange={(e) => setEqSpec(e.target.value)}
                placeholder="Technical specification (capacity, voltage, temperature range)..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-md whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Equipment
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Equipment</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Units</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {equipment.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.spec}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{item.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {item.totalUnits}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      ${item.hourlyRate}/hr
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={item.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                        {item.isActive ? 'Available' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleEquipmentActive(item)}
                        className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                      >
                        {item.isActive ? 'Take Offline' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Staff Roster */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <form onSubmit={handleAddStaff} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Add Staff Member to Facility Roster</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Staff Code</span>
                <input
                  type="text"
                  maxLength={24}
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                  placeholder="STF-106"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Full Name</span>
                <input
                  type="text"
                  maxLength={LIMITS.NAME_MAX}
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Liam Mercer"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Role</span>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  <option value="Sous Chef">Sous Chef</option>
                  <option value="Prep Cook">Prep Cook</option>
                  <option value="Sanitation Lead">Sanitation Lead</option>
                  <option value="Facility Tech">Facility Tech</option>
                  <option value="R&D Baker">R&D Baker</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Primary Station</span>
                <input
                  type="text"
                  maxLength={80}
                  value={staffStation}
                  onChange={(e) => setStaffStation(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Shift</span>
                <select
                  value={staffShift}
                  onChange={(e) => setStaffShift(e.target.value as StaffShift)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                >
                  <option value="Morning">Morning</option>
                  <option value="Midday">Midday</option>
                  <option value="Evening">Evening</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-md whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Staff Member
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Staff Code · Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Primary Station</th>
                  <th className="py-3 px-4">Shift</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {staff.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-slate-500 mr-2">{m.staffCode}</span>
                      <span className="font-medium text-slate-900">{m.name}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{m.role}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{m.station}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{m.shift}</td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={m.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                        {m.isActive ? 'Active' : 'Off Roster'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleStaffActive(m)}
                        className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                      >
                        {m.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
