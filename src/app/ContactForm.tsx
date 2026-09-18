"use client";
import { useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import styles from "./page.module.css";

export default function ContactForm({ listingId, email, onBusy }: { listingId: string; email: string; onBusy: (busy: boolean) => void }) {
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const request = useRef<{ id: string; body: string } | null>(null);
  if (state) return <p className={styles.notice} role="status">{
    state === "sent" ? "Your message was accepted for delivery. They can reply directly to your email." :
    state === "uncertain" ? "We could not confirm delivery. We won’t send it again automatically, to avoid duplicates." :
    state === "cancelled" ? "This listing is no longer available. Your message was not sent." :
    "Your message is saved for delivery. You don’t need to send it again."
  }</p>;
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); onBusy(true); setError("");
    if (!request.current || request.current.body !== body) request.current = { id: crypto.randomUUID(), body };
    try {
      const { data } = await browserSupabase().auth.getSession();
      if (!data.session) throw new Error("Please sign in again.");
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ listingId, requestId: request.current.id, message: body, shareEmail: consent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Please try again.");
      setState(result.state);
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again with the same message."); }
    finally { setBusy(false); onBusy(false); }
  }}>
    <p className={styles.fieldHint}>Introduce yourself and tell them why you would make a good team.</p>
    <div className={styles.fieldGrid}>
      <label className={styles.fullField}><span>YOUR REPLY ADDRESS — NOT PUBLIC</span><input type="email" readOnly value={email} /></label>
      <label className={styles.fullField}><span>YOUR MESSAGE</span><textarea rows={5} required maxLength={1500} disabled={busy} value={body} onChange={e => setBody(e.target.value)} /></label>
    </div>
    <label className={styles.privacyNote} style={{ display: "flex", gap: 12, margin: "20px 0" }}>
      <input type="checkbox" required checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />
      <span>Your email address will be shared with this rider or team so they can reply. It will not appear on the public board.</span>
    </label>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <button type="submit" className={styles.formSubmit} disabled={busy || !body.trim()}>{busy ? "SENDING…" : "SEND MESSAGE"}<span aria-hidden="true">→</span></button>
  </form>;
}
