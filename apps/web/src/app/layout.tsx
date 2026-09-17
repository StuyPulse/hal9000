import type { Metadata } from "next";
import "./globals.css";
import { AdaptivePageTitle } from "@/components/adaptive-page-title";
import { OfflineSupport } from "@/components/offline-support";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = { title: "HAL9000 | StuyPulse Scouting", description: "Fast, reliable FRC competition scouting.", icons: { icon: "/694-logo.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AdaptivePageTitle/><OfflineSupport/>{children}<Analytics /></body></html>;
}
