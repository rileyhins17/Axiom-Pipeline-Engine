import { getPrisma } from "./src/lib/db";

async function main() {
  const prisma = getPrisma();
  const runs = await prisma.outreachRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5,
  });

  for (const run of runs) {
    console.log(`Run ${run.id} @ ${run.startedAt.toISOString()}`);
    console.log(`Status: ${run.status}`);
    console.log(`Claimed: ${run.claimedCount}, Sent: ${run.sentCount}, Failed: ${run.failedCount}, Skipped: ${run.skippedCount}`);
    console.log(`Metadata: ${run.metadata}`);
    console.log("--------------------------------------------------");
  }
}

main().catch(console.error);
