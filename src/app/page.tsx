"use client";

import { useEffect, useMemo, useState } from "react";import styles from "./page.module.css";

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
const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

useEffect(() => {
  if (!selectedListing) {
    return;
  }

  const scrollPosition = window.scrollY;
  const previousBodyPosition = document.body.style.position;
  const previousBodyTop = document.body.style.top;
  const previousBodyWidth = document.body.style.width;
  const previousHtmlOverflow = document.documentElement.style.overflow;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setSelectedListing(null);
    }
  }

  document.documentElement.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollPosition}px`;
  document.body.style.width = "100%";

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.position = previousBodyPosition;
    document.body.style.top = previousBodyTop;
    document.body.style.width = previousBodyWidth;

    window.removeEventListener("keydown", handleKeyDown);
    window.scrollTo(0, scrollPosition);
  };
}, [selectedListing]);

  const visibleListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesType =
        typeFilter === "all" || listing.type === typeFilter;
      const matchesVibe =
        vibeFilter === null || listing.vibes.includes(vibeFilter);

      return matchesType && matchesVibe;
    });
  }, [typeFilter, vibeFilter]);

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

          <button className={styles.createButton} type="button">
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
            className={typeFilter === "rider" ? styles.activeType : ""}
            onClick={() => setTypeFilter("rider")}
            type="button"
          >
            I NEED A TEAM
          </button>
          <button
            className={typeFilter === "team" ? styles.activeType : ""}
            onClick={() => setTypeFilter("team")}
            type="button"
          >
            WE NEED RIDERS
          </button>
        </div>

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

        {visibleListings.length > 0 ? (
          <div className={styles.grid}>
            {visibleListings.map((listing) => (
              <article className={styles.card} key={listing.id}>
                <div className={styles.imageWrap}>
                  {/* Temporary public event image used only for the prototype. */}
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
                  <p className={styles.description}>{listing.description}</p>

                  <div className={styles.tags}>
                    {listing.vibes.map((vibe) => (
                      <span key={vibe}>{vibe}</span>
                    ))}
                  </div>

<button
  className={styles.profileButton}
  type="button"
  onClick={() => setSelectedListing(listing)}
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
            <span>Try another Riding Vibe or show all listings.</span>
          </div>
        )}
      </section>

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

        <button className={styles.messageButton} type="button">
          SEND A MESSAGE
          <span aria-hidden="true">→</span>
        </button>

        <p className={styles.privacyNote}>
          Your email address stays private. We only forward your message.
        </p>
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