import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline - Axiom Pipeline Engine",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-background px-5 py-10 text-center">
      <section className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.025] p-6">
        <div className="mx-auto grid size-11 place-items-center rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-300">
          <WifiOff className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-white">Connection needed</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Axiom Pipeline Engine keeps private CRM data online-only. Reconnect and reopen the app.
        </p>
      </section>
    </main>
  );
}

