import { timingSafeEqual } from "node:crypto";
import { adminClient, deliverChatNotification } from "@/lib/server/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const counts = { sent: 0, skipped: 0, errors: 0 };
  try {
    const client = adminClient();
    for (let i = 0; i < 100 && Date.now() - started < 35000; i++) {
      const state = await deliverChatNotification(client);
      if (state === null) break;
      if (state === "sent") counts.sent++;
      else if (state === "skipped") counts.skipped++;
      else { counts.errors++; break; }
    }
  } catch { counts.errors++; }
  console.info("notifications.completed", { ...counts, durationMs: Date.now() - started });
  return Response.json(counts, { status: counts.errors ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
