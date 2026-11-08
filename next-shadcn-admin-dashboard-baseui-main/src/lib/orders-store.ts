/**
 * ORVA Store — Orders In-Memory & Persistent Fallback Store & Utilities
 * Persists fallback orders to src/data/fallback-orders.json and synchronizes with globalThis
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface FallbackOrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerPhone2: string | null;
  wilayaCode: number;
  wilayaName: string;
  communeName: string;
  deliveryType: 'DOMICILE' | 'STOP_DESK';
  deliveryAddress: string;
  packId: string;
  productName: string;
  productPrice: number;
  shippingFee: number;
  totalPayable: number;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
  originHub: 'BISKRA_07';
  createdAt: string;
  remarks?: any[];
  isSwitched?: boolean;
  conversionCount?: number;
  sourceOrderId?: string;
}

interface GlobalOrdersStorage {
  __fallbackOrdersStore?: FallbackOrderRecord[];
}

const globalForOrders = globalThis as unknown as GlobalOrdersStorage;

function getFallbackFilePath(): string {
  const cwd = process.cwd();
  // Check if running in next-shadcn-admin-dashboard-baseui-main
  const candidate1 = path.join(cwd, 'src', 'data', 'fallback-orders.json');
  if (fs.existsSync(candidate1)) {
    return candidate1;
  }
  // Check if running from workspace root
  const candidate2 = path.join(cwd, 'next-shadcn-admin-dashboard-baseui-main', 'src', 'data', 'fallback-orders.json');
  if (fs.existsSync(candidate2)) {
    return candidate2;
  }
  // Fallback to directory existence
  if (fs.existsSync(path.join(cwd, 'src', 'data'))) {
    return candidate1;
  }
  if (fs.existsSync(path.join(cwd, 'next-shadcn-admin-dashboard-baseui-main', 'src', 'data'))) {
    return candidate2;
  }
  return candidate1;
}

export function getStoredFallbackOrders(): FallbackOrderRecord[] {
  const filePath = getFallbackFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      if (data.trim()) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          globalForOrders.__fallbackOrdersStore = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[Orders Store File Read Error]:', err);
  }

  if (Array.isArray(globalForOrders.__fallbackOrdersStore)) {
    return globalForOrders.__fallbackOrdersStore;
  }

  return [];
}

export function saveAllFallbackOrders(orders: FallbackOrderRecord[]): void {
  globalForOrders.__fallbackOrdersStore = orders;
  const filePath = getFallbackFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Orders Store File Write Error]:', err);
  }
}

export function saveFallbackOrder(order: FallbackOrderRecord): void {
  const orders = getStoredFallbackOrders();
  const existingIdx = orders.findIndex(
    (o) => (o.id && o.id === order.id) || (o.orderNumber && o.orderNumber === order.orderNumber)
  );
  if (existingIdx >= 0) {
    orders[existingIdx] = order;
  } else {
    orders.unshift(order);
  }
  saveAllFallbackOrders(orders);
}

export const fallbackOrdersStore: FallbackOrderRecord[] = new Proxy([] as FallbackOrderRecord[], {
  get(_target, prop) {
    const list = getStoredFallbackOrders();
    if (prop === 'length') return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (prop === 'push') {
      return (...items: FallbackOrderRecord[]) => {
        for (const item of items) {
          saveFallbackOrder(item);
        }
        return getStoredFallbackOrders().length;
      };
    }
    if (prop === 'unshift') {
      return (...items: FallbackOrderRecord[]) => {
        for (const item of items) {
          saveFallbackOrder(item);
        }
        return getStoredFallbackOrders().length;
      };
    }
    const val = (list as any)[prop];
    if (typeof val === 'function') {
      return val.bind(list);
    }
    return val;
  },
  set(_target, prop, value) {
    const list = getStoredFallbackOrders();
    (list as any)[prop] = value;
    saveAllFallbackOrders(list);
    return true;
  },
  has(_target, prop) {
    const list = getStoredFallbackOrders();
    return prop in list;
  },
  ownKeys(_target) {
    const list = getStoredFallbackOrders();
    return Reflect.ownKeys(list);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const list = getStoredFallbackOrders();
    return Reflect.getOwnPropertyDescriptor(list, prop);
  },
});

export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomHex = '';
  for (let i = 0; i < 4; i++) {
    randomHex += chars[crypto.randomInt(0, chars.length)];
  }
  return `ORV-${dateStr}-${randomHex}`;
}
