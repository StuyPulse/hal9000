import type { Metadata } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { AdaptivePageTitle } from "@/components/adaptive-page-title";
import { OfflineSupport } from "@/components/offline-support";
import { Analytics } from "@vercel/analytics/next";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap", variable: "--font-manrope" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-dm-mono" });

export const metadata: Metadata = { title: "HAL9000 | StuyPulse Scouting", description: "Fast, reliable FRC competition scouting.", icons: { icon: "/694-logo.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${manrope.variable} ${dmMono.variable}`}><body><AdaptivePageTitle/><OfflineSupport/>{children}<Analytics /></body></html>;
}
