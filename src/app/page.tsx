"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { browserSupabase, isConfigured } from "@/lib/supabase";
import { dateLabel, message, meta, photoUrl, rpc, vibes, type Listing } from "@/lib/listings";
import SignIn from "./SignIn";
import MyListings from "./MyListings";
import ContactForm from "./ContactForm";
import Messages from "./Messages";
import TeamPanel, { RiderTeam } from "./TeamPanel";
import styles from "./page.module.css";

import CreateListingForm from "./CreateListingForm";

type ListingType = "rider" | "team";

export default function Home() {
  const [typeFilter, setTypeFilter] = useState<"all" | ListingType>("all");
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState("all");
  const [lookingOnly, setLookingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [createType, setCreateType] = useState<"rider" | "team">("rider");
  const [teamUpdates, setTeamUpdates] = useState(0);
  const requestVersion = useRef(0);
  const moreTrigger = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
const [showCreateForm, setShowCreateForm] = useState(false);
const [contactStep, setContactStep] = useState<"profile" | "compose">("profile");
const [contactBusy, setContactBusy] = useState(false);
const contactHeading = useRef<HTMLHeadingElement | null>(null);
const messageTrigger = useRef<HTMLButtonElement | null>(null);
const dialogTrigger = useRef<HTMLButtonElement | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [chatId, setChatId] = useState<string>();
  const [unread, setUnread] = useState(0);
  const [unreadRefresh, setUnreadRefresh] = useState(0);
  const refreshUnread = useCallback(() => setUnreadRefresh(n => n + 1), []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function load() {
      if (document.hidden) return;
      try { const [count, updates] = await Promise.all([rpc<number>("chat_unread"), rpc<number>("paddock_badge")]); if (alive) { setUnread(count); setTeamUpdates(updates); } }
      catch { /* Keep the last known count; Messages displays connection errors. */ }
    }
    void load(); const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [user, unreadRefresh]);
  const [editing, setEditing] = useState<Listing | undefined>();
  const filterArgs = useCallback(() => ({ p_type: typeFilter, p_search: query, p_looking: lookingOnly, p_vibe: vibeFilter ?? "", p_gender: genderFilter }), [typeFilter, query, lookingOnly, vibeFilter, genderFilter]);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadError("");
    try { const data = await rpc<{ items: Listing[]; total: number }>("paddock_list", filterArgs()); if (version === requestVersion.current) { setListings(data.items); setTotal(data.total); } }
    catch (error) { if (version === requestVersion.current) setLoadError(message(error)); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [filterArgs]);
  const loadMore = useCallback(async () => {
    if (loading || moreBusy || listings.length >= total) return;
    const version = requestVersion.current; setMoreBusy(true);
    try { const data = await rpc<{ items: Listing[]; total: number }>("paddock_list", { ...filterArgs(), p_offset: listings.length }); if (version === requestVersion.current) { setListings(previous => Array.from(new Map([...previous, ...data.items].map(row => [row.id, row])).values())); setTotal(data.total); } }
    catch (error) { setLoadError(message(error)); }
    finally { setMoreBusy(false); }
  }, [loading, moreBusy, listings.length, total, filterArgs]);
  useEffect(() => {
    if (!isConfigured) return;
    queueMicrotask(() => void reload());
    const onFocus = () => { void reload(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
  useEffect(() => {
    const node = moreTrigger.current;
    if (!node || loading || loadError) return;
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) void loadMore(); }, { rootMargin: "300px" });
    observer.observe(node); return () => observer.disconnect();
  }, [loadMore, loading, loadError]);
  const openProfile = useCallback(async (id: string) => {
    try {
      const profile = await rpc<Listing | null>("public_listing", { p_id: id });
      if (!profile) throw new Error("This profile is hidden, deleted or expired.");
      setShowManage(false); setContactStep("profile"); setSelectedListing(profile);
    } catch (error) { setNotice(message(error)); }
  }, []);
  function signInForProfile(id: string) {
    const target = `/?profile=${encodeURIComponent(id)}`;
    window.history.replaceState(null, "", target);
    setSelectedListing(null); setShowSignIn(true);
  }
  useEffect(() => {
    if (!isConfigured) {
      queueMicrotask(() => { setLoadError("Add the supplied Supabase settings to .env.local, then restart the app."); setLoading(false); setAuthLoading(false); });
      return;
    }
    const client = browserSupabase();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null); setAuthLoading(false);
      if (session) {
        setShowSignIn(false);
        let profileRequested = new URLSearchParams(window.location.search).get("profile");
        let manageRequested = new URLSearchParams(window.location.search).get("manage") === "1";
        let inboxRequested = new URLSearchParams(window.location.search).get("messages") === "1";
        try {
          const destination = JSON.parse(localStorage.getItem("teamfinder:sign-in-destination") ?? "null");
          inboxRequested ||= destination?.page === "messages" && destination.expires > Date.now();
          manageRequested ||= destination?.page === "manage" && destination.expires > Date.now();
          if (destination?.page === "profile" && destination.expires > Date.now()) profileRequested ||= destination.id;
          localStorage.removeItem("teamfinder:sign-in-destination");
        } catch { /* Optional navigation hint. */ }
        if (profileRequested && /^[0-9a-f-]{36}$/i.test(profileRequested)) {
          const id = profileRequested; queueMicrotask(() => void openProfile(id));
        }
        if (inboxRequested) {
          setShowMessages(true);
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
        }
        if (manageRequested) {
          setShowManage(true);
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
        }
      }
      if (event === "SIGNED_OUT") { setShowManage(false); setShowMessages(false); setSelectedListing(null); setUnread(0); setTeamUpdates(0); setShowCreateForm(false); setEditing(undefined); }
    });
    client.auth.getSession().then(async ({ data, error }) => {
      if (error) setNotice("That sign-in link could not be used. Please request a new one.");
      if (data.session) {
        const verified = await client.auth.getUser();
        setUser(verified.data.user);
        if (verified.error) setNotice("Please sign in again.");
      }
      if (!data.session && ["manage", "messages"].some(key => new URLSearchParams(window.location.search).get(key) === "1")) setShowSignIn(true);
      setAuthLoading(false);
    }).catch(() => { setNotice("Sign-in could not be checked. Please try again."); setAuthLoading(false); });
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("error")) setTimeout(() => setNotice("The sign-in link has expired or was already used. Please request another one."), 0);
    const profileId = new URLSearchParams(window.location.search).get("profile");
    if (profileId && /^[0-9a-f-]{36}$/i.test(profileId)) queueMicrotask(() => void openProfile(profileId));
    return () => subscription.unsubscribe();
  }, [openProfile]);
  function openCreate(trigger: HTMLButtonElement) {
    dialogTrigger.current = trigger; setEditing(undefined);
    if (!user) { window.history.replaceState(null, "", "/?manage=1"); setShowSignIn(true); } else setShowManage(true);
  }
  async function signOut() {
    try { const { error } = await browserSupabase().auth.signOut(); if (error) throw error; setNotice("Signed out."); }
    catch (error) { setNotice(message(error)); }
  }

