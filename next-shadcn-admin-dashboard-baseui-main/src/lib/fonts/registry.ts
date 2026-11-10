import { Geist } from "next/font/google";
import localFont from "next/font/local";

export const thmanyahSans = localFont({
  src: [
    { path: "./thmanyah/thmanyahsans-Light.woff2", weight: "300", style: "normal" },
    { path: "./thmanyah/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./thmanyah/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./thmanyah/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
    { path: "./thmanyah/thmanyahsans-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-thmanyah",
  display: "swap",
});

export const tajawal = localFont({
  src: [
    { path: "./tajawal/Tajawal-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "./tajawal/Tajawal-Light.ttf", weight: "300", style: "normal" },
    { path: "./tajawal/Tajawal-Regular.ttf", weight: "400", style: "normal" },
    { path: "./tajawal/Tajawal-Medium.ttf", weight: "500", style: "normal" },
    { path: "./tajawal/Tajawal-Bold.ttf", weight: "700", style: "normal" },
    { path: "./tajawal/Tajawal-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "./tajawal/Tajawal-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-tajawal",
  display: "swap",
});

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const fontRegistry = {
  thmanyah: {
    label: "Thmanyah Sans (عربي)",
    font: thmanyahSans,
  },
  geist: {
    label: "Geist (Latin)",
    font: geist,
  },
  tajawal: {
    label: "Tajawal (عربي)",
    font: tajawal,
  },
} as const;

export type FontKey = keyof typeof fontRegistry;

export const fontKeys = Object.keys(fontRegistry) as FontKey[];

export const fontVars = Object.values(fontRegistry)
  .map(({ font }) => font.variable)
  .join(" ");

export const fontOptions = fontKeys.map((key) => ({
  key,
  label: fontRegistry[key].label,
}));
