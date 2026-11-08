# High-Conversion Cash-on-Delivery (COD) Checkout Guide
> **Engineered for Algerian & Regional E-Commerce Markets**

---

## 1. The Anatomy of 1-Page COD Checkout

In COD markets, traditional multi-step checkouts (asking for account creation, separate billing addresses, and credit card entry) result in catastrophic drop-off rates (often > 80%).

This template implements a **frictionless single-page COD checkout**:

```
+-----------------------------------------------------------+
|                    1-PAGE COD CHECKOUT                    |
+-----------------------------------------------------------+
| [ Cart Items Summary & Price Breakdown ]                 |
|                                                           |
| 1. Customer Information:                                  |
|    - Full Name                                            |
|    - Mobile Phone (05/06/07 xx xx xx xx)                  |
|    - Secondary Phone (Optional backup)                    |
|                                                           |
| 2. Shipping Destination:                                  |
|    - Wilaya [ Dropdown (01 to 58) ]                       |
|    - Commune [ Filtered Cascading Dropdown ]              |
|    - Delivery Method: (•) À Domicile (Home)               |
|                       ( ) Stop-Desk (Bureau / Centre)     |
|    - Street Address / Landmark                            |
|                                                           |
| 3. Payment Notice:                                        |
|    "💵 Paiement à la livraison à la réception du colis"   |
|                                                           |
| [ CONFIRMER MA COMMANDE — TOTAL: 14,500 DZD ]             |
+-----------------------------------------------------------+
```

---

## 2. Phone Number Validation Rules

The customer's phone number is the primary operational anchor of a COD order. Invalid phone numbers directly cause wasted shipping fees and unfulfillable orders.

### Algerian Mobile Format Specifications:
- **Length:** Exactly 10 digits (when entered in local format) or 12 digits (with country code `+213`).
- **Valid Operator Prefixes:**
  - `05` — Ooredoo
  - `06` — Mobilis
  - `07` — Djezzy
- **Sanitization Pipeline:**
  1. Strip all non-numeric characters (spaces, dashes, parentheses).
  2. If starting with `+213` or `00213`, normalize to local `0` prefix.
  3. Validate against regex: `/^(05|06|07)[0-9]{8}$/`.

```typescript
// Validation snippet (Zod)
import { z } from "zod";

export const algerianPhoneSchema = z
  .string()
  .transform((val) => val.replace(/[\s\-\(\)\.]/g, ""))
  .transform((val) => {
    if (val.startsWith("+213")) return "0" + val.slice(4);
    if (val.startsWith("00213")) return "0" + val.slice(5);
    if (val.startsWith("213")) return "0" + val.slice(3);
    return val;
  })
  .refine((val) => /^(05|06|07)[0-9]{8}$/.test(val), {
    message: "Numéro de téléphone mobile algérien invalide (ex: 0550123456)",
  });
```

---

## 3. Wilaya & Commune Cascading Logistics

The dataset in `src/lib/algeria-cities.ts` provides complete coverage of all 58 Wilayas and their associated communes:

```typescript
export interface Wilaya {
  code: string;               // "16"
  name: string;               // "Alger"
  nameAr?: string;            // "الجزائر"
  deliveryFeeDomicile: number;// 600 DZD
  deliveryFeeStopDesk: number;// 350 DZD
  communes: string[];         // ["Hydra", "El Biar", "Bab El Oued", ...]
}
```

### Dynamic Behavior:
1. **Selection Reaction:** When the user picks a Wilaya, the Commune dropdown instantly filters to display only valid communes for that specific province.
2. **Dynamic Fee Calculation:**
   - If `deliveryMethod === 'DOMICILE'`, the delivery fee updates to `wilaya.deliveryFeeDomicile`.
   - If `deliveryMethod === 'STOP_DESK'`, the delivery fee updates to `wilaya.deliveryFeeStopDesk`.
   - If free shipping threshold is met (`subtotal >= freeShippingThreshold`), delivery fee automatically drops to `0`.
3. **Total Recalculation:** `Total = Subtotal + DeliveryFee`.

---

## 4. Order Creation & Audit Timeline

When the buyer clicks **"Confirmer ma commande"**, the request executes a Server Action (`submitOrderAction`):

1. **Input Validation:** Zod validates customer information, cart snapshot, and shipping selection.
2. **Customer Upsert:** Finds or creates a customer record indexed by sanitized phone number.
3. **Order Generation:** Creates an order record with a human-readable order number:
   - Format: `[PREFIX]-[YYMMDD]-[RANDOM]` (e.g. `KDJ-261107-742`).
   - Sets initial status to `PENDING`.
   - Sets payment status to `UNPAID` (COD).
4. **Order Items Snapshot:** Inserts order item snapshots capturing the exact product name, variant, and unit price at time of purchase.
5. **Initial Delivery Stub:** Creates a delivery record in `PENDING` state linked to the order.
6. **Audit Timeline Event:** Adds an initial event to `order_timeline_events`:
   - Title: `Commande créée via la boutique en ligne`
   - Actor: `CUSTOMER`
7. **Instant Operator Alert:** Dispatches an asynchronous Telegram notification to the store management group with customer name, phone, Wilaya, and order value.
8. **Redirect:** Redirects the buyer to `/checkout/confirmation?orderNumber=...` displaying order summary and contact details.

---

## 5. Operator Phone Confirmation Protocol

Before creating a courier shipment, store operators follow this workflow:

1. **Dashboard Review:** Open `/admin/orders` to view `PENDING` orders.
2. **Click-to-Call:** Call the customer to verify:
   - Genuine intent to purchase.
   - Exact address / landmark for courier delivery.
   - Selected variant (size, color, material).
3. **Status Update:**
   - If verified: Mark order as `CONFIRMED`.
   - If customer unreachable: Schedule retry or mark `CANCELLED`.
4. **Dispatch:** Generate courier tracking label via the Courier Adapter.

