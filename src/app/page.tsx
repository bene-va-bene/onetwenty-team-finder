"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

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

                  <button className={styles.profileButton} type="button">
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

      <footer className={styles.footer}>
        <span>RAD RACE ONETWENTY 2027</span>
        <span>TEAMWORK MAKES THE DREAM WORK.</span>
      </footer>
    </main>
  );
}