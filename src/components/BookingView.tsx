import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Check,
  AlertTriangle,
  X,
  Plus,
  Minus,
  QrCode,
  ListPlus,
  Award,
  FlaskConical,
} from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AvailabilitySlot,
  BookedEquipmentItem,
  Booking,
  BookingPrefillRequest,
  BookingQueueEntry,
  KitchenEquipment,
  KitchenSpace,
  LIMITS,
  POINTS_PER_HOUR,
  UserProfile,
  clampStr,
} from '../types';
import { SpaceImage } from './SpaceImage';
import { BookingPassModal } from './BookingPassModal';

interface BookingViewProps {
  uid: string;
  userName: string;
  userProfile: UserProfile | null;
  spaces: KitchenSpace[];
  equipment: KitchenEquipment[];
  availabilitySlots: AvailabilitySlot[];
  bookings: Booking[];
  queueEntries: BookingQueueEntry[];
  loading: boolean;
  prefillRequest?: BookingPrefillRequest | null;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenProductionForBooking?: (bookingId: string) => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 to 21:00

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function BookingView({
  uid,
  userName,
  userProfile,
  spaces,
  equipment,
  availabilitySlots,
  bookings,
  queueEntries,
  loading,
  prefillRequest = null,
  onNotify,
  onOpenProductionForBooking,
}: BookingViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(spaces[0]?.id ?? '');
  const [startHour, setStartHour] = useState<number>(9);
  const [durationHours, setDurationHours] = useState<number>(3);
  const [equipmentQty, setEquipmentQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [joiningQueue, setJoiningQueue] = useState<boolean>(false);
  const [bookingFilter, setBookingFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [activePassBooking, setActivePassBooking] = useState<Booking | null>(null);

  const activeSpaces = useMemo(() => spaces.filter((s) => s.isActive), [spaces]);
  const activeEquipment = useMemo(() => equipment.filter((e) => e.isActive), [equipment]);

  useEffect(() => {
    if (!selectedSpaceId && activeSpaces.length > 0) {
      setSelectedSpaceId(activeSpaces[0].id);
    }
  }, [activeSpaces, selectedSpaceId]);

  useEffect(() => {
    if (!prefillRequest) return;
    if (prefillRequest.spaceId && activeSpaces.some((s) => s.id === prefillRequest.spaceId)) {
      setSelectedSpaceId(prefillRequest.spaceId);
    }
    if (typeof prefillRequest.durationHours === 'number' && prefillRequest.durationHours >= 1) {
      setDurationHours(Math.min(12, Math.max(1, prefillRequest.durationHours)));
    }
    if (prefillRequest.equipmentNames && prefillRequest.equipmentNames.length > 0) {
      const nextEq: Record<string, number> = {};
      for (const reqName of prefillRequest.equipmentNames) {
        const needle = reqName.toLowerCase();
        const found = activeEquipment.find(
          (eq) =>
            eq.name.toLowerCase().includes(needle) ||
            needle.includes(eq.name.toLowerCase().split(' ')[0])
        );
        if (found) {
          nextEq[found.id] = 1;
        }
      }
      if (Object.keys(nextEq).length > 0) {
        setEquipmentQty((prev) => ({ ...prev, ...nextEq }));
      }
    }
    if (prefillRequest.notes) {
      setNotes(clampStr(prefillRequest.notes, LIMITS.NOTES_MAX));
    }
  }, [prefillRequest, activeSpaces, activeEquipment]);

  const effectiveSpace = useMemo(
    () => activeSpaces.find((s) => s.id === selectedSpaceId) || activeSpaces[0] || null,
    [activeSpaces, selectedSpaceId]
  );

  const endHour = Math.min(24, startHour + durationHours);

  // Build map of occupied hours per space for the selected date
  const spaceOccupancyMap = useMemo(() => {
    const map: Record<string, Map<number, AvailabilitySlot>> = {};
    for (const space of activeSpaces) {
      map[space.id] = new Map<number, AvailabilitySlot>();
    }
    for (const slot of availabilitySlots) {
      if (slot.date === selectedDate && slot.status !== 'cancelled') {
        if (!map[slot.spaceId]) map[slot.spaceId] = new Map<number, AvailabilitySlot>();
        for (let h = slot.startHour; h < slot.endHour; h++) {
          map[slot.spaceId].set(h, slot);
        }
      }
    }
    return map;
  }, [availabilitySlots, activeSpaces, selectedDate]);

  const occupiedHours = useMemo(() => {
    if (!effectiveSpace) return new Set<number>();
    const map = spaceOccupancyMap[effectiveSpace.id];
    return map ? new Set<number>(map.keys()) : new Set<number>();
  }, [spaceOccupancyMap, effectiveSpace]);

  const hasTimeConflict = useMemo(() => {
    for (let h = startHour; h < endHour; h++) {
      if (occupiedHours.has(h)) return true;
    }
    return startHour + durationHours > 24;
  }, [occupiedHours, startHour, durationHours, endHour]);

  const selectedEquipmentList: BookedEquipmentItem[] = useMemo(() => {
    return activeEquipment
      .filter((eq) => (equipmentQty[eq.id] || 0) > 0)
      .map((eq) => ({
        equipmentId: eq.id,
        name: eq.name,
        quantity: equipmentQty[eq.id],
        hourlyRate: eq.hourlyRate,
      }));
  }, [activeEquipment, equipmentQty]);

  const spaceSubtotal = effectiveSpace ? effectiveSpace.hourlyRate * durationHours : 0;
  const equipmentSubtotal = selectedEquipmentList.reduce(
    (sum, item) => sum + item.hourlyRate * item.quantity * durationHours,
    0
  );
  const totalCost = spaceSubtotal + equipmentSubtotal;
  const pointsEarned = durationHours * POINTS_PER_HOUR;

  const adjustEquipment = (eqId: string, delta: number, maxUnits: number) => {
    setEquipmentQty((prev) => {
      const current = prev[eqId] || 0;
      const next = Math.max(0, Math.min(maxUnits, current + delta));
      return { ...prev, [eqId]: next };
    });
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveSpace) {
      onNotify('Select a commercial kitchen space first.', 'error');
      return;
    }
    if (hasTimeConflict) {
      onNotify('Selected hours are already occupied. Join the waitlist queue or pick open hours.', 'error');
      return;
    }
    if (!LIMITS.DATE_PATTERN.test(selectedDate)) {
      onNotify('Invalid booking date format.', 'error');
      return;
    }

    setSubmitting(true);
    const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);

      const newBookingPayload = {
        ownerId: uid,
        chefName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        spaceId: effectiveSpace.id,
        spaceName: clampStr(effectiveSpace.name, LIMITS.NAME_MAX),
        date: selectedDate,
        startHour,
        durationHours,
        endHour,
        equipmentItems: selectedEquipmentList.slice(0, 20),
        spaceSubtotal,
        equipmentSubtotal,
        totalCost,
        pointsEarned,
        status: 'confirmed' as const,
        notes: clampStr(notes, LIMITS.NOTES_MAX),
        createdAt: now,
        updatedAt: now,
      };

      batch.set(doc(db, 'bookings', bookingId), newBookingPayload);

      batch.set(doc(db, 'availabilitySlots', bookingId), {
        bookingId,
        ownerId: uid,
        spaceId: effectiveSpace.id,
        date: selectedDate,
        startHour,
        endHour,
        status: 'confirmed',
        updatedAt: now,
      });

      if (userProfile) {
        batch.update(doc(db, 'users', uid), {
          loyaltyPoints: (userProfile.loyaltyPoints || 0) + pointsEarned,
          totalHoursBooked: (userProfile.totalHoursBooked || 0) + durationHours,
          updatedAt: now,
        });
      }

      const equipSummary =
        selectedEquipmentList.length > 0
          ? ` with ${selectedEquipmentList.map((i) => `${i.quantity}x ${i.name}`).join(', ')}`
          : '';

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'booking',
        severity: 'info',
        station: clampStr(effectiveSpace.name, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Reserved ${effectiveSpace.name} on ${selectedDate} (${formatHour(startHour)}–${formatHour(endHour)})${equipSummary}. Total $${totalCost.toFixed(2)}. Earned +${pointsEarned} pts.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId,
        createdAt: now,
      });

      await batch.commit();

      const completedPass: Booking = {
        ...newBookingPayload,
        id: bookingId,
      };

      setEquipmentQty({});
      setNotes('');
      setActivePassBooking(completedPass);
      onNotify(
        `Confirmed ${effectiveSpace.name} (${formatHour(startHour)}–${formatHour(endHour)}) and added +${pointsEarned} loyalty points!`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!effectiveSpace) return;
    setJoiningQueue(true);
    const queueId = `que_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'bookingQueue', queueId), {
        ownerId: uid,
        chefName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        spaceId: effectiveSpace.id,
        spaceName: clampStr(effectiveSpace.name, LIMITS.NAME_MAX),
        date: selectedDate,
        startHour,
        durationHours,
        endHour,
        equipmentItems: selectedEquipmentList.slice(0, 20),
        estimatedTotal: totalCost,
        status: 'waiting',
        notes: clampStr(notes, 400),
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'booking',
        severity: 'warn',
        station: clampStr(effectiveSpace.name, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Joined waitlist queue (${queueId}) for occupied slot on ${effectiveSpace.name}, ${selectedDate} (${formatHour(startHour)}–${formatHour(endHour)}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: '',
        createdAt: now,
      });

      await batch.commit();
      setNotes('');
      onNotify(
        `Added to priority waitlist queue for ${effectiveSpace.name} (${formatHour(startHour)}–${formatHour(endHour)}).`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookingQueue/${queueId}`);
    } finally {
      setJoiningQueue(false);
    }
  };

  const handleCancelQueue = async (entry: BookingQueueEntry) => {
    if (entry.status !== 'waiting') return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookingQueue', entry.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onNotify(`Removed waitlist ticket for ${entry.spaceName}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookingQueue/${entry.id}`);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    if (booking.status === 'completed' || booking.status === 'cancelled') return;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), {
        status: 'cancelled',
        updatedAt: now,
      });
      batch.update(doc(db, 'availabilitySlots', booking.id), {
        status: 'cancelled',
        updatedAt: now,
      });
      if (userProfile && booking.ownerId === uid) {
        const deduct = booking.pointsEarned || booking.durationHours * POINTS_PER_HOUR;
        batch.update(doc(db, 'users', uid), {
          loyaltyPoints: Math.max(0, (userProfile.loyaltyPoints || 0) - deduct),
          totalHoursBooked: Math.max(0, (userProfile.totalHoursBooked || 0) - booking.durationHours),
          updatedAt: now,
        });
      }
      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType: 'booking',
        severity: 'warn',
        station: clampStr(booking.spaceName, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Cancelled reservation ${booking.id} for ${booking.spaceName} on ${booking.date} (${formatHour(booking.startHour)}–${formatHour(booking.endHour)}).`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: booking.id,
        createdAt: now,
      });
      await batch.commit();
      onNotify(`Cancelled reservation on ${booking.spaceName}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (bookingFilter === 'active') return b.status === 'confirmed' || b.status === 'in-progress';
      if (bookingFilter === 'completed') return b.status === 'completed' || b.status === 'cancelled';
      return true;
    });
  }, [bookings, bookingFilter]);

  const activeQueueTickets = useMemo(
    () => queueEntries.filter((q) => q.status === 'waiting'),
    [queueEntries]
  );

  if (loading && activeSpaces.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* QR Code Pass Modal */}
      {activePassBooking && (
        <BookingPassModal
          booking={activePassBooking}
          onClose={() => setActivePassBooking(null)}
        />
      )}

      {/* Main Booking Split Layout */}
      <form onSubmit={handleConfirmBooking} className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Space + Timetable + Equipment */}
        <div className="xl:col-span-8 space-y-8">
          {/* Step 1: Select Kitchen Type (matches Landing Page Kitchen Types with prices) */}
          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">1. Choose Kitchen Type & Hourly Rate</h2>
                <p className="text-sm text-slate-600">
                  Select from our commercial culinary suites. Every hour booked earns {POINTS_PER_HOUR} loyalty points.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {activeSpaces.length} kitchen types
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSpaces.map((space) => {
                const isSelected = effectiveSpace?.id === space.id;
                return (
                  <button
                    type="button"
                    key={space.id}
                    onClick={() => setSelectedSpaceId(space.id)}
                    className={`text-left bg-white rounded-lg border transition-colors overflow-hidden flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                      isSelected
                        ? 'border-teal-700 ring-1 ring-teal-700'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="h-40 w-full overflow-hidden bg-slate-100 relative">
                      <SpaceImage imagePath={space.imagePath} alt={space.name} />
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{space.name}</h3>
                          <span className="font-mono tabular-nums text-sm font-bold text-teal-800 whitespace-nowrap shrink-0">
                            ${space.hourlyRate}/hr
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>{space.zone}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{space.sqFt} sq ft</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Up to {space.capacity} chefs</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600 leading-relaxed line-clamp-2">
                          {space.description}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className={isSelected ? 'font-semibold text-teal-700' : 'text-slate-500'}>
                          {isSelected ? 'Selected Kitchen' : 'Select kitchen'}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-teal-700" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: Schedule & Facility Occupancy Timetable */}
          <section className="space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-lg font-semibold text-slate-900">2. Occupancy Timetable & Hourly Window</h2>
              <p className="text-sm text-slate-600">
                Inspect live kitchen occupancy across all stations for {selectedDate}. Click any cell to select a station & hour, or join the waitlist queue if occupied.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Session Date
                  </span>
                  <input
                    type="date"
                    min={todayStr}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                    required
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Start Hour
                  </span>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {formatHour(h)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Duration (Hours)</span>
                  <select
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((d) => (
                      <option key={d} value={d} disabled={startHour + d > 24}>
                        {d} {d === 1 ? 'hour' : 'hours'} (until {formatHour(Math.min(24, startHour + d))})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Full Facility Occupancy Timetable Matrix */}
              <div className="space-y-2.5 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">
                    Facility Occupancy Timetable · {selectedDate}
                  </span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm border border-slate-300 bg-white inline-block" />
                      Available
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-teal-700 inline-block" />
                      Selected
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
                      Occupied (Queueable)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="py-2 px-3 text-[11px] font-semibold text-slate-600 min-w-[150px]">
                          Kitchen Station
                        </th>
                        {HOURS.map((h) => (
                          <th
                            key={h}
                            className="py-2 px-1 text-center text-[11px] font-mono tabular-nums font-medium text-slate-500 min-w-[32px]"
                          >
                            {String(h).padStart(2, '0')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeSpaces.map((sp) => {
                        const rowOccupancy = spaceOccupancyMap[sp.id];
                        const isRowSpace = effectiveSpace?.id === sp.id;
                        return (
                          <tr key={sp.id} className={isRowSpace ? 'bg-slate-50/60' : 'bg-white'}>
                            <td className="py-2 px-3 text-xs font-medium text-slate-900 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedSpaceId(sp.id)}
                                className={`text-left hover:text-teal-700 ${
                                  isRowSpace ? 'font-semibold text-teal-800' : ''
                                }`}
                              >
                                {sp.name}
                              </button>
                            </td>
                            {HOURS.map((h) => {
                              const slot = rowOccupancy?.get(h);
                              const isOccupied = Boolean(slot);
                              const isYours = slot?.ownerId === uid;
                              const isSelectedCell = isRowSpace && h >= startHour && h < endHour;
                              return (
                                <td key={h} className="p-0.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSpaceId(sp.id);
                                      setStartHour(h);
                                    }}
                                    title={
                                      isOccupied
                                        ? `${sp.name} at ${formatHour(h)} — Occupied (${isYours ? 'Your booking' : 'Booked'}). Click to queue.`
                                        : `${sp.name} at ${formatHour(h)} — Available ($${sp.hourlyRate}/hr)`
                                    }
                                    className={`w-full h-7 rounded-sm text-[10px] font-mono tabular-nums border transition-colors ${
                                      isSelectedCell && isOccupied
                                        ? 'bg-amber-600 border-amber-700 text-white font-semibold'
                                        : isSelectedCell
                                        ? 'bg-teal-700 border-teal-700 text-white font-semibold'
                                        : isOccupied
                                        ? isYours
                                          ? 'bg-teal-100 border-teal-300 text-teal-900 font-medium'
                                          : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-teal-600 hover:text-teal-700'
                                    }`}
                                  >
                                    {isOccupied ? (isYours ? 'ME' : 'BK') : '·'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Occupied Slot -> Waitlist Queue Prompt */}
                {hasTimeConflict && effectiveSpace && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          Time Slot Occupied on {effectiveSpace.name} ({formatHour(startHour)}–{formatHour(endHour)})
                        </span>
                      </div>
                      <p className="text-xs text-amber-800">
                        This window is already reserved on {selectedDate}. You can join the priority waitlist queue—if the reservation cancels or an admin opens capacity, your request can be promoted.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinQueue}
                      disabled={joiningQueue}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <ListPlus className="w-4 h-4" />
                      {joiningQueue ? 'Joining Queue...' : 'Join Waitlist Queue'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Step 3: Commercial Equipment Add-Ons */}
          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">3. Commercial Equipment Add-Ons</h2>
                <p className="text-sm text-slate-600">
                  Reserve specialized thermal, mixing, cooling, or packaging equipment for your {durationHours}-hour block.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {selectedEquipmentList.length} selected
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              {activeEquipment.map((eq) => {
                const qty = equipmentQty[eq.id] || 0;
                return (
                  <div
                    key={eq.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{eq.name}</span>
                        <span className="text-xs text-slate-500">· {eq.category}</span>
                      </div>
                      <p className="text-xs text-slate-600">{eq.spec}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                          ${eq.hourlyRate}/hr
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          {eq.totalUnits} units max
                        </div>
                      </div>

                      <div className="flex items-center border border-slate-300 rounded-md bg-white">
                        <button
                          type="button"
                          onClick={() => adjustEquipment(eq.id, -1, eq.totalUnits)}
                          disabled={qty === 0}
                          aria-label={`Remove ${eq.name}`}
                          className="p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-mono tabular-nums font-medium text-slate-900">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustEquipment(eq.id, 1, eq.totalUnits)}
                          disabled={qty >= eq.totalUnits}
                          aria-label={`Add ${eq.name}`}
                          className="p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right 4 Columns: Sticky Booking Summary */}
        <aside className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-6 space-y-5 xl:sticky xl:top-6">
          <div className="border-b border-slate-200 pb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Reservation Summary</h3>
              <p className="text-xs text-slate-500 mt-0.5">Includes QR Pass & Loyalty Points</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">Your Points</div>
              <div className="text-xs font-mono tabular-nums font-semibold text-teal-800">
                {userProfile?.loyaltyPoints ?? 0} pts
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Kitchen Type</span>
              <span className="font-medium text-slate-900 text-right">{effectiveSpace?.name || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Schedule</span>
              <span className="font-mono tabular-nums text-slate-900">
                {selectedDate} · {formatHour(startHour)}–{formatHour(endHour)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Duration</span>
              <span className="font-mono tabular-nums text-slate-900">{durationHours} hrs</span>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">
                Station ({durationHours}h × ${effectiveSpace?.hourlyRate || 0})
              </span>
              <span className="font-mono tabular-nums text-slate-900">${spaceSubtotal.toFixed(2)}</span>
            </div>

            {selectedEquipmentList.map((item) => (
              <div key={item.equipmentId} className="flex justify-between gap-2 text-xs text-slate-600">
                <span className="truncate">
                  {item.quantity}× {item.name} ({durationHours}h)
                </span>
                <span className="font-mono tabular-nums text-slate-900 shrink-0">
                  ${(item.hourlyRate * item.quantity * durationHours).toFixed(2)}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between text-xs text-teal-800 pt-1">
              <span className="inline-flex items-center gap-1 font-medium">
                <Award className="w-3.5 h-3.5" />
                Loyalty Points Reward
              </span>
              <span className="font-mono tabular-nums font-semibold">+{pointsEarned} pts</span>
            </div>

            <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-900">Estimated Total</span>
              <span className="text-xl font-mono tabular-nums font-bold text-teal-800">
                ${totalCost.toFixed(2)}
              </span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Production / Prep Notes</span>
            <textarea
              rows={3}
              maxLength={LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Laminated brioche batch trial, allergen-free setup required"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          {hasTimeConflict ? (
            <button
              type="button"
              onClick={handleJoinQueue}
              disabled={joiningQueue || !effectiveSpace}
              className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              {joiningQueue ? 'Adding to Queue...' : 'Slot Booked — Join Waitlist Queue'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting || !effectiveSpace}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              {submitting ? 'Confirming Reservation...' : 'Confirm Booking & Get QR Pass'}
            </button>
          )}
        </aside>
      </form>

      {/* Active Waitlist Queue Tickets */}
      {activeQueueTickets.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Waitlist Queue Tickets</h2>
            <p className="text-xs text-slate-600">
              Pending slot requests awaiting availability or admin promotion.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {activeQueueTickets.map((q) => (
              <div key={q.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {q.spaceName} · <span className="text-amber-700">Queued</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500">
                    {q.date} · {formatHour(q.startHour)}–{formatHour(q.endHour)} ({q.durationHours}h) · Est. ${q.estimatedTotal.toFixed(2)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelQueue(q)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap self-start sm:self-center"
                >
                  Leave Queue
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* My Bookings Ledger */}
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">My Kitchen Reservations</h2>
            <p className="text-sm text-slate-600">
              Open QR passes to share via Email/WhatsApp or log production once a session finishes.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(['all', 'active', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setBookingFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                  bookingFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-600">
            No kitchen reservations match this filter. Select a kitchen type and open hours above to book.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Space & Window</th>
                  <th className="py-3 px-4">Equipment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Points</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{b.spaceName}</div>
                      <div className="text-xs font-mono tabular-nums text-slate-500">
                        {b.date} · {formatHour(b.startHour)}–{formatHour(b.endHour)} ({b.durationHours}h)
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {b.equipmentItems.length === 0
                        ? 'Space only'
                        : b.equipmentItems.map((e) => `${e.quantity}× ${e.name}`).join(', ')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-medium capitalize ${
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
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-teal-700">
                      {b.status === 'cancelled' ? '0' : `+${b.pointsEarned ?? b.durationHours * POINTS_PER_HOUR}`}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      ${b.totalCost.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {b.status !== 'cancelled' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActivePassBooking(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded border border-slate-300 transition-colors whitespace-nowrap"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              QR Pass
                            </button>
                            {onOpenProductionForBooking && (
                              <button
                                type="button"
                                onClick={() => onOpenProductionForBooking(b.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 rounded border border-teal-200 transition-colors whitespace-nowrap"
                              >
                                <FlaskConical className="w-3.5 h-3.5" />
                                Log Production
                              </button>
                            )}
                          </>
                        )}
                        {(b.status === 'confirmed' || b.status === 'in-progress') && (
                          <button
                            type="button"
                            onClick={() => handleCancelBooking(b)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
