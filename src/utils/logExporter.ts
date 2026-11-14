import { SessionLogEntry } from '../types';

function formatTimestamp(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  if (ts instanceof Date) return ts.toISOString();
  return String(ts);
}

export function buildLogFileContent(entries: SessionLogEntry[], facilityName = 'HEARTHLINE COMMERCIAL KITCHEN'): string {
  const header = [
    `# ==============================================================================`,
    `# ${facilityName} — OPERATIONAL & HACCP SESSION LOG`,
    `# GENERATED_AT: ${new Date().toISOString()}`,
    `# TOTAL_ENTRIES: ${entries.length}`,
    `# FORMAT: [ISO_TIMESTAMP] [SEVERITY] [EVENT_TYPE] [STATION] [TEMP_C] [ACTOR] :: MESSAGE`,
    `# ==============================================================================`,
    ``,
  ];

  const lines = entries.map((entry) => {
    const ts = formatTimestamp(entry.createdAt);
    const sev = entry.severity.toUpperCase().padEnd(8, ' ');
    const evt = entry.eventType.toUpperCase().padEnd(10, ' ');
    const station = (entry.station || 'GENERAL').padEnd(26, ' ');
    const temp = (entry.tempReadingC ? `${entry.tempReadingC}C` : 'N/A').padEnd(7, ' ');
    const bookingRef = entry.bookingId ? ` (booking=${entry.bookingId})` : '';
    return `${ts} | ${sev} | ${evt} | ${station} | ${temp} | ${entry.actorName} :: ${entry.message}${bookingRef}`;
  });

  return [...header, ...lines, ``].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildCsvContent(entries: SessionLogEntry[]): string {
  const escapeCsv = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
  const headers = ['Timestamp', 'Severity', 'EventType', 'Station', 'TempC', 'Actor', 'BookingId', 'Message'];
  const rows = entries.map((e) =>
    [
      formatTimestamp(e.createdAt),
      e.severity,
      e.eventType,
      e.station,
      e.tempReadingC || '',
      e.actorName,
      e.bookingId || '',
      e.message,
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
