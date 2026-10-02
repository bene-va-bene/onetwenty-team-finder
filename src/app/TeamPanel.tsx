"use client";
import { useCallback, useEffect, useState } from "react";
import { message, photoUrl, rpc, type Listing } from "@/lib/listings";
import styles from "./page.module.css";

type Rider = Pick<Listing, "id" | "name" | "image_path" | "revision">;
type JoinStatus = { rider: Listing | null; captain: boolean; state: string | null; membership: { team_id: string; team_name: string } | null };
export default function TeamPanel({ team, signedIn, onSignIn, onOpen, onManage, onBusy, onChanged }: { team: Listing; signedIn: boolean; onSignIn: () => void; onOpen: (id: string) => void; onManage: () => void; onBusy: (busy: boolean) => void; onChanged: () => void }) {
  const [roster, setRoster] = useState<Rider[]>([]);
  const [status, setStatus] = useState<JoinStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([rpc<Rider[]>("paddock_roster", { p_team: team.id }), signedIn ? rpc<JoinStatus>("paddock_join_status", { p_team: team.id }) : Promise.resolve(null)])
      .then(([riders, mine]) => { if (alive) { setRoster(riders); setStatus(mine); setLoaded(true); setError(""); } })
      .catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [team.id, signedIn, refresh]);
  async function request() {
    if (busy) return;
    setBusy(true); onBusy(true); setError("");
    try { await rpc("paddock_request", { p_team: team.id, p_name: name, p_consent: consent }); setRefresh(n => n + 1); onChanged(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <section className={styles.profileSection} aria-labelledby="team-members-title">
    <h3 id="team-members-title">THE CREW</h3>
    <div className={styles.roster}>{roster.map(rider => <button type="button" key={rider.id} onClick={() => onOpen(rider.id)} disabled={busy}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(rider, true)} alt="" loading="lazy" /><strong>{rider.name}</strong>
    </button>)}</div>
    {loaded && !roster.length && <p className={styles.fieldHint}>No rider profiles linked yet. The team can already be complete — teammates just need to request to join.</p>}
    {error && <p role="alert" className={styles.notice}>{error} <button type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)}>TRY AGAIN</button></p>}
    {!loaded ? <p role="status">Loading team…</p> : !signedIn ? <button type="button" className={styles.formSubmit} onClick={onSignIn}>SIGN IN TO REQUEST TO JOIN →</button>
      : status?.state === "accepted" ? <div className={styles.notice}><p>YOU’RE IN THIS TEAM.</p><button type="button" className={styles.photoButton} onClick={onManage}>MY PADDOCK</button></div>
      : status?.membership ? <div className={styles.notice}><p>You’re already in {status.membership.team_name}. Leave it before joining another team.</p><button type="button" className={styles.photoButton} onClick={onManage}>MY PADDOCK</button></div>
      : status?.state === "pending" ? <div className={styles.notice}><p>REQUEST PENDING — your captain will approve it.</p><button type="button" className={styles.photoButton} disabled={busy} onClick={async () => {
        if (!status.rider) return; setBusy(true); onBusy(true);
        try { await rpc("paddock_leave", { p_team: team.id, p_rider: status.rider.id }); setRefresh(n => n + 1); onChanged(); }
        catch (error) { setError(message(error)); } finally { setBusy(false); onBusy(false); }
      }}>WITHDRAW REQUEST</button></div>
      : status?.rider && status.rider.status !== "active" ? <div className={styles.notice}><p>Your rider profile is hidden or a draft. Publish it first.</p><button type="button" className={styles.photoButton} onClick={onManage}>MY PADDOCK</button></div>
      : <form onSubmit={event => { event.preventDefault(); void request(); }}>
        {!team.looking && <p className={styles.fieldHint}>This team isn’t recruiting. Already part of the crew? Request to link your profile.</p>}
        {!status?.rider && <><label className={styles.fullField}><span>YOUR NAME</span><input required maxLength={60} autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} /></label><label className={styles.checkLine}><input required type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I agree to publicly show my rider name and approved team membership in the Paddock. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</span></label><p className={styles.fieldHint}>One rider profile, reused everywhere. Photo and other details can come later.</p></>}
        {status?.rider && <p className={styles.fieldHint}>Joining as <strong>{status.rider.name}</strong>. Your approved membership will appear on the public team profile.</p>}
        <button className={styles.formSubmit} type="submit" disabled={busy}>{busy ? "SENDING…" : status?.captain ? "JOIN MY TEAM" : "REQUEST TO JOIN"} →</button>
        <p className={styles.fieldHint}>Paddock membership does not book or confirm a race entry.</p>
      </form>}
  </section>;
}

export function RiderTeam({ riderId, onOpen }: { riderId: string; onOpen: (id: string) => void }) {
  const [team, setTeam] = useState<{ id: string; name: string } | null>(null);
  const load = useCallback(() => rpc<{ id: string; name: string } | null>("paddock_rider_team", { p_rider: riderId }), [riderId]);
  useEffect(() => { let alive = true; load().then(value => { if (alive) setTeam(value); }).catch(() => {}); return () => { alive = false; }; }, [load]);
  return team ? <section className={styles.profileSection}><p className={styles.profileLabel}>MY TEAM</p><button type="button" className={styles.photoButton} onClick={() => onOpen(team.id)}>{team.name} →</button></section> : null;
}
