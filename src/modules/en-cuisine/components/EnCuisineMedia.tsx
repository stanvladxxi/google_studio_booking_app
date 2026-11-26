import { useState } from 'react';
import { Award, ChefHat, Layers, Package, UtensilsCrossed } from 'lucide-react';
import equipmentStudioImg from '../../../assets/images/encuisine_equipment_studio_1794851779783.jpg';
import supplierPantryImg from '../../../assets/images/encuisine_supplier_pantry_1794851781152.jpg';
import banabitesBrandImg from '../../../assets/images/encuisine_banabites_brand_1794851781341.jpg';
import gccEditorialImg from '../../../assets/images/encuisine_gcc_editorial_1794851782194.jpg';
import pastrySuiteImg from '../../../assets/images/space_pastry_suite_1794589444682.jpg';
import hotlineBayImg from '../../../assets/images/space_hotline_bay_1794589444911.jpg';
import coldPrepImg from '../../../assets/images/space_cold_prep_1794589446355.jpg';
import sensoryRdImg from '../../../assets/images/space_sensory_rd_1794589446122.jpg';

const MEDIA_MAP: Record<string, string> = {
  equipment_studio: equipmentStudioImg,
  supplier_pantry: supplierPantryImg,
  banabites_brand: banabitesBrandImg,
  gcc_editorial: gccEditorialImg,
  pastry_suite: pastrySuiteImg,
  hotline_bay: hotlineBayImg,
  cold_prep: coldPrepImg,
  sensory_rd: sensoryRdImg,
};

interface EnCuisineMediaProps {
  imageKey: string;
  alt: string;
  fallbackLabel?: string;
  kind?: 'equipment' | 'supplier' | 'brand' | 'editorial';
  className?: string;
}

export function EnCuisineMedia({
  imageKey,
  alt,
  fallbackLabel,
  kind = 'equipment',
  className = 'w-full h-full object-cover',
}: EnCuisineMediaProps) {
  const [hasError, setHasError] = useState(false);
  const src = MEDIA_MAP[imageKey] || '';

  if (hasError || !src) {
    const FallbackIcon =
      kind === 'supplier'
        ? Package
        : kind === 'brand'
        ? Award
        : kind === 'editorial'
        ? ChefHat
        : kind === 'equipment'
        ? Layers
        : UtensilsCrossed;

    return (
      <div className="w-full h-full bg-gradient-to-br from-[#08291E] via-[#0B3B2B] to-[#134E3A] flex flex-col items-center justify-center p-4 text-emerald-50">
        <FallbackIcon className="w-6 h-6 mb-2 text-orange-400" strokeWidth={1.6} />
        <span className="text-xs font-medium text-center text-emerald-100 line-clamp-2">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}

export function BrandEmblem({ code, name }: { code: string; name: string }) {
  return (
    <div
      aria-label={`${name} logo placeholder`}
      className="w-11 h-11 rounded-md bg-[#0B3B2B] text-white border border-emerald-900 flex items-center justify-center font-mono text-sm font-bold tracking-wider shrink-0"
    >
      {code.slice(0, 3).toUpperCase() || <UtensilsCrossed className="w-4 h-4 text-orange-400" />}
    </div>
  );
}
