import {
  doc,
  getDocs,
  collection,
  serverTimestamp,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { KitchenEquipment, KitchenSpace, StaffMember } from '../types';

export const DEFAULT_SPACES: Omit<KitchenSpace, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'space_pastry_suite',
    name: 'Pastry & Lamination Suite',
    zone: 'Pastry',
    sqFt: 840,
    capacity: 6,
    hourlyRate: 85,
    description:
      'Climate-stabilized marble lamination benches, 3-deck stone hearth oven, and proofers.',
    imagePath: 'pastry_suite',
    isActive: true,
  },
  {
    id: 'space_hotline_bay',
    name: 'Hot Line & Convection Bay',
    zone: 'Hot Line',
    sqFt: 1120,
    capacity: 8,
    hourlyRate: 95,
    description:
      'Full 16-ft Type-I hood line with dual Rational combi ovens, 6-burner induction suite, and kettle.',
    imagePath: 'hotline_bay',
    isActive: true,
  },
  {
    id: 'space_cold_prep',
    name: 'Cold Prep & Packaging Room',
    zone: 'Cold Prep',
    sqFt: 680,
    capacity: 5,
    hourlyRate: 70,
    description:
      'Chilled 10°C assembly room with direct walk-in cooler access, sealing line, and labeling bench.',
    imagePath: 'cold_prep',
    isActive: true,
  },
  {
    id: 'space_sensory_rd',
    name: 'R&D Sensory Test Kitchen',
    zone: 'R&D Lab',
    sqFt: 540,
    capacity: 4,
    hourlyRate: 75,
    description:
      'Precision culinary lab island with 0.1g micro-balances, sous-vide circulators, and tasting booths.',
    imagePath: 'sensory_rd',
    isActive: true,
  },
];

export const DEFAULT_EQUIPMENT: Omit<KitchenEquipment, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'eq_rational_combi',
    name: 'Rational iCombi Pro 10-Pan',
    category: 'Thermal',
    spec: 'Steam / Convection / 30–300°C probe control',
    hourlyRate: 24,
    totalUnits: 2,
    isActive: true,
  },
  {
    id: 'eq_hobart_60qt',
    name: 'Hobart 60Qt Planetary Mixer',
    category: 'Mixing',
    spec: '4-speed heavy dough hook, whip, and flat beater',
    hourlyRate: 18,
    totalUnits: 2,
    isActive: true,
  },
  {
    id: 'eq_blast_chiller',
    name: 'Irinox Blast Chiller BC-12',
    category: 'Cooling',
    spec: '+90°C to +3°C in 90 min / -18°C shock freeze',
    hourlyRate: 22,
    totalUnits: 1,
    isActive: true,
  },
  {
    id: 'eq_vacuum_sealer',
    name: 'Multivac Chamber Vacuum Sealer',
    category: 'Packaging',
    spec: 'Double-seal bar, MAP gas flush capable',
    hourlyRate: 15,
    totalUnits: 2,
    isActive: true,
  },
  {
    id: 'eq_pacojet_4',
    name: 'Pacojet 4 Micro-Puree System',
    category: 'Precision',
    spec: 'Overpressure 1.2 bar pacotizing with 12 beakers',
    hourlyRate: 20,
    totalUnits: 2,
    isActive: true,
  },
  {
    id: 'eq_stone_deck',
    name: 'Polin 3-Deck Stone Hearth Oven',
    category: 'Thermal',
    spec: 'Independent steam injection per chamber',
    hourlyRate: 28,
    totalUnits: 1,
    isActive: true,
  },
];

export const DEFAULT_STAFF: Omit<StaffMember, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'staff_elena_vance',
    staffCode: 'STF-101',
    name: 'Elena Vance',
    role: 'Sous Chef',
    station: 'Hot Line & Convection Bay',
    shift: 'Morning',
    linkedUid: '',
    isActive: true,
  },
  {
    id: 'staff_marcus_chen',
    staffCode: 'STF-102',
    name: 'Marcus Chen',
    role: 'R&D Baker',
    station: 'Pastry & Lamination Suite',
    shift: 'Morning',
    linkedUid: '',
    isActive: true,
  },
  {
    id: 'staff_nadia_okafor',
    staffCode: 'STF-103',
    name: 'Nadia Okafor',
    role: 'Sanitation Lead',
    station: 'Cold Prep & Packaging Room',
    shift: 'Midday',
    linkedUid: '',
    isActive: true,
  },
  {
    id: 'staff_david_kessler',
    staffCode: 'STF-104',
    name: 'David Kessler',
    role: 'Facility Tech',
    station: 'All Zones',
    shift: 'Evening',
    linkedUid: '',
    isActive: true,
  },
  {
    id: 'staff_sofia_morales',
    staffCode: 'STF-105',
    name: 'Sofia Morales',
    role: 'Prep Cook',
    station: 'R&D Sensory Test Kitchen',
    shift: 'Midday',
    linkedUid: '',
    isActive: true,
  },
];

export async function seedFacilityCatalogIfEmpty(): Promise<boolean> {
  try {
    const spacesSnap = await getDocs(query(collection(db, 'spaces'), limit(1)));
    const equipSnap = await getDocs(query(collection(db, 'equipment'), limit(1)));
    const staffSnap = await getDocs(query(collection(db, 'staff'), limit(1)));

    if (!spacesSnap.empty && !equipSnap.empty && !staffSnap.empty) {
      return false;
    }

    const batch = writeBatch(db);
    const now = serverTimestamp();

    if (spacesSnap.empty) {
      for (const space of DEFAULT_SPACES) {
        batch.set(doc(db, 'spaces', space.id), {
          ...space,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (equipSnap.empty) {
      for (const eq of DEFAULT_EQUIPMENT) {
        batch.set(doc(db, 'equipment', eq.id), {
          ...eq,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (staffSnap.empty) {
      for (const member of DEFAULT_STAFF) {
        const { id: staffDocId, ...memberData } = member;
        batch.set(doc(db, 'staff', staffDocId), {
          ...memberData,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'spaces/equipment/staff');
  }
}
