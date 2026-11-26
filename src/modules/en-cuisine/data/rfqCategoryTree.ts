import { RecipeCategory, SupplierRfqRequestType } from '../../../types';

export type CulinaryProcessScope = 'all' | 'hot' | 'cold';

export interface RfqCategoryLeaf {
  id: string;
  name: string;
  defaultUnit: string;
  specHint: string;
  recommendedCerts: string[];
}

export interface RfqCategoryGroup {
  id: string;
  name: string;
  processScope?: 'hot' | 'cold';
  supplierTag: string;
  leaves: RfqCategoryLeaf[];
}

export interface RfqCategoryRoot {
  type: SupplierRfqRequestType;
  label: string;
  drillLabel: string;
  usesFoodProcess: boolean;
  groups: RfqCategoryGroup[];
}

export interface PopularRfqSuggestion {
  name: string;
  processScope?: 'hot' | 'cold';
  requestType: SupplierRfqRequestType;
  categoryPath: string;
  unit: string;
}

export const PROCESS_SCOPE_LABELS: Record<CulinaryProcessScope, string> = {
  all: 'All Food Processes',
  hot: 'Hot Process',
  cold: 'Cold Process',
};

export const RFQ_CATEGORY_TREE: RfqCategoryRoot[] = [
  {
    type: 'ingredient',
    label: 'Food & Ingredients',
    drillLabel: 'Hot or Cold Food Process',
    usesFoodProcess: true,
    groups: [
      {
        id: 'hot_baked_flours',
        name: 'Hot Process · Baked Goods, Flours & Doughs',
        processScope: 'hot',
        supplierTag: 'Hot Process · Bakery & Dry Pantry Suppliers',
        leaves: [
          {
            id: 'hot_flours',
            name: 'Flours, Grains, Starches & Baking Mixes',
            defaultUnit: 'kg',
            specHint: 'Protein %, ash %, falling number, 00 / high-protein / cake / gluten-free flour, 25 kg sacks',
            recommendedCerts: ['Halal', 'HACCP'],
          },
          {
            id: 'hot_leavening_choc',
            name: 'Yeast, Leavening, Chocolate & Baking Fats',
            defaultUnit: 'kg',
            specHint: 'Instant yeast, E471 emulsifiers, couverture cocoa %, 82% butter sheets, baking margarine',
            recommendedCerts: ['Halal', 'Food Grade COA'],
          },
        ],
      },
      {
        id: 'hot_cooked_prep',
        name: 'Hot Process · Cooked Kitchen, Proteins & Pantry',
        processScope: 'hot',
        supplierTag: 'Hot Process · Kitchen & Protein Suppliers',
        leaves: [
          {
            id: 'hot_proteins',
            name: 'Halal Meat, Poultry, Seafood & Stocks',
            defaultUnit: 'kg',
            specHint: 'Cut spec, fat/lean ratio, calibrated fillet weight, chilled vacuum or IQF, GCC Halal cert',
            recommendedCerts: ['Halal', 'Cold Chain', 'HACCP'],
          },
          {
            id: 'hot_spices_sauces',
            name: 'Spices, Cooking Oils, Pastes & Hot Sauces',
            defaultUnit: 'kg',
            specHint: 'Whole/ground spices, high-smoke-point cooking oils, concentrated sauces/pastes, bulk pack',
            recommendedCerts: ['Halal', 'ISO 22000'],
          },
          {
            id: 'hot_sweeteners_additives',
            name: 'Sugars, Syrups, Preservatives & Heat-Stable Additives',
            defaultUnit: 'kg',
            specHint: 'ICUMSA sugar, glucose syrup, calcium propionate, sorbates, food-grade COA required',
            recommendedCerts: ['Halal', 'Food Grade COA'],
          },
        ],
      },
      {
        id: 'cold_dairy_chilled',
        name: 'Cold Process · Chilled Dairy, Cream Cheese & Cold-Set',
        processScope: 'cold',
        supplierTag: 'Cold Process · Dairy & Chilled Suppliers',
        leaves: [
          {
            id: 'cold_cream_cheese',
            name: 'Cream Cheese, Mascarpone, Labneh & Whipping Cream',
            defaultUnit: 'kg',
            specHint: 'Fat % (e.g. 33% cream cheese / 35% whipping cream), 1–2 kg blocks/cartons, 2–4°C cold chain',
            recommendedCerts: ['Halal', 'ISO 22000', 'Cold Chain'],
          },
          {
            id: 'cold_gelato_bases',
            name: 'Gelato, Soft-Serve, Sorbet & Cold-Set Stabilizers',
            defaultUnit: 'kg',
            specHint: 'Dosage g/L, overrun %, neutral cold-process stabilizer, hydrocolloid gums & pectin',
            recommendedCerts: ['Halal', 'HACCP'],
          },
        ],
      },
      {
        id: 'cold_beverages_produce',
        name: 'Cold Process · Beverages, Purees, Dressings & Produce',
        processScope: 'cold',
        supplierTag: 'Cold Process · Beverage & Fresh Produce Suppliers',
        leaves: [
          {
            id: 'cold_bev_purees',
            name: 'Fruit Purees, IQF Fruits, Coffee, Matcha & Syrups',
            defaultUnit: 'kg',
            specHint: 'Brix %, pasteurized aseptic 1 kg pouches, barista milk, botanical syrups, roast profile',
            recommendedCerts: ['Halal', 'Cold Chain'],
          },
          {
            id: 'cold_produce_dressings',
            name: 'Fresh Produce, Herbs, Cold-Pressed Oils & Dressings',
            defaultUnit: 'kg',
            specHint: 'Washed ready-to-eat greens, fresh herbs, cold-emulsion bases, chilled 2–5°C delivery',
            recommendedCerts: ['HACCP', 'Cold Chain'],
          },
        ],
      },
    ],
  },
  {
    type: 'machinery',
    label: 'Commercial Machinery',
    drillLabel: 'By Machine Function',
    usesFoodProcess: false,
    groups: [
      {
        id: 'mach_ovens_thermal',
        name: 'Ovens, Ranges & Thermal Baking',
        supplierTag: 'Commercial Ovens & Thermal Equipment Suppliers',
        leaves: [
          {
            id: 'mach_ovens',
            name: 'Deck, Convection, Rotary & Combi Ovens',
            defaultUnit: 'units',
            specHint: 'Tray/GN capacity (600x400mm), steam injection, 380V 3-phase/50Hz Kuwait grid, max °C',
            recommendedCerts: ['CE', 'ISO 9001'],
          },
          {
            id: 'mach_proofers_ranges',
            name: 'Dough Proofers, Deep Fryers, Grills & Steam Kettles',
            defaultUnit: 'units',
            specHint: 'Humidity/temp range, oil vat litres or BTU/kW output, SS304 body, gas or 3-phase electric',
            recommendedCerts: ['CE', 'ISO 9001'],
          },
        ],
      },
      {
        id: 'mach_mixers_prep',
        name: 'Mixers, Sheeters & Food Prep',
        supplierTag: 'Mixers & Food Prep Machinery Suppliers',
        leaves: [
          {
            id: 'mach_mixers_sheeters',
            name: 'Planetary/Spiral Mixers, Dough Sheeters & Dividers',
            defaultUnit: 'units',
            specHint: 'Bowl litres (20L–80L), flour capacity kg, motor kW, SS304 safety guard & attachments',
            recommendedCerts: ['CE', 'ISO 9001'],
          },
          {
            id: 'mach_cutters_blenders',
            name: 'Food Processors, High-Shear Blenders & Meat Slicers',
            defaultUnit: 'units',
            specHint: 'Blade diameter mm, RPM, continuous duty rating, food-contact stainless steel parts',
            recommendedCerts: ['CE', 'UL'],
          },
        ],
      },
      {
        id: 'mach_chillers_cold',
        name: 'Refrigeration, Blast Chillers & Cold Rooms',
        supplierTag: 'Commercial Refrigeration & Cold Room Suppliers',
        leaves: [
          {
            id: 'mach_blast_cold',
            name: 'Blast Chillers, Shock Freezers & Gelato Batch Freezers',
            defaultUnit: 'units',
            specHint: '+90°C to +3°C cycle kg, 43°C GCC tropicalized compressor, R290/R404a',
            recommendedCerts: ['CE', 'GCC Tropicalized'],
          },
          {
            id: 'mach_cold_rooms',
            name: 'Walk-In Cold Rooms, Undercounter Chillers & Display Cases',
            defaultUnit: 'units',
            specHint: 'Panel thickness mm, operating temp (-18°C or 2–4°C), glass anti-fog, compressor specs',
            recommendedCerts: ['CE', 'GCC Tropicalized'],
          },
        ],
      },
      {
        id: 'mach_bev_packaging',
        name: 'Beverage, Packaging & QC Lab Systems',
        supplierTag: 'Beverage, Packaging & QC Machinery Suppliers',
        leaves: [
          {
            id: 'mach_espresso_bev',
            name: 'Commercial Espresso Machines, Grinders & Ice Makers',
            defaultUnit: 'units',
            specHint: 'Group heads (2–3 group), dual boiler PID, water filtration, daily kg ice output',
            recommendedCerts: ['CE', 'UL'],
          },
          {
            id: 'mach_sealers_qc',
            name: 'Vacuum/MAP Sealers, Shrink Wrappers & QC Lab Meters',
            defaultUnit: 'units',
            specHint: 'Packs per min, seal bar length mm, gas-flush port, 0.1g bench scale or pH/aw/Brix calibration',
            recommendedCerts: ['CE', 'ISO 9001'],
          },
        ],
      },
    ],
  },
  {
    type: 'packaging',
    label: 'Packaging & Supplies',
    drillLabel: 'By Container Type',
    usesFoodProcess: false,
    groups: [
      {
        id: 'pack_boxes_cartons',
        name: 'Boxes, Cartons & Food Trays',
        supplierTag: 'Boxes, Cartons & Food Tray Suppliers',
        leaves: [
          {
            id: 'pack_cake_boxes',
            name: 'Cake Boxes, Pastry Cartons & Window Sleeves',
            defaultUnit: 'units',
            specHint: 'Dimensions L×W×H mm, 350–450 GSM kraft/ivory board, greaseproof coating, custom CMYK print',
            recommendedCerts: ['Food-Contact Safe'],
          },
          {
            id: 'pack_trays_bowls',
            name: 'Foil Trays, Kraft Salad Bowls & Takeaway Clamshells',
            defaultUnit: 'units',
            specHint: 'Capacity ml/oz, leak-proof snap lid, ovenable/microwaveable spec, carton pack count',
            recommendedCerts: ['Food-Contact Safe'],
          },
        ],
      },
      {
        id: 'pack_films_pouches',
        name: 'Films, Pouches & Liners',
        supplierTag: 'Flexible Films & Pouch Converters',
        leaves: [
          {
            id: 'pack_bopp_vacuum',
            name: 'BOPP Flow-Wrap Film Rolls & Vacuum/Sous-Vide Bags',
            defaultUnit: 'rolls',
            specHint: 'Roll width mm, micron thickness, core diameter, high-barrier EVOH or anti-fog film',
            recommendedCerts: ['Food-Contact Safe', 'ISO 9001'],
          },
          {
            id: 'pack_pouches_liners',
            name: 'Stand-Up Barrier Pouches, Parchment & Greaseproof Liners',
            defaultUnit: 'units',
            specHint: 'Zipper/tear-notch pouch dimensions, foil/matte laminate, silicone baking sheets',
            recommendedCerts: ['Food-Contact Safe'],
          },
        ],
      },
      {
        id: 'pack_cups_bottles',
        name: 'Cups, Bottles & Sealed Lids',
        supplierTag: 'Cups, Bottles & Beverage Packaging Suppliers',
        leaves: [
          {
            id: 'pack_cups_lids',
            name: 'Dessert Cups, Coffee Cups, Gelato Tubs & Lids',
            defaultUnit: 'units',
            specHint: '8 oz / 12 oz / 500 ml volume, double-wall paper or clear rPET, flat/dome/sipper lids',
            recommendedCerts: ['Food-Contact Safe'],
          },
          {
            id: 'pack_bottles_caps',
            name: 'PET/HDPE Juice Bottles, Tamper Caps & Shrink Bands',
            defaultUnit: 'units',
            specHint: '250 ml / 500 ml / 1 L neck finish, tamper-evident ratchet cap, crystal-clear BPA-free resin',
            recommendedCerts: ['Food-Contact Safe', 'Cold Chain'],
          },
        ],
      },
      {
        id: 'pack_bulk_labels',
        name: 'Bulk Tubs, Drums & Labels',
        supplierTag: 'Bulk Containers & Custom Label Suppliers',
        leaves: [
          {
            id: 'pack_bulk_pails',
            name: 'Food-Grade Bulk Tubs, Buckets, Jerrycans & Crates',
            defaultUnit: 'units',
            specHint: '5L / 10L / 20L HDPE pail with tamper-evident lid, freezer-safe (-20°C), stackable',
            recommendedCerts: ['Food-Contact Safe'],
          },
          {
            id: 'pack_labels_stickers',
            name: 'Thermal Barcode, Nutrition, Allergen & Tamper Labels',
            defaultUnit: 'rolls',
            specHint: 'Label size mm, freezer/moisture-resistant adhesive, direct thermal or custom printed roll',
            recommendedCerts: ['ISO 9001'],
          },
        ],
      },
    ],
  },
];

