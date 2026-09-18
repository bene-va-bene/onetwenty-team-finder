"use client";
import { useCallback, useEffect, useState } from "react";
import { dateLabel, message, removeListing, rpc, type Listing } from "@/lib/listings";
import styles from "./page.module.css";

export default function MyListings({ onClose, onEdit, onChanged }: { onClose: () => void; onEdit: (listing: Listing) => void; onChanged: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows(await rpc<Listing[]>("my_listings")); } catch (error) { setError(message(error)); } finally { setLoading(false); setNow(Date.now()); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  async function act(row: Listing, action: "active" | "closed" | "delete") {
    setBusy(true); setError("");
    try {
      if (action === "delete") await removeListing(row);
      else await rpc("set_listing_status", { p_id: row.id, p_status: action, p_revision: row.revision });
      setDeleting(null);
    } catch (error) { setError(message(error)); }
    finally { await load(); onChanged(); setBusy(false); }
  }
  return <div className={styles.formBackdrop}><section className={styles.formPanel} role="dialog" data-busy={busy} aria-modal="true" aria-labelledby="manage-title">
    <header className={styles.formHeader}><h2 id="manage-title">MY LISTINGS</h2><button type="button" className={styles.formClose} onClick={onClose} disabled={busy}>CLOSE ×</button></header>
    <div className={styles.listingForm}>
      <p className={styles.fieldHint}>Close a listing when you have found your people. You can reopen it until its ten-month limit. Editing or reopening does not extend that date.</p>
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {loading ? <p role="status">Loading your listings…</p> : !rows.length && <p>No listings yet. Close this window and choose Create a listing.</p>}
      {rows.map((row) => <article key={row.id} className={styles.manageCard}>
        <p className={styles.formEyebrow}>{row.expires_at && new Date(row.expires_at).getTime() <= now ? "EXPIRED" : row.status.toUpperCase()}</p><h3>{row.name}</h3><p>{row.region}</p>
        <p className={styles.fieldHint}>Published: {dateLabel(row.published_at)}{row.expires_at ? ` · Deletion due: ${dateLabel(row.expires_at)}` : " · Not public yet"}</p>
        <div className={styles.photoActions}>
          <button className={styles.photoButton} type="button" disabled={busy || Boolean(row.expires_at && new Date(row.expires_at).getTime() <= now)} onClick={() => onEdit(row)}>EDIT</button>
          {row.status !== "draft" && <button className={styles.photoButton} type="button" disabled={busy || Boolean(row.status !== "active" && row.expires_at && new Date(row.expires_at).getTime() <= now)} onClick={() => void act(row, row.status === "active" ? "closed" : "active")}>{row.status === "active" ? "CLOSE LISTING" : "REOPEN LISTING"}</button>}
          <button className={styles.photoButton} type="button" disabled={busy} onClick={() => setDeleting(row.id)}>DELETE PERMANENTLY</button>
        </div>
        {deleting === row.id && <div className={styles.notice}><p>Delete this listing and its photos permanently? This cannot be undone. Your sign-in account remains available.</p><div className={styles.photoActions}><button type="button" className={styles.photoButton} disabled={busy} onClick={() => void act(row, "delete")}>{busy ? "DELETING…" : "YES, DELETE"}</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => setDeleting(null)}>CANCEL</button></div></div>}
      </article>)}
    </div>
  </section></div>;
}
