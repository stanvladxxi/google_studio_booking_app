import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  Plus,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { Product, RecipeVersion } from '../types';
import { formatKwd, roundKwd } from '../utils/costing';

type DemoConnector = 'Talabat (Demo)' | 'Deliveroo (Demo)' | 'Careem (Demo)';
type DemoOrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';
type DemoSyncState = 'SYNCED' | 'PENDING' | 'FAILED' | 'REQUIRES_REVIEW';

interface DemoOrderItem {
  name: string;
  qty: number;
  unitPriceKwd: number;
  gramsPerUnit: number;
}

interface DemoOrder {
  id: string;
  orderNumber: string;
  branch: string;
  connector: DemoConnector;
  customerLabel: string;
  status: DemoOrderStatus;
  items: DemoOrderItem[];
  createdTime: string;
}

interface DemoMenuItem {
  id: string;
  name: string;
  category: string;
  approvedVersionLabel: string;
  costPerUnitKwd: number;
  sellingPriceKwd: number;
  available: boolean;
  syncStates: Record<DemoConnector, DemoSyncState>;
}

const DEMO_BRANCHES = ['Hawally Central', 'Salmiya Express', 'Kuwait City Hub'] as const;
const DEMO_CONNECTORS: DemoConnector[] = [
  'Talabat (Demo)',
  'Deliveroo (Demo)',
  'Careem (Demo)',
];

const INITIAL_DEMO_ORDERS: DemoOrder[] = [
  {
    id: 'ord_demo_1',
    orderNumber: 'TLB-4092',
    branch: 'Hawally Central',
    connector: 'Talabat (Demo)',
    customerLabel: 'Al-Shaab Block 4',
    status: 'NEW',
    items: [
      { name: 'Cardamom Brioche Box (4pc)', qty: 2, unitPriceKwd: 3.25, gramsPerUnit: 360 },
      { name: 'Cold Brew Pistachio Basque Slice', qty: 1, unitPriceKwd: 2.1, gramsPerUnit: 190 },
    ],
    createdTime: '16:42',
  },
  {
    id: 'ord_demo_2',
    orderNumber: 'DLV-8814',
    branch: 'Hawally Central',
    connector: 'Deliveroo (Demo)',
    customerLabel: 'Jabriya Block 7',
    status: 'PREPARING',
    items: [
      { name: 'Cultured Butter Kouign-Amann', qty: 4, unitPriceKwd: 1.45, gramsPerUnit: 120 },
    ],
    createdTime: '16:28',
  },
  {
    id: 'ord_demo_3',
    orderNumber: 'CRM-1129',
    branch: 'Salmiya Express',
    connector: 'Careem (Demo)',
    customerLabel: 'Salmiya Marina',
    status: 'ACCEPTED',
    items: [
      { name: 'Saffron Honey Focaccia', qty: 2, unitPriceKwd: 2.8, gramsPerUnit: 480 },
      { name: 'Cultured Butter Kouign-Amann', qty: 2, unitPriceKwd: 1.45, gramsPerUnit: 120 },
    ],
    createdTime: '16:35',
  },
  {
    id: 'ord_demo_4',
    orderNumber: 'TLB-4087',
    branch: 'Kuwait City Hub',
    connector: 'Talabat (Demo)',
    customerLabel: 'Sharq Business Tower',
    status: 'READY',
    items: [
      { name: 'Cardamom Brioche Box (4pc)', qty: 3, unitPriceKwd: 3.25, gramsPerUnit: 360 },
    ],
    createdTime: '16:15',
  },
];