export const POPULAR_RFQ_SUGGESTIONS: PopularRfqSuggestion[] = [
  // Cold Process Food Popular
  {
    name: 'Cream Cheese (33% Butterfat)',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Chilled Dairy, Cream Cheese & Cold-Set > Cream Cheese, Mascarpone, Labneh & Whipping Cream',
    unit: 'kg',
  },
  {
    name: 'Whipping Cream (35% Fat)',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Chilled Dairy, Cream Cheese & Cold-Set > Cream Cheese, Mascarpone, Labneh & Whipping Cream',
    unit: 'L',
  },
  {
    name: 'Mascarpone Cheese',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Chilled Dairy, Cream Cheese & Cold-Set > Cream Cheese, Mascarpone, Labneh & Whipping Cream',
    unit: 'kg',
  },
  {
    name: 'Mango / Passionfruit Puree (Aseptic)',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Beverages, Purees, Dressings & Produce > Fruit Purees, IQF Fruits, Coffee, Matcha & Syrups',
    unit: 'kg',
  },
  {
    name: 'Cold-Set Gelato Stabilizer Base',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Chilled Dairy, Cream Cheese & Cold-Set > Gelato, Soft-Serve, Sorbet & Cold-Set Stabilizers',
    unit: 'kg',
  },
  {
    name: 'Specialty Espresso Beans / Matcha',
    processScope: 'cold',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Cold Process · Beverages, Purees, Dressings & Produce > Fruit Purees, IQF Fruits, Coffee, Matcha & Syrups',
    unit: 'kg',
  },

  // Hot Process Food Popular
  {
    name: 'Unsalted Lactic Butter Sheets (82%)',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Yeast, Leavening, Chocolate & Baking Fats',
    unit: 'kg',
  },
  {
    name: 'Couverture Dark Chocolate (70%)',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Yeast, Leavening, Chocolate & Baking Fats',
    unit: 'kg',
  },
  {
    name: 'High-Protein Bread / 00 Flour',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Flours, Grains, Starches & Baking Mixes',
    unit: 'kg',
  },
  {
    name: 'E471 Emulsifier / Dough Improver',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Yeast, Leavening, Chocolate & Baking Fats',
    unit: 'kg',
  },
  {
    name: 'Halal Chicken Breast / Beef Chuck',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Cooked Kitchen, Proteins & Pantry > Halal Meat, Poultry, Seafood & Stocks',
    unit: 'kg',
  },
  {
    name: 'Calcium Propionate / Potassium Sorbate',
    processScope: 'hot',
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Cooked Kitchen, Proteins & Pantry > Sugars, Syrups, Preservatives & Heat-Stable Additives',
    unit: 'kg',
  },

  // Commercial Machinery Popular (By Function — no Hot/Cold)
  {
    name: '3-Deck Convection Bakery Oven',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Ovens, Ranges & Thermal Baking > Deck, Convection, Rotary & Combi Ovens',
    unit: 'units',
  },
  {
    name: 'Planetary Dough Mixer (40L)',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Mixers, Sheeters & Food Prep > Planetary/Spiral Mixers, Dough Sheeters & Dividers',
    unit: 'units',
  },
  {
    name: 'Blast Chiller (5–10 Tray)',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Refrigeration, Blast Chillers & Cold Rooms > Blast Chillers, Shock Freezers & Gelato Batch Freezers',
    unit: 'units',
  },
  {
    name: 'Walk-In Cold Room Unit (-18°C / +4°C)',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Refrigeration, Blast Chillers & Cold Rooms > Walk-In Cold Rooms, Undercounter Chillers & Display Cases',
    unit: 'units',
  },
  {
    name: 'Commercial 2-Group Espresso Machine',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Beverage, Packaging & QC Lab Systems > Commercial Espresso Machines, Grinders & Ice Makers',
    unit: 'units',
  },
  {
    name: 'Chamber Vacuum / MAP Sealer',
    requestType: 'machinery',
    categoryPath:
      'Commercial Machinery > Beverage, Packaging & QC Lab Systems > Vacuum/MAP Sealers, Shrink Wrappers & QC Lab Meters',
    unit: 'units',
  },

  // Packaging & Supplies Popular (By Container Type — no Hot/Cold)
  {
    name: 'Window Cake Boxes (25×25cm)',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Boxes, Cartons & Food Trays > Cake Boxes, Pastry Cartons & Window Sleeves',
    unit: 'units',
  },
  {
    name: 'BOPP Flow-Wrap Film Rolls',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Films, Pouches & Liners > BOPP Flow-Wrap Film Rolls & Vacuum/Sous-Vide Bags',
    unit: 'rolls',
  },
  {
    name: 'Tamper-Evident Chilled Tubs (500ml)',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Cups, Bottles & Sealed Lids > Dessert Cups, Coffee Cups, Gelato Tubs & Lids',
    unit: 'units',
  },
  {
    name: 'rPET Juice Bottles + Tamper Caps (250ml)',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Cups, Bottles & Sealed Lids > PET/HDPE Juice Bottles, Tamper Caps & Shrink Bands',
    unit: 'units',
  },
  {
    name: 'Food-Grade Bulk Pails (10L) & Labels',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Bulk Tubs, Drums & Labels > Food-Grade Bulk Tubs, Buckets, Jerrycans & Crates',
    unit: 'units',
  },
  {
    name: 'Custom Thermal Allergen & Barcode Labels',
    requestType: 'packaging',
    categoryPath:
      'Packaging & Supplies > Bulk Tubs, Drums & Labels > Thermal Barcode, Nutrition, Allergen & Tamper Labels',
    unit: 'rolls',
  },
];

