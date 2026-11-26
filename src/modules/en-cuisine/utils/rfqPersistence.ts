import {
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../../../firebase';
import {
  LIMITS,
  MaterialCategory,
  MaterialUnit,
  StorageZone,
  SupplierQuote,
  SupplierQuoteStatus,
  SupplierRfq,
  SupplierRfqRequestType,
  SupplierRfqTradeTerms,
  clampStr,
  sanitizeId,
} from '../../../types';
import { LibraryIngredient } from '../types';
import { saveIngredientLibraryItem } from './libraryPersistence';

export async function createSupplierRfq(params: {
  buyerUid: string;
  buyerName: string;
  requestType: SupplierRfqRequestType;
  categoryPath: string;
  itemName: string;
  quantity: number;
  unit: string;
  targetUnitPriceKwd: number;
  specifications: string;
  certifications: string[];
  tradeTerms: SupplierRfqTradeTerms;
  paymentTerms: string;
  deliveryCity: string;
  neededByDate: string;
  sourceRecipeName?: string;
}): Promise<{ id: string; rfqCode: string }> {
  const id = sanitizeId(`rfq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const rfqCode = `RFQ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`;
  const now = serverTimestamp();

  const payload = {
    id,
    rfqCode,
    buyerUid: params.buyerUid,
    buyerName: clampStr(params.buyerName || 'Kitchen Buyer', 100),
    requestType: params.requestType,
    categoryPath: clampStr(params.categoryPath, 180),
    itemName: clampStr(params.itemName, 140),
    quantity: Math.max(0.01, Number(params.quantity) || 1),
    unit: clampStr(params.unit || 'kg', 24),
    targetUnitPriceKwd: Math.max(0, Number(params.targetUnitPriceKwd) || 0),
    specifications: clampStr(params.specifications || '', 1500),
    certifications: (params.certifications || []).slice(0, 10).map((c) => clampStr(c, 40)),
    tradeTerms: params.tradeTerms,
    paymentTerms: clampStr(params.paymentTerms || 'Net 30', 120),
    deliveryCity: clampStr(params.deliveryCity || 'Kuwait City', 80),
    neededByDate: clampStr(params.neededByDate || '', 32),
    sourceRecipeName: clampStr(params.sourceRecipeName || '', 140),
    status: 'open',
    awardedQuoteId: '',
    createdAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'supplierRfqs', id), payload);

  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  batch.set(doc(db, 'logs', logId), {
    ownerId: params.buyerUid,
    actorName: clampStr(params.buyerName || 'Kitchen Buyer', LIMITS.NAME_MAX),
    eventType: 'material',
    severity: 'info',
    station: 'Supplier RFQ Portal',
    tempReadingC: '--',
    message: clampStr(
      `Posted ${rfqCode} (${params.requestType}): ${params.quantity} ${params.unit} of ${params.itemName}${params.sourceRecipeName ? ` for ${params.sourceRecipeName}` : ''}.`,
      LIMITS.LOG_MSG_MAX
    ),
    bookingId: '',
    createdAt: now,
  });

  try {
    await batch.commit();
    return { id, rfqCode };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `supplierRfqs/${id}`);
  }
}

export async function submitSupplierQuote(params: {
  rfq: SupplierRfq;
  supplierUid: string;
  supplierCompany: string;
  supplierContact: string;
  originCountry: string;
  quotedUnitPriceKwd: number;
  moqQty: number;
  moqUnit: string;
  leadTimeDays: number;
  shippingTerms: string;
  paymentTerms: string;
  validUntilDate: string;
  warrantyOrShelfLife: string;
  notes: string;
}): Promise<string> {
  const id = sanitizeId(`sq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const now = serverTimestamp();

  const payload = {
    id,
    rfqId: params.rfq.id,
    buyerUid: params.rfq.buyerUid,
    supplierUid: params.supplierUid,
    supplierCompany: clampStr(params.supplierCompany || 'Verified Supplier', 120),
    supplierContact: clampStr(params.supplierContact || '', 100),
    originCountry: clampStr(params.originCountry || 'Kuwait', 80),
    quotedUnitPriceKwd: Math.max(0, Number(params.quotedUnitPriceKwd) || 0),
    moqQty: Math.max(0.01, Number(params.moqQty) || 1),
    moqUnit: clampStr(params.moqUnit || params.rfq.unit || 'kg', 24),
    leadTimeDays: Math.max(0, Math.round(Number(params.leadTimeDays) || 0)),
    shippingTerms: clampStr(params.shippingTerms || params.rfq.tradeTerms, 120),
    paymentTerms: clampStr(params.paymentTerms || 'Net 30', 120),
    validUntilDate: clampStr(params.validUntilDate || '', 32),
    warrantyOrShelfLife: clampStr(params.warrantyOrShelfLife || '', 160),
    notes: clampStr(params.notes || '', 1000),
    status: 'submitted' as SupplierQuoteStatus,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'supplierQuotes', id), payload);
    // If the buyer themselves is logging a received quote or updating status, buyer can mark RFQ 'quoted'
    if (params.supplierUid === params.rfq.buyerUid && params.rfq.status === 'open') {
      batch.update(doc(db, 'supplierRfqs', params.rfq.id), {
        status: 'quoted',
        updatedAt: now,
      });
    }
    await batch.commit();
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `supplierQuotes/${id}`);
  }
}

