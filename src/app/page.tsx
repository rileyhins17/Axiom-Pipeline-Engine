"use client"
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function TheHuntPage() {
  const [niche, setNiche] = useState("")
  const [city, setCity] = useState("")
  const [radius, setRadius] = useState("10")
  const [maxDepth, setMaxDepth] = useState("5")
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [csvPath, setCsvPath] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const handleExtraction = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setCompleted(false)
    setLogs([])
    setCsvPath("")

    const params = new URLSearchParams({ niche, city, radius, maxDepth })
    const eventSource = new EventSource(`/api/scrape?${params.toString()}`)

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.error) {
        setLogs(prev => [...prev, `[!!!] ERROR: ${data.error}`])
        setLoading(false)
        eventSource.close()
        return
      }

      if (data._done) {
        setCompleted(true)
        setLoading(false)
        eventSource.close()
        return
      }

      if (data.message) {
        setLogs(prev => [...prev, data.message])
        if (data.message.includes("[💾] CSV Appended:")) {
          setCsvPath(data.message.split(": ")[1])
        }
      }
    }

    eventSource.onerror = (err) => {
      setLogs(prev => [...prev, `[!!!] CRITICAL: SSE Connection Dropped. Look at terminal.`])
      setLoading(false)
      eventSource.close()
    }
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Controls */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-3xl font-extrabold tracking-tight">The Hunt V2</CardTitle>
            <CardDescription className="text-muted-foreground">
              Deep-mine qualified prospects missing websites, analyze their digital footprint, and auto-export to CSV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExtraction} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="niche" className="font-semibold">Niche / Profession</Label>
                <Input
                  id="niche" placeholder="e.g. Roofers, Concrete, Med-Spas"
                  value={niche} onChange={(e) => setNiche(e.target.value)}
                  required className="bg-muted/50 focus:bg-background transition-colors"
                  disabled={loading}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="font-semibold">Target City</Label>
                  <Input
                    id="city" placeholder="e.g. Cambridge"
                    value={city} onChange={(e) => setCity(e.target.value)}
                    required className="bg-muted/50 focus:bg-background transition-colors"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius" className="font-semibold">Radius (km)</Label>
                  <Input
                    id="radius" type="number"
                    value={radius} onChange={(e) => setRadius(e.target.value)}
                    required className="bg-muted/50 focus:bg-background transition-colors"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxDepth" className="font-semibold">Max Scroll Depth</Label>
                  <Input
                    id="maxDepth" type="number" min="1" max="50"
                    title="How deep to scroll in Maps (1 = fast, 15 = deep)"
                    value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)}
                    required className="bg-muted/50 focus:bg-background transition-colors"
                    disabled={loading}
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full font-bold text-md" disabled={loading}>
                {loading ? "Streaming Extraction..." : "Commence Engine V2"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Live Terminal */}
        <Card className="bg-black border-border shadow-xl overflow-hidden flex flex-col h-[500px]">
          <CardHeader className="bg-zinc-950 border-b border-white/10 py-3">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <span className="ml-2 text-xs font-mono text-zinc-500 tracking-wider">OMNISCIENT_TERMINAL_V2</span>
            </div>
          </CardHeader>
          <CardContent
            ref={scrollRef}
            className="flex-1 p-4 overflow-y-auto font-mono text-xs sm:text-sm text-green-400 space-y-1"
          >
            {logs.length === 0 && !loading && (
              <p className="text-zinc-600">Waiting for commands...</p>
            )}
            {logs.map((log, i) => (
              <div key={i} className="break-words">
                {log.startsWith("[!!!]") ? <span className="text-red-500 font-bold">{log}</span> :
                  log.startsWith("[✅]") ? <span className="text-emerald-400 font-bold">{log}</span> :
                    log.startsWith("[✔]") ? <span className="text-zinc-300">{log}</span> :
                      log.startsWith("[💾]") ? <span className="text-cyan-400">{log}</span> :
                        log}
              </div>
            ))}
            {loading && (
              <div className="animate-pulse text-zinc-500 mt-2">_</div>
            )}
          </CardContent>
          {completed && (
            <CardFooter className="bg-emerald-950/30 border-t border-emerald-900/30 py-3 block">
              <h4 className="text-emerald-400 font-bold text-sm mb-1">Export Completed Safely</h4>
              <p className="text-emerald-500/80 text-xs font-mono break-all">{csvPath}</p>
              <Button variant="outline" size="sm" className="w-full mt-3 border-emerald-800 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-300" onClick={() => window.location.href = '/vault'}>
                Dive into The Vault
              </Button>
            </CardFooter>
          )}
        </Card>

      </div>
    </div>
  )
}
