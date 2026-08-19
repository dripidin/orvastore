/**
 * TypeScript Type Definitions for Orders & Supabase E-Commerce Database Schema
 */

export type OrderStatus =
    | 'pending'
    | 'confirmed'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'مؤكد في Redex'
    | 'prete_a_expedier'
    | 'vers_wilaya';

export interface OrderItem {
    id?: string;
    orderId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    createdAt?: string;
}

export interface Order {
    id?: string;
    orderId: string;
    storeId: 'tnt_clock' | 'yamahasac' | string;
    fullName: string;
    phone: string;
    wilaya: string;
    commune?: string;
    deliveryType: 'توصيل للمنزل' | 'توصيل للمكتب (Stop Desk)' | string;
    deliveryTime?: string;
    quantity: number;
    productName: string;
    productTotal: string;
    shippingFee: string;
    priceNum: number;
    grandTotal: string;
    status: OrderStatus;
    in_redex: boolean;
    redex_tracking_code?: string | null;
    notes?: string;
    remarks?: Array<{ text: string; date: string }>;
    clientIp?: string;
    deviceId?: string;
    date?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface RateLimitRecord {
    id?: string;
    ip: string;
    deviceId: string;
    createdAt: string;
}
