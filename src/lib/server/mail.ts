import "server-only";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export type MailJob = { id: string; kind: "contact" | "reminder"; listing_id: string; name: string; to: string; replyTo: string | null; body: string | null; published_at: string; expires_at: string };
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server configuration missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export type Admin = ReturnType<typeof adminClient>;
export async function serverRpc<T>(client: Admin, name: string, args = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error("Database operation failed");
  return data as T;
}
export function mailConfig() {
  const pass = process.env.SMTP_PASSWORD;
  const origin = new URL(process.env.APP_URL ?? "");
  if (!pass || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && origin.hostname === "localhost"))) throw new Error("Mail configuration missing");
  if (process.env.VERCEL_ENV === "production" && origin.protocol !== "https:") throw new Error("Production requires HTTPS");
  return { pass, origin: origin.origin };
}
function date(value: string) { return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
export function mailText(job: MailJob, origin: string) {
  if (job.kind === "contact") return {
    subject: "Someone wants to ride with you.",
    text: `YOU’VE GOT COMPANY.\n\nSomeone got in touch about your listing “${job.name}”:\n\n${job.body}\n\nHit reply to contact the sender directly. Your reply will share your email address with them.\n\nFound your crew? Close your listing so others know you’re sorted.\n\nMANAGE MY LISTING\n${origin}/?manage=1\n\nmuch love\nRAD RACE`,
  };
  const manage = `${origin}/?manage=1`;
  return {
    subject: "Still looking for your crew?",
    text: `Friendly reminder:\n\nYour listing “${job.name}” is still online.\n\nStill looking? You don’t need to do anything.\nPlans changed? Edit your listing.\nFound your people? Close it.\n\nMANAGE MY LISTING\n${manage}\n\nPublished: ${date(job.published_at)}\nAutomatic deletion: ${date(job.expires_at)}\n\nYour listing and its associated photo and messages will be deleted ten months after publication. Editing or reopening it won’t extend that date.\n\nThis is a service reminder for your listing. Replies to this reminder aren’t monitored and are automatically discarded.\n\nmuch love\nRAD RACE`,
  };
}
export async function deliver(client: Admin, id?: string) {
  const config = mailConfig();
  const job = await serverRpc<MailJob | null>(client, "mail_claim", { p_id: id ?? null });
  if (!job) return null;
  const transport = mailTransport(config.pass);
  let state: "sent" | "failed" | "uncertain" = "uncertain";
  try {
    const result = await transport.sendMail({
      from: { name: "RAD RACE Team Finder", address: "teamfinder@rad-race.com" },
      to: { name: "", address: job.to },
      replyTo: job.replyTo ? { name: "", address: job.replyTo } : undefined,
      messageId: `<${job.id}@rad-race.com>`, ...mailText(job, config.origin),
      headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
    });
    state = result.accepted.length === 1 ? "sent" : "failed";
  } catch (error) {
    // A disconnect during DATA is ambiguous. Never blindly resend an accepted message.
    const e = error as { responseCode?: number; command?: string; code?: string };
    const definitelyNotAccepted = (e.responseCode !== undefined && e.responseCode >= 400) ||
      ["EAUTH", "EDNS"].includes(e.code ?? "") || ["CONN", "EHLO", "HELO", "AUTH", "MAIL FROM", "RCPT TO"].includes(e.command ?? "");
    state = definitelyNotAccepted ? "failed" : "uncertain";
  } finally { transport.close(); }
  // If this write fails, sending becomes uncertain in the daily worker, not a duplicate send.
  await serverRpc(client, "mail_finish", { p_id: job.id, p_state: state });
  return state;
}

function mailTransport(pass: string) {
  return nodemailer.createTransport({
    host: "smtp.strato.de", port: 465, secure: true,
    auth: { user: "teamfinder@rad-race.com", pass: pass },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, dnsTimeout: 5000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
}

export function chatNotificationText(origin: string) {
  return {
    subject: "You’ve got a new message. | RAD RACE Team Finder",
    text: `YOUR CREW IS CALLING.

You have new unread messages in the RAD RACE ONETWENTY Team Finder.

OPEN MESSAGES
${origin}/?messages=1

Read and reply in the Team Finder. You may need to sign in first. Your conversations and email address stay private.

You can turn off these notifications in Messages. Please don’t reply to this email — replies to this address are automatically discarded.

much love
RAD RACE`,
  };
}
export async function deliverChatNotification(client: Admin) {
  const config = mailConfig();
  const job = await serverRpc<{ id: string; to: string } | null>(client, "chat_email_claim");
  if (!job) return null;
  if (!await serverRpc<boolean>(client, "chat_email_ready", { p_id: job.id })) {
    await serverRpc(client, "chat_email_finish", { p_id: job.id, p_state: "skipped" });
    return "skipped";
  }
  const transport = mailTransport(config.pass);
  let state: "sent" | "failed" | "uncertain" = "uncertain";
  try {
    const result = await transport.sendMail({
      from: { name: "RAD RACE Team Finder", address: "teamfinder@rad-race.com" },
      to: { name: "", address: job.to },
      messageId: `<chat-${job.id}@rad-race.com>`,
      ...chatNotificationText(config.origin),
      headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
    });
    state = result.accepted.length === 1 ? "sent" : "failed";
  } catch (error) {
    const e = error as { responseCode?: number; command?: string; code?: string };
    const rejected = (e.responseCode !== undefined && e.responseCode >= 400) ||
      ["EAUTH", "EDNS"].includes(e.code ?? "") || ["CONN", "EHLO", "HELO", "AUTH", "MAIL FROM", "RCPT TO"].includes(e.command ?? "");
    state = rejected ? "failed" : "uncertain";
  } finally { transport.close(); }
  await serverRpc(client, "chat_email_finish", { p_id: job.id, p_state: state });
  return state;
}
