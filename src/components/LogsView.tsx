import { useMemo, useState } from 'react';
import { FileText, Download, Plus, Eye } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  KitchenSpace,
  LIMITS,
  LogEventType,
  LogSeverity,
  SessionLogEntry,
  clampStr,
} from '../types';
import { buildCsvContent, buildLogFileContent, downloadTextFile } from '../utils/logExporter';

interface LogsViewProps {
  uid: string;
  userName: string;
  logs: SessionLogEntry[];
  spaces: KitchenSpace[];
  bookings: Booking[];
  loading: boolean;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const EVENT_TYPES: LogEventType[] = [
  'sanitation',
  'equipment',
  'recipe',
  'material',
  'duty',
  'booking',
  'production',
  'incident',
];

function formatDisplayTime(ts: unknown): string {
  if (!ts) return 'Pending...';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }
  return String(ts);
}

export function LogsView({
  uid,
  userName,
  logs,
  spaces,
  bookings,
  loading,
  onNotify,
}: LogsViewProps) {
  const [eventType, setEventType] = useState<LogEventType>('sanitation');
  const [severity, setSeverity] = useState<LogSeverity>('info');
  const [station, setStation] = useState<string>(spaces[0]?.name || 'General Facility');
  const [tempReadingC, setTempReadingC] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [filterType, setFilterType] = useState<'all' | LogEventType>('all');
  const [showRawPreview, setShowRawPreview] = useState(false);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = clampStr(message, LIMITS.LOG_MSG_MAX);
    if (!cleanMsg) {
      onNotify('Enter a log message before saving.', 'error');
      return;
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'logs', logId), {
        ownerId: uid,
        actorName: clampStr(userName || 'Kitchen Member', LIMITS.NAME_MAX),
        eventType,
        severity,
        station: clampStr(station || 'General Facility', LIMITS.NAME_MAX),
        tempReadingC: clampStr(tempReadingC, 24),
        message: cleanMsg,
        bookingId: clampStr(bookingId, 128),
        createdAt: serverTimestamp(),
      });
      setMessage('');
      setTempReadingC('');
      onNotify('Log entry appended to session record.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `logs/${logId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => filterType === 'all' || l.eventType === filterType);
  }, [logs, filterType]);

  const rawLogContent = useMemo(() => buildLogFileContent(filteredLogs), [filteredLogs]);

  const handleDownloadLog = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadTextFile(`hearthline-session-${dateTag}.log`, rawLogContent, 'text/plain;charset=utf-8');
    onNotify(`Downloaded hearthline-session-${dateTag}.log (${filteredLogs.length} entries).`, 'success');
  };

  const handleDownloadCsv = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    const csv = buildCsvContent(filteredLogs);
    downloadTextFile(`hearthline-session-${dateTag}.csv`, csv, 'text/csv;charset=utf-8');
    onNotify(`Exported hearthline-session-${dateTag}.csv.`, 'success');
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Append Manual Log Entry */}
      <form onSubmit={handleAddLog} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Append Operational / HACCP Log Entry</h2>
            <p className="text-sm text-slate-600">
              Record sanitation checks, equipment temperatures, shift handovers, or incidents. Export anytime as a .LOG file.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowRawPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              {showRawPreview ? 'Table View' : 'Preview .LOG File'}
            </button>
            <button
              type="button"
              onClick={handleDownloadLog}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download .LOG
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Event Type</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as LogEventType)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md capitalize focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Severity</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as LogSeverity)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="info">Info (Nominal)</option>
              <option value="warn">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Station / Zone</span>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="General Facility">General Facility</option>
              <option value="Walk-In Cooler">Walk-In Cooler</option>
              <option value="Deep Freezer">Deep Freezer</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Temp Reading (°C)</span>
            <input
              type="text"
              maxLength={24}
              value={tempReadingC}
              onChange={(e) => setTempReadingC(e.target.value)}
              placeholder="e.g. 3.4 or 210"
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Linked Session</span>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="">Facility-Wide</option>
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
            maxLength={LIMITS.LOG_MSG_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Verified 200ppm quat sanitizer concentration on pastry marble benches prior to lamination run."
            required
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Writing...' : 'Append Log Entry'}
          </button>
        </div>
      </form>

      {/* Filter Bar & Log Viewer */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Session Audit Stream</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              ({filteredLogs.length} entries)
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['all', ...EVENT_TYPES] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                  filterType === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {showRawPreview ? (
          <div className="bg-slate-900 text-slate-100 rounded-lg border border-slate-800 p-5 overflow-x-auto">
            <pre className="text-xs font-mono leading-relaxed whitespace-pre">
              {rawLogContent}
            </pre>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No log entries recorded</p>
            <p className="text-xs text-slate-500">
              Append a sanitation, equipment, or session note above, or create a booking to generate automatic audit records.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Type · Severity</th>
                  <th className="py-3 px-4">Station</th>
                  <th className="py-3 px-4 text-right">Temp</th>
                  <th className="py-3 px-4">Actor & Log Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredLogs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                      {formatDisplayTime(entry.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span className="capitalize font-medium text-slate-800">{entry.eventType}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span
                        className={`font-medium uppercase ${
                          entry.severity === 'critical'
                            ? 'text-red-700'
                            : entry.severity === 'warn'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {entry.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {entry.station || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {entry.tempReadingC ? `${entry.tempReadingC}°C` : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900 mr-1.5">{entry.actorName}:</span>
                      <span>{entry.message}</span>
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
