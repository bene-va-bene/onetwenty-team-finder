"use client";
import { useRef, useState } from "react";
import { message, rpc } from "@/lib/listings";
import styles from "./page.module.css";

export default function ContactForm({ listingId, threadId, onBusy, onSent }: {
  listingId?: string; threadId?: string; onBusy: (busy: boolean) => void; onSent: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ id: string; body: string; name: string } | null>(null);
  const sending = useRef(false);
  return <form className={threadId ? styles.chatComposer : undefined} onSubmit={async event => {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); onBusy(true); setError("");
    if (!request.current || request.current.body !== body || request.current.name !== name) request.current = { id: crypto.randomUUID(), body, name };
    try {
      const id = threadId ?? await rpc<string>("send_chat", { p_listing: listingId, p_request: request.current.id, p_body: body, p_name: name });
      if (threadId) await rpc("reply_chat", { p_thread: threadId, p_request: request.current.id, p_body: body });
      setBody(""); request.current = null; onSent(id);
    } catch (error) { setError(message(error)); }
    finally { sending.current = false; setBusy(false); onBusy(false); }
  }}>
    {!threadId && <p className={styles.fieldHint}>Introduce yourself. Replies appear in Messages. You don’t need a listing, and your email address stays private. The chat is deleted when this listing is deleted or expires.</p>}
    <div className={styles.fieldGrid}>
      {!threadId && <label className={styles.fullField}><span>YOUR NAME IN THIS CHAT</span><input autoComplete="given-name" required maxLength={60} disabled={busy} value={name} onChange={e => setName(e.target.value)} /></label>}
      <label className={styles.fullField}><span>YOUR MESSAGE</span><textarea rows={3} required maxLength={1500} disabled={busy} value={body} onChange={e => setBody(e.target.value)} /></label>
    </div>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <button type="submit" className={styles.formSubmit} disabled={busy || !body.trim()}>{busy ? "SENDING…" : "SEND MESSAGE"}<span aria-hidden="true">→</span></button>
  </form>;
}
