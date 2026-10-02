"use client";
import { useCallback, useEffect, useState } from "react";
import { dateLabel, message, meta, removeListing, rpc, type Listing } from "@/lib/listings";
import styles from "./page.module.css";

type Member = { team_id: string; team_name: string; rider_id: string; name: string; state: "pending" | "accepted"; description: string; region: string };
type Event = { id: string; kind: string; seen: boolean; team_name: string; rider_name: string; created_at: string };
type Home = { rider: Listing | null; membership: { team_id: string; team_name: string } | null; requests: Member[]; outgoing: { team_id: string; team_name: string }[]; events: Event[]; features: { listing_id: string; allowed: boolean }[] };
export default function MyListings({ onClose, onEdit, onCreate, onOpen, onChanged }: { onClose: () => void; onEdit: (listing: Listing) => void; onCreate: (type: "rider" | "team") => void; onOpen: (id: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Listing[]>([]);
  const [home, setHome] = useState<Home | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [listings, data] = await Promise.all([rpc<Listing[]>("my_listings"), rpc<Home>("paddock_home")]);
    setRows(listings); setHome(data);
    if (data.events.some(e => !e.seen)) await rpc("paddock_seen", { p_ids: data.events.map(e => e.id) });
  }, []);
  useEffect(() => { queueMicrotask(() => { void load().catch(error => setError(message(error))); }); }, [load]);
  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); setDeleting(null); await load(); onChanged(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.formBackdrop}><section className={styles.formPanel} role="dialog" data-busy={busy} aria-modal="true" aria-labelledby="manage-title">
    <header className={styles.formHeader}><h2 id="manage-title">MY PADDOCK</h2><button type="button" className={styles.formClose} onClick={onClose} disabled={busy}>CLOSE ×</button></header>
    <div className={styles.listingForm}>
      <p className={styles.fieldHint}>Your rider profile, your teams and your requests. A complete team stays visible. Hide a profile only when you want it taken off the public Paddock.</p>
      {error && <p role="alert" className={styles.notice}>{error} <button type="button" disabled={busy} onClick={() => void act(load)}>TRY AGAIN</button></p>}
      {!home ? <p role="status">Loading your Paddock…</p> : <>
        <div className={styles.photoActions}>
          <button type="button" className={styles.photoButton} disabled={busy} onClick={() => home.rider ? onEdit(home.rider) : onCreate("rider")}>{home.rider ? "EDIT MY RIDER PROFILE" : "CREATE MY RIDER PROFILE"}</button>
          <button type="button" className={styles.photoButton} disabled={busy || rows.length >= 3} onClick={() => onCreate("team")}>CREATE A TEAM</button>
        </div>
        {home.membership && home.rider && <section className={styles.manageCard}><h3>MY TEAM: {home.membership.team_name}</h3>
          <p className={styles.fieldHint}>This is your Paddock membership, not confirmation of a booked race entry.</p>
          <div className={styles.photoActions}><button type="button" className={styles.photoButton} disabled={busy} onClick={() => onOpen(home.membership!.team_id)}>VIEW TEAM</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => { if (window.confirm("Leave this team? Rejoining requires approval again.")) void act(() => rpc("paddock_leave", { p_team: home.membership!.team_id, p_rider: home.rider!.id })); }}>LEAVE TEAM</button></div>
        </section>}
        {home.outgoing.map(request => <section className={styles.manageCard} key={request.team_id}><h3>{request.team_name}</h3><p>REQUEST PENDING</p><button type="button" className={styles.photoButton} disabled={busy} onClick={() => void act(() => rpc("paddock_leave", { p_team: request.team_id, p_rider: home.rider!.id }))}>WITHDRAW REQUEST</button></section>)}
        {home.requests.some(r => r.state === "pending") && <h3>JOIN REQUESTS</h3>}
        {home.requests.filter(r => r.state === "pending").map(request => <section className={styles.manageCard} key={request.team_id + request.rider_id}>
          <p className={styles.formEyebrow}>{request.team_name}</p><h3>{request.name}</h3><p>{request.region}</p><p>{request.description}</p>
          <div className={styles.photoActions}><button type="button" className={styles.photoButton} disabled={busy} onClick={() => onOpen(request.rider_id)}>VIEW RIDER</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => void act(() => rpc("paddock_decide", { p_team: request.team_id, p_rider: request.rider_id, p_accept: true }))}>ACCEPT</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => void act(() => rpc("paddock_decide", { p_team: request.team_id, p_rider: request.rider_id, p_accept: false }))}>DECLINE</button></div>
        </section>)}
        {rows.map(row => <article key={row.id} className={styles.manageCard}>
          <p className={styles.formEyebrow}>{row.type.toUpperCase()} · {row.status === "active" ? "PUBLIC" : row.status === "closed" ? "HIDDEN" : "DRAFT"}</p><h3>{row.name}</h3><p>{meta(row)}</p>
          <p className={styles.fieldHint}>Published: {dateLabel(row.published_at)} · Deletion due: {dateLabel(row.expires_at)}</p>
          <div className={styles.photoActions}>
            <button className={styles.photoButton} type="button" disabled={busy} onClick={() => onEdit(row)}>EDIT</button>
            {row.status !== "draft" && <><button className={styles.photoButton} type="button" disabled={busy} onClick={() => void act(() => rpc("paddock_search", { p_listing: row.id, p_looking: !row.looking, p_revision: row.revision }))}>{row.looking ? (row.type === "team" ? "MARK TEAM COMPLETE" : "STOP LOOKING") : (row.type === "team" ? "LOOK FOR RIDERS" : "LOOK FOR A TEAM")}</button>
            <button className={styles.photoButton} type="button" disabled={busy} onClick={() => void act(() => rpc("set_listing_status", { p_id: row.id, p_status: row.status === "active" ? "closed" : "active", p_revision: row.revision }))}>{row.status === "active" ? "HIDE PROFILE" : "SHOW PROFILE"}</button></>}
            <button className={styles.photoButton} type="button" disabled={busy} onClick={() => setDeleting(row.id)}>DELETE</button>
          </div>
          {deleting === row.id && <div className={styles.notice}><p>Delete this profile, its photos, membership links and all its conversations permanently? Your sign-in account remains.</p><div className={styles.photoActions}><button type="button" className={styles.photoButton} disabled={busy} onClick={() => void act(() => removeListing(row))}>YES, DELETE</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => setDeleting(null)}>CANCEL</button></div></div>}
          {row.type === "team" && home.requests.filter(r => r.team_id === row.id && r.state === "accepted").map(rider => <div className={styles.memberRow} key={rider.rider_id}><button type="button" disabled={busy} onClick={() => onOpen(rider.rider_id)}>{rider.name} →</button><button type="button" className={styles.photoButton} disabled={busy} onClick={() => { if (window.confirm(`Remove ${rider.name} from this team?`)) void act(() => rpc("paddock_leave", { p_team: row.id, p_rider: rider.rider_id })); }}>REMOVE</button></div>)}
          <div className={styles.featureBox}><h4>WANT YOUR CREW FEATURED BY RAD RACE?</h4><p>Give us a chance to discover your story. Selected riders and teams may appear on our website and social channels. Featuring is not guaranteed.</p>
            <label className={styles.checkLine}><input type="checkbox" checked={home.features.some(f => f.listing_id === row.id && f.allowed)} disabled={busy || row.status !== "active"} onChange={event => { const allow = event.target.checked; void act(() => rpc("paddock_feature", { p_listing: row.id, p_allow: allow })); }} /><span>Optional: RAD RACE may use this profile’s current photo and text for an ONETWENTY feature on its website and social channels. I have the photographer’s permission and the agreement of everyone pictured for this use.</span></label>
            <p className={styles.fieldHint}>You can withdraw permission here for future use. Editing your profile resets it so you can approve the new version. Your profile works without this permission.</p>
          </div>
        </article>)}
        {!!home.events.length && <section><h3>RECENT TEAM UPDATES</h3>{home.events.map(event => <p key={event.id} className={styles.activityLine}>{event.kind === "requested" ? `${event.rider_name} asked to join ${event.team_name}.` : event.kind === "accepted" ? `You’re now part of ${event.team_name}.` : event.kind === "declined" ? `${event.team_name} declined your request.` : `Your membership in ${event.team_name} has ended.`}<small>{dateLabel(event.created_at)}</small></p>)}</section>}
      </>}
    </div>
  </section></div>;
}
