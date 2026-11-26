import { LibraryIngredient } from '../types';

export const CATEGORY_ORDER: string[] = [
  'Flours',
  'Fats & Oils',
  'Sugars & Sweeteners',
  'Eggs & Dairy',
  'Fruit & Mash',
  'Meat & Protein',
  'Chinese Cuisine',
  'Indian Cuisine',
  'Mexican Cuisine',
  'Arabic Cuisine',
  'American Cuisine',
  'Leavening',
  'Salt & Misc',
  'Preservatives',
  'Emulsifiers',
  'Colours',
  'Packing Materials',
];

export interface ParentGroupDef {
  name: string;
  key: 'hot' | 'cold' | 'universal';
  categories: string[];
}

export const PARENT_GROUPS: ParentGroupDef[] = [
  {
    name: 'Hot Process',
    key: 'hot',
    categories: [
      'Meat & Protein',
      'Chinese Cuisine',
      'Indian Cuisine',
      'Mexican Cuisine',
      'Arabic Cuisine',
      'American Cuisine',
    ],
  },
  {
    name: 'Cold Process',
    key: 'cold',
    categories: [
      'Flours',
      'Fats & Oils',
      'Sugars & Sweeteners',
      'Eggs & Dairy',
      'Fruit & Mash',
      'Leavening',
    ],
  },
  {
    name: 'Universal — applies to every cuisine',
    key: 'universal',
    categories: [
      'Salt & Misc',
      'Preservatives',
      'Emulsifiers',
      'Colours',
      'Packing Materials',
    ],
  },
];

export const SUPPLIER_OPTIONS: string[] = [
  'Americana',
  'IFFCO',
  'Al Kabeer',
  'Rawabi',
  'Kuwait Flour Mills',
  'Local Market Supplier',
  'Bulk Distributor A',
  'Bulk Distributor B',
  'Generic / Unspecified',
];

