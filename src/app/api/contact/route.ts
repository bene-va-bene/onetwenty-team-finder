import { requestSupabase } from "@/lib/supabase";
import { adminClient, deliver, mailConfig, serverRpc } from "@/lib/server/mail";

export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };
function reply(body: object, status = 200) { return Response.json(body, { status, headers }); }
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: "Please sign in to send a message." }, 401);
  try {
    const client = requestSupabase(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at) return reply({ error: "Please sign in again." }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Invalid request." }, 400);
    // Stream bound also applies to chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Please write a message." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 12000) { await reader.cancel(); return reply({ error: "Message too large." }, 413); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ error: "Invalid request." }, 400); }
    if (!body || typeof body.listingId !== "string" || typeof body.requestId !== "string" || !uuid.test(body.listingId) || !uuid.test(body.requestId) ||
      typeof body.message !== "string" || !body.message.trim() || body.message.length > 1500 || body.shareEmail !== true) return reply({ error: "Please check your message and agree to share your reply address." }, 400);
    mailConfig(); const admin = adminClient(); // Fail before enqueueing when not configured.
    const queued = await client.rpc("enqueue_contact", { p_listing: body.listingId, p_request: body.requestId, p_body: body.message });
    if (queued.error) return reply({ error: queued.error.code === "P0002" ? "Too many messages. Please try again later." : "This message could not be queued. The listing may be closed, be your own, or have changed. Reload and try again." }, queued.error.code === "P0002" ? 429 : 400);
    try { await deliver(admin, queued.data.id); } catch { /* persisted job will be handled by worker */ }
    const state = await serverRpc<string | null>(admin, "mail_status", { p_id: queued.data.id });
    return reply({ state: state ?? "cancelled" }, state === "sent" ? 200 : 202);
  } catch { return reply({ error: "Message delivery is temporarily unavailable. Please retry with the same message." }, 503); }
}
