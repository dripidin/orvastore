import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers & Delivery",
  description: "Customers and Delivery Operations Tracking — ORVA Store",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