export const CERT_OPTIONS = [
  'Halal',
  'ISO 22000',
  'HACCP',
  'Food Grade COA',
  'Cold Chain',
  'Alcohol-Free',
  'CE',
  'UL',
  'ISO 9001',
  'GCC Tropicalized',
  'Food-Contact Safe',
];

export const SUPPLIER_SPECIALTY_OPTIONS = RFQ_CATEGORY_TREE.flatMap((root) =>
  root.groups.map((grp) => ({
    id: grp.id,
    label: grp.name,
    supplierTag: grp.supplierTag,
    processScope: grp.processScope,
    requestType: root.type,
    rootLabel: root.label,
  }))
);

export function getRecentProductQueries(uid: string): string[] {
  if (typeof window === 'undefined' || !uid) return [];
  try {
    const raw = window.localStorage.getItem(`hearthline_recent_products_${uid}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function recordRecentProductQuery(uid: string, term: string): string[] {
  const clean = term.trim();
  if (typeof window === 'undefined' || !uid || clean.length < 2) {
    return getRecentProductQueries(uid);
  }
  const existing = getRecentProductQueries(uid);
  const next = [
    clean,
    ...existing.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, 12);
  try {
    window.localStorage.setItem(
      `hearthline_recent_products_${uid}`,
      JSON.stringify(next)
    );
  } catch {
    // ignore storage errors
  }
  return next;
}

export function findCategoryGroup(categoryPath: string): RfqCategoryGroup | null {
  const pathLower = categoryPath.toLowerCase();
  for (const root of RFQ_CATEGORY_TREE) {
    for (const grp of root.groups) {
      if (pathLower.includes(grp.name.toLowerCase())) {
        return grp;
      }
      for (const leaf of grp.leaves) {
        const full = `${root.label} > ${grp.name} > ${leaf.name}`;
        if (full.toLowerCase() === pathLower || pathLower.includes(leaf.name.toLowerCase())) {
          return grp;
        }
      }
    }
  }
  return null;
}

export function findCategoryContext(categoryPath: string): RfqCategoryLeaf | null {
  const pathLower = categoryPath.toLowerCase();
  for (const root of RFQ_CATEGORY_TREE) {
    for (const grp of root.groups) {
      for (const leaf of grp.leaves) {
        const full = `${root.label} > ${grp.name} > ${leaf.name}`;
        if (full.toLowerCase() === pathLower || leaf.name.toLowerCase() === pathLower) {
          return leaf;
        }
      }
    }
  }
  return null;
}

export function buildCategoryPath(
  rootLabel: string,
  groupName: string,
  leafName: string
): string {
  return `${rootLabel} > ${groupName} > ${leafName}`;
}

export function inferProcessFromPath(categoryPath: string): 'hot' | 'cold' {
  const p = categoryPath.toLowerCase();
  if (p.includes('cold process') || p.includes('cold') || p.includes('chilled')) {
    return 'cold';
  }
  return 'hot';
}

export function rfqMatchesSupplierSpecialties(
  rfqCategoryPath: string,
  rfqRequestType: SupplierRfqRequestType,
  selectedGroupIds: string[]
): boolean {
  if (selectedGroupIds.length === 0) return true;
  const pathLower = rfqCategoryPath.toLowerCase();
  for (const specId of selectedGroupIds) {
    const spec = SUPPLIER_SPECIALTY_OPTIONS.find((s) => s.id === specId);
    if (!spec) continue;
    if (pathLower.includes(spec.label.toLowerCase())) {
      return true;
    }
    if (
      rfqRequestType === 'ingredient' &&
      spec.requestType === 'ingredient' &&
      ((spec.processScope === 'hot' && pathLower.includes('hot process')) ||
        (spec.processScope === 'cold' && pathLower.includes('cold process')))
    ) {
      return true;
    }
    // Backwards compatibility for legacy saved Machinery / Packaging paths
    if (rfqRequestType === 'machinery' && spec.requestType === 'machinery') {
      if (spec.id === 'mach_ovens_thermal' && (pathLower.includes('oven') || pathLower.includes('thermal'))) return true;
      if (spec.id === 'mach_mixers_prep' && (pathLower.includes('mixer') || pathLower.includes('sheeter'))) return true;
      if (spec.id === 'mach_chillers_cold' && (pathLower.includes('chiller') || pathLower.includes('freezer'))) return true;
      if (spec.id === 'mach_bev_packaging' && (pathLower.includes('espresso') || pathLower.includes('sealer') || pathLower.includes('gelato'))) return true;
    }
    if (rfqRequestType === 'packaging' && spec.requestType === 'packaging') {
      if (spec.id === 'pack_boxes_cartons' && (pathLower.includes('box') || pathLower.includes('tray'))) return true;
      if (spec.id === 'pack_films_pouches' && (pathLower.includes('film') || pathLower.includes('bopp') || pathLower.includes('pouch'))) return true;
      if (spec.id === 'pack_cups_bottles' && (pathLower.includes('cup') || pathLower.includes('bottle'))) return true;
      if (spec.id === 'pack_bulk_labels' && (pathLower.includes('tub') || pathLower.includes('label'))) return true;
    }
  }
  const matchedGroup = findCategoryGroup(rfqCategoryPath);
  if (matchedGroup && selectedGroupIds.includes(matchedGroup.id)) return true;
  return false;
}

export function getSupplierTargetLabel(
  categoryPath: string,
  requestType?: SupplierRfqRequestType
): string {
  const grp = findCategoryGroup(categoryPath);
  if (grp) return grp.supplierTag;
  const lower = categoryPath.toLowerCase();
  if (requestType === 'machinery' || lower.startsWith('commercial machinery')) {
    return 'Commercial Machinery & Equipment Suppliers';
  }
  if (requestType === 'packaging' || lower.startsWith('packaging')) {
    return 'Packaging & Food-Contact Supplies Converters';
  }
  const process = inferProcessFromPath(categoryPath);
  return process === 'cold'
    ? 'Cold Process · Food & Dairy Suppliers'
    : 'Hot Process · Bakery & Kitchen Suppliers';
}

export function guessRfqPresetForQuery(
  query: string,
  recipeCategory?: RecipeCategory
): {
  requestType: SupplierRfqRequestType;
  categoryPath: string;
  unit: string;
} {
  const q = query.toLowerCase();
  if (
    q.includes('chiller') ||
    q.includes('freezer') ||
    q.includes('cold room')
  ) {
    return {
      requestType: 'machinery',
      categoryPath:
        'Commercial Machinery > Refrigeration, Blast Chillers & Cold Rooms > Blast Chillers, Shock Freezers & Gelato Batch Freezers',
      unit: 'units',
    };
  }
  if (
    q.includes('espresso') ||
    q.includes('sealer') ||
    q.includes('vacuum') ||
    q.includes('wrapper') ||
    q.includes('scale')
  ) {
    return {
      requestType: 'machinery',
      categoryPath:
        'Commercial Machinery > Beverage, Packaging & QC Lab Systems > Vacuum/MAP Sealers, Shrink Wrappers & QC Lab Meters',
      unit: 'units',
    };
  }
  if (q.includes('mixer') || q.includes('sheeter') || q.includes('blender') || q.includes('slicer')) {
    return {
      requestType: 'machinery',
      categoryPath:
        'Commercial Machinery > Mixers, Sheeters & Food Prep > Planetary/Spiral Mixers, Dough Sheeters & Dividers',
      unit: 'units',
    };
  }
  if (
    q.includes('oven') ||
    q.includes('machine') ||
    q.includes('fryer') ||
    q.includes('grill') ||
    q.includes('proofer')
  ) {
    return {
      requestType: 'machinery',
      categoryPath:
        'Commercial Machinery > Ovens, Ranges & Thermal Baking > Deck, Convection, Rotary & Combi Ovens',
      unit: 'units',
    };
  }
  if (q.includes('cup') || q.includes('bottle')) {
    return {
      requestType: 'packaging',
      categoryPath:
        'Packaging & Supplies > Cups, Bottles & Sealed Lids > Dessert Cups, Coffee Cups, Gelato Tubs & Lids',
      unit: 'units',
    };
  }
  if (q.includes('film') || q.includes('wrap') || q.includes('pouch') || q.includes('bag')) {
    return {
      requestType: 'packaging',
      categoryPath:
        'Packaging & Supplies > Films, Pouches & Liners > BOPP Flow-Wrap Film Rolls & Vacuum/Sous-Vide Bags',
      unit: 'rolls',
    };
  }
  if (q.includes('tub') || q.includes('pail') || q.includes('drum') || q.includes('label')) {
    return {
      requestType: 'packaging',
      categoryPath:
        'Packaging & Supplies > Bulk Tubs, Drums & Labels > Food-Grade Bulk Tubs, Buckets, Jerrycans & Crates',
      unit: q.includes('label') ? 'rolls' : 'units',
    };
  }
  if (q.includes('box') || q.includes('carton') || q.includes('tray') || q.includes('bowl')) {
    return {
      requestType: 'packaging',
      categoryPath:
        'Packaging & Supplies > Boxes, Cartons & Food Trays > Cake Boxes, Pastry Cartons & Window Sleeves',
      unit: 'units',
    };
  }
  if (
    q.includes('cheese') ||
    q.includes('cream') ||
    q.includes('milk') ||
    q.includes('yogurt') ||
    q.includes('mascarpone') ||
    q.includes('labneh')
  ) {
    return {
      requestType: 'ingredient',
      categoryPath:
        'Food & Ingredients > Cold Process · Chilled Dairy, Cream Cheese & Cold-Set > Cream Cheese, Mascarpone, Labneh & Whipping Cream',
      unit: 'kg',
    };
  }
  if (
    q.includes('matcha') ||
    q.includes('coffee') ||
    q.includes('gelato') ||
    q.includes('sorbet') ||
    q.includes('puree') ||
    q.includes('syrup') ||
    q.includes('salad') ||
    q.includes('herb') ||
    q.includes('juice') ||
    q.includes('berry')
  ) {
    return {
      requestType: 'ingredient',
      categoryPath:
        'Food & Ingredients > Cold Process · Beverages, Purees, Dressings & Produce > Fruit Purees, IQF Fruits, Coffee, Matcha & Syrups',
      unit: 'kg',
    };
  }
  if (
    q.includes('meat') ||
    q.includes('chicken') ||
    q.includes('beef') ||
    q.includes('lamb') ||
    q.includes('fish') ||
    q.includes('prawn') ||
    q.includes('spice')
  ) {
    return {
      requestType: 'ingredient',
      categoryPath:
        'Food & Ingredients > Hot Process · Cooked Kitchen, Proteins & Pantry > Halal Meat, Poultry, Seafood & Stocks',
      unit: 'kg',
    };
  }
  if (recipeCategory === 'Sauce & Emulsion') {
    return {
      requestType: 'ingredient',
      categoryPath:
        'Food & Ingredients > Cold Process · Beverages, Purees, Dressings & Produce > Fresh Produce, Herbs, Cold-Pressed Oils & Dressings',
      unit: 'kg',
    };
  }
  if (recipeCategory === 'Savory Prep' || recipeCategory === 'Fermentation') {
    return {
      requestType: 'ingredient',
      categoryPath:
        'Food & Ingredients > Hot Process · Cooked Kitchen, Proteins & Pantry > Spices, Cooking Oils, Pastes & Hot Sauces',
      unit: 'kg',
    };
  }
  return {
    requestType: 'ingredient',
    categoryPath:
      'Food & Ingredients > Hot Process · Baked Goods, Flours & Doughs > Flours, Grains, Starches & Baking Mixes',
    unit: 'kg',
  };
}
