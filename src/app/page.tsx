"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { browserSupabase, isConfigured } from "@/lib/supabase";
import { dateLabel, message, meta, photoUrl, rpc, vibes, type Listing } from "@/lib/listings";
import SignIn from "./SignIn";
import MyListings from "./MyListings";
import ContactForm from "./ContactForm";
import Messages from "./Messages";
import styles from "./page.module.css";

import CreateListingForm from "./CreateListingForm";

type ListingType = "rider" | "team";

export default function Home() {
  const [typeFilter, setTypeFilter] = useState<"all" | ListingType>("all");
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState("all");
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
      try { const count = await rpc<number>("chat_unread"); if (alive) setUnread(count); }
      catch { /* Keep the last known count; Messages displays connection errors. */ }
    }
    void load(); const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [user, unreadRefresh]);
  const [editing, setEditing] = useState<Listing | undefined>();
  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setListings(await rpc<Listing[]>("list_public_listings")); }
    catch (error) { setLoadError(message(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!isConfigured) {
      queueMicrotask(() => { setLoadError("Add the supplied Supabase settings to .env.local, then restart the app."); setLoading(false); setAuthLoading(false); });
      return;
    }
    queueMicrotask(() => void reload());
    const client = browserSupabase();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null); setAuthLoading(false);
      if (session) {
        setShowSignIn(false);
        if (new URLSearchParams(window.location.search).get("manage") === "1") {
          setShowManage(true);
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
        }
      }
      if (event === "SIGNED_OUT") { setShowManage(false); setShowMessages(false); setSelectedListing(null); setUnread(0); setShowCreateForm(false); setEditing(undefined); }
    });
    client.auth.getSession().then(async ({ data, error }) => {
      if (error) setNotice("That sign-in link could not be used. Please request a new one.");
      if (data.session) {
        const verified = await client.auth.getUser();
        setUser(verified.data.user);
        if (verified.error) setNotice("Please sign in again.");
      }
      if (!data.session && new URLSearchParams(window.location.search).get("manage") === "1") setShowSignIn(true);
      setAuthLoading(false);
    }).catch(() => { setNotice("Sign-in could not be checked. Please try again."); setAuthLoading(false); });
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("error")) setTimeout(() => setNotice("The sign-in link has expired or was already used. Please request another one."), 0);
    const onFocus = () => { void reload(); };
    window.addEventListener("focus", onFocus);
    return () => { subscription.unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, [reload]);
  function openCreate(trigger: HTMLButtonElement) {
    dialogTrigger.current = trigger; setEditing(undefined);
    if (!user) setShowSignIn(true); else setShowCreateForm(true);
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

  const visibleListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesType =
        typeFilter === "all" || listing.type === typeFilter;
      const matchesVibe =
        vibeFilter === null || listing.vibes.includes(vibeFilter);

      const matchesGender = genderFilter === "all" || (listing.type === "rider"
        ? listing.riderGender === (genderFilter === "Women" ? "Woman" : "Man")
        : listing.seeking === "Anyone" || listing.seeking === genderFilter);
      return matchesType && matchesVibe && matchesGender;
    });
  }, [listings, typeFilter, vibeFilter, genderFilter]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#">
          RAD RACE
        </a>

        <span className={styles.event}>ONETWENTY 2027</span>
        <nav className={styles.accountNav} aria-label="Account">
          <button type="button" disabled={authLoading || !isConfigured} onClick={(event) => { dialogTrigger.current = event.currentTarget; if (user) setShowManage(true); else setShowSignIn(true); }}>{authLoading ? "LOADING…" : user ? "MY LISTINGS" : "SIGN IN"}</button>
          {user && <button type="button" onClick={(event) => { dialogTrigger.current = event.currentTarget; setChatId(undefined); setShowMessages(true); }}>MESSAGES{unread > 0 ? ` (${unread})` : ""}</button>}
          {user && <button type="button" onClick={() => void signOut()}>SIGN OUT</button>}
        </nav>

      </header>

      <section className={styles.hero}>
        <div className={styles.heroNumber}>120</div>

        <div className={styles.heroContent}>
          <p className={styles.kicker}>RIDE TOGETHER. FINISH TOGETHER.</p>
          <h1>FIND YOUR TEAM.</h1>
          <p className={styles.intro}>
            Still missing a team? Or one rider short? Find the people who match
            your pace, your plans and your idea of a good day on the bike.
          </p>

          <button
  className={styles.createButton}
  type="button"
  disabled={authLoading || !isConfigured}
  onClick={(event) => openCreate(event.currentTarget)}
