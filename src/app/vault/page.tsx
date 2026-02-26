import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import VaultDataTable from "@/components/VaultDataTable"

export default async function TheVaultPage() {
    const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" }
    })

    return (
        <div className="max-w-7xl mx-auto mt-10 space-y-8 animate-in fade-in duration-700">
            <Card className="border-border shadow-2xl bg-black/40 backdrop-blur-md">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                                <span className="text-emerald-500">⬢</span> The Vault
                            </CardTitle>
                            <CardDescription className="text-muted-foreground text-md mt-1">
                                Your secured repository of highly qualified, enriched targets.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-emerald-400 border-emerald-900 bg-emerald-950/30 px-3 py-1 font-mono">
                            {leads.length} Targets Acquired
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <VaultDataTable initialLeads={leads} />
                </CardContent>
            </Card>
        </div>
    )
}
