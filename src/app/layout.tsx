import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { PwaServiceWorker } from "@/components/pwa-service-worker";
import { ToastProvider } from "@/components/ui/toast-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PerformanceProvider } from "@/lib/ui/performance";

import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Axiom Pipeline Engine",
  description: "Axiom Pipeline Engine for lead extraction, enrichment, outreach, and operations control.",
  applicationName: "Axiom Pipeline Engine",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Axiom Ops",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080e",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <PerformanceProvider>
          <TooltipProvider delayDuration={0}>
            <ToastProvider>
              <AppShell>{children}</AppShell>
              <PwaServiceWorker />
            </ToastProvider>
          </TooltipProvider>
        </PerformanceProvider>
      </body>
    </html>
  );
}
