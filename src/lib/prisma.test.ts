import { strict as assert } from "node:assert";
import test from "node:test";

import { setCloudflareBindings, type D1DatabaseLike, type D1PreparedStatementLike } from "./cloudflare";
import { getPrisma } from "./prisma";

function createRecordingDb() {
  let selectQuery = "";
  let selectParams: unknown[] = [];

  const db: D1DatabaseLike = {
    prepare(query: string): D1PreparedStatementLike {
      let params: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all<T>() {
          if (query.startsWith("PRAGMA table_info")) {
            return {
              results: [
                { name: "id" },
                { name: "leadId" },
                { name: "status" },
                { name: "lastSentAt" },
                { name: "createdAt" },
              ] as T[],
            };
          }

          selectQuery = query;
          selectParams = params;
          return { results: [] };
        },
        async first<T>() {
          return null as T | null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  };

  return {
    db,
    getSelectQuery: () => selectQuery,
    getSelectParams: () => selectParams,
  };
}

test("D1 query adapter supports notIn filters", async () => {
  const recorder = createRecordingDb();
  setCloudflareBindings({ DB: recorder.db });

  await getPrisma().outreachSequence.findMany({
    where: { status: { notIn: ["STOPPED", "COMPLETED"] } },
    take: 1,
  });

  assert.match(recorder.getSelectQuery(), /"status" NOT IN \(\?, \?\)/);
  assert.deepEqual(recorder.getSelectParams().slice(0, 2), ["STOPPED", "COMPLETED"]);
});
