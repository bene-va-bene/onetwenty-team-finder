import { timingSafeEqual } from "node:crypto";
import { adminClient, deliver, mailConfig, serverRpc } from "@/lib/server/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now(); const token = crypto.randomUUID();
  let client;
  const counts = { deleted: 0, accountsDeleted: 0, mailProcessed: 0, errors: 0, timeBudgetReached: false, moreWorkPossible: false };
  try {
    client = adminClient();
    if (!await serverRpc<boolean>(client, "lifecycle_prepare", { p_token: token })) return Response.json({ busy: true });
    // Purge before sending. Missing mail credentials must not prevent retention cleanup.
    const ids = await serverRpc<string[]>(client, "expired_listings");
    if (ids.length === 100) counts.moreWorkPossible = true;
    for (const id of ids) {
      if (Date.now() - started > 30000) { counts.timeBudgetReached = true; break; }
      try {
        const bucket = client.storage.from("listing-photos");
        let complete = false;
        while (Date.now() - started < 35000) {
          const result = await bucket.list(id, { limit: 100 });
          if (result.error) throw new Error("Storage failed");
          if (!result.data.length) { complete = true; break; }
          const removed = await bucket.remove(result.data.map(item => `${id}/${item.name}`));
          if (removed.error) throw new Error("Storage failed");
        }
        if (!complete) { counts.timeBudgetReached = true; break; }
        await serverRpc(client, "purge_listing", { p_id: id }); counts.deleted++;
      } catch { counts.errors++; }
    }
    for (const id of await serverRpc<string[]>(client, "cleanup_accounts")) {
      if (Date.now() - started > 35000) { counts.timeBudgetReached = true; break; }
      const { error } = await client.auth.admin.deleteUser(id, false);
      if (error) counts.errors++; else counts.accountsDeleted++;
    }
    try {
      mailConfig();
      for (let i = 0; i < 100 && Date.now() - started < 35000; i++) {
        const state = await deliver(client);
        if (state === null) break;
        counts.mailProcessed++;
        if (state !== "sent") { counts.errors++; break; } // do not hammer an unhealthy SMTP service
      }
    } catch { counts.errors++; }
    if (counts.mailProcessed === 100 || Date.now() - started >= 35000) counts.moreWorkPossible = true;
    // Aggregate operational evidence only: never log addresses, message bodies or credentials.
    console.info("maintenance.completed", { ...counts, durationMs: Date.now() - started });
    return Response.json(counts, { status: counts.errors || counts.timeBudgetReached || counts.moreWorkPossible ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { console.error("maintenance.failed", { ...counts, durationMs: Date.now() - started }); return Response.json({ error: "Maintenance failed", ...counts }, { status: 503 }); }
  finally { if (client) { try { await serverRpc(client, "lifecycle_release", { p_token: token }); } catch { /* lease expires */ } } }
}
