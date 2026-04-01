import TriageClient from "./TriageClient";
import { requireSession } from "@/lib/session";

export default async function TriagePage() {
  await requireSession();

  return <TriageClient />;
}
