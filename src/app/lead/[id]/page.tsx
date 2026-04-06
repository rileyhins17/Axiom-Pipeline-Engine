import { DossierClient } from "@/components/dossier/dossier-client";
import { ToastProvider } from "@/components/ui/toast-provider";
import { requireSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function LeadDossierPage({ params }: { params: Promise<{ id: string }> }) {
    await requireSession();

    const { id } = await params;
    const leadId = parseInt(id, 10);

    return (
        <ToastProvider>
            <DossierClient leadId={leadId} />
        </ToastProvider>
    );
}
