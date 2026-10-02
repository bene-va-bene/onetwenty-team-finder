"use client";

import { useCallback, useEffect, useState } from "react";
import { dateLabel, message, meta, removeListing, rpc, type Listing } from "@/lib/listings";
import styles from "./page.module.css";

type Member = {
  team_id: string;
  team_name: string;
  rider_id: string;
  name: string;
  state: "pending" | "accepted";
  description: string;
  region: string;
};

type Event = {
  id: string;
  kind: string;
  seen: boolean;
  team_name: string;
  rider_name: string;
  created_at: string;
};

type Home = {
  rider: Listing | null;
  membership: { team_id: string; team_name: string } | null;
  requests: Member[];
  outgoing: { team_id: string; team_name: string }[];
  events: Event[];
  features: { listing_id: string; allowed: boolean }[];
};

export default function MyListings({
  onClose,
  onEdit,
  onCreate,
  onOpen,
  onBrowseTeams,
  onChanged,
}: {
  onClose: () => void;
  onEdit: (listing: Listing) => void;
  onCreate: (type: "rider" | "team") => void;
  onOpen: (id: string) => void;
  onBrowseTeams: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Listing[]>([]);
  const [home, setHome] = useState<Home | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState<string | null>(null);
  const [newCaptain, setNewCaptain] = useState("");

  const load = useCallback(async () => {
    const [listings, data] = await Promise.all([
      rpc<Listing[]>("my_listings"),
      rpc<Home>("paddock_home"),
    ]);
    setRows(listings);
    setHome(data);
    if (data.events.some((event) => !event.seen)) {
      await rpc("paddock_seen", { p_ids: data.events.map((event) => event.id) });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch((error) => setError(message(error)));
    });
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setDeleting(null);
      setAbandoning(null);
      setNewCaptain("");
      await load();
      onChanged();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  function abandonTeam(team: Listing) {
    if (!home?.rider) return;
    const remaining = home.requests.filter(
      (member) =>
        member.team_id === team.id &&
        member.state === "accepted" &&
        member.rider_id !== home.rider!.id,
    );

    if (remaining.length === 0) {
      if (
        window.confirm(
          "You’re about to abandon your team. There is no other member who can take over, so the team will be deleted.",
        )
      ) {
        void act(() => removeListing(team));
      }
      return;
    }

    if (remaining.length === 1) {
      if (
        window.confirm(
          `You’re about to abandon your team. ${remaining[0].name} will become the new captain.`,
        )
      ) {
        void act(() =>
          rpc("paddock_abandon_team", {
            p_team: team.id,
            p_new_captain: remaining[0].rider_id,
          }),
        );
      }
      return;
    }

    setAbandoning(team.id);
    setNewCaptain("");
  }

  return (
    <div className={styles.formBackdrop}>
      <section
        className={styles.formPanel}
        role="dialog"
        data-busy={busy}
        aria-modal="true"
        aria-labelledby="manage-title"
      >
        <header className={styles.formHeader}>
          <h2 id="manage-title">MY PADDOCK</h2>
          <button type="button" className={styles.formClose} onClick={onClose} disabled={busy}>
            CLOSE ×
          </button>
        </header>

        <div className={styles.listingForm}>
          <p className={styles.fieldHint}>
            Start with your rider profile. From there you can join one team or create one team of your own.
          </p>

          {error && (
            <p role="alert" className={styles.notice}>
              {error}{" "}
              <button type="button" disabled={busy} onClick={() => void act(load)}>
                TRY AGAIN
              </button>
            </p>
          )}

          {!home ? (
            <p role="status">Loading your Paddock…</p>
          ) : (
            <>
              {(() => {
                const ownedTeam = rows.find((row) => row.type === "team");
                const rider = home.rider;
                const membership = home.membership;
                return (
                  <>
                    {!rider ? (
                      <section className={styles.nextStepCard}>
                        <p className={styles.formEyebrow}>STEP 1</p>
                        <h3>CREATE YOUR RIDER PROFILE</h3>
                        <p>Every person in the Paddock starts as a rider. After that you can join a team or build your own.</p>
                        <button
                          type="button"
                          className={styles.formSubmit}
                          disabled={busy}
                          onClick={() => onCreate("rider")}
                        >
                          CREATE RIDER PROFILE <span aria-hidden="true">→</span>
                        </button>
                      </section>
                    ) : !ownedTeam && !membership && rider.status === "active" ? (
                      <section className={styles.nextStepCard}>
                        <p className={styles.formEyebrow}>YOUR NEXT STEP</p>
                        <h3>JOIN A TEAM OR BUILD YOUR OWN.</h3>
                        <p>Your rider profile is ready. Now choose what you want to do.</p>
                        <div className={styles.nextStepChoices}>
                          <button
                            type="button"
                            className={styles.nextStepChoice}
                            disabled={busy}
                            onClick={onBrowseTeams}
                          >
                            <strong>FIND A TEAM</strong>
                            <span>Browse teams that are looking for riders.</span>
                            <b aria-hidden="true">→</b>
                          </button>
                          <button
                            type="button"
                            className={styles.nextStepChoice}
                            disabled={busy}
                            onClick={() => onCreate("team")}
                          >
                            <strong>BUILD MY TEAM</strong>
                            <span>Create your team, then add riders through join requests.</span>
                            <b aria-hidden="true">→</b>
                          </button>
                        </div>
                      </section>
                    ) : null}

                    {rider && (
                      <div className={styles.photoActions}>
                        <button
                          type="button"
                          className={styles.photoButton}
                          disabled={busy}
                          onClick={() => onEdit(rider)}
                        >
                          EDIT MY RIDER PROFILE
                        </button>
                      </div>
                    )}

                    {rider && !ownedTeam && rider.status !== "active" && (
                      <p className={styles.fieldHint}>
                        Publish your rider profile before creating a team.
                      </p>
                    )}

                    {rider && !ownedTeam && membership && (
                      <p className={styles.fieldHint}>
                        You’re already part of {membership.team_name}. Leave your current team before creating your own.
                      </p>
                    )}

                    {membership && rider && (
                      <section className={styles.manageCard}>
                        <h3>MY TEAM: {membership.team_name}</h3>
                        <p className={styles.fieldHint}>
                          {ownedTeam?.id === membership.team_id
                            ? "You’re the captain."
                            : "You can only be in one team at a time."}
                        </p>
                        <div className={styles.photoActions}>
                          <button
                            type="button"
                            className={styles.photoButton}
                            disabled={busy}
                            onClick={() => onOpen(membership.team_id)}
                          >
                            VIEW TEAM
                          </button>
                          {ownedTeam?.id !== membership.team_id && (
                            <button
                              type="button"
                              className={styles.photoButton}
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Leave this team? You’ll be shown as looking for a team again.",
                                  )
                                ) {
                                  void act(() =>
                                    rpc("paddock_leave", {
                                      p_team: membership.team_id,
                                      p_rider: rider.id,
                                    }),
                                  );
                                }
                              }}
                            >
                              LEAVE TEAM
                            </button>
                          )}
                        </div>
                      </section>
                    )}
                  </>
                );
              })()}

              {home.outgoing.map((request) => (
                <section className={styles.manageCard} key={request.team_id}>
                  <h3>{request.team_name}</h3>
                  <p>REQUEST PENDING</p>
                  <button
                    type="button"
                    className={styles.photoButton}
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        rpc("paddock_leave", {
                          p_team: request.team_id,
                          p_rider: home.rider!.id,
                        }),
                      )
                    }
                  >
                    WITHDRAW REQUEST
                  </button>
                </section>
              ))}

              {home.requests.some((request) => request.state === "pending") && <h3>JOIN REQUESTS</h3>}
              {home.requests
                .filter((request) => request.state === "pending")
                .map((request) => (
                  <section className={styles.manageCard} key={request.team_id + request.rider_id}>
                    <p className={styles.formEyebrow}>{request.team_name}</p>
                    <h3>{request.name}</h3>
                    <p>{request.region}</p>
                    <p>{request.description}</p>
                    <div className={styles.photoActions}>
                      <button
                        type="button"
                        className={styles.photoButton}
                        disabled={busy}
                        onClick={() => onOpen(request.rider_id)}
                      >
                        VIEW RIDER
                      </button>
                      <button
                        type="button"
                        className={styles.photoButton}
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            rpc("paddock_decide", {
                              p_team: request.team_id,
                              p_rider: request.rider_id,
                              p_accept: true,
                            }),
                          )
                        }
                      >
                        ACCEPT
                      </button>
                      <button
                        type="button"
                        className={styles.photoButton}
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            rpc("paddock_decide", {
                              p_team: request.team_id,
                              p_rider: request.rider_id,
                              p_accept: false,
                            }),
                          )
                        }
                      >
                        DECLINE
                      </button>
                    </div>
                  </section>
                ))}

              {rows.map((row) => {
                const acceptedMembers = home.requests.filter(
                  (member) => member.team_id === row.id && member.state === "accepted",
                );
                const captainRiderId =
                  row.type === "team" && home.rider && home.membership?.team_id === row.id
                    ? home.rider.id
                    : null;

                return (
                  <article key={row.id} className={styles.manageCard}>
                    <p className={styles.formEyebrow}>
                      {row.type.toUpperCase()} · {row.status === "active" ? "PUBLIC" : row.status === "closed" ? "HIDDEN" : "DRAFT"}
                    </p>
                    <h3>{row.name}</h3>
                    <p>{meta(row)}</p>
                    <p className={styles.fieldHint}>
                      Published: {dateLabel(row.published_at)} · Deletion due: {dateLabel(row.expires_at)}
                    </p>

                    <div className={styles.photoActions}>
                      <button className={styles.photoButton} type="button" disabled={busy} onClick={() => onEdit(row)}>
                        EDIT
                      </button>
                      {row.status !== "draft" && (
                        <button
                          className={styles.photoButton}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              rpc("set_listing_status", {
                                p_id: row.id,
                                p_status: row.status === "active" ? "closed" : "active",
                                p_revision: row.revision,
                              }),
                            )
                          }
                        >
                          {row.status === "active" ? "HIDE PROFILE" : "SHOW PROFILE"}
                        </button>
                      )}
                      {row.type === "team" && (
                        <button
                          className={styles.photoButton}
                          type="button"
                          disabled={busy}
                          onClick={() => abandonTeam(row)}
                        >
                          ABANDON TEAM
                        </button>
                      )}
                      <button
                        className={styles.photoButton}
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleting(row.id)}
                      >
                        {row.type === "team" ? "DELETE TEAM" : "DELETE RIDER PROFILE"}
                      </button>
                    </div>

                    {abandoning === row.id && (
                      <div className={styles.notice}>
                        <p>YOU’RE ABOUT TO ABANDON YOUR TEAM.</p>
                        <p>Please choose the new captain.</p>
                        <label className={styles.fullField}>
                          <span>NEW CAPTAIN</span>
                          <select
                            value={newCaptain}
                            onChange={(event) => setNewCaptain(event.target.value)}
                            disabled={busy}
                          >
                            <option value="">Choose a team member</option>
                            {acceptedMembers
                              .filter((member) => member.rider_id !== home.rider?.id)
                              .map((member) => (
                                <option key={member.rider_id} value={member.rider_id}>
                                  {member.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className={styles.photoActions}>
                          <button
                            type="button"
                            className={styles.photoButton}
                            disabled={busy || !newCaptain}
                            onClick={() =>
                              void act(() =>
                                rpc("paddock_abandon_team", {
                                  p_team: row.id,
                                  p_new_captain: newCaptain,
                                }),
                              )
                            }
                          >
                            ABANDON TEAM
                          </button>
                          <button
                            type="button"
                            className={styles.photoButton}
                            disabled={busy}
                            onClick={() => {
                              setAbandoning(null);
                              setNewCaptain("");
                            }}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {deleting === row.id && (
                      <div className={styles.notice}>
                        <p>
                          Delete this {row.type === "team" ? "team" : "profile"}, its photos, membership links and all its conversations permanently? Your sign-in account remains.
                        </p>
                        <div className={styles.photoActions}>
                          <button
                            type="button"
                            className={styles.photoButton}
                            disabled={busy}
                            onClick={() => void act(() => removeListing(row))}
                          >
                            YES, DELETE
                          </button>
                          <button
                            type="button"
                            className={styles.photoButton}
                            disabled={busy}
                            onClick={() => setDeleting(null)}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {row.type === "team" &&
                      acceptedMembers.map((rider) => (
                        <div className={styles.memberRow} key={rider.rider_id}>
                          <button type="button" disabled={busy} onClick={() => onOpen(rider.rider_id)}>
                            {rider.name}
                            {rider.rider_id === captainRiderId ? " · CAPTAIN" : ""} →
                          </button>
                          {rider.rider_id !== captainRiderId && (
                            <button
                              type="button"
                              className={styles.photoButton}
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Remove ${rider.name} from this team?`)) {
                                  void act(() =>
                                    rpc("paddock_leave", {
                                      p_team: row.id,
                                      p_rider: rider.rider_id,
                                    }),
                                  );
                                }
                              }}
                            >
                              REMOVE
                            </button>
                          )}
                        </div>
                      ))}

                    <div className={styles.featureBox}>
                      <h4>WANT YOUR CREW FEATURED BY RAD RACE?</h4>
                      <p>
                        Give us a chance to discover your story. Selected riders and teams may appear on our website and social channels. Featuring is not guaranteed.
                      </p>
                      <label className={styles.checkLine}>
                        <input
                          type="checkbox"
                          checked={home.features.some(
                            (feature) => feature.listing_id === row.id && feature.allowed,
                          )}
                          disabled={busy || row.status !== "active"}
                          onChange={(event) => {
                            const allow = event.target.checked;
                            void act(() =>
                              rpc("paddock_feature", {
                                p_listing: row.id,
                                p_allow: allow,
                              }),
                            );
                          }}
                        />
                        <span>
                          Optional: RAD RACE may use this profile’s current photo and text for an ONETWENTY feature on its website and social channels. I have the photographer’s permission and the agreement of everyone pictured for this use.
                        </span>
                      </label>
                      <p className={styles.fieldHint}>
                        You can withdraw permission here for future use. Editing your profile resets it so you can approve the new version. Your profile works without this permission.
                      </p>
                    </div>
                  </article>
                );
              })}

              {!!home.events.length && (
                <section>
                  <h3>RECENT TEAM UPDATES</h3>
                  {home.events.map((event) => (
                    <p key={event.id} className={styles.activityLine}>
                      {event.kind === "requested"
                        ? `${event.rider_name} asked to join ${event.team_name}.`
                        : event.kind === "accepted"
                          ? `You’re now part of ${event.team_name}.`
                          : event.kind === "declined"
                            ? `${event.team_name} declined your request.`
                            : `Your membership in ${event.team_name} has ended.`}
                      <small>{dateLabel(event.created_at)}</small>
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
