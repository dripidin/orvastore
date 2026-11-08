import {
  Boxes,
  ChartBar,
  Forklift,
  Gauge,
  Globe,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  Package,
  Settings2,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/** Classic admin tools → Next.js routes (no demo/template fluff). */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "ORVA STORE",
    items: [
      {
        id: "orders",
        title: "Orders Management",
        url: "/dashboard/ecommerce#orders",
        icon: ShoppingBag,
      },
      {
        id: "delivery-management",
        title: "Delivery & Tariffs (58 Wilayas)",
        url: "/dashboard/logistics",
        icon: Forklift,
      },
      {
        id: "analytics",
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: Gauge,
      },
      {
        id: "store-traffic",
        title: "Store Traffic",
        url: "/dashboard/store-traffic",
        icon: ChartBar,
      },
      {
        id: "settings",
        title: "Settings & Carriers",
        url: "/dashboard/settings",
        icon: Settings2,
      },
    ],
  },
  {
    id: 2,
    label: "PRODUCT AND STOCK",
    items: [
      {
        id: "products",
        title: "Products & Inventory",
        url: "/dashboard/products",
        icon: Boxes,
      },
      {
        id: "top-products",
        title: "Top Products",
        url: "/dashboard/top-products",
        icon: Package,
      },
      {
        id: "product-designer",
        title: "Product Page Designer",
        url: "/dashboard/products/designer",
        icon: LayoutTemplate,
      },
      {
        id: "product-demand",
        title: "Demand by Wilaya",
        url: "/dashboard/products/demand/",
        icon: MapPin,
      },
      {
        id: "store-pages-sitemap",
        title: "Store Pages & Sitemap",
        url: "/dashboard/products/pages/",
        icon: Globe,
      },
    ],
  },
];
