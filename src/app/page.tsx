"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

import CreateListingForm from "./CreateListingForm";

type ListingType = "rider" | "team";

type Listing = {
  id: number;
  type: ListingType;
  name: string;
  region: string;
  meta: string;
  description: string;
  vibes: string[];
  image: string;
  categories: string[];
  riderGender?: string;
  seeking?: string;
};

const vibes = [
  "Just for the views",
  "Good times, good pace",
  "Sporty but social",
  "Let’s shred",
  "Race to win",
];

const listings: Listing[] = [
  {
    id: 1,
    type: "rider",
    name: "Mara",
    categories: ["Women", "Mixed"],
    riderGender: "Woman",
    region: "Hamburg",
    meta: "Rider looking for a team",
    description:
      "Happy to ride hard, but the best team is still the one sharing snacks and finishing together.",
    vibes: ["Sporty but social", "Let’s shred"],
    image:
      "https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/1749046735460-E4191I1QD7VISTCZOFOD/RR_120_Raceday_Bjoern-Reschabek_001-min.jpg",
  },
  {
    id: 2,
    type: "team",
    name: "Team No Sleep",
    categories: ["Mixed"],
    seeking: "Women",
    region: "Berlin",
    meta: "Team looking for 2 riders",
    description:
      "Four friends, questionable jokes and a solid pace. We need two more people who enjoy the whole day.",
    vibes: ["Good times, good pace", "Sporty but social"],
image:
  "https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/1749046759661-S8NTH6HMAJJEJKBPHYHY/RR_120_Raceday_Bjoern-Reschabek_135-min.jpg",  },
  {
    id: 3,
    type: "rider",
    name: "Nico",
    categories: ["Men", "Mixed"],
    riderGender: "Man",
    region: "Cologne",
    meta: "Rider looking for a team",
    description:
      "Climbs are my thing. I can adapt to the group, from a fast social ride to a proper race effort.",
    vibes: ["Sporty but social", "Let’s shred", "Race to win"],
    image:
      "https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/1749046739646-BZ9V7EX6DABUDDZQZY6R/RR_120_Raceday_Bjoern-Reschabek_025-min.jpg",
  },
  {
    id: 4,
    type: "team",
    name: "Gipfelstürmer",
    categories: ["Men"],
    seeking: "Men",
    region: "Munich",
    meta: "Team looking for 1 rider",
    description:
      "We are here for a long day outside, great views and a finish line beer. Nobody gets dropped.",
    vibes: ["Just for the views", "Good times, good pace"],
    image:
      "https://images.squarespace-cdn.com/content/v1/652e5fda918ed33c257c1fdf/1749046752971-8EEBFXUG0OPFXE5UOG95/RR_120_Raceday_Bjoern-Reschabek_098-min.jpg",
  },
];
export default function Home() {
  const [typeFilter, setTypeFilter] = useState<"all" | ListingType>("all");
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState("all");
const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
const [showCreateForm, setShowCreateForm] = useState(false);
const [contactStep, setContactStep] = useState<"profile" | "compose" | "demo">("profile");
const [contactEmail, setContactEmail] = useState("");
const [contactMessage, setContactMessage] = useState("");
const contactHeading = useRef<HTMLHeadingElement | null>(null);
const messageTrigger = useRef<HTMLButtonElement | null>(null);
const dialogTrigger = useRef<HTMLButtonElement | null>(null);

useEffect(() => {
  if (contactStep !== "profile") contactHeading.current?.focus();
}, [contactStep]);

useEffect(() => {
if (!selectedListing && !showCreateForm) {    return;
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
      event.preventDefault();
setSelectedListing(null);
setShowCreateForm(false);
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
}, [selectedListing, showCreateForm]);

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
  }, [typeFilter, vibeFilter, genderFilter]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#">
          RAD RACE
        </a>

        <span className={styles.event}>ONETWENTY 2027</span>

        <button className={styles.menuButton} type="button" aria-label="Open menu">
          MENU
        </button>
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
  onClick={(event) => { dialogTrigger.current = event.currentTarget; setShowCreateForm(true); }}
>
  CREATE A LISTING
  <span aria-hidden="true">↗</span>
</button>
        </div>
      </section>

      <section className={styles.finder}>
        <div className={styles.finderHeading}>
          <div>
            <p className={styles.sectionLabel}>TEAM FINDER</p>
            <h2>WHO ARE YOU LOOKING FOR?</h2>
          </div>

          <p className={styles.resultCount}>
            {visibleListings.length} ACTIVE LISTINGS
          </p>
        </div>

        <div className={styles.typeFilters} aria-label="Listing type">
          <button
            className={typeFilter === "all" ? styles.activeType : ""}
            onClick={() => setTypeFilter("all")}
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

        {visibleListings.length > 0 ? (
          <div className={styles.grid}>
            {visibleListings.map((listing) => (
              <article className={styles.card} key={listing.id}>
                <div className={styles.imageWrap}>
                  {/* Temporary public event image used only for the prototype. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={listing.image}
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
                  <p className={styles.cardMeta}>{listing.meta}</p>
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
    setContactEmail("");
    setContactMessage("");
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
            <span>Try different filters or use RESET FILTERS.</span>
          </div>
        )}
      </section>

      {showCreateForm && (
  <CreateListingForm onClose={() => setShowCreateForm(false)} />
)}
{selectedListing && (
  <div
    className={styles.modalBackdrop}
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setSelectedListing(null);
      }
    }}
  >
    <section
      className={styles.profileModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <button
        className={styles.closeButton}
        type="button"
        onClick={() => setSelectedListing(null)}
        aria-label="Close profile"
      >
        CLOSE ×
      </button>

      <div className={styles.profileImageWrap}>
        {/* Prototype image. Later replaced by the user upload. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedListing.image}
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
        <p className={styles.cardMeta}>{selectedListing.meta}</p>
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
            <strong>EN · DE</strong>
          </div>
          <div>
            <span>PUBLISHED</span>
            <strong>17 SEP 2026</strong>
          </div>
        </div>

        <button
          ref={messageTrigger}
          className={styles.messageButton}
          type="button"
          hidden={contactStep !== "profile"}
          style={contactStep !== "profile" ? { display: "none" } : undefined}
          onClick={() => setContactStep("compose")}
        >
          SEND A MESSAGE
          <span aria-hidden="true">→</span>
        </button>

        {contactStep === "profile" && <p className={styles.privacyNote}>
          Try the contact form. This demo does not send messages.
        </p>}

        {contactStep !== "profile" && (
          <section className={styles.profileSection} aria-labelledby="contact-title">
            <h3 id="contact-title" ref={contactHeading} tabIndex={-1} style={{ fontSize: "1.5rem", marginBottom: 16 }}>
              {contactStep === "demo" ? "NOTHING SENT — THIS IS A DEMO" : `CONTACT ${selectedListing.name.toUpperCase()}`}
            </h3>
            {contactStep === "compose" ? (
              <form onSubmit={(event) => {
                event.preventDefault();
                const field = event.currentTarget.elements.namedItem("message") as HTMLTextAreaElement;
                field.setCustomValidity(contactMessage.trim() ? "" : "Please write a message.");
                if (event.currentTarget.reportValidity()) setContactStep("demo");
              }}>
                <p className={styles.fieldHint}>Introduce yourself and tell them why you would make a good team.</p>
                <div className={styles.fieldGrid}>
                  <label className={styles.fullField}>
                    <span>YOUR EMAIL — NOT PUBLIC</span>
                    <input name="email" type="email" autoComplete="email" required maxLength={254}
                      value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                  </label>
                  <label className={styles.fullField}>
                    <span>YOUR MESSAGE</span>
                    <textarea name="message" rows={5} required maxLength={1500}
                      value={contactMessage} onChange={(event) => {
                        event.currentTarget.setCustomValidity("");
                        setContactMessage(event.target.value);
                      }} />
                  </label>
                </div>
                <p className={styles.privacyNote} style={{ marginBottom: 16 }}>
                  Demo only: nothing is sent or saved to a server. In the finished app,
                  you’ll confirm your email before your message is forwarded.
                  Closing this profile discards your draft.
                </p>
                <button className={styles.formSubmit} type="submit">TRY CONTACT FLOW <span aria-hidden="true">→</span></button>
              </form>
            ) : (
              <>
                <p className={styles.fieldHint}>In the finished app, you’ll receive an email with a confirmation link. Your message will only be forwarded after you confirm. This demo has sent neither an email nor a message.</p>
                <button className={styles.formSubmit} type="button" onClick={() => setContactStep("compose")}>BACK TO MESSAGE</button>
              </>
            )}
            <button className={styles.profileButton} style={{ marginTop: 20 }} type="button" onClick={() => {
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
