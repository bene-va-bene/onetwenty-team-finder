"use client";
import { useState } from "react";
import { browserSupabase, isConfigured } from "@/lib/supabase";
import { message } from "@/lib/listings";
import styles from "./page.module.css";

export default function SignIn({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  return <div className={styles.formBackdrop}><section className={styles.formPanel} role="dialog" aria-modal="true" aria-labelledby="signin-title">
    <header className={styles.formHeader}><div><p className={styles.formEyebrow}>NO PASSWORD NEEDED</p><h2 id="signin-title">YOUR EMAIL. YOUR CREW.</h2></div><button type="button" className={styles.formClose} onClick={onClose}>CLOSE ×</button></header>
    <form className={styles.listingForm} onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      if (Date.now() < retryAt) { setError("Please wait one minute before requesting another email."); return; }
      setBusy(true); setError("");
      try {
        // Preserve the inbox destination if Auth falls back to the configured Site URL.
        try {
          if (new URLSearchParams(window.location.search).get("messages") === "1") {
            localStorage.setItem("teamfinder:sign-in-destination", JSON.stringify({ page: "messages", expires: Date.now() + 3600000 }));
          }
        } catch { /* The redirect URL still carries the destination when storage is unavailable. */ }
        const { error } = await browserSupabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + (new URLSearchParams(window.location.search).get("messages") === "1" ? "/?messages=1" : ""), shouldCreateUser: true } });
        if (error) throw error;
        setSent(true); setRetryAt(Date.now() + 60_000);
      } catch (error) { setError(message(error)); } finally { setBusy(false); }
    }}>
      <p className={styles.fieldHint}>We’ll email you a sign-in link. Open it to message other riders or manage your listings. You don’t need a listing to chat. Your email address stays private.</p>
      <div className={styles.fieldGrid}><label className={styles.fullField}><span>EMAIL ADDRESS</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} /></label></div>
      <p className={styles.fieldHint}>Read how we handle your account and messages in our <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>privacy notice (opens a new tab)</a>.</p>
      {sent && <p className={styles.notice} role="status">Check your inbox, including spam. Open the sign-in link, then open Messages or choose a listing to contact.</p>}
      {!isConfigured && <p className={styles.notice}>The Team Finder connection has not been configured yet.</p>}
      {error && <p className={styles.notice} role="alert">{error}</p>}
      <button className={styles.formSubmit} type="submit" disabled={busy || !isConfigured}>{busy ? "SENDING…" : sent ? "SEND ANOTHER LINK" : "EMAIL ME A SIGN-IN LINK"}</button>
    </form>
  </section></div>;
}