export async function updateSupplierQuoteOffer(params: {
  quoteId: string;
  quotedUnitPriceKwd: number;
  moqQty: number;
  moqUnit: string;
  leadTimeDays: number;
  shippingTerms: string;
  paymentTerms: string;
  validUntilDate: string;
  warrantyOrShelfLife: string;
  notes: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'supplierQuotes', params.quoteId), {
      quotedUnitPriceKwd: Math.max(0, Number(params.quotedUnitPriceKwd) || 0),
      moqQty: Math.max(0.01, Number(params.moqQty) || 1),
      moqUnit: clampStr(params.moqUnit || 'kg', 24),
      leadTimeDays: Math.max(0, Math.round(Number(params.leadTimeDays) || 0)),
      shippingTerms: clampStr(params.shippingTerms, 120),
      paymentTerms: clampStr(params.paymentTerms, 120),
      validUntilDate: clampStr(params.validUntilDate, 32),
      warrantyOrShelfLife: clampStr(params.warrantyOrShelfLife, 160),
      notes: clampStr(params.notes, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `supplierQuotes/${params.quoteId}`);
  }
}

export async function setQuoteReviewStatus(
  quoteId: string,
  status: 'shortlisted' | 'declined'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'supplierQuotes', quoteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `supplierQuotes/${quoteId}`);
  }
}

export async function awardSupplierQuote(params: {
  rfq: SupplierRfq;
  quote: SupplierQuote;
  otherQuotes: SupplierQuote[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(doc(db, 'supplierRfqs', params.rfq.id), {
    status: 'awarded',
    awardedQuoteId: params.quote.id,
    updatedAt: now,
  });

  batch.update(doc(db, 'supplierQuotes', params.quote.id), {
    status: 'accepted',
    updatedAt: now,
  });

  for (const q of params.otherQuotes) {
    if (q.id !== params.quote.id && q.status !== 'declined') {
      batch.update(doc(db, 'supplierQuotes', q.id), {
        status: 'declined',
        updatedAt: now,
      });
    }
  }

  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  batch.set(doc(db, 'logs', logId), {
    ownerId: params.actorUid,
    actorName: clampStr(params.actorName || 'Buyer', LIMITS.NAME_MAX),
    eventType: 'material',
    severity: 'info',
    station: 'Supplier RFQ Portal',
    tempReadingC: '--',
    message: clampStr(
      `Awarded ${params.rfq.rfqCode} (${params.rfq.itemName}) to ${params.quote.supplierCompany} at KWD ${params.quote.quotedUnitPriceKwd.toFixed(3)}/${params.rfq.unit}.`,
      LIMITS.LOG_MSG_MAX
    ),
    bookingId: '',
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `supplierRfqs/${params.rfq.id}`);
  }
}

export async function closeSupplierRfq(rfqId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'supplierRfqs', rfqId), {
      status: 'closed',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `supplierRfqs/${rfqId}`);
  }
}

export async function deleteSupplierRfq(rfqId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'supplierRfqs', rfqId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `supplierRfqs/${rfqId}`);
  }
}