useEffect(() => {
  if (contactStep !== "profile") contactHeading.current?.focus();
}, [contactStep]);

useEffect(() => {
if (!selectedListing && !showCreateForm && !showSignIn && !showManage && !showMessages) {    return;
  }

  const scrollPosition = window.scrollY;
  const previousBodyPosition = document.body.style.position;
  const previousBodyTop = document.body.style.top;
  const previousBodyWidth = document.body.style.width;
  const previousHtmlOverflow = document.documentElement.style.overflow;
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  if (!dialog) return;
  const returnFocus = dialogTrigger.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const previousTabIndex = dialog.getAttribute("tabindex");
  dialog.tabIndex = -1;

  function focusableElements() {
    return Array.from(dialog!.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]'
    )).filter((element) => element.tabIndex >= 0 &&
      !element.matches(':disabled, [type="hidden"]') &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden");
  }

  function keepFocusInside(event: FocusEvent) {
    if (event.target instanceof Node && !dialog!.contains(event.target)) {
      (focusableElements()[0] ?? dialog!).focus({ preventScroll: true });
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (dialog!.getAttribute("data-busy") === "true") return;
      event.preventDefault();
setSelectedListing(null);
setShowCreateForm(false);
setShowSignIn(false);
setShowManage(false);
setShowMessages(false);
      return;
    }
    if (event.key === "Tab") {
      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog!.focus({ preventScroll: true });
      } else if (!elements.includes(active as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  document.documentElement.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollPosition}px`;
  document.body.style.width = "100%";

  window.addEventListener("keydown", handleKeyDown);
  document.addEventListener("focusin", keepFocusInside);
  (focusableElements()[0] ?? dialog).focus({ preventScroll: true });

  return () => {
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.position = previousBodyPosition;
    document.body.style.top = previousBodyTop;
    document.body.style.width = previousBodyWidth;

    window.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", keepFocusInside);
    if (previousTabIndex === null) dialog.removeAttribute("tabindex");
    else dialog.setAttribute("tabindex", previousTabIndex);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    window.scrollTo(0, scrollPosition);
  };
}, [selectedListing, showCreateForm, showSignIn, showManage, showMessages]);

  const visibleListings = listings;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#">
          RAD RACE
        </a>

        <span className={styles.event}>ONETWENTY 2027</span>
        <nav className={styles.accountNav} aria-label="Account">
          <button type="button" disabled={authLoading || !isConfigured} onClick={(event) => { dialogTrigger.current = event.currentTarget; if (user) setShowManage(true); else setShowSignIn(true); }}>{authLoading ? "LOADING…" : user ? `MY PADDOCK${teamUpdates ? ` (${teamUpdates})` : ""}` : "SIGN IN"}</button>
          {user && <button type="button" onClick={(event) => { dialogTrigger.current = event.currentTarget; setChatId(undefined); setShowMessages(true); }}>MESSAGES{unread > 0 ? ` (${unread})` : ""}</button>}
          {user && <button type="button" onClick={() => void signOut()}>SIGN OUT</button>}
        </nav>

      </header>

      <section className={styles.hero}>
        <div className={styles.heroNumber}>120</div>

        <div className={styles.heroContent}>
          <p className={styles.kicker}>RIDE TOGETHER. FINISH TOGETHER.</p>
          <h1>ONETWENTY<br />PADDOCK.</h1>
          <p className={styles.intro}>
            Meet the riders. Discover the teams. Find your crew — or show the one you already have. This is your ONETWENTY Paddock.
          </p>

          <button
  className={styles.createButton}
  type="button"
  disabled={authLoading || !isConfigured}
  onClick={(event) => openCreate(event.currentTarget)}
>
  JOIN THE PADDOCK
  <svg
    aria-hidden="true"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
  >
    <path d="M7 17L17 7" />
    <path d="M8 7H17V16" />
  </svg>
  </button>
        </div>
      </section>

      <section className={styles.finder}>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {loadError && <div className={styles.notice} role="alert"><p>{loadError}</p><button type="button" onClick={() => void reload()}>TRY AGAIN</button></div>}
        <div className={styles.finderHeading}>
          <div>
            <p className={styles.sectionLabel}>MEET YOUR STARTING LINE</p>
            <h2>WHO’S RIDING?</h2>
          </div>

          <p className={styles.resultCount}>
            {loading ? "LOADING…" : `${total} PROFILES`}
          </p>
        </div>

        <div className={styles.typeFilters} aria-label="Listing type">
          <button
            className={typeFilter === "all" ? styles.activeType : ""}
            onClick={() => setTypeFilter("all")}
            aria-pressed={typeFilter === "all"}
            type="button"
          >
            ALL
          </button>
<button
  className={typeFilter === "team" ? styles.activeType : ""}
  onClick={() => setTypeFilter("team")}
  aria-pressed={typeFilter === "team"}
  type="button"
>
  TEAMS
</button>

<button
  className={typeFilter === "rider" ? styles.activeType : ""}
  onClick={() => setTypeFilter("rider")}
  aria-pressed={typeFilter === "rider"}
  type="button"
>
  RIDERS
</button>        </div>

        <label className={styles.searchField}><span className={styles.profileLabel}>FIND A RIDER, TEAM OR CITY</span><input type="search" maxLength={100} placeholder="Search the Paddock…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.vibeFilters}><button type="button" aria-pressed={lookingOnly} className={lookingOnly ? styles.activeVibe : ""} onClick={() => setLookingOnly(value => !value)}>TEAM FINDER · STILL LOOKING</button></div>
        <div className={styles.vibeFilters} aria-label="Riding vibe">
          {vibes.map((vibe) => (
            <button
              key={vibe}
              className={vibeFilter === vibe ? styles.activeVibe : ""}
              aria-pressed={vibeFilter === vibe}
              onClick={() =>
                setVibeFilter((current) => (current === vibe ? null : vibe))
              }
              type="button"
            >
              {vibe}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 32 }}>
          <p id="gender-filter-label" className={styles.profileLabel}>{typeFilter === "team" ? "TEAMS LOOKING FOR" : typeFilter === "rider" ? "RIDERS" : "RIDERS / TEAMS LOOKING FOR"}</p>
          <div className={styles.vibeFilters} role="group" aria-labelledby="gender-filter-label" style={{ margin: "10px 0 0", flexWrap: "wrap", overflow: "visible", paddingRight: 0 }}>
            {["Women", "Men"].map((gender) => (
              <button key={gender} type="button"
                className={genderFilter === gender ? styles.activeVibe : ""}
                aria-pressed={genderFilter === gender}
                onClick={() => setGenderFilter((current) => current === gender ? "all" : gender)}>
                {gender}
              </button>
            ))}
            {(typeFilter !== "all" || vibeFilter !== null || genderFilter !== "all" || lookingOnly || search) && (
              <button type="button" onClick={() => { setTypeFilter("all"); setVibeFilter(null); setGenderFilter("all"); setLookingOnly(false); setSearch(""); }}>Clear filters ×</button>
            )}
          </div>
        </div>

        {loading ? <p role="status">Loading profiles…</p> : loadError ? null : visibleListings.length > 0 ? (
          <div className={styles.grid}>
            {visibleListings.map((listing) => (
              <article className={styles.card} key={listing.id}>
                <div className={styles.imageWrap}>
                  {/* Temporary public event image used only for the prototype. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(listing, true)}
                    loading="lazy"
                    alt=""
                    className={styles.image}
                  />
                  <span className={styles.listingType}>
                    {meta(listing).toUpperCase()}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <p className={styles.cardMeta}>{meta(listing)}</p>
                  <h3>{listing.name}</h3>
                  <p className={styles.region}>{listing.region}</p>
                  <div className={styles.categoryTags}>
                    {(listing.type === "team" || listing.riderGender) && <span>{listing.type === "rider" ? listing.riderGender : listing.looking ? `Looking for: ${listing.seeking}` : "TEAM COMPLETE"}</span>}
                    {!!listing.categories.length && <span>{listing.type === "rider" ? "Team categories: " : "Team category: "}{listing.categories.join(", ")}</span>}
                  </div>
                  <p className={styles.description}>{listing.description}</p>

                  <div className={styles.tags}>
                    {listing.vibes.map((vibe) => (
                      <span key={vibe}>{vibe}</span>
                    ))}
                  </div>

<button
  className={styles.profileButton}
  type="button"
  onClick={(event) => {
    dialogTrigger.current = event.currentTarget;
    setContactStep("profile");
    setSelectedListing(listing);
  }}
>
                      VIEW PROFILE
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>NO MATCH YET.</p>
            <span>{search || typeFilter !== "all" || lookingOnly || vibeFilter || genderFilter !== "all" ? "Try different filters or use Clear filters." : "Be the first to join the Paddock."}</span>
          </div>
        )}
        {!loading && listings.length < total && <div ref={moreTrigger}><button type="button" className={`${styles.photoButton} ${styles.loadMore}`} disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "LOADING…" : "MORE PROFILES ↓"}</button></div>}
      </section>

      {showCreateForm && (
  <CreateListingForm kind={createType} initial={editing} email={user?.email ?? ""} onClose={() => setShowCreateForm(false)} onSaved={() => { setShowCreateForm(false); setEditing(undefined); setShowManage(true); setNotice("Your profile is online. Manage your team and optional RAD RACE feature permission in My Paddock."); void reload(); }} />
)}
{showMessages && user && <Messages initialId={chatId} onClose={() => { setShowMessages(false); refreshUnread(); }} onUnreadChanged={refreshUnread} />}
{showSignIn && <SignIn onClose={() => setShowSignIn(false)} />}
{showManage && <MyListings onCreate={(type) => { setCreateType(type); setEditing(undefined); setShowManage(false); setShowCreateForm(true); }} onOpen={(id) => void openProfile(id)} onClose={() => { setShowManage(false); refreshUnread(); }} onChanged={() => { void reload(); refreshUnread(); }} onEdit={(listing) => { setEditing(listing); setShowManage(false); setShowCreateForm(true); }} />}
{selectedListing && (
  <div
    className={styles.modalBackdrop}
    role="presentation"
    onMouseDown={(event) => {
      if (!contactBusy && event.target === event.currentTarget) {
        setSelectedListing(null);
      }
    }}
  >
    <section
      key={selectedListing.id}
      className={styles.profileModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
      data-busy={contactBusy}
    >
      <button
        className={styles.closeButton}
        type="button"
        onClick={() => setSelectedListing(null)}
        aria-label="Close profile"
        disabled={contactBusy}
      >
        CLOSE ×
      </button>

      <div className={styles.profileImageWrap}>
        {/* Prototype image. Later replaced by the user upload. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(selectedListing)}
          alt=""
          className={styles.profileImage}
        />

        <span className={styles.profileType}>
          {meta(selectedListing).toUpperCase()}
        </span>
      </div>

      <div className={styles.profileContent}>
        <p className={styles.cardMeta}>{meta(selectedListing)}</p>
        <h2 id="profile-title">{selectedListing.name}</h2>
        <p className={styles.profileRegion}>{selectedListing.region}</p>
        <div className={styles.profileSection}>
          <p className={styles.profileLabel}>{selectedListing.type === "rider" ? "RIDER & TEAM PREFERENCE" : "TEAM & RIDER SEARCH"}</p>
          <div className={styles.categoryTags}>
            {(selectedListing.type === "team" || selectedListing.riderGender) && <span>{selectedListing.type === "rider" ? selectedListing.riderGender : selectedListing.looking ? `Looking for: ${selectedListing.seeking}` : "TEAM COMPLETE"}</span>}
                    {!!selectedListing.categories.length && <span>{selectedListing.type === "rider" ? "Team categories: " : "Team category: "}{selectedListing.categories.join(", ")}</span>}
          </div>
        </div>

        {selectedListing.type === "team" ? <TeamPanel key={selectedListing.id} team={selectedListing} signedIn={Boolean(user)} onSignIn={() => signInForProfile(selectedListing.id)} onOpen={id => void openProfile(id)} onManage={() => { setSelectedListing(null); setShowManage(true); }} onBusy={setContactBusy} onChanged={() => { refreshUnread(); void reload(); }} /> : <RiderTeam key={selectedListing.id} riderId={selectedListing.id} onOpen={id => void openProfile(id)} />}
        <div className={styles.profileSection}>
          <p className={styles.profileLabel}>ABOUT</p>
          <p className={styles.profileDescription}>
            {selectedListing.description}
          </p>
        </div>

        <div className={styles.profileSection}>
          <p className={styles.profileLabel}>UP FOR</p>
          <div className={styles.profileTags}>
            {selectedListing.vibes.map((vibe) => (
              <span key={vibe}>{vibe}</span>
            ))}
          </div>
        </div>

        <div className={styles.profileFacts}>
          <div>
            <span>LANGUAGES</span>
            <strong>{selectedListing.languages}</strong>
          </div>
          <div>
            <span>PUBLISHED</span>
            <strong>{dateLabel(selectedListing.published_at)}</strong>
          </div>
        </div>

        {selectedListing.type === "rider" && selectedListing.age && <p className={styles.fieldHint}>Age: {selectedListing.age}</p>}
        <div className={styles.photoActions}>{(["strava", "instagram"] as const).map((key) => selectedListing[key] && <a key={key} href={selectedListing[key]} target="_blank" rel="noopener noreferrer" className={styles.photoButton}>{key.toUpperCase()}</a>)}</div>
        <button
          ref={messageTrigger}
          className={styles.messageButton}
          type="button"
          hidden={contactStep !== "profile"}
          style={contactStep !== "profile" ? { display: "none" } : undefined}
          onClick={() => { if (!user) { signInForProfile(selectedListing.id); } else setContactStep("compose"); }}
        >
          {user ? "SEND MESSAGE" : "SIGN IN TO SEND A MESSAGE"}
          <span aria-hidden="true">→</span>
        </button>

        {contactStep === "profile" && <p className={styles.privacyNote}>
          Chat privately with this rider or team. Replies appear in Messages. Your email address stays private.
        </p>}

        {contactStep !== "profile" && (
          <section className={styles.profileSection} aria-labelledby="contact-title">
            <h3 id="contact-title" ref={contactHeading} tabIndex={-1} style={{ fontSize: "1.5rem", marginBottom: 16 }}>
              {`CONTACT ${selectedListing.name.toUpperCase()}`}
            </h3>
            <ContactForm listingId={selectedListing.id} onBusy={setContactBusy} onSent={(id) => { setChatId(id); setSelectedListing(null); setShowMessages(true); refreshUnread(); }} />
            <button disabled={contactBusy} className={styles.profileButton} style={{ marginTop: 20 }} type="button" onClick={() => {
              setContactStep("profile");
              requestAnimationFrame(() => messageTrigger.current?.focus());
            }}>BACK TO PROFILE <span aria-hidden="true">←</span></button>
          </section>
        )}
      </div>
    </section>
  </div>
)}

      <footer className={styles.footer}>
        <span>RAD RACE ONETWENTY PADDOCK · 2027</span>
        <nav aria-label="Legal and support" style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px" }}>
          <a href="/privacy">PRIVACY</a>
          <a href="https://www.rad-race.com/imprint">IMPRINT</a>
          <a href="mailto:info@rad-race.com?subject=Teamfinder%20report">CONTACT / REPORT</a>
        </nav>
      </footer>
    </main>
  );
}
