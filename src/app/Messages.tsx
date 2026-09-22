"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { dateLabel, message, rpc } from "@/lib/listings";
import ContactForm from "./ContactForm";
import styles from "./page.module.css";

type Conversation = { id: string; listing_name: string; peer_name: string; unread: number; blocked: boolean; blocked_by_me: boolean; expires_at: string };
type ChatMessage = { id: number; body: string; mine: boolean; created_at: string };

function ConversationView({ thread, onChanged, onBusy }: { thread: Conversation; onChanged: () => void; onBusy: (busy: boolean) => void }) {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const acknowledged = useRef(0);
  const tail = useRef<number | null>(null);
  const latest = items.at(-1)?.id ?? 0;
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const firstLoad = tail.current === null;
        const data = await rpc<ChatMessage[]>("read_chat", { p_thread: thread.id, p_after: tail.current });
        if (!alive) return;
        setItems(previous => Array.from(new Map([...previous, ...data].map(item => [item.id, item])).values()).sort((a, b) => a.id - b.id));
        if (firstLoad) setOlder(data.length === 50);
        if (data.length) tail.current = data.at(-1)!.id;
        setError("");
      } catch (error) { if (alive) setError(message(error)); }
      finally { inFlight = false; if (alive) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(interval); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [thread.id, refresh]);
  useEffect(() => {
    if (atBottom.current) end.current?.scrollIntoView({ block: "nearest" });
  }, [latest]);
  const markRead = useCallback(async () => {
    if (!latest || acknowledged.current >= latest || document.hidden || !document.hasFocus() || !atBottom.current) return;
    try { await rpc("seen_chat", { p_thread: thread.id, p_seen: latest }); acknowledged.current = latest; onChanged(); }
    catch { /* The next focus or refresh retries the acknowledgement. */ }
  }, [latest, thread.id, onChanged]);
  useEffect(() => {
    void markRead();
    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", markRead);
    return () => { window.removeEventListener("focus", markRead); document.removeEventListener("visibilitychange", markRead); };
  }, [markRead, refresh]);
  return <section className={styles.chatConversation} aria-label={`Conversation with ${thread.peer_name}`}>
    <h3 className={styles.chatTitle}>{thread.peer_name}</h3>
    <p className={styles.fieldHint}>About: {thread.listing_name}. This chat is deleted with the listing, no later than {dateLabel(thread.expires_at)}.</p>
    <button type="button" className={styles.photoButton} disabled={busy} onClick={async () => {
      setBusy(true); onBusy(true);
      try { await rpc("block_chat", { p_thread: thread.id, p_block: !thread.blocked_by_me }); onChanged(); }
      catch (error) { setError(message(error)); }
      finally { setBusy(false); onBusy(false); }
    }}>{thread.blocked_by_me ? "UNBLOCK CONVERSATION" : "BLOCK CONVERSATION"}</button>
    {error && <div className={styles.notice} role="alert">{error} <button type="button" onClick={() => setRefresh(n => n + 1)}>TRY AGAIN</button></div>}
    {loading && <p role="status">Loading messages…</p>}
    <div className={styles.chatLog} ref={pane} role="log" aria-label="Messages" aria-live="polite" tabIndex={0} onScroll={() => {
      const el = pane.current;
      atBottom.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (atBottom.current) void markRead();
    }}>
      {older && <button type="button" className={styles.photoButton} disabled={olderBusy} onClick={async () => {
        setOlderBusy(true); const el = pane.current; const height = el?.scrollHeight ?? 0; atBottom.current = false;
        try {
          const data = await rpc<ChatMessage[]>("read_chat", { p_thread: thread.id, p_before: items[0]?.id });
          setOlder(data.length === 50);
          setItems(previous => Array.from(new Map([...data, ...previous].map(item => [item.id, item])).values()).sort((a, b) => a.id - b.id));
          requestAnimationFrame(() => { if (el) el.scrollTop += el.scrollHeight - height; });
        } catch (error) { setError(message(error)); }
        finally { setOlderBusy(false); }
      }}>{olderBusy ? "LOADING…" : "OLDER MESSAGES"}</button>}
      {items.map(item => <div key={item.id} className={`${styles.chatBubble} ${item.mine ? styles.chatMine : ""}`}>
        <strong>{item.mine ? "YOU" : thread.peer_name}</strong>
        <p>{item.body}</p>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</time>
      </div>)}
      <div ref={end} />
    </div>
    {thread.blocked ? <p className={styles.notice}>Messaging is paused in this conversation.</p> : <ContactForm threadId={thread.id} onBusy={value => { setBusy(value); onBusy(value); }} onSent={() => { atBottom.current = true; setRefresh(n => n + 1); onChanged(); }} />}
  </section>;
}

