import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
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
  title: "The Omniscient — B2B Lead Intelligence Engine",
  description: "AI-powered B2B lead extraction, enrichment, scoring, and intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <PerformanceProvider>
          <TooltipProvider delayDuration={0}>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </PerformanceProvider>
      </body>
    </html>
  );
}

