import { useMemo, useState } from 'react';
import { ClipboardCheck, Plus, CheckCircle2, Play, Trash2 } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  DutyPriority,
  DutyStatus,
  KitchenSpace,
  LIMITS,
  StaffDuty,
  StaffMember,
  clampStr,
} from '../types';

interface DutiesViewProps {
  uid: string;
  userName: string;
  duties: StaffDuty[];
  staff: StaffMember[];
  spaces: KitchenSpace[];
  bookings: Booking[];
  loading: boolean;
  mineOnly?: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export function DutiesView({
  uid,
  userName,
  duties,
  staff,
  spaces,
  bookings,
  loading,
  mineOnly = false,
  onNotify,
}: DutiesViewProps) {
  const activeStaff = useMemo(() => staff.filter((s) => s.isActive), [staff]);

  const [staffId, setStaffId] = useState(activeStaff[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [station, setStation] = useState(spaces[0]?.name || 'Hot Line & Convection Bay');
  const [priority, setPriority] = useState<DutyPriority>('normal');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookingId, setBookingId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | DutyStatus>('all');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const selectedStaff = useMemo(
    () => activeStaff.find((s) => s.id === staffId) || activeStaff[0] || null,
    [activeStaff, staffId]
  );

  const handleAssignDuty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) {
      onNotify('No active staff member selected.', 'error');
      return;
    }
    const cleanTitle = clampStr(title, LIMITS.DUTY_TITLE_MAX);
    if (!cleanTitle) {
      onNotify('Enter a duty title.', 'error');
      return;
    }

    const dutyId = `dty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'duties', dutyId), {
        ownerId: uid,
        assignedByUid: uid,
        assignedByName: clampStr(userName || 'Kitchen Lead', LIMITS.NAME_MAX),
        staffId: selectedStaff.id,
        staffName: clampStr(selectedStaff.name, LIMITS.NAME_MAX),
        assigneeUid: clampStr(selectedStaff.linkedUid || '', 128),
        title: cleanTitle,
        description: clampStr(description, LIMITS.DESC_MAX),
        station: clampStr(station, LIMITS.NAME_MAX),
        priority,
        dueDate: clampStr(dueDate, 32),
        bookingId: clampStr(bookingId, 128),
        status: 'pending',
        completionNotes: '',
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Lead', LIMITS.NAME_MAX),
        eventType: 'duty',
        severity: priority === 'urgent' ? 'warn' : 'info',
        station: clampStr(station, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Assigned duty "${cleanTitle}" (${priority}) to ${selectedStaff.name} (${selectedStaff.role}) due ${dueDate}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: clampStr(bookingId, 128),
        createdAt: now,
      });

      await batch.commit();
      setTitle('');
      setDescription('');
      onNotify(`Assigned "${cleanTitle}" to ${selectedStaff.name}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `duties/${dutyId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDutyStatus = async (duty: StaffDuty, nextStatus: DutyStatus) => {
    if (duty.status === 'completed') return;
    const note = clampStr(notesDraft[duty.id] ?? duty.completionNotes ?? '', 400);
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = serverTimestamp();

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'duties', duty.id), {
        status: nextStatus,
        completionNotes: note,
        updatedAt: now,
      });

      batch.set(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Staff', LIMITS.NAME_MAX),
        eventType: 'duty',
        severity: 'info',
        station: clampStr(duty.station, LIMITS.NAME_MAX),
        tempReadingC: '',
        message: clampStr(
          `Updated duty "${duty.title}" for ${duty.staffName} to ${nextStatus.toUpperCase()}${note ? ` — ${note}` : ''}.`,
          LIMITS.LOG_MSG_MAX
        ),
        bookingId: duty.bookingId || '',
        createdAt: now,
      });

      await batch.commit();
      onNotify(`Duty "${duty.title}" marked ${nextStatus}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `duties/${duty.id}`);
    }
  };

  const handleDeleteDuty = async (duty: StaffDuty) => {
    try {
      await deleteDoc(doc(db, 'duties', duty.id));
      onNotify(`Removed duty "${duty.title}".`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `duties/${duty.id}`);
    }
  };

  const filteredDuties = useMemo(() => {
    return duties.filter((d) => statusFilter === 'all' || d.status === statusFilter);
  }, [duties, statusFilter]);

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Assign Staff Duty Form (hidden for kitchen_worker mine-only view) */}
      {!mineOnly && (
      <form onSubmit={handleAssignDuty} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assign Duty to Kitchen Staff</h2>
            <p className="text-sm text-slate-600">
              Delegate prep work, sanitation sign-offs, equipment calibration, or closing checklists.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {activeStaff.length} staff on roster
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Assign To Staff</span>
            <select
              value={selectedStaff?.id || ''}
              onChange={(e) => setStaffId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              {activeStaff.length === 0 && <option value="">No staff available</option>}
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.role} ({s.shift})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Duty Title</span>
            <input
              type="text"
              maxLength={LIMITS.DUTY_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sanitize planetary mixer bowls and calibrate deck oven probe"
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as DutyPriority)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Station</span>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="All Zones">All Zones</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Due Date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5 lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Linked Session (Optional)</span>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="">General Facility Duty</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.date} · {b.spaceName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            maxLength={LIMITS.DESC_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Specific checklist instructions, allergen handling notes, or SOP reference..."
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
          <button
            type="submit"
            disabled={submitting || !selectedStaff}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Assigning...' : 'Assign Duty'}
          </button>
        </div>
      </form>
      )}

      {/* Duties Queue */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">
              {mineOnly ? 'My Assigned Duties' : 'Active Duty Roster'}
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(['all', 'pending', 'in-progress', 'completed'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {filteredDuties.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No duties match this status</p>
            <p className="text-xs text-slate-500">
              Assign a prep, sanitation, or technical duty above to coordinate shift handoffs.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {filteredDuties.map((duty) => (
              <div key={duty.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{duty.title}</span>
                    <span
                      className={`text-xs font-medium uppercase ${
                        duty.priority === 'urgent'
                          ? 'text-red-700'
                          : duty.priority === 'normal'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      · {duty.priority}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{duty.staffName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{duty.station}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Due {duty.dueDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>Assigned by {duty.assignedByName}</span>
                  </div>
                  {duty.description && (
                    <p className="text-xs text-slate-600 pt-0.5">{duty.description}</p>
                  )}
                  {duty.completionNotes && (
                    <p className="text-xs text-emerald-700 pt-0.5">
                      Completion note: {duty.completionNotes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {duty.status !== 'completed' && (
                    <input
                      type="text"
                      maxLength={200}
                      value={notesDraft[duty.id] ?? ''}
                      onChange={(e) =>
                        setNotesDraft((prev) => ({ ...prev, [duty.id]: e.target.value }))
                      }
                      placeholder="Sign-off note (optional)"
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md w-44 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  )}

                  {duty.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateDutyStatus(duty, 'in-progress')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start
                    </button>
                  )}

                  {duty.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateDutyStatus(duty, 'completed')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Complete
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 px-2">Completed</span>
                  )}

                  {!mineOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDuty(duty)}
                      title="Delete duty"
                      className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
