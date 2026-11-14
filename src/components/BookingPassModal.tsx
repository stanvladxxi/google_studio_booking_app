import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Mail, MessageCircle, Copy, Check, X } from 'lucide-react';
import { Booking } from '../types';

interface BookingPassModalProps {
  booking: Booking;
  onClose: () => void;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function BookingPassModal({ booking, onClose }: BookingPassModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const passPayload = [
    `HEARTHLINE KITCHEN PASS`,
    `Booking ID: ${booking.id}`,
    `Chef: ${booking.chefName}`,
    `Space: ${booking.spaceName}`,
    `Date: ${booking.date}`,
    `Window: ${formatHour(booking.startHour)} - ${formatHour(booking.endHour)} (${booking.durationHours}h)`,
    `Equipment: ${
      booking.equipmentItems.length > 0
        ? booking.equipmentItems.map((e) => `${e.quantity}x ${e.name}`).join(', ')
        : 'Space only'
    }`,
    `Total: $${booking.totalCost.toFixed(2)}`,
    `Loyalty Points Earned: +${booking.pointsEarned} pts`,
  ].join('\n');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(passPayload, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR generation failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [passPayload]);

  const handleSavePng = () => {
    if (!qrDataUrl) return;
    // Composite pass card + QR code onto canvas for clean saveable image
    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, canvas.width, 84);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Hearthline Kitchen — Access Pass', 28, 44);
    ctx.font = '13px monospace';
    ctx.fillText(`REF: ${booking.id}`, 28, 66);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 140, 112, 280, 280);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(booking.spaceName, 32, 430);

      ctx.fillStyle = '#475569';
      ctx.font = '15px monospace';
      ctx.fillText(`Date: ${booking.date}`, 32, 464);
      ctx.fillText(
        `Hours: ${formatHour(booking.startHour)} - ${formatHour(booking.endHour)} (${booking.durationHours}h)`,
        32,
        490
      );
      ctx.fillText(`Chef: ${booking.chefName}`, 32, 516);
      ctx.fillText(`Total: $${booking.totalCost.toFixed(2)}`, 32, 542);

      ctx.fillStyle = '#0f766e';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`Points Earned: +${booking.pointsEarned} pts`, 32, 574);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Present this QR pass at station check-in.', 32, 636);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `hearthline-pass-${booking.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = qrDataUrl;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(passPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const emailSubject = encodeURIComponent(
    `Hearthline Kitchen Booking Pass — ${booking.spaceName} (${booking.date})`
  );
  const emailBody = encodeURIComponent(
    `${passPayload}\n\nVerify Pass Reference: ${booking.id}`
  );
  const whatsappText = encodeURIComponent(
    `*Hearthline Kitchen Booking Pass*\nSpace: ${booking.spaceName}\nDate: ${booking.date}\nTime: ${formatHour(
      booking.startHour
    )} - ${formatHour(booking.endHour)} (${booking.durationHours}h)\nTotal: $${booking.totalCost.toFixed(
      2
    )}\nPoints Earned: +${booking.pointsEarned} pts\nRef: ${booking.id}`
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-pass-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full overflow-hidden shadow-xl">
        <div className="bg-teal-700 px-5 py-4 flex items-center justify-between text-white">
          <div>
            <h3 id="booking-pass-title" className="text-base font-semibold">
              Kitchen Booking QR Pass
            </h3>
            <p className="text-xs font-mono text-teal-100 mt-0.5">{booking.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking pass"
            className="p-1 text-teal-100 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col items-center">
            {qrDataUrl ? (
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <img
                  src={qrDataUrl}
                  alt={`QR Code for booking ${booking.id}`}
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="w-48 h-48 bg-slate-100 rounded-lg animate-pulse" />
            )}
            <p className="text-xs text-slate-500 mt-2">
              Scan at station check-in or save pass for your records
            </p>
          </div>

          <div className="border-t border-b border-slate-200 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Station</span>
              <span className="font-semibold text-slate-900">{booking.spaceName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Schedule</span>
              <span className="font-mono tabular-nums text-slate-900">
                {booking.date} · {formatHour(booking.startHour)}–{formatHour(booking.endHour)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Paid</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${booking.totalCost.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Loyalty Points Added</span>
              <span className="font-mono tabular-nums font-semibold text-teal-700">
                +{booking.pointsEarned} pts
              </span>
            </div>
          </div>

          {/* Share & Save Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleSavePng}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Save QR Pass
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy Details'}
            </button>

            <a
              href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
            >
              <Mail className="w-4 h-4" />
              Send via Email
            </a>

            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              Send WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