export async function createPoFromAwardedQuote(params: {
  uid: string;
  userName: string;
  rfq: SupplierRfq;
  quote: SupplierQuote;
}): Promise<string> {
  const { uid, userName, rfq, quote } = params;
  const orderQty = Math.max(rfq.quantity, quote.moqQty);
  const unitNorm: MaterialUnit =
    rfq.unit === 'kg' || rfq.unit === 'g' || rfq.unit === 'L' || rfq.unit === 'mL'
      ? (rfq.unit as MaterialUnit)
      : 'units';
  const category: MaterialCategory =
    rfq.requestType === 'packaging'
      ? 'Packaging'
      : rfq.categoryPath.toLowerCase().includes('dairy')
      ? 'Dairy & Fats'
      : rfq.categoryPath.toLowerCase().includes('flour')
      ? 'Flour & Dry'
      : 'Specialty';
  const storageZone: StorageZone =
    category === 'Dairy & Fats' ? 'Walk-In Cooler' : 'Dry Pantry';

  const subtotalKwd = Number((orderQty * quote.quotedUnitPriceKwd).toFixed(3));
  const deliveryFeeKwd = quote.shippingTerms.toLowerCase().includes('ddp') ? 0 : 2.5;
  const totalKwd = Number((subtotalKwd + deliveryFeeKwd).toFixed(3));
  const orderId = sanitizeId(`po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const orderCode = `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`;
  const expectedDate = new Date(
    Date.now() + Math.max(1, quote.leadTimeDays || 3) * 86400000
  )
    .toISOString()
    .slice(0, 10);

  const gramsTotal =
    unitNorm === 'kg' || unitNorm === 'L'
      ? Math.round(orderQty * 1000)
      : Math.round(orderQty);

  const batch = writeBatch(db);
  batch.set(doc(db, 'materialOrders', orderId), {
    id: orderId,
    ownerId: uid,
    orderedByName: clampStr(userName || 'Buyer', 100),
    orderCode,
    supplier: clampStr(quote.supplierCompany, 100),
    sourceProductId: '',
    sourceVersionLabel: clampStr(rfq.rfqCode, 48),
    items: [
      {
        materialName: clampStr(rfq.itemName, 100),
        category,
        quantity: Number(orderQty.toFixed(2)),
        unit: unitNorm,
        gramsTotal,
        unitCostKwd: Number(quote.quotedUnitPriceKwd.toFixed(3)),
        lineTotalKwd: subtotalKwd,
        storageZone,
      },
    ],
    subtotalKwd,
    deliveryFeeKwd,
    totalKwd,
    status: 'ordered',
    expectedDate,
    notes: clampStr(
      `Generated from awarded ${rfq.rfqCode} (${quote.supplierCompany} · ${quote.shippingTerms}).`,
      400
    ),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return orderCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `materialOrders/${orderId}`);
  }
}

export async function addQuotedIngredientToLibrary(params: {
  uid: string;
  userName: string;
  rfq: SupplierRfq;
  quote: SupplierQuote;
}): Promise<LibraryIngredient> {
  const { uid, userName, rfq, quote } = params;
  const pathLower = rfq.categoryPath.toLowerCase();
  const cat = pathLower.includes('dairy')
    ? 'Eggs & Dairy'
    : pathLower.includes('flour')
    ? 'Flours'
    : pathLower.includes('fat') || pathLower.includes('oil')
    ? 'Fats & Oils'
    : pathLower.includes('sugar')
    ? 'Sugars & Sweeteners'
    : pathLower.includes('emulsifier')
    ? 'Emulsifiers'
    : pathLower.includes('preservative')
    ? 'Preservatives'
    : pathLower.includes('colour') || pathLower.includes('flavor')
    ? 'Colours'
    : pathLower.includes('packaging')
    ? 'Packing Materials'
    : 'Salt & Misc';

  const costPerKg =
    rfq.unit === 'g'
      ? quote.quotedUnitPriceKwd * 1000
      : quote.quotedUnitPriceKwd;

  const newIng: LibraryIngredient = {
    id: sanitizeId(`rfq_ing_${rfq.itemName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}_${Date.now().toString(36)}`),
    name: clampStr(rfq.itemName, 100),
    cat,
    custom: true,
    vegan: !pathLower.includes('dairy') && !pathLower.includes('meat'),
    allergens: pathLower.includes('dairy') ? ['dairy'] : [],
    costKg: Number(costPerKg.toFixed(3)),
    wastagePct: 0,
    bulkQty: rfq.quantity,
    bulkUnit: rfq.unit === 'g' ? 'g' : 'kg',
    bulkCost: Number((rfq.quantity * quote.quotedUnitPriceKwd).toFixed(3)),
    bulkCurrency: 'KWD',
    kcal: 0,
    fat: 0,
    satFat: 0,
    sugar: 0,
    protein: 0,
    carbs: 0,
    note: `Quoted via ${rfq.rfqCode} by ${quote.supplierCompany} (${quote.shippingTerms})`,
  };

  await saveIngredientLibraryItem({
    uid,
    userName,
    item: newIng,
    stockQty: 0,
    history: [],
    logMessage: `Added "${newIng.name}" to Ingredient Library from awarded quote ${rfq.rfqCode} (KWD ${costPerKg.toFixed(3)}/kg).`,
  });

  return newIng;
}
