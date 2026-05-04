/**
 * Generic skeleton shown while a server-rendered page is loading.
 * Wired up via per-route `loading.tsx` files which Next.js renders
 * inside an automatic Suspense boundary during navigation. This is
 * what eliminates the "click → wait → page" gap on tab switches.
 */
export function RouteSkeleton({ label }: { label?: string }) {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5 animate-pulse">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-white/[0.05]" />
          <div className="h-8 w-64 rounded bg-white/[0.06]" />
          <div className="h-3 w-72 rounded bg-white/[0.04]" />
        </div>
        <div className="h-10 w-44 rounded-lg bg-white/[0.04]" />
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="v2-card h-28 border border-white/[0.06] bg-white/[0.02]"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="v2-card h-72 lg:col-span-2 bg-white/[0.02]" />
        <div className="v2-card h-72 bg-white/[0.02]" />
      </div>

      {label ? (
        <span className="sr-only">Loading {label}</span>
      ) : null}
    </div>
  );
}
