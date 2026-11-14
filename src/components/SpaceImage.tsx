import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import pastrySuiteImg from '../assets/images/space_pastry_suite_1794589444682.jpg';
import hotlineBayImg from '../assets/images/space_hotline_bay_1794589444911.jpg';
import coldPrepImg from '../assets/images/space_cold_prep_1794589446355.jpg';
import sensoryRdImg from '../assets/images/space_sensory_rd_1794589446122.jpg';

const IMAGE_MAP: Record<string, string> = {
  pastry_suite: pastrySuiteImg,
  hotline_bay: hotlineBayImg,
  cold_prep: coldPrepImg,
  sensory_rd: sensoryRdImg,
};

interface SpaceImageProps {
  imagePath: string;
  alt: string;
  className?: string;
}

export function SpaceImage({ imagePath, alt, className = 'w-full h-full object-cover' }: SpaceImageProps) {
  const [hasError, setHasError] = useState(false);
  const resolvedSrc = IMAGE_MAP[imagePath] || (imagePath.startsWith('/') ? imagePath : '');

  if (hasError || !resolvedSrc) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 flex flex-col items-center justify-center p-4 text-slate-500">
        <UtensilsCrossed className="w-6 h-6 mb-2 text-slate-400" strokeWidth={1.5} />
        <span className="text-xs font-medium text-center text-slate-600">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
