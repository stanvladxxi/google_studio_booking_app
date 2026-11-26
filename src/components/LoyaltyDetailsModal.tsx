import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  CalendarClock,
  Users,
  X,
} from 'lucide-react';
import {
  Booking,
  POINTS_PER_HOUR,
  ProductionBatch,
  RecipeVersion,
  SessionLogEntry,
  UserProfile,
} from '../types';

type BreakdownCategory = 'all' | 'booking' | 'referral' | 'activity';

interface LoyaltyEntry {
  id: string;
  category: 'booking' | 'referral' | 'activity';
  title: string;
  subtitle: string;
  dateLabel: string;
  sortKey: number;
  points: number;
  statusLabel: string;
  tone: 'positive' | 'neutral' | 'muted';
}

interface LoyaltyDetailsModalProps {
  onClose: () => void;
  userId: string;
  userName: string;
  userProfile: UserProfile | null;
  bookings: Booking[];
  productionBatches: ProductionBatch[];
  recipeVersions: RecipeVersion[];
  logs: SessionLogEntry[];
}

function getTimestampMillis(ts: unknown): number {
  if (!ts) return 0;
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function formatDateMillis(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHourRange(startHour: number, endHour: number): string {
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${fmt(startHour)}–${fmt(endHour)}`;
}

export function LoyaltyDetailsModal({
  onClose,
  userId,
  userName,
  userProfile,
  bookings,
  productionBatches,
  recipeVersions,
  logs,
}: LoyaltyDetailsModalProps) {
  const [filter, setFilter] = useState<BreakdownCategory>('all');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const breakdown = useMemo(() => {
    const myBookings = bookings.filter((b) => b.ownerId === userId);
    const myBatches = productionBatches.filter((b) => b.ownerId === userId);
    const myVersions = recipeVersions.filter((v) => v.ownerId === userId);
    const myActivityLogs = logs.filter(
      (l) => l.ownerId === userId && l.eventType !== 'booking'
    );

    const activeBookings = myBookings.filter((b) => b.status !== 'cancelled');
    const cancelledBookings = myBookings.filter((b) => b.status === 'cancelled');

    const bookingPointsTotal = activeBookings.reduce((sum, b) => {
      const pts =
        typeof b.pointsEarned === 'number'
          ? b.pointsEarned
          : b.durationHours * POINTS_PER_HOUR;
      return sum + pts;
    }, 0);

    const referralPointsTotal = 0;
    const profileBalance = userProfile?.loyaltyPoints ?? 0;
    const balanceDelta = profileBalance - bookingPointsTotal - referralPointsTotal;
    const activityPointsTotal = balanceDelta;

    const entries: LoyaltyEntry[] = [];

    for (const b of myBookings) {
      const basePts =
        typeof b.pointsEarned === 'number'
          ? b.pointsEarned
          : b.durationHours * POINTS_PER_HOUR;
      const isCancelled = b.status === 'cancelled';
      const dateSort = Date.parse(`${b.date}T${String(b.startHour).padStart(2, '0')}:00:00`) ||
        getTimestampMillis(b.createdAt);

      entries.push({
        id: `booking-${b.id}`,
        category: 'booking',
        title: b.spaceName || 'Kitchen Station Booking',
        subtitle: `${b.durationHours}h (${formatHourRange(b.startHour, b.endHour)}) · ${POINTS_PER_HOUR} pts/hr`,
        dateLabel: b.date || formatDateMillis(getTimestampMillis(b.createdAt)),
        sortKey: dateSort,
        points: isCancelled ? 0 : basePts,
        statusLabel: isCancelled ? 'Cancelled (reversed)' : b.status,
        tone: isCancelled ? 'muted' : 'positive',
      });
    }

    if (balanceDelta !== 0) {
      const updatedMs = getTimestampMillis(userProfile?.updatedAt) || Date.now();
      entries.push({
        id: 'activity-balance-adjustment',
        category: 'activity',
        title:
          balanceDelta > 0
            ? 'Kitchen Activity & Bonus Credit'
            : 'Account Balance Adjustment',
        subtitle:
          balanceDelta > 0
            ? 'Direct loyalty credit beyond active kitchen bookings'
            : 'Manual or administrative points reconciliation',
        dateLabel: formatDateMillis(updatedMs),
        sortKey: updatedMs,
        points: balanceDelta,
        statusLabel: balanceDelta > 0 ? 'Credited' : 'Adjusted',
        tone: balanceDelta > 0 ? 'positive' : 'muted',
      });
    }

    for (const batch of myBatches) {
      const ms = getTimestampMillis(batch.createdAt) || Date.parse(batch.date) || 0;
      entries.push({
        id: `batch-${batch.id}`,
        category: 'activity',
        title: `Production Batch · ${batch.productName}`,
        subtitle: `Batch ${batch.batchNumber} · ${batch.quantityProduced} ${batch.unit} · QC ${batch.qcScore}/10`,
        dateLabel: batch.date || formatDateMillis(ms),
        sortKey: ms,
        points: 0,
        statusLabel: 'Logged activity',
        tone: 'neutral',
      });
    }

    for (const version of myVersions) {
      const ms = getTimestampMillis(version.createdAt);
      entries.push({
        id: `version-${version.id}`,
        category: 'activity',
        title: `R&D Formulation v${version.versionNumber}`,
        subtitle: version.changeReason || `${version.expectedYield} ${version.yieldUnit} yield`,
        dateLabel: formatDateMillis(ms),
        sortKey: ms,
        points: 0,
        statusLabel: version.validationStatus.replace('_', ' '),
        tone: 'neutral',
      });
    }

    for (const entry of myActivityLogs) {
      const ms = getTimestampMillis(entry.createdAt);
      entries.push({
        id: `log-${entry.id}`,
        category: 'activity',
        title: `${entry.eventType.charAt(0).toUpperCase()}${entry.eventType.slice(1)} Log · ${entry.station || 'Kitchen'}`,
        subtitle: entry.message,
        dateLabel: formatDateMillis(ms),
        sortKey: ms,
        points: 0,
        statusLabel: entry.severity,
        tone: 'neutral',
      });
    }

    entries.sort((a, b) => b.sortKey - a.sortKey);

    const activityEntriesCount = entries.filter((e) => e.category === 'activity').length;

    return {
      profileBalance,
      bookingPointsTotal,
      referralPointsTotal,
      activityPointsTotal,
      activeBookingsCount: activeBookings.length,
      cancelledBookingsCount: cancelledBookings.length,
      activityEntriesCount,
      entries,
    };
  }, [bookings, logs, productionBatches, recipeVersions, userId, userProfile]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return breakdown.entries;
    return breakdown.entries.filter((e) => e.category === filter);
  }, [breakdown.entries, filter]);

  const tabOptions: Array<{
    id: BreakdownCategory;
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'All Sources', count: breakdown.entries.length },
    {
      id: 'booking',
      label: 'Booking',
      count: breakdown.entries.filter((e) => e.category === 'booking').length,
    },
    { id: 'referral', label: 'Referral', count: 0 },
    { id: 'activity', label: 'Activity', count: breakdown.activityEntriesCount },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loyalty-details-title"
    >
      <div
        className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
              <Award className="w-4.5 h-4.5 text-teal-700" />
            </div>
            <div className="min-w-0">
              <h2
                id="loyalty-details-title"
                className="text-base font-bold text-slate-900 truncate"
              >
                Loyalty Points Breakdown
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {userName} · {POINTS_PER_HOUR} pts earned per booked kitchen hour
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap"
            aria-label="Close loyalty breakdown"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-teal-50/70 border border-teal-200 rounded-md p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-teal-800">
                Total Balance
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-bold text-teal-950">
                {breakdown.profileBalance.toLocaleString()} pts
              </div>
              <div className="mt-0.5 font-mono tabular-nums text-[11px] text-teal-700">
                {userProfile?.totalHoursBooked ?? 0}h total booked
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <CalendarClock className="w-3.5 h-3.5 text-teal-700" />
                <span>Booking</span>
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                {breakdown.bookingPointsTotal.toLocaleString()} pts
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {breakdown.activeBookingsCount} active
                {breakdown.cancelledBookingsCount > 0
                  ? ` · ${breakdown.cancelledBookingsCount} cancelled`
                  : ''}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Referral</span>
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                {breakdown.referralPointsTotal.toLocaleString()} pts
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                0 referral credits
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                <span>Activity</span>
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                {breakdown.activityPointsTotal >= 0
                  ? breakdown.activityPointsTotal.toLocaleString()
                  : breakdown.activityPointsTotal.toLocaleString()}{' '}
                pts
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {breakdown.activityEntriesCount} activity records
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {tabOptions.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-sm ${
                      active ? 'bg-teal-800 text-teal-50' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ledger List */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredEntries.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-md p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                {filter === 'referral'
                  ? 'No referral points credited yet.'
                  : filter === 'booking'
                  ? 'No kitchen bookings recorded yet.'
                  : filter === 'activity'
                  ? 'No kitchen activity records logged yet.'
                  : 'No loyalty activity recorded yet.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {filter === 'referral'
                  ? 'Referral credits will appear here once referral rewards are attributed to your account.'
                  : 'Book hourly kitchen stations to earn 100 pts per booked hour.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              {filteredEntries.map((item) => {
                const categoryStyles =
                  item.category === 'booking'
                    ? 'bg-teal-50 text-teal-800 border-teal-200'
                    : item.category === 'referral'
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border rounded-sm whitespace-nowrap ${categoryStyles}`}
                        >
                          {item.category}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 break-words">
                        {item.subtitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono tabular-nums">{item.dateLabel}</span>
                        <span>·</span>
                        <span className="capitalize">{item.statusLabel}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`font-mono tabular-nums text-sm font-bold whitespace-nowrap ${
                          item.points > 0
                            ? 'text-teal-700'
                            : item.points < 0
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.points > 0
                          ? `+${item.points.toLocaleString()} pts`
                          : item.points < 0
                          ? `${item.points.toLocaleString()} pts`
                          : '0 pts'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Reconciled from your bookings and account loyalty balance.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
