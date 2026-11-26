import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { INITIAL_DEMO_MENU } from '../../../components/AggregatorPlaceholders';
import { ActiveSection, KitchenEquipment, KitchenSpace, Product, UserRole } from '../../../types';
import {
  EDITORIAL_ITEMS_DATA,
  FEATURED_EQUIPMENT_DATA,
  FEATURED_INFLUENCERS_DATA,
  NEW_BRANDS_DATA,
  SAMPLE_EN_CUISINE_RECIPES,
  SUPPLIER_HUB_PRODUCTS_DATA,
} from '../data/discoverSeed';
import { EnCuisineCatalogDoc, EnCuisineTab } from '../types';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  moduleGroup: 'Kitchen Booking' | 'En Cuisine · Core & Menu' | 'En Cuisine · Discover';
  targetSection: ActiveSection;
  targetEnCuisineTab?: EnCuisineTab;
  prefillSpaceId?: string;
}

interface GlobalSearchBarProps {
  effectiveRole: UserRole;
  allowedSections: ActiveSection[];
  spaces: KitchenSpace[];
  equipment: KitchenEquipment[];
  products: Product[];
  customItems: EnCuisineCatalogDoc[];
  onNavigateResult: (result: {
    section: ActiveSection;
    enCuisineTab?: EnCuisineTab;
    spaceId?: string;
  }) => void;
}

export function GlobalSearchBar({
  effectiveRole,
  allowedSections,
  spaces,
  equipment,
  products,
  customItems,
  onNavigateResult,
}: GlobalSearchBarProps) {
  const [queryText, setQueryText] = useState('');
  const [open, setOpen] = useState(false);

  const canSearchRecipes = effectiveRole !== 'aggregator';
  const canSearchMasterMenu =
    effectiveRole === 'admin' ||
    effectiveRole === 'aggregator' ||
    effectiveRole === 'recipe_dev' ||
    effectiveRole === 'kitchen_manager';

  const searchableItems: SearchResultItem[] = useMemo(() => {
    const list: SearchResultItem[] = [];

    if (allowedSections.includes('booking')) {
      for (const s of spaces.filter((sp) => sp.isActive)) {
        list.push({
          id: `sp_${s.id}`,
          title: s.name,
          subtitle: `${s.zone} · $${s.hourlyRate}/hr`,
          moduleGroup: 'Kitchen Booking',
          targetSection: 'booking',
          prefillSpaceId: s.id,
        });
      }
      for (const eq of equipment.filter((e) => e.isActive)) {
        list.push({
          id: `eq_${eq.id}`,
          title: eq.name,
          subtitle: `${eq.category} · ${eq.spec}`,
          moduleGroup: 'Kitchen Booking',
          targetSection: 'booking',
        });
      }
    }

    if (allowedSections.includes('en-cuisine')) {
      if (canSearchRecipes) {
        for (const p of products) {
          list.push({
            id: `prod_${p.id}`,
            title: p.name,
            subtitle: `Recipe Formulation · ${p.category}`,
            moduleGroup: 'En Cuisine · Core & Menu',
            targetSection: 'en-cuisine',
            targetEnCuisineTab: 'recipes',
          });
        }
        for (const r of SAMPLE_EN_CUISINE_RECIPES) {
          list.push({
            id: `srec_${r.id}`,
            title: r.title,
            subtitle: `${r.category} · ${r.version}`,
            moduleGroup: 'En Cuisine · Core & Menu',
            targetSection: 'en-cuisine',
            targetEnCuisineTab: 'recipes',
          });
        }
      }

      if (canSearchMasterMenu) {
        for (const m of INITIAL_DEMO_MENU) {
          list.push({
            id: `mmenu_${m.id}`,
            title: m.name,
            subtitle: `Master Menu · ${m.category} · KWD ${m.sellingPriceKwd.toFixed(3)}`,
            moduleGroup: 'En Cuisine · Core & Menu',
            targetSection: 'en-cuisine',
            targetEnCuisineTab: 'menu',
          });
        }
      }

      for (const eq of FEATURED_EQUIPMENT_DATA) {
        list.push({
          id: `deq_${eq.id}`,
          title: eq.name,
          subtitle: `Equipment · ${eq.supplier}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
      for (const sp of SUPPLIER_HUB_PRODUCTS_DATA) {
        list.push({
          id: `dsp_${sp.id}`,
          title: sp.name,
          subtitle: `Supplier Hub · ${sp.supplier}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
      for (const inf of FEATURED_INFLUENCERS_DATA) {
        list.push({
          id: `dinf_${inf.id}`,
          title: inf.name,
          subtitle: `${inf.specialty} · ${inf.city}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
      for (const br of NEW_BRANDS_DATA) {
        list.push({
          id: `dbr_${br.id}`,
          title: br.name,
          subtitle: `${br.country} · ${br.category}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
      for (const ed of EDITORIAL_ITEMS_DATA) {
        list.push({
          id: `ded_${ed.id}`,
          title: ed.title,
          subtitle: `${ed.tabType} · ${ed.topicTag}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
      for (const c of customItems.filter((i) => i.isActive)) {
        list.push({
          id: `dcus_${c.id}`,
          title: c.title,
          subtitle: `${c.category} · ${c.subtitle}`,
          moduleGroup: 'En Cuisine · Discover',
          targetSection: 'en-cuisine',
          targetEnCuisineTab: 'discover',
        });
      }
    }

    return list;
  }, [
    allowedSections,
    canSearchMasterMenu,
    canSearchRecipes,
    spaces,
    equipment,
    products,
    customItems,
  ]);

  const groupedResults = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    const matches = searchableItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q)
      )
      .slice(0, 12);

    const groups: { groupName: string; items: SearchResultItem[] }[] = [];
    for (const item of matches) {
      let existing = groups.find((g) => g.groupName === item.moduleGroup);
      if (!existing) {
        existing = { groupName: item.moduleGroup, items: [] };
        groups.push(existing);
      }
      existing.items.push(item);
    }
    return groups;
  }, [queryText, searchableItems]);

  return (
    <div className="relative w-full max-w-xs sm:max-w-sm">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="search"
          value={queryText}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQueryText(e.target.value);
            setOpen(true);
          }}
          placeholder="Search kitchens, menu, recipes, brands..."
          aria-label="Global search across Booking and En Cuisine"
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#0B3B2B]"
        />
        {queryText && (
          <button
            type="button"
            onClick={() => {
              setQueryText('');
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-2 text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && queryText.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto divide-y divide-slate-100">
          {groupedResults.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">
              No matches for &ldquo;{queryText.trim()}&rdquo; across Booking or En Cuisine.
            </div>
          ) : (
            groupedResults.map((group) => (
              <div key={group.groupName} className="p-2 space-y-1">
                <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0B3B2B]">
                  {group.groupName}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigateResult({
                        section: item.targetSection,
                        enCuisineTab: item.targetEnCuisineTab,
                        spaceId: item.prefillSpaceId,
                      });
                      setOpen(false);
                      setQueryText('');
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-50/70 transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 truncate">{item.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