export const INITIAL_DEMO_MENU: DemoMenuItem[] = [
  {
    id: 'menu_brioche',
    name: 'Cardamom Brioche Box (4pc)',
    category: 'Bakery',
    approvedVersionLabel: 'v3 · Approved',
    costPerUnitKwd: 0.92,
    sellingPriceKwd: 3.25,
    available: true,
    syncStates: {
      'Talabat (Demo)': 'SYNCED',
      'Deliveroo (Demo)': 'SYNCED',
      'Careem (Demo)': 'PENDING',
    },
  },
  {
    id: 'menu_kouign',
    name: 'Cultured Butter Kouign-Amann',
    category: 'Bakery',
    approvedVersionLabel: 'v2 · Approved',
    costPerUnitKwd: 0.38,
    sellingPriceKwd: 1.45,
    available: true,
    syncStates: {
      'Talabat (Demo)': 'SYNCED',
      'Deliveroo (Demo)': 'REQUIRES_REVIEW',
      'Careem (Demo)': 'SYNCED',
    },
  },
  {
    id: 'menu_basque',
    name: 'Cold Brew Pistachio Basque Slice',
    category: 'Confectionery',
    approvedVersionLabel: 'v4 · Approved',
    costPerUnitKwd: 0.64,
    sellingPriceKwd: 2.1,
    available: true,
    syncStates: {
      'Talabat (Demo)': 'SYNCED',
      'Deliveroo (Demo)': 'SYNCED',
      'Careem (Demo)': 'FAILED',
    },
  },
  {
    id: 'menu_focaccia',
    name: 'Saffron Honey Focaccia',
    category: 'Bakery',
    approvedVersionLabel: 'v1 · Approved',
    costPerUnitKwd: 0.78,
    sellingPriceKwd: 2.8,
    available: false,
    syncStates: {
      'Talabat (Demo)': 'PENDING',
      'Deliveroo (Demo)': 'SYNCED',
      'Careem (Demo)': 'SYNCED',
    },
  },
];

const NEXT_STATUS_ACTION: Partial<
  Record<DemoOrderStatus, { next: DemoOrderStatus; label: string }>
> = {
  NEW: { next: 'ACCEPTED', label: 'Accept Order' },
  ACCEPTED: { next: 'PREPARING', label: 'Start Prep' },
  PREPARING: { next: 'READY', label: 'Mark Ready' },
  READY: { next: 'COMPLETED', label: 'Complete' },
};

const ORDER_STATUS_TEXT_CLASS: Record<DemoOrderStatus, string> = {
  NEW: 'text-teal-800 font-semibold',
  ACCEPTED: 'text-sky-700 font-semibold',
  PREPARING: 'text-amber-700 font-semibold',
  READY: 'text-emerald-700 font-semibold',
  COMPLETED: 'text-slate-600 font-medium',
  CANCELLED: 'text-slate-400 font-medium',
  FAILED: 'text-red-700 font-semibold',
};

const SYNC_STATE_TEXT_CLASS: Record<DemoSyncState, string> = {
  SYNCED: 'text-emerald-700 font-semibold',
  PENDING: 'text-amber-700 font-semibold',
  REQUIRES_REVIEW: 'text-sky-700 font-semibold',
  FAILED: 'text-red-700 font-semibold',
};

interface OrdersPlaceholderViewProps {
  onNotify?: (msg: string, type?: 'success' | 'error') => void;
}