export const SEED_LIBRARY: LibraryIngredient[] = [
  // ---------- FLOURS ----------
  { id: 'fl_ap', name: 'All-Purpose Flour', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.1, kcal: 364, fat: 1.0, satFat: 0.2, sugar: 0.3, protein: 10.3, carbs: 76, note: 'General baking standard, 10–11% protein' },
  { id: 'fl_00', name: '"00" Flour (Italian, fine milled)', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.4, kcal: 353, fat: 1.5, satFat: 0.3, sugar: 0.3, protein: 11.0, carbs: 74, note: 'Very fine grind, 11–12.5% protein' },
  { id: 'fl_bread', name: 'Bread Flour (high protein)', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.2, kcal: 361, fat: 1.5, satFat: 0.2, sugar: 0.3, protein: 13.0, carbs: 73, note: '12.5–14% protein, chewy structure' },
  { id: 'fl_cake', name: 'Cake Flour (low protein, chlorinated)', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.6, kcal: 362, fat: 0.8, satFat: 0.1, sugar: 0.3, protein: 8.0, carbs: 78, note: '7–9% protein, tender fine crumb' },
  { id: 'fl_selfrising', name: 'Self-Rising Flour', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.3, kcal: 362, fat: 1.0, satFat: 0.2, sugar: 0.3, protein: 9.7, carbs: 77, note: 'Pre-blended with baking powder + salt' },
  { id: 'fl_wholewheat', name: 'Whole Wheat Flour', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.2, kcal: 340, fat: 2.5, satFat: 0.4, sugar: 0.4, protein: 13.2, carbs: 72, note: 'Higher fiber, denser crumb' },
  { id: 'fl_protein', name: 'Protein-Enriched Flour (vital gluten added)', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 2.0, kcal: 358, fat: 1.2, satFat: 0.2, sugar: 0.3, protein: 16.0, carbs: 70, note: 'AP + added vital gluten, 15–18% protein' },
  { id: 'fl_almond', name: 'Almond Flour', cat: 'Flours', vegan: true, allergens: ['tree nuts'], costKg: 9.5, kcal: 571, fat: 50.0, satFat: 4.0, sugar: 4.4, protein: 21.0, carbs: 20, note: 'Gluten-free, moist, dense' },
  { id: 'fl_coconut', name: 'Coconut Flour', cat: 'Flours', vegan: true, allergens: ['tree nuts'], costKg: 6.0, kcal: 400, fat: 13.3, satFat: 11.8, sugar: 7.0, protein: 19.0, carbs: 60, note: 'Very absorbent, gluten-free' },
  { id: 'fl_rice', name: 'Rice Flour (white)', cat: 'Flours', vegan: true, allergens: [], costKg: 2.2, kcal: 366, fat: 1.4, satFat: 0.4, sugar: 0.1, protein: 6.0, carbs: 80, note: 'Gluten-free, fine texture' },
  { id: 'fl_oat', name: 'Oat Flour', cat: 'Flours', vegan: true, allergens: ['gluten (cross-contact common)'], costKg: 2.8, kcal: 404, fat: 9.0, satFat: 1.6, sugar: 1.0, protein: 15.0, carbs: 66, note: 'Mild sweetness, low gluten' },
  { id: 'fl_semolina', name: 'Semolina (Durum) Flour', cat: 'Flours', vegan: true, allergens: ['gluten'], costKg: 1.5, kcal: 360, fat: 1.1, satFat: 0.2, sugar: 0.7, protein: 12.7, carbs: 73, note: 'Coarse, high protein' },

  // ---------- FATS & OILS ----------
  { id: 'oil_sunflower', name: 'Sunflower Oil', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 2.3, kcal: 884, fat: 100, satFat: 10.3, sugar: 0, protein: 0, carbs: 0, note: 'Neutral flavour, common default' },
  { id: 'oil_canola', name: 'Canola Oil', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 2.1, kcal: 884, fat: 100, satFat: 7.4, sugar: 0, protein: 0, carbs: 0, note: 'Lowest sat. fat of common oils' },
  { id: 'oil_canola_sunflower_blend', name: 'Canola-Sunflower Blend', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 2.0, kcal: 884, fat: 100, satFat: 8.8, sugar: 0, protein: 0, carbs: 0, note: 'Common commercial vegetable oil blend' },
  { id: 'oil_vegblend', name: 'Vegetable Oil Blend (mixed seed)', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 1.9, kcal: 884, fat: 100, satFat: 12.0, sugar: 0, protein: 0, carbs: 0, note: 'Lowest cost, composition varies by supplier' },
  { id: 'oil_corn', name: 'Corn Oil', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 2.4, kcal: 884, fat: 100, satFat: 12.7, sugar: 0, protein: 0, carbs: 0, note: 'Mild flavour, high smoke point' },
  { id: 'oil_oliveevoo', name: 'Extra Virgin Olive Oil', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 7.5, kcal: 884, fat: 100, satFat: 13.8, sugar: 0, protein: 0, carbs: 0, note: 'Distinct flavour' },
  { id: 'oil_coconut', name: 'Coconut Oil (refined)', cat: 'Fats & Oils', vegan: true, allergens: ['tree nuts (per some regulatory lists)'], costKg: 4.5, kcal: 862, fat: 100, satFat: 86.5, sugar: 0, protein: 0, carbs: 0, note: 'Solid below ~24°C' },
  { id: 'butter_unsalted', name: 'Unsalted Butter', cat: 'Fats & Oils', vegan: false, allergens: ['dairy'], costKg: 8.5, kcal: 717, fat: 81, satFat: 51.4, sugar: 0.1, protein: 0.9, carbs: 0.1, note: 'Standard creaming method' },
  { id: 'butter_salted', name: 'Salted Butter', cat: 'Fats & Oils', vegan: false, allergens: ['dairy'], costKg: 8.2, kcal: 714, fat: 81, satFat: 51.4, sugar: 0.1, protein: 0.9, carbs: 0.1, note: 'Reduce added salt if substituting' },
  { id: 'margarine', name: 'Margarine (baking)', cat: 'Fats & Oils', vegan: true, allergens: [], costKg: 4.0, kcal: 717, fat: 80, satFat: 20.0, sugar: 0.5, protein: 0.2, carbs: 1.0, note: 'Vegan butter substitute' },
  { id: 'ghee', name: 'Ghee (clarified butter)', cat: 'Fats & Oils', vegan: false, allergens: ['dairy (trace)'], costKg: 12.0, kcal: 900, fat: 100, satFat: 62.0, sugar: 0, protein: 0.3, carbs: 0, note: 'Nutty flavour, high smoke point' },

  // ---------- SUGARS & SWEETENERS ----------
  { id: 'sugar_white', name: 'Granulated White Sugar', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 0.9, kcal: 387, fat: 0, satFat: 0, sugar: 100, protein: 0, carbs: 100, note: 'Standard sucrose' },
  { id: 'sugar_brown_light', name: 'Light Brown Sugar', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 1.1, kcal: 380, fat: 0, satFat: 0, sugar: 97, protein: 0.1, carbs: 98, note: 'Adds molasses moisture + flavour' },
  { id: 'sugar_brown_dark', name: 'Dark Brown Sugar', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 1.2, kcal: 373, fat: 0, satFat: 0, sugar: 95, protein: 0.1, carbs: 96, note: 'Stronger molasses flavour' },
  { id: 'sugar_powdered', name: 'Powdered (Icing) Sugar', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 1.3, kcal: 389, fat: 0, satFat: 0, sugar: 99.7, protein: 0, carbs: 99.8, note: '~3% cornstarch anti-caking' },
  { id: 'honey', name: 'Honey', cat: 'Sugars & Sweeteners', vegan: false, allergens: [], costKg: 6.5, kcal: 304, fat: 0, satFat: 0, sugar: 82, protein: 0.3, carbs: 82, note: 'Adds moisture and browning' },
  { id: 'maple_syrup', name: 'Maple Syrup', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 9.0, kcal: 260, fat: 0.2, satFat: 0, sugar: 60, protein: 0, carbs: 67, note: 'Distinct flavour, liquid' },
  { id: 'glucose_syrup', name: 'Glucose Syrup', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 2.0, kcal: 316, fat: 0, satFat: 0, sugar: 80, protein: 0, carbs: 80, note: 'Improves moisture retention/shelf life' },
  { id: 'erythritol', name: 'Erythritol (bulk sweetener)', cat: 'Sugars & Sweeteners', vegan: true, allergens: [], costKg: 5.5, kcal: 20, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 100, note: '~70% sweetness of sucrose' },

  // ---------- EGGS & DAIRY ----------
  { id: 'egg_whole', name: 'Whole Eggs (fresh, ~50g each)', cat: 'Eggs & Dairy', vegan: false, allergens: ['egg'], costKg: 4.5, costUnit: 'piece', pieceWeightG: 50, kcal: 143, fat: 9.5, satFat: 3.1, sugar: 0.4, protein: 12.6, carbs: 0.7, note: '~50g per large egg — costed per piece and per kg from tray bulk entry' },
  { id: 'egg_white', name: 'Egg White (liquid)', cat: 'Eggs & Dairy', vegan: false, allergens: ['egg'], costKg: 5.0, kcal: 52, fat: 0.2, satFat: 0, sugar: 0.7, protein: 11.0, carbs: 0.7, note: 'Structure/aeration without fat' },
  { id: 'egg_yolk', name: 'Egg Yolk (liquid)', cat: 'Eggs & Dairy', vegan: false, allergens: ['egg'], costKg: 6.5, kcal: 322, fat: 27.0, satFat: 9.6, sugar: 0.6, protein: 15.9, carbs: 3.6, note: 'Richness, emulsification, colour' },
  { id: 'egg_replacer', name: 'Liquid Egg Substitute (vegan)', cat: 'Eggs & Dairy', vegan: true, allergens: [], costKg: 6.0, kcal: 60, fat: 0.5, satFat: 0, sugar: 2.0, protein: 1.0, carbs: 12, note: 'Binding substitute, texture differs' },
  { id: 'milk_whole', name: 'Whole Milk', cat: 'Eggs & Dairy', vegan: false, allergens: ['dairy'], costKg: 1.0, kcal: 61, fat: 3.3, satFat: 1.9, sugar: 5.1, protein: 3.2, carbs: 4.8, note: 'Standard liquid dairy' },
  { id: 'buttermilk', name: 'Buttermilk', cat: 'Eggs & Dairy', vegan: false, allergens: ['dairy'], costKg: 1.4, kcal: 40, fat: 1.0, satFat: 0.6, sugar: 4.8, protein: 3.3, carbs: 4.9, note: 'Acidic — activates baking soda' },
  { id: 'yogurt_plain', name: 'Plain Yogurt', cat: 'Eggs & Dairy', vegan: false, allergens: ['dairy'], costKg: 2.5, kcal: 61, fat: 3.3, satFat: 2.1, sugar: 4.7, protein: 3.5, carbs: 4.7, note: 'Moisture + tenderizing acid' },
  { id: 'cream_heavy', name: 'Heavy Cream', cat: 'Eggs & Dairy', vegan: false, allergens: ['dairy'], costKg: 4.0, kcal: 340, fat: 36.0, satFat: 23.0, sugar: 2.8, protein: 2.1, carbs: 2.8, note: 'Richness for batters/fillings' },
  { id: 'condensed_milk', name: 'Sweetened Condensed Milk', cat: 'Eggs & Dairy', vegan: false, allergens: ['dairy'], costKg: 3.0, kcal: 321, fat: 8.7, satFat: 5.5, sugar: 54.0, protein: 7.9, carbs: 54.4, note: 'Sweetener + moisture + richness' },

  // ---------- FRUIT & MASH ----------
  { id: 'banana_mashed', name: 'Ripe Banana (mashed)', cat: 'Fruit & Mash', vegan: true, allergens: [], costKg: 1.2, wastagePct: 40, kcal: 89, fat: 0.3, satFat: 0.1, sugar: 12.2, protein: 1.1, carbs: 23, note: '40% peel/trim wastage adjusts effective edible cost/kg' },
  { id: 'applesauce', name: 'Unsweetened Applesauce', cat: 'Fruit & Mash', vegan: true, allergens: [], costKg: 1.5, kcal: 42, fat: 0.1, satFat: 0, sugar: 9.0, protein: 0.2, carbs: 11.3, note: 'Common oil/egg replacer' },
  { id: 'pumpkin_puree', name: 'Pumpkin Purée', cat: 'Fruit & Mash', vegan: true, allergens: [], costKg: 2.0, kcal: 34, fat: 0.1, satFat: 0.1, sugar: 2.8, protein: 1.0, carbs: 8.1, note: 'Moisture + colour + mild sweetness' },

  // ---------- MEAT & PROTEIN ----------
  { id: 'chicken_breast', name: 'Chicken Breast (boneless, skinless, raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 2.5, wastagePct: 0, kcal: 165, fat: 3.6, satFat: 1.0, sugar: 0, protein: 31.0, carbs: 0, note: 'Cooking loss: grilled/roasted ~25–30%, poached ~15–20% — set in Costing Engine' },
  { id: 'chicken_whole', name: 'Whole Chicken (raw, bone-in)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 1.8, wastagePct: 0, kcal: 215, fat: 15.0, satFat: 4.3, sugar: 0, protein: 18.6, carbs: 0, note: 'Roasted whole cooking loss ~30%; trim loss ~25–30% if deboned' },
  { id: 'ground_beef', name: 'Ground Beef (80/20, raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 4.0, wastagePct: 0, kcal: 254, fat: 20.0, satFat: 7.8, sugar: 0, protein: 17.0, carbs: 0, note: 'Pan-fried cooking loss ~25–30%' },
  { id: 'beef_chuck', name: 'Beef Chuck Roast (raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 5.5, wastagePct: 0, kcal: 257, fat: 20.0, satFat: 8.0, sugar: 0, protein: 17.5, carbs: 0, note: 'Braised/roasted cooking loss ~30–35%' },
  { id: 'pork_shoulder', name: 'Pork Shoulder (raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 3.5, wastagePct: 0, kcal: 262, fat: 21.0, satFat: 7.6, sugar: 0, protein: 16.9, carbs: 0, note: 'Roasted/braised cooking loss ~30–35%' },
  { id: 'bacon_raw', name: 'Bacon (raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 7.0, wastagePct: 0, kcal: 541, fat: 42.0, satFat: 14.0, sugar: 1.4, protein: 37.0, carbs: 1.4, note: 'Pan-fried cooking loss ~45–50%' },
  { id: 'lamb_shoulder', name: 'Lamb Shoulder (raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 7.5, wastagePct: 0, kcal: 258, fat: 20.9, satFat: 8.8, sugar: 0, protein: 16.4, carbs: 0, note: 'Roasted cooking loss ~30–32%' },
  { id: 'salmon_fillet', name: 'Salmon Fillet (raw)', cat: 'Meat & Protein', vegan: false, allergens: ['fish'], costKg: 9.0, wastagePct: 0, kcal: 208, fat: 13.0, satFat: 3.1, sugar: 0, protein: 20.0, carbs: 0, note: 'Baked cooking loss ~18–20%' },
  { id: 'turkey_breast', name: 'Turkey Breast (raw)', cat: 'Meat & Protein', vegan: false, allergens: [], costKg: 4.0, wastagePct: 0, kcal: 135, fat: 1.0, satFat: 0.3, sugar: 0, protein: 30.0, carbs: 0, note: 'Roasted cooking loss ~25–30%' },

  // ---------- LEAVENING ----------
  { id: 'baking_powder', name: 'Baking Powder (double-acting)', cat: 'Leavening', vegan: true, allergens: [], costKg: 5.0, kcal: 53, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 28, note: 'Typical use 1–2% of flour weight' },
  { id: 'baking_soda', name: 'Baking Soda (sodium bicarbonate)', cat: 'Leavening', vegan: true, allergens: [], costKg: 2.5, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Needs an acidic ingredient to activate' },
  { id: 'cream_tartar', name: 'Cream of Tartar', cat: 'Leavening', vegan: true, allergens: [], costKg: 11.0, kcal: 258, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 64, note: 'Stabilizes whipped egg whites' },
  { id: 'yeast_instant', name: 'Instant Dry Yeast', cat: 'Leavening', vegan: true, allergens: [], costKg: 9.0, kcal: 325, fat: 1.9, satFat: 0.3, sugar: 0, protein: 40.4, carbs: 41.2, note: 'For enriched/yeasted baked goods' },

  // ---------- SALT & MISC ----------
  { id: 'salt', name: 'Fine Salt', cat: 'Salt & Misc', vegan: true, allergens: [], costKg: 0.6, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Typical use 0.5–1% of flour weight' },
  { id: 'vanilla_extract', name: 'Pure Vanilla Extract', cat: 'Salt & Misc', vegan: true, allergens: [], costKg: 38.0, kcal: 288, fat: 0.1, satFat: 0, sugar: 12.7, protein: 0.1, carbs: 12.7, note: 'Typical use 0.5–1% of batter weight' },
  { id: 'cinnamon', name: 'Ground Cinnamon', cat: 'Salt & Misc', vegan: true, allergens: [], costKg: 16.0, kcal: 247, fat: 1.2, satFat: 0.3, sugar: 2.2, protein: 4.0, carbs: 81, note: 'Common banana cake spice' },
  { id: 'walnuts', name: 'Chopped Walnuts', cat: 'Salt & Misc', vegan: true, allergens: ['tree nuts'], costKg: 12.0, kcal: 654, fat: 65.0, satFat: 6.1, sugar: 2.6, protein: 15.0, carbs: 14, note: 'Common banana cake inclusion' },
  { id: 'choc_chips', name: 'Chocolate Chips (semi-sweet)', cat: 'Salt & Misc', vegan: false, allergens: ['dairy'], costKg: 9.0, kcal: 479, fat: 29.7, satFat: 17.7, sugar: 52.4, protein: 4.2, carbs: 63.1, note: 'Check brand for dairy/soy lecithin' },

  // ---------- PRESERVATIVES ----------
  { id: 'e200', name: 'Sorbic Acid', ecode: 'E200', cat: 'Preservatives', vegan: true, allergens: [], costKg: 9.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.05–0.2% of batter weight', func: 'Antimicrobial — inhibits mould/yeast growth' },
  { id: 'e202', name: 'Potassium Sorbate', ecode: 'E202', cat: 'Preservatives', vegan: true, allergens: [], costKg: 8.5, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.05–0.2% of batter weight', func: 'Antimicrobial, water-soluble' },
  { id: 'e282', name: 'Calcium Propionate', ecode: 'E282', cat: 'Preservatives', vegan: true, allergens: [], costKg: 7.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.1–0.3% of flour weight', func: 'Anti-mould for bread/cake' },
  { id: 'e300', name: 'Ascorbic Acid (Vitamin C)', ecode: 'E300', cat: 'Preservatives', vegan: true, allergens: [], costKg: 12.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.001–0.01% of flour weight', func: 'Dough conditioner / antioxidant' },
  { id: 'e223', name: 'Sodium Metabisulphite', ecode: 'E223', cat: 'Preservatives', vegan: true, allergens: ['sulphites'], costKg: 6.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace — max varies by region', func: 'Antioxidant/preservative, declarable allergen' },

  // ---------- EMULSIFIERS ----------
  { id: 'e322', name: 'Lecithin (soy)', ecode: 'E322', cat: 'Emulsifiers', vegan: true, allergens: ['soy'], costKg: 10.0, kcal: 763, fat: 100, satFat: 15.0, sugar: 0, protein: 0, carbs: 0, dosage: '0.2–0.5% of batter weight', func: 'Emulsifier — batter uniformity' },
  { id: 'e471', name: 'Mono- and Diglycerides of Fatty Acids', ecode: 'E471', cat: 'Emulsifiers', vegan: false, allergens: [], costKg: 8.0, kcal: 900, fat: 100, satFat: 35.0, sugar: 0, protein: 0, carbs: 0, dosage: '0.3–1% of batter weight', func: 'Emulsifier — softness/shelf-life' },
  { id: 'e410', name: 'Locust Bean Gum', ecode: 'E410', cat: 'Emulsifiers', vegan: true, allergens: [], costKg: 16.0, kcal: 335, fat: 1.0, satFat: 0, sugar: 0, protein: 5.0, carbs: 80, dosage: '0.1–0.3% of batter weight', func: 'Thickener/stabilizer' },
  { id: 'e415', name: 'Xanthan Gum', ecode: 'E415', cat: 'Emulsifiers', vegan: true, allergens: [], costKg: 15.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.1–0.5% of batter weight', func: 'Thickener, esp. gluten-free structure' },

  // ---------- COLOURS ----------
  { id: 'e100', name: 'Curcumin (Turmeric extract)', ecode: 'E100', cat: 'Colours', vegan: true, allergens: [], costKg: 40.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.001–0.01% of batter weight', func: 'Natural yellow colourant' },
  { id: 'e101', name: 'Riboflavin (Vitamin B2)', ecode: 'E101', cat: 'Colours', vegan: true, allergens: [], costKg: 60.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace', func: 'Yellow-orange colourant, also a vitamin' },
  { id: 'e120', name: 'Carmine (Cochineal)', ecode: 'E120', cat: 'Colours', vegan: false, allergens: [], costKg: 120.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace', func: 'Red colourant — insect-derived, not vegan' },
  { id: 'e133', name: 'Brilliant Blue FCF', ecode: 'E133', cat: 'Colours', vegan: true, allergens: [], costKg: 30.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace', func: 'Synthetic blue colourant' },
  { id: 'e150a', name: 'Caramel Colour (plain)', ecode: 'E150a', cat: 'Colours', vegan: true, allergens: [], costKg: 5.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: '0.01–0.1% of batter weight', func: 'Brown colourant' },
  { id: 'e160a', name: 'Beta-Carotene', ecode: 'E160a', cat: 'Colours', vegan: true, allergens: [], costKg: 25.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace', func: 'Natural orange-yellow, provitamin A' },
  { id: 'e163', name: 'Anthocyanins', ecode: 'E163', cat: 'Colours', vegan: true, allergens: [], costKg: 35.0, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, dosage: 'trace', func: 'Natural red-purple colourant' },

  // ---------- PACKING MATERIALS ----------
  { id: 'pk_bopp_clear', name: 'BOPP Flow Wrap Film (Clear, 20 micron)', cat: 'Packing Materials', costUnit: 'roll', costKg: 0, vegan: true, allergens: [], rollLengthM: 4000, rollWidthMM: 280, gsm: 20, costPerRoll: 45.0, wrapLengthCmPerUnit: 18, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Clear flow-wrap film — cost/pack derived from roll length / wrap length per pack' },
  { id: 'pk_bopp_printed', name: 'BOPP Flow Wrap Film (Printed, custom branding)', cat: 'Packing Materials', costUnit: 'roll', costKg: 0, vegan: true, allergens: [], rollLengthM: 3000, rollWidthMM: 280, gsm: 25, costPerRoll: 85.0, wrapLengthCmPerUnit: 18, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Printed/branded film' },
  { id: 'pk_box_small', name: 'Cardboard Box (Small, single slice)', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.045, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Single-portion box' },
  { id: 'pk_box_large', name: 'Cardboard Box (Large, whole cake)', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.28, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Whole-cake box' },
  { id: 'pk_label', name: 'Product Label / Sticker', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.012, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Printed label incl. ingredient/allergen declaration' },
  { id: 'pk_paperbag', name: 'Paper Bag (branded)', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.06, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Take-away paper bag' },
  { id: 'pk_shrink_sleeve', name: 'Shrink Sleeve (PVC/PETG, printed)', cat: 'Packing Materials', costUnit: 'roll', costKg: 0, vegan: true, allergens: [], rollLengthM: 1500, rollWidthMM: 120, gsm: 40, costPerRoll: 60.0, wrapLengthCmPerUnit: 9, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Full-body shrink sleeve' },
  { id: 'pk_tamper_band', name: 'Tamper-Evident Band', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.018, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Perforated shrink band over lid/box seam' },
  { id: 'pk_cakeboard', name: 'Printed Cake Board (round, branded)', cat: 'Packing Materials', costUnit: 'unit', costKg: 0, vegan: true, allergens: [], costPerUnit: 0.15, kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, note: 'Rigid board base under whole cakes' },

  // ---------- CHINESE CUISINE ----------
  { id: 'cn_soysauce', name: 'Soy Sauce (light)', cat: 'Chinese Cuisine', vegan: true, allergens: ['soy', 'gluten'], costKg: 2.0, kcal: 53, fat: 0.1, satFat: 0, sugar: 0.4, protein: 8.1, carbs: 4.9, note: 'Base seasoning for stir-fries and marinades' },
  { id: 'cn_sesameoil', name: 'Sesame Oil (toasted)', cat: 'Chinese Cuisine', vegan: true, allergens: ['sesame'], costKg: 6.5, kcal: 884, fat: 100, satFat: 14.2, sugar: 0, protein: 0, carbs: 0, note: 'Finishing oil, strong aroma' },
  { id: 'cn_oystersauce', name: 'Oyster Sauce', cat: 'Chinese Cuisine', vegan: false, allergens: ['shellfish'], costKg: 3.0, kcal: 51, fat: 0.3, satFat: 0.1, sugar: 9.0, protein: 1.4, carbs: 11.0, note: 'Umami base for stir-fries and braises' },
  { id: 'cn_ricevinegar', name: 'Rice Vinegar', cat: 'Chinese Cuisine', vegan: true, allergens: [], costKg: 1.8, kcal: 18, fat: 0, satFat: 0, sugar: 0.3, protein: 0, carbs: 0.6, note: 'Mild acidity for dressings' },
  { id: 'cn_shaoxing', name: 'Shaoxing Wine', cat: 'Chinese Cuisine', vegan: true, allergens: [], costKg: 3.5, kcal: 121, fat: 0, satFat: 0, sugar: 0.5, protein: 0.6, carbs: 4.0, note: 'Cooking wine for marinades' },
  { id: 'cn_fivespice', name: 'Five-Spice Powder', cat: 'Chinese Cuisine', vegan: true, allergens: [], costKg: 18.0, kcal: 344, fat: 12.0, satFat: 4.0, sugar: 2.0, protein: 8.0, carbs: 65.0, note: 'Star anise, clove, cinnamon, fennel, Sichuan pepper' },
  { id: 'cn_ginger', name: 'Fresh Ginger', cat: 'Chinese Cuisine', vegan: true, allergens: [], costKg: 3.0, kcal: 80, fat: 0.8, satFat: 0.2, sugar: 1.7, protein: 1.8, carbs: 18.0, note: 'Aromatic base' },
  { id: 'cn_hoisin', name: 'Hoisin Sauce', cat: 'Chinese Cuisine', vegan: true, allergens: ['soy', 'gluten'], costKg: 3.5, kcal: 220, fat: 3.4, satFat: 0.6, sugar: 32.0, protein: 3.0, carbs: 44.0, note: 'Sweet-savory glaze' },
  { id: 'cn_cornstarch', name: 'Cornstarch (for slurry)', cat: 'Chinese Cuisine', vegan: true, allergens: [], costKg: 1.2, kcal: 381, fat: 0.1, satFat: 0, sugar: 0, protein: 0.3, carbs: 91.0, note: 'Thickener for sauces' },

  // ---------- INDIAN CUISINE ----------
  { id: 'in_garammasala', name: 'Garam Masala', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 15.0, kcal: 379, fat: 15.0, satFat: 2.0, sugar: 3.0, protein: 14.0, carbs: 55.0, note: 'Warming spice blend' },
  { id: 'in_turmeric', name: 'Turmeric Powder', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 8.0, kcal: 312, fat: 3.3, satFat: 1.8, sugar: 3.2, protein: 9.7, carbs: 67.0, note: 'Base colour and earthy flavour' },
  { id: 'in_cuminseed', name: 'Cumin Seeds', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 6.0, kcal: 375, fat: 22.3, satFat: 1.5, sugar: 2.3, protein: 17.8, carbs: 44.2, note: 'Tempered in hot oil' },
  { id: 'in_basmati', name: 'Basmati Rice', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 2.5, kcal: 356, fat: 0.9, satFat: 0.2, sugar: 0.1, protein: 7.1, carbs: 78.0, note: 'Long-grain aromatic rice' },
  { id: 'in_redlentils', name: 'Red Lentils (Masoor Dal)', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 2.0, kcal: 352, fat: 1.1, satFat: 0.2, sugar: 2.0, protein: 24.0, carbs: 63.0, note: 'Fast-cooking dal' },
  { id: 'in_gingergarlic', name: 'Ginger-Garlic Paste', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 3.5, kcal: 90, fat: 0.5, satFat: 0.1, sugar: 3.0, protein: 3.0, carbs: 18.0, note: 'Standard aromatic base' },
  { id: 'in_tamarind', name: 'Tamarind Paste', cat: 'Indian Cuisine', vegan: true, allergens: [], costKg: 4.0, kcal: 239, fat: 0.6, satFat: 0.2, sugar: 57.0, protein: 2.8, carbs: 63.0, note: 'Sour note in curries and chutneys' },
  { id: 'in_paneer', name: 'Paneer', cat: 'Indian Cuisine', vegan: false, allergens: ['dairy'], costKg: 6.0, kcal: 265, fat: 20.8, satFat: 13.3, sugar: 2.6, protein: 18.3, carbs: 3.6, note: 'Fresh non-melting cheese' },

  // ---------- MEXICAN CUISINE ----------
  { id: 'mx_masaharina', name: 'Corn Masa Harina', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 2.0, kcal: 363, fat: 3.8, satFat: 0.5, sugar: 1.5, protein: 8.3, carbs: 76.0, note: 'Nixtamalized corn flour' },
  { id: 'mx_cumin', name: 'Ground Cumin', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 6.0, kcal: 375, fat: 22.3, satFat: 1.5, sugar: 2.3, protein: 17.8, carbs: 44.2, note: 'Core spice in Mexican blends' },
  { id: 'mx_chilipowder', name: 'Chili Powder (blend)', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 7.0, kcal: 282, fat: 14.3, satFat: 2.5, sugar: 7.0, protein: 12.0, carbs: 50.0, note: 'Blended seasoning' },
  { id: 'mx_guajillo', name: 'Dried Guajillo Chiles', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 12.0, kcal: 283, fat: 6.0, satFat: 1.0, sugar: 30.0, protein: 11.0, carbs: 57.0, note: 'Mild tangy dried chile' },
  { id: 'mx_lime', name: 'Fresh Lime', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 2.5, kcal: 30, fat: 0.2, satFat: 0, sugar: 1.7, protein: 0.7, carbs: 10.9, note: 'Acid finish' },
  { id: 'mx_cilantro', name: 'Fresh Cilantro', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 4.0, kcal: 23, fat: 0.5, satFat: 0, sugar: 0.9, protein: 2.1, carbs: 3.7, note: 'Fresh herb finish' },
  { id: 'mx_quesofresco', name: 'Queso Fresco', cat: 'Mexican Cuisine', vegan: false, allergens: ['dairy'], costKg: 7.5, kcal: 264, fat: 20.0, satFat: 13.0, sugar: 2.5, protein: 18.0, carbs: 2.0, note: 'Crumbly fresh cheese' },
  { id: 'mx_blackbeans', name: 'Black Beans (cooked)', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 2.2, kcal: 132, fat: 0.5, satFat: 0.1, sugar: 0.3, protein: 8.9, carbs: 23.7, note: 'Staple protein/side' },
  { id: 'mx_chipotle', name: 'Chipotle in Adobo', cat: 'Mexican Cuisine', vegan: true, allergens: [], costKg: 5.0, kcal: 130, fat: 3.0, satFat: 0.5, sugar: 12.0, protein: 4.0, carbs: 22.0, note: 'Smoky heat for marinades' },

  // ---------- ARABIC CUISINE ----------
  { id: 'ar_zaatar', name: "Za'atar Blend", cat: 'Arabic Cuisine', vegan: true, allergens: ['sesame'], costKg: 12.0, kcal: 379, fat: 20.0, satFat: 3.0, sugar: 2.0, protein: 10.0, carbs: 42.0, note: 'Thyme, sumac, sesame, salt' },
  { id: 'ar_sumac', name: 'Ground Sumac', cat: 'Arabic Cuisine', vegan: true, allergens: [], costKg: 15.0, kcal: 262, fat: 6.0, satFat: 0.5, sugar: 3.0, protein: 5.0, carbs: 65.0, note: 'Tart, lemony finishing spice' },
  { id: 'ar_tahini', name: 'Tahini', cat: 'Arabic Cuisine', vegan: true, allergens: ['sesame'], costKg: 9.0, kcal: 595, fat: 54.0, satFat: 7.6, sugar: 0.5, protein: 17.0, carbs: 21.0, note: 'Sesame paste for hummus and halva' },
  { id: 'ar_pommolasses', name: 'Pomegranate Molasses', cat: 'Arabic Cuisine', vegan: true, allergens: [], costKg: 8.0, kcal: 260, fat: 0.2, satFat: 0, sugar: 55.0, protein: 1.5, carbs: 65.0, note: 'Sweet-tart syrup' },
  { id: 'ar_cardamom', name: 'Ground Cardamom', cat: 'Arabic Cuisine', vegan: true, allergens: [], costKg: 30.0, kcal: 311, fat: 6.7, satFat: 0.6, sugar: 0, protein: 10.8, carbs: 68.0, note: 'Coffee, desserts, rice dishes' },
  { id: 'ar_bulgur', name: 'Bulgur Wheat', cat: 'Arabic Cuisine', vegan: true, allergens: ['gluten'], costKg: 2.0, kcal: 342, fat: 1.3, satFat: 0.2, sugar: 0.4, protein: 12.3, carbs: 76.0, note: 'Base grain for tabbouleh and kibbeh' },
  { id: 'ar_chickpeas', name: 'Dried Chickpeas', cat: 'Arabic Cuisine', vegan: true, allergens: [], costKg: 2.0, kcal: 364, fat: 6.0, satFat: 0.6, sugar: 11.0, protein: 19.0, carbs: 61.0, note: 'Hummus, falafel, stews' },
  { id: 'ar_labneh', name: 'Labneh', cat: 'Arabic Cuisine', vegan: false, allergens: ['dairy'], costKg: 5.0, kcal: 150, fat: 10.0, satFat: 6.5, sugar: 4.0, protein: 8.0, carbs: 5.0, note: 'Strained yogurt' },

  // ---------- AMERICAN CUISINE ----------
  { id: 'us_mustard', name: 'Yellow Mustard', cat: 'American Cuisine', vegan: true, allergens: ['mustard'], costKg: 3.0, kcal: 66, fat: 3.3, satFat: 0.2, sugar: 3.0, protein: 4.4, carbs: 5.4, note: 'Condiment and glaze base' },
  { id: 'us_bbqsauce', name: 'BBQ Sauce', cat: 'American Cuisine', vegan: true, allergens: [], costKg: 3.5, kcal: 172, fat: 0.6, satFat: 0.1, sugar: 33.0, protein: 1.0, carbs: 40.0, note: 'Glaze/finish for grilled meats' },
  { id: 'us_worcestershire', name: 'Worcestershire Sauce', cat: 'American Cuisine', vegan: false, allergens: ['fish'], costKg: 4.5, kcal: 78, fat: 0, satFat: 0, sugar: 15.0, protein: 0, carbs: 19.5, note: 'Umami depth' },
  { id: 'us_cheddar', name: 'Cheddar Cheese', cat: 'American Cuisine', vegan: false, allergens: ['dairy'], costKg: 8.5, kcal: 403, fat: 33.0, satFat: 21.0, sugar: 0.5, protein: 25.0, carbs: 1.3, note: 'Standard melting cheese' },
  { id: 'us_cornmeal', name: 'Yellow Cornmeal', cat: 'American Cuisine', vegan: true, allergens: [], costKg: 1.8, kcal: 370, fat: 3.9, satFat: 0.5, sugar: 0.6, protein: 8.0, carbs: 79.0, note: 'Cornbread, breading, grits' },
  { id: 'us_smokedpaprika', name: 'Smoked Paprika', cat: 'American Cuisine', vegan: true, allergens: [], costKg: 10.0, kcal: 282, fat: 13.0, satFat: 2.0, sugar: 10.0, protein: 14.0, carbs: 54.0, note: 'BBQ rubs, chili, smoky depth' },
];

export interface NutritionRefEntry {
  name: string;
  aliases: string[];
  kcal: number;
  fat: number;
  satFat: number;
  sugar: number;
  protein: number;
  carbs: number;
  allergens: string[];
  vegan: boolean;
}

export const NUTRITION_REFERENCE_DB: NutritionRefEntry[] = [
  { name: 'Almond Butter', aliases: ['almond spread'], kcal: 614, fat: 56, satFat: 5.3, sugar: 4.4, protein: 21, carbs: 19, allergens: ['tree nuts'], vegan: true },
  { name: 'Peanut Butter', aliases: [], kcal: 588, fat: 50, satFat: 10, sugar: 9, protein: 25, carbs: 20, allergens: ['peanuts'], vegan: true },
  { name: 'Tahini', aliases: ['sesame paste'], kcal: 595, fat: 54, satFat: 7.6, sugar: 0.5, protein: 17, carbs: 21, allergens: ['sesame'], vegan: true },
  { name: 'Coconut Sugar', aliases: ['palm sugar'], kcal: 375, fat: 0.5, satFat: 0.4, sugar: 75, protein: 0.2, carbs: 78, allergens: [], vegan: true },
  { name: 'Molasses', aliases: ['blackstrap molasses'], kcal: 290, fat: 0.1, satFat: 0, sugar: 60, protein: 0, carbs: 75, allergens: [], vegan: true },
  { name: 'Agave Syrup', aliases: ['agave nectar'], kcal: 310, fat: 0.2, satFat: 0, sugar: 68, protein: 0.1, carbs: 76, allergens: [], vegan: true },
  { name: 'Malt Syrup', aliases: ['barley malt syrup'], kcal: 318, fat: 0.1, satFat: 0, sugar: 48, protein: 3.9, carbs: 76, allergens: ['gluten'], vegan: true },
  { name: 'Rye Flour', aliases: [], kcal: 349, fat: 1.7, satFat: 0.2, sugar: 1.0, protein: 8.8, carbs: 75, allergens: ['gluten'], vegan: true },
  { name: 'Spelt Flour', aliases: [], kcal: 338, fat: 2.4, satFat: 0.4, sugar: 6.8, protein: 14.6, carbs: 70, allergens: ['gluten'], vegan: true },
  { name: 'Brown Rice Flour', aliases: [], kcal: 363, fat: 2.8, satFat: 0.6, sugar: 0.9, protein: 7.2, carbs: 76, allergens: [], vegan: true },
  { name: 'Tapioca Starch', aliases: ['tapioca flour'], kcal: 358, fat: 0.02, satFat: 0, sugar: 3.4, protein: 0.2, carbs: 88, allergens: [], vegan: true },
  { name: 'Arrowroot Powder', aliases: ['arrowroot starch'], kcal: 357, fat: 0.1, satFat: 0, sugar: 0, protein: 0.3, carbs: 88, allergens: [], vegan: true },
  { name: 'Potato Starch', aliases: [], kcal: 357, fat: 0.1, satFat: 0, sugar: 0, protein: 0.1, carbs: 83, allergens: [], vegan: true },
  { name: 'Agar Agar', aliases: ['agar powder'], kcal: 26, fat: 0, satFat: 0, sugar: 0, protein: 0.5, carbs: 6.8, allergens: [], vegan: true },
  { name: 'Gelatin Sheets', aliases: ['leaf gelatin'], kcal: 335, fat: 0.1, satFat: 0, sugar: 0, protein: 85, carbs: 0, allergens: [], vegan: false },
  { name: 'Cocoa Butter', aliases: [], kcal: 884, fat: 100, satFat: 60, sugar: 0, protein: 0, carbs: 0, allergens: [], vegan: true },
  { name: 'Cocoa Powder', aliases: ['unsweetened cocoa'], kcal: 228, fat: 14, satFat: 8.1, sugar: 1.8, protein: 19.6, carbs: 58, allergens: [], vegan: true },
  { name: 'White Chocolate', aliases: [], kcal: 539, fat: 32, satFat: 19, sugar: 59, protein: 5.9, carbs: 59, allergens: ['dairy'], vegan: false },
  { name: 'Milk Chocolate', aliases: [], kcal: 535, fat: 30, satFat: 18, sugar: 52, protein: 7.7, carbs: 59, allergens: ['dairy'], vegan: false },
  { name: 'Cream Cheese', aliases: [], kcal: 342, fat: 34, satFat: 19, sugar: 3.2, protein: 6.2, carbs: 4.1, allergens: ['dairy'], vegan: false },
  { name: 'Mascarpone', aliases: [], kcal: 429, fat: 44, satFat: 29, sugar: 3.0, protein: 4.8, carbs: 4.0, allergens: ['dairy'], vegan: false },
  { name: 'Ricotta', aliases: [], kcal: 174, fat: 13, satFat: 8.3, sugar: 0.3, protein: 11.3, carbs: 3.0, allergens: ['dairy'], vegan: false },
  { name: 'Sour Cream', aliases: [], kcal: 198, fat: 19.4, satFat: 12.1, sugar: 2.9, protein: 2.4, carbs: 4.6, allergens: ['dairy'], vegan: false },
  { name: 'Evaporated Milk', aliases: [], kcal: 134, fat: 7.6, satFat: 4.6, sugar: 12.7, protein: 6.8, carbs: 10, allergens: ['dairy'], vegan: false },
  { name: 'Powdered Milk', aliases: ['dry milk', 'milk powder'], kcal: 496, fat: 26.7, satFat: 16.7, sugar: 38.4, protein: 26.3, carbs: 38.4, allergens: ['dairy'], vegan: false },
  { name: 'Oat Milk', aliases: [], kcal: 47, fat: 1.5, satFat: 0.2, sugar: 4.1, protein: 1.0, carbs: 7.5, allergens: ['gluten (cross-contact common)'], vegan: true },
  { name: 'Almond Milk', aliases: [], kcal: 17, fat: 1.5, satFat: 0.1, sugar: 0.2, protein: 0.6, carbs: 0.6, allergens: ['tree nuts'], vegan: true },
  { name: 'Coconut Cream', aliases: [], kcal: 330, fat: 34, satFat: 30, sugar: 3.3, protein: 3.6, carbs: 6.7, allergens: [], vegan: true },
  { name: 'Dates', aliases: ['medjool dates', 'date paste'], kcal: 277, fat: 0.2, satFat: 0, sugar: 66.5, protein: 1.8, carbs: 75, allergens: [], vegan: true },
  { name: 'Raisins', aliases: [], kcal: 299, fat: 0.5, satFat: 0.1, sugar: 59, protein: 3.1, carbs: 79, allergens: [], vegan: true },
  { name: 'Pecans', aliases: [], kcal: 691, fat: 72, satFat: 6.2, sugar: 4.0, protein: 9.2, carbs: 14, allergens: ['tree nuts'], vegan: true },
  { name: 'Cashews', aliases: [], kcal: 553, fat: 44, satFat: 7.8, sugar: 5.9, protein: 18, carbs: 30, allergens: ['tree nuts'], vegan: true },
  { name: 'Sunflower Seeds', aliases: [], kcal: 584, fat: 51, satFat: 4.5, sugar: 2.6, protein: 21, carbs: 20, allergens: [], vegan: true },
  { name: 'Chia Seeds', aliases: [], kcal: 486, fat: 31, satFat: 3.3, sugar: 0, protein: 17, carbs: 42, allergens: [], vegan: true },
  { name: 'Flaxseed', aliases: ['ground flaxseed', 'flax meal'], kcal: 534, fat: 42, satFat: 3.7, sugar: 1.6, protein: 18, carbs: 29, allergens: [], vegan: true },
  { name: 'Psyllium Husk', aliases: [], kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, allergens: [], vegan: true },
  { name: 'Turmeric Powder', aliases: [], kcal: 312, fat: 3.3, satFat: 1.8, sugar: 3.2, protein: 9.7, carbs: 67, allergens: [], vegan: true },
  { name: 'Ginger Powder', aliases: ['ground ginger'], kcal: 335, fat: 4.2, satFat: 1.1, sugar: 3.4, protein: 9.0, carbs: 71, allergens: [], vegan: true },
  { name: 'Nutmeg', aliases: ['ground nutmeg'], kcal: 525, fat: 36, satFat: 26, sugar: 2.8, protein: 5.8, carbs: 49, allergens: [], vegan: true },
  { name: 'Cardamom', aliases: ['ground cardamom'], kcal: 311, fat: 6.7, satFat: 0.6, sugar: 0, protein: 10.8, carbs: 68, allergens: [], vegan: true },
  { name: 'Cloves', aliases: ['ground cloves'], kcal: 274, fat: 13, satFat: 3.9, sugar: 2.4, protein: 6.0, carbs: 65, allergens: [], vegan: true },
  { name: 'Allspice', aliases: [], kcal: 263, fat: 8.7, satFat: 2.3, sugar: 0, protein: 6.1, carbs: 72, allergens: [], vegan: true },
  { name: 'Orange Zest', aliases: [], kcal: 97, fat: 0.2, satFat: 0, sugar: 25, protein: 1.5, carbs: 25, allergens: [], vegan: true },
  { name: 'Lemon Zest', aliases: [], kcal: 47, fat: 0.3, satFat: 0, sugar: 2.5, protein: 1.5, carbs: 16, allergens: [], vegan: true },
  { name: 'Rosewater', aliases: [], kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, allergens: [], vegan: true },
  { name: 'Orange Blossom Water', aliases: [], kcal: 0, fat: 0, satFat: 0, sugar: 0, protein: 0, carbs: 0, allergens: [], vegan: true },
  { name: 'Espresso Powder', aliases: ['instant espresso'], kcal: 353, fat: 0.5, satFat: 0.1, sugar: 0, protein: 12.2, carbs: 73, allergens: [], vegan: true },
  { name: 'Instant Coffee', aliases: [], kcal: 353, fat: 0.5, satFat: 0.1, sugar: 0, protein: 12.2, carbs: 73, allergens: [], vegan: true },
  { name: 'Malted Milk Powder', aliases: [], kcal: 410, fat: 6.5, satFat: 3.8, sugar: 38, protein: 11, carbs: 76, allergens: ['dairy', 'gluten'], vegan: false },
  { name: 'Buttermilk Powder', aliases: [], kcal: 387, fat: 6.7, satFat: 4.2, sugar: 47, protein: 33.5, carbs: 49, allergens: ['dairy'], vegan: false },
  { name: 'Corn Syrup', aliases: ['light corn syrup'], kcal: 286, fat: 0, satFat: 0, sugar: 76, protein: 0, carbs: 77, allergens: [], vegan: true },
  { name: 'Brown Rice Syrup', aliases: [], kcal: 316, fat: 0, satFat: 0, sugar: 2, protein: 0, carbs: 79, allergens: [], vegan: true },
];

export const BANANA_CAKE_TEMPLATE = {
  name: 'Banana Cake',
  category: 'Bakery' as const,
  unitWeightG: 90,
  prepMinutes: 25,
  targetTempC: 175,
  methodNotes:
    'Cream sugar and oil. Add eggs one at a time. Fold in mashed banana. Sift dry ingredients separately, fold in gently. Pour into lined tin. Bake 175°C / 347°F for 45–50 min until skewer comes out clean.',
  overheadCostKwd: 0.45,
  markupPct: 160,
  equipment: ['Deck Convection Oven (3-Tier)', 'Planetary Spiral Mixer (40L)'],
  items: [
    { id: 'fl_ap', g: 250, supplier: 'Kuwait Flour Mills' },
    { id: 'sugar_white', g: 180, supplier: 'Americana' },
    { id: 'sugar_brown_light', g: 40, supplier: 'Americana' },
    { id: 'oil_sunflower', g: 120, supplier: 'IFFCO' },
    { id: 'egg_whole', g: 150, supplier: 'Local Market Supplier' },
    { id: 'banana_mashed', g: 300, supplier: 'Local Market Supplier' },
    { id: 'yogurt_plain', g: 60, supplier: 'Rawabi' },
    { id: 'baking_powder', g: 6 },
    { id: 'baking_soda', g: 4 },
    { id: 'salt', g: 3 },
    { id: 'vanilla_extract', g: 6 },
    { id: 'cinnamon', g: 2 },
    { id: 'walnuts', g: 60, supplier: 'Al Kabeer' },
  ],
};