>
  CREATE A LISTING
  <span aria-hidden="true">↗</span>
</button>
        </div>
      </section>

      <section className={styles.finder}>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {loadError && <div className={styles.notice} role="alert"><p>{loadError}</p><button type="button" onClick={() => void reload()}>TRY AGAIN</button></div>}
        <div className={styles.finderHeading}>
          <div>
            <p className={styles.sectionLabel}>TEAM FINDER</p>
            <h2>WHO ARE YOU LOOKING FOR?</h2>
          </div>

          <p className={styles.resultCount}>
            {loading ? "LOADING…" : `${visibleListings.length} ACTIVE LISTINGS`}
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
  I NEED A TEAM
</button>

<button
  className={typeFilter === "rider" ? styles.activeType : ""}
  onClick={() => setTypeFilter("rider")}
  aria-pressed={typeFilter === "rider"}
  type="button"
>
  WE NEED RIDERS
</button>        </div>

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
            {(typeFilter !== "all" || vibeFilter !== null || genderFilter !== "all") && (
              <button type="button" onClick={() => { setTypeFilter("all"); setVibeFilter(null); setGenderFilter("all"); }}>Clear filters ×</button>
            )}
          </div>
        </div>

        {loading ? <p role="status">Loading listings…</p> : loadError ? null : visibleListings.length > 0 ? (
          <div className={styles.grid}>
            {visibleListings.map((listing) => (
              <article className={styles.card} key={listing.id}>
                <div className={styles.imageWrap}>
                  {/* Temporary public event image used only for the prototype. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(listing)}
                    alt=""
                    className={styles.image}
                  />
                  <span className={styles.listingType}>
                    {listing.type === "rider"
                      ? "LOOKING FOR A TEAM"
                      : "LOOKING FOR RIDERS"}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <p className={styles.cardMeta}>{meta(listing)}</p>
                  <h3>{listing.name}</h3>
                  <p className={styles.region}>{listing.region}</p>
                  <div className={styles.categoryTags}>
                    {listing.categories.map((category) => <span key={category}>{category}</span>)}
                    <span>{listing.type === "rider" ? listing.riderGender : `Seeking: ${listing.seeking}`}</span>
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
            <span>{listings.length ? "Try different filters or use Clear filters." : "Be the first to create a listing."}</span>
          </div>
        )}
      </section>

      {showCreateForm && (
  <CreateListingForm initial={editing} email={user?.email ?? ""} onClose={() => setShowCreateForm(false)} onSaved={() => { setShowCreateForm(false); setEditing(undefined); setNotice("Your listing is now online. Manage it under My listings."); void reload(); }} />
)}
{showMessages && user && <Messages initialId={chatId} onClose={() => { setShowMessages(false); refreshUnread(); }} onUnreadChanged={refreshUnread} />}
{showSignIn && <SignIn onClose={() => setShowSignIn(false)} />}
{showManage && <MyListings onClose={() => setShowManage(false)} onChanged={() => void reload()} onEdit={(listing) => { setEditing(listing); setShowManage(false); setShowCreateForm(true); }} />}
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
          {selectedListing.type === "rider"
            ? "LOOKING FOR A TEAM"
            : "LOOKING FOR RIDERS"}
        </span>
      </div>

      <div className={styles.profileContent}>
        <p className={styles.cardMeta}>{meta(selectedListing)}</p>
        <h2 id="profile-title">{selectedListing.name}</h2>
        <p className={styles.profileRegion}>{selectedListing.region}</p>
        <div className={styles.profileSection}>
          <p className={styles.profileLabel}>{selectedListing.type === "rider" ? "OPEN TO TEAM CATEGORIES" : "TEAM CATEGORY"}</p>
          <div className={styles.categoryTags}>
            {selectedListing.categories.map((category) => <span key={category}>{category}</span>)}
            <span>{selectedListing.type === "rider" ? selectedListing.riderGender : `Seeking: ${selectedListing.seeking}`}</span>
          </div>
        </div>

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
          onClick={() => { if (!user) { setSelectedListing(null); setShowSignIn(true); } else setContactStep("compose"); }}
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
        <span>RAD RACE ONETWENTY 2027</span>
        <span>TEAMWORK MAKES THE DREAM WORK.</span>
      </footer>
    </main>
  );
}