export function OrdersPlaceholderView({ onNotify }: OrdersPlaceholderViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [selectedConnector, setSelectedConnector] = useState<string>('All Connectors');
  const [orders, setOrders] = useState<DemoOrder[]>(INITIAL_DEMO_ORDERS);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Simulated demo connector feed active. Changes stay local until Phase 5 live endpoints.'
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const branchOk = selectedBranch === 'All Branches' || o.branch === selectedBranch;
      const connOk = selectedConnector === 'All Connectors' || o.connector === selectedConnector;
      return branchOk && connOk;
    });
  }, [orders, selectedBranch, selectedConnector]);

  const productionDemand = useMemo(() => {
    const active = filteredOrders.filter((o) =>
      ['NEW', 'ACCEPTED', 'PREPARING'].includes(o.status)
    );
    const rollup = new Map<string, { qty: number; totalGrams: number; revenueKwd: number }>();
    for (const order of active) {
      for (const item of order.items) {
        const prev = rollup.get(item.name) || { qty: 0, totalGrams: 0, revenueKwd: 0 };
        rollup.set(item.name, {
          qty: prev.qty + item.qty,
          totalGrams: prev.totalGrams + item.qty * item.gramsPerUnit,
          revenueKwd: roundKwd(prev.revenueKwd + item.qty * item.unitPriceKwd),
        });
      }
    }
    return Array.from(rollup.entries()).map(([name, vals]) => ({ name, ...vals }));
  }, [filteredOrders]);

  const handleTransitionOrder = (orderId: string, nextStatus: DemoOrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
    const target = orders.find((o) => o.id === orderId);
    const msg = `${target?.orderNumber || orderId} updated to ${nextStatus} (Demo).`;
    setStatusMessage(msg);
    onNotify?.(msg, 'success');
  };

  const handleSimulateIncomingOrder = () => {
    const branch =
      selectedBranch === 'All Branches'
        ? DEMO_BRANCHES[orders.length % DEMO_BRANCHES.length]
        : selectedBranch;
    const connector =
      selectedConnector === 'All Connectors'
        ? DEMO_CONNECTORS[orders.length % DEMO_CONNECTORS.length]
        : (selectedConnector as DemoConnector);
    const prefix =
      connector === 'Talabat (Demo)'
        ? 'TLB'
        : connector === 'Deliveroo (Demo)'
        ? 'DLV'
        : 'CRM';
    const num = 4100 + orders.length;
    const nowTime = new Date().toTimeString().slice(0, 5);
    const sampleItems: DemoOrderItem[] =
      orders.length % 2 === 0
        ? [
            { name: 'Cardamom Brioche Box (4pc)', qty: 2, unitPriceKwd: 3.25, gramsPerUnit: 360 },
            { name: 'Saffron Honey Focaccia', qty: 1, unitPriceKwd: 2.8, gramsPerUnit: 480 },
          ]
        : [
            { name: 'Cultured Butter Kouign-Amann', qty: 3, unitPriceKwd: 1.45, gramsPerUnit: 120 },
            { name: 'Cold Brew Pistachio Basque Slice', qty: 2, unitPriceKwd: 2.1, gramsPerUnit: 190 },
          ];

    const created: DemoOrder = {
      id: `ord_demo_${Date.now()}`,
      orderNumber: `${prefix}-${num}`,
      branch,
      connector,
      customerLabel: `Block ${(orders.length % 9) + 1} · Demo Customer`,
      status: 'NEW',
      items: sampleItems,
      createdTime: nowTime,
    };

    setOrders((prev) => [created, ...prev]);
    const msg = `Simulated incoming order ${created.orderNumber} via ${connector} for ${branch}.`;
    setStatusMessage(msg);
    onNotify?.(msg, 'success');
  };

  const activeQueueCount = filteredOrders.filter((o) =>
    ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)
  ).length;
  const filteredRevenueKwd = roundKwd(
    filteredOrders
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'FAILED')
      .reduce(
        (sum, o) => sum + o.items.reduce((s, i) => s + i.qty * i.unitPriceKwd, 0),
        0
      )
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-teal-700 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-900">
              Order Center (Interactive Phase 5 Demo)
            </h2>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Clickable branch queue &amp; mock delivery connector simulator (Talabat, Deliveroo, Careem — Demo only). Advance order statuses and inspect deterministic gram-level kitchen demand.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSimulateIncomingOrder}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Simulate Incoming Order (Demo)
        </button>
      </div>

      {/* Filters & KPI Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-8 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {['All Branches', ...DEMO_BRANCHES].map((branch) => (
              <button
                key={branch}
                type="button"
                onClick={() => setSelectedBranch(branch)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedBranch === branch
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {branch}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {['All Connectors', ...DEMO_CONNECTORS].map((conn) => (
              <button
                key={conn}
                type="button"
                onClick={() => setSelectedConnector(conn)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedConnector === conn
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {conn}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] text-slate-500">Active Queue</div>
            <div className="text-sm font-mono tabular-nums font-semibold text-slate-900">
              {activeQueueCount} orders
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-500">Filtered Gross (Demo)</div>
            <div className="text-sm font-mono tabular-nums font-semibold text-teal-800">
              {formatKwd(filteredRevenueKwd)}
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500 px-1">{statusMessage}</div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Clickable Branch Order Queue */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">No demo orders match this filter</p>
              <button
                type="button"
                onClick={handleSimulateIncomingOrder}
                className="px-3 py-1.5 text-xs font-medium text-teal-800 border border-teal-300 rounded-md hover:bg-teal-50"
              >
                Simulate Incoming Order (Demo)
              </button>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const orderTotal = roundKwd(
                order.items.reduce((s, i) => s + i.qty * i.unitPriceKwd, 0)
              );
              const nextAction = NEXT_STATUS_ACTION[order.status];
              return (
                <div key={order.id} className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-slate-900">
                          {order.orderNumber}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-medium text-slate-800">{order.connector}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs text-slate-600">{order.branch}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {order.customerLabel}
                        <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{order.createdTime}</span>
                        <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                        <span className={`text-xs ${ORDER_STATUS_TEXT_CLASS[order.status]}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums text-sm font-semibold text-slate-900 shrink-0">
                      {formatKwd(orderTotal)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 space-y-1 bg-slate-50 rounded-md px-3 py-2 border border-slate-200/80">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="font-mono tabular-nums font-semibold">{it.qty}x</span>{' '}
                          {it.name}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {it.qty * it.gramsPerUnit} g · {formatKwd(it.qty * it.unitPriceKwd)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {nextAction && (
                      <button
                        type="button"
                        onClick={() => handleTransitionOrder(order.id, nextAction.next)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {nextAction.label}
                      </button>
                    )}
                    {order.status !== 'COMPLETED' &&
                      order.status !== 'CANCELLED' &&
                      order.status !== 'FAILED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTransitionOrder(order.id, 'CANCELLED')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTransitionOrder(order.id, 'FAILED')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md whitespace-nowrap"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Simulate Fail
                          </button>
                        </>
                      )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Production Demand Rollup */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-semibold text-slate-900">Active Kitchen Demand</h3>
            </div>
            <span className="text-[11px] text-slate-500">NEW · ACCEPTED · PREP</span>
          </div>

          {productionDemand.length === 0 ? (
            <p className="text-xs text-slate-500">
              No active queue demand in the selected branch/connector view.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {productionDemand.map((row) => (
                <div key={row.name} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="font-mono tabular-nums text-slate-500 mt-0.5">
                      {row.totalGrams} g total batch weight
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums font-semibold text-slate-900">
                      {row.qty} units
                    </div>
                    <div className="font-mono tabular-nums text-teal-800">
                      {formatKwd(row.revenueKwd)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MenuPlaceholderViewProps {
  products?: Product[];
  versions?: RecipeVersion[];
  onNotify?: (msg: string, type?: 'success' | 'error') => void;
}

export function MenuPlaceholderView({
  products = [],
  versions = [],
  onNotify,
}: MenuPlaceholderViewProps) {
  const [menuItems, setMenuItems] = useState<DemoMenuItem[]>(INITIAL_DEMO_MENU);
  const [activeConnector, setActiveConnector] = useState<DemoConnector>('Talabat (Demo)');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Merge any real approved products (without exposing R&D ingredients to aggregator)
  const mergedMenuItems = useMemo(() => {
    const approvedReal: DemoMenuItem[] = products
      .filter((p) => p.status !== 'archived')
      .map((p) => {
        const ver =
          versions.find((v) => v.id === p.currentRecipeVersionId) ||
          versions.find((v) => v.productId === p.id);
        const unitCost =
          ver && ver.expectedYield > 0
            ? roundKwd(ver.expectedCost / ver.expectedYield)
            : 0.75;
        const sellPrice =
          p.sellingPriceKwd ||
          ver?.suggestedPriceKwd ||
          roundKwd(unitCost * 2.8);
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          approvedVersionLabel: ver
            ? `v${ver.versionNumber} · ${ver.validationStatus.replace('_', ' ')}`
            : 'v1 · linked',
          costPerUnitKwd: unitCost,
          sellingPriceKwd: sellPrice,
          available: true,
          syncStates: {
            'Talabat (Demo)': 'PENDING' as DemoSyncState,
            'Deliveroo (Demo)': 'PENDING' as DemoSyncState,
            'Careem (Demo)': 'REQUIRES_REVIEW' as DemoSyncState,
          },
        };
      });

    const existingIds = new Set(menuItems.map((m) => m.id));
    const extras = approvedReal.filter((r) => !existingIds.has(r.id));
    return [...extras, ...menuItems];
  }, [products, versions, menuItems]);

  const handleToggleAvailability = (item: DemoMenuItem) => {
    setMenuItems((prev) => {
      const exists = prev.some((m) => m.id === item.id);
      const nextAvail = !item.available;
      if (!exists) {
        return [
          {
            ...item,
            available: nextAvail,
            syncStates: {
              ...item.syncStates,
              [activeConnector]: 'PENDING',
            },
          },
          ...prev,
        ];
      }
      return prev.map((m) =>
        m.id === item.id
          ? {
              ...m,
              available: nextAvail,
              syncStates: {
                ...m.syncStates,
                [activeConnector]: 'PENDING',
              },
            }
          : m
      );
    });
    onNotify?.(
      `${item.name} marked ${item.available ? 'Out of Stock' : 'Available'} — ${activeConnector} sync pending.`,
      'success'
    );
  };

  const handlePriceStep = (item: DemoMenuItem, deltaKwd: number) => {
    const nextPrice = Math.max(0.25, roundKwd(item.sellingPriceKwd + deltaKwd));
    setMenuItems((prev) => {
      const exists = prev.some((m) => m.id === item.id);
      if (!exists) {
        return [
          {
            ...item,
            sellingPriceKwd: nextPrice,
            syncStates: {
              ...item.syncStates,
              [activeConnector]: 'REQUIRES_REVIEW',
            },
          },
          ...prev,
        ];
      }
      return prev.map((m) =>
        m.id === item.id
          ? {
              ...m,
              sellingPriceKwd: nextPrice,
              syncStates: {
                ...m.syncStates,
                [activeConnector]: 'REQUIRES_REVIEW',
              },
            }
          : m
      );
    });
  };

  const handlePushConnectorSync = (item: DemoMenuItem) => {
    setSyncingId(item.id);
    setMenuItems((prev) => {
      const exists = prev.some((m) => m.id === item.id);
      const updatedItem: DemoMenuItem = {
        ...item,
        syncStates: {
          ...item.syncStates,
          [activeConnector]: 'SYNCED',
        },
      };
      if (!exists) return [updatedItem, ...prev];
      return prev.map((m) => (m.id === item.id ? updatedItem : m));
    });
    setSyncingId(null);
    onNotify?.(
      `Synced "${item.name}" (${formatKwd(item.sellingPriceKwd)}) to ${activeConnector}.`,
      'success'
    );
  };

  const handleSyncAll = () => {
    setMenuItems((prev) =>
      prev.map((m) => ({
        ...m,
        syncStates: {
          ...m.syncStates,
          [activeConnector]: 'SYNCED',
        },
      }))
    );
    onNotify?.(`All menu items pushed to ${activeConnector} (Demo).`, 'success');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <UtensilsCrossed className="w-5 h-5 text-teal-700 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-900">
              Master Menu &amp; Connector Sync (Interactive Phase 5 Demo)
            </h2>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Clickable KWD menu pricing, availability toggles, and demo aggregator connector sync states (Talabat, Deliveroo, Careem — Demo). R&amp;D ingredient formulations remain isolated from aggregator access.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSyncAll}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync All to {activeConnector}
        </button>
      </div>

      {/* Connector Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start overflow-x-auto">
          {DEMO_CONNECTORS.map((conn) => (
            <button
              key={conn}
              type="button"
              onClick={() => setActiveConnector(conn)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeConnector === conn
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-teal-700" />
              {conn}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Click prices or availability to test connector sync states</span>
        </div>
      </div>

      {/* Clickable Menu Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">Master Menu Item</th>
              <th className="py-3 px-4">Version Ref</th>
              <th className="py-3 px-4 text-right">Menu Price (KWD)</th>
              <th className="py-3 px-4 text-right">Est. Margin</th>
              <th className="py-3 px-4">Availability</th>
              <th className="py-3 px-4">{activeConnector} Sync</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {mergedMenuItems.map((item) => {
              const marginPct =
                item.sellingPriceKwd > 0
                  ? Math.round(
                      ((item.sellingPriceKwd - item.costPerUnitKwd) /
                        item.sellingPriceKwd) *
                        1000
                    ) / 10
                  : 0;
              const syncState = item.syncStates[activeConnector];
              return (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.category}</div>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600">
                    {item.approvedVersionLabel}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePriceStep(item, -0.25)}
                        className="px-2 py-0.5 text-xs border border-slate-300 rounded hover:bg-slate-100 font-mono"
                        title="Decrease KWD 0.250"
                      >
                        -
                      </button>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 min-w-20 text-center">
                        {formatKwd(item.sellingPriceKwd)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePriceStep(item, 0.25)}
                        className="px-2 py-0.5 text-xs border border-slate-300 rounded hover:bg-slate-100 font-mono"
                        title="Increase KWD 0.250"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                    {marginPct}%
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleToggleAvailability(item)}
                      className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        item.available
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {item.available ? 'Available' : 'Paused (86)'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span className={SYNC_STATE_TEXT_CLASS[syncState]}>{syncState}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      disabled={syncingId === item.id}
                      onClick={() => handlePushConnectorSync(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-white border border-teal-300 rounded-md hover:bg-teal-50 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Push Sync (Demo)
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