function EmailNotifications() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<boolean>("chat_email_preference").then(value => { if (alive) { setEnabled(value); setError(""); } })
      .catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [refresh]);
  return <div>
    <label className={styles.fieldHint} style={{ display: "flex", alignItems: "center", gap: "0.75rem", minHeight: 44, cursor: "pointer" }}>
      <input type="checkbox" checked={enabled ?? false} disabled={enabled === null || busy} onChange={async event => {
        const next = event.target.checked;
        setBusy(true); setError("");
        try { setEnabled(await rpc<boolean>("chat_email_preference", { p_enabled: next })); }
        catch (error) { setError(message(error)); }
        finally { setBusy(false); }
      }} />
      EMAIL ME ABOUT NEW MESSAGES
    </label>
    <p className={styles.fieldHint}>{enabled === null ? "Loading notification settings…" : "A heads-up for unread messages, with a link back here. Message content stays in the app. Multiple messages are grouped."}</p>
    {error && <p className={styles.notice} role="alert">{error} <button type="button" onClick={() => setRefresh(n => n + 1)}>TRY AGAIN</button></p>}
  </div>;
}

export default function Messages({ initialId, onClose, onUnreadChanged }: { initialId?: string; onClose: () => void; onUnreadChanged: () => void }) {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState(initialId ?? "");
  const [selectedSnapshot, setSelectedSnapshot] = useState<Conversation>();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const changed = useCallback(() => { setRefresh(n => n + 1); onUnreadChanged(); }, [onUnreadChanged]);
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const [data, detail] = await Promise.all([
          rpc<Conversation[]>("chat_inbox", { p_offset: offset }),
          selected ? rpc<Conversation[]>("chat_inbox", { p_thread: selected }) : Promise.resolve([]),
        ]);
        if (alive) { setThreads(data); setSelectedSnapshot(detail[0]); setError(""); }
      }
      catch (error) { if (alive) setError(message(error)); }
      finally { inFlight = false; if (alive) setLoading(false); }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [offset, refresh, selected]);
  const active = threads.find(thread => thread.id === selected) ?? (selectedSnapshot?.id === selected ? selectedSnapshot : undefined);
  return <div className={styles.formBackdrop}>
    <section className={`${styles.formPanel} ${styles.messagesPanel}`} role="dialog" aria-modal="true" aria-labelledby="messages-title" data-busy={busy}>
      <header className={styles.formHeader}><div><p className={styles.formEyebrow}>FIND YOUR CREW</p><h2 id="messages-title">MESSAGES</h2></div><button disabled={busy} type="button" className={styles.formClose} onClick={onClose}>CLOSE ×</button></header>
      <div className={`${styles.listingForm} ${styles.messagesBody} ${active ? styles.messagesChatBody : ""}`}>
        {error && <p className={styles.notice} role="alert">{error} <button type="button" onClick={changed}>TRY AGAIN</button></p>}
        {loading ? <p role="status">Loading conversations…</p> : active ? <>
          <button type="button" disabled={busy} className={styles.photoButton} onClick={() => setSelected("")}>← ALL CONVERSATIONS</button>
          <ConversationView key={active.id} thread={active} onChanged={changed} onBusy={setBusy} />
        </> : <>
          <p className={styles.fieldHint}>Private conversations with riders and teams. Read and reply here. Your email address stays private.</p>
          <EmailNotifications />
          {selected && <p className={styles.notice}>This conversation is no longer on this page. Its listing may have been deleted or expired.</p>}
          {!threads.length && <p>No conversations yet. Open a listing and send a message to get started.</p>}
          <div className={styles.chatThreads}>{threads.map(thread => <button key={thread.id} type="button" onClick={() => { setSelectedSnapshot(thread); setSelected(thread.id); }}>
            <strong>{thread.peer_name}</strong><span>{thread.listing_name}</span><span>{thread.unread ? `${thread.unread} unread` : "Open conversation →"}</span>
          </button>)}</div>
          <div className={styles.photoActions}>
            {offset > 0 && <button type="button" className={styles.photoButton} onClick={() => { setSelected(""); setOffset(n => Math.max(0, n - 30)); }}>← PREVIOUS</button>}
            {threads.length === 30 && <button type="button" className={styles.photoButton} onClick={() => { setSelected(""); setOffset(n => n + 30); }}>NEXT →</button>}
          </div>
        </>}
      </div>
    </section>
  </div>;
}
