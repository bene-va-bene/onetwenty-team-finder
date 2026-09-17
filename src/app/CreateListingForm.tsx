"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import PhotoPicker from "./PhotoPicker";

const ridingVibes = [
  "Just for the views",
  "Good times, good pace",
  "Sporty but social",
  "Let’s shred",
  "Race to win",
];

type CreateListingFormProps = {
  onClose: () => void;
};

export default function CreateListingForm({
  onClose,
}: CreateListingFormProps) {
  const [listingType, setListingType] = useState<"rider" | "team">("rider");
  const [riderGender, setRiderGender] = useState("");
  const [teamCategory, setTeamCategory] = useState("Mixed");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [mixedSeeking, setMixedSeeking] = useState("Anyone");
  const seeking = teamCategory === "Mixed" ? mixedSeeking : teamCategory;
  const availableCategories = riderGender === "Woman" ? ["Women", "Mixed"] : riderGender === "Man" ? ["Men", "Mixed"] : [];
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const editScrollPosition = useRef(0);
  const wasPreview = useRef(false);

  useEffect(() => {
    if (preview) {
      backdropRef.current?.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true });
    } else if (wasPreview.current) {
      previewButtonRef.current?.focus({ preventScroll: true });
      backdropRef.current?.scrollTo(0, editScrollPosition.current);
    }
    wasPreview.current = preview !== null;
  }, [preview]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function toggleVibe(vibe: string) {
    setSelectedVibes((current) =>
      current.includes(vibe)
        ? current.filter((item) => item !== vibe)
        : [...current, vibe],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photoBusy || selectedVibes.length === 0 || (listingType === "rider" && (!riderGender || preferredCategories.length === 0))) {
      return;
    }

    const data = new FormData(event.currentTarget);
    const fields = ["displayName", "region", "age", "languages", "ridersNeeded", "description", "strava", "instagram"];
    const publicFields: Record<string, string> = {};
    for (const field of fields) {
      publicFields[field] = String(data.get(field) ?? "").trim();
    }
    for (const field of ["displayName", "region", "languages", "description"]) {
      const input = event.currentTarget.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement;
      input.setCustomValidity(publicFields[field] ? "" : "Please complete this field.");
      if (!input.reportValidity()) return;
    }
    if (listingType === "team") delete publicFields.age;
    // Only permit ordinary web links in the rendered preview.
    for (const field of ["strava", "instagram"]) {
      const input = event.currentTarget.elements.namedItem(field) as HTMLInputElement;
      input.setCustomValidity("");
      if (publicFields[field] && !/^https?:\/\//i.test(publicFields[field])) {
        input.setCustomValidity("Please enter a link starting with https://");
        input.reportValidity();
        return;
      }
    }
    editScrollPosition.current = backdropRef.current?.scrollTop ?? 0;
    setPreview(publicFields);
  }

  return (
    <div className={styles.formBackdrop} ref={backdropRef}>
      <section
        className={styles.formPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-listing-title"
      >
        <header className={styles.formHeader}>
          <div>
            <p className={styles.formEyebrow}>ONETWENTY 2027</p>
            <h2 id="create-listing-title" ref={headingRef} tabIndex={-1}>
              {preview ? "YOUR LISTING PREVIEW" : "CREATE A LISTING"}
            </h2>
          </div>

          <button
            className={styles.formClose}
            type="button"
            onClick={onClose}
            aria-label="Close form"
          >
            CLOSE ×
          </button>
        </header>

        {preview && (
          <div className={styles.listingForm}>
            <p className={styles.fieldHint}>
              This is a demo — nothing has been published or sent. Check the
              public details below. Your email is not part of your public profile.
            </p>
            <article style={{ overflowWrap: "anywhere" }}>
              {imagePreview && (
                <div className={styles.uploadPreview} style={{ width: "100%", maxWidth: 360, marginBottom: 24 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt={`Selected photo for ${preview.displayName}`} />
                </div>
              )}
              <p className={styles.formEyebrow}>
                {listingType === "rider" ? "LOOKING FOR A TEAM" : "LOOKING FOR RIDERS"}
              </p>
              <h3 style={{ fontSize: "clamp(2rem, 7vw, 3.5rem)", lineHeight: 1.1 }}>
                {preview.displayName}
              </h3>
              <p className={styles.profileRegion}>{preview.region}</p>
              <div className={styles.profileSection}>
                <p className={styles.profileLabel}>{listingType === "rider" ? "OPEN TO TEAM CATEGORIES" : "TEAM CATEGORY"}</p>
                <div className={styles.categoryTags}>
                  {(listingType === "rider" ? preferredCategories : [teamCategory]).map((category) => <span key={category}>{category}</span>)}
                  <span>{listingType === "rider" ? riderGender : `Seeking: ${seeking}`}</span>
                </div>
              </div>
              <div className={styles.profileSection}>
                <p className={styles.profileLabel}>ABOUT</p>
                <p className={styles.profileDescription} style={{ whiteSpace: "pre-wrap" }}>
                  {preview.description}
                </p>
              </div>
              <div className={styles.profileSection}>
                <p className={styles.profileLabel}>UP FOR</p>
                <div className={styles.profileTags}>
                  {selectedVibes.map((vibe) => <span key={vibe}>{vibe}</span>)}
                </div>
              </div>
              <dl className={styles.profileSection} style={{ display: "grid", gap: 16 }}>
                <div><dt>Languages</dt><dd>{preview.languages}</dd></div>
                {listingType === "rider" && preview.age && <div><dt>Age</dt><dd>{preview.age}</dd></div>}
                {listingType === "team" && (
                  <div><dt>Riders needed</dt><dd>{preview.ridersNeeded === "5" ? "5+" : preview.ridersNeeded}</dd></div>
                )}
                {(["strava", "instagram"] as const).map((field) => preview[field] && (
                  <div key={field}>
                    <dt>{field === "strava" ? "Strava" : "Instagram"}</dt>
                    <dd><a href={preview[field]} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{preview[field]}</a></dd>
                  </div>
                ))}
              </dl>
            </article>
            <div className={styles.formSubmitArea} style={{ marginTop: 32 }}>
              <button className={styles.formSubmit} type="button" onClick={() => setPreview(null)}>
                BACK TO EDIT <span aria-hidden="true">←</span>
              </button>
              <p>Your details stay in this open form. Closing it discards this demo draft.</p>
            </div>
          </div>
        )}

        <form className={styles.listingForm} onSubmit={handleSubmit} onInput={(event) => {
          const field = event.target;
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.setCustomValidity("");
        }} style={preview ? { display: "none" } : undefined}>
          <fieldset className={styles.formSection}>
            <legend>
              <span>01</span>
              WHAT ARE YOU LOOKING FOR?
            </legend>

            <div className={styles.formTypeOptions}>
              <label>
                <input
                  type="radio"
                  name="listingType"
                  value="rider"
                  checked={listingType === "rider"}
                  onChange={() => setListingType("rider")}
                />
                <span>
                  <strong>I NEED A TEAM</strong>
                  I’m a rider looking for people to join.
                </span>
              </label>

              <label>
                <input
                  type="radio"
                  name="listingType"
                  value="team"
                  checked={listingType === "team"}
                  onChange={() => setListingType("team")}
                />
                <span>
                  <strong>WE NEED RIDERS</strong>
                  Our existing team still has open spots.
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>TEAM CATEGORY &amp; RIDERS</legend>
            {listingType === "rider" ? (
              <>
                <div className={styles.fieldGrid}>
                  <label><span>GENDER FOR RACE CLASSIFICATION</span>
                    <select required value={riderGender} onChange={(event) => {
                      const value = event.target.value;
                      setRiderGender(value);
                      setPreferredCategories((current) => current.filter((category) => category === "Mixed" || category === (value === "Woman" ? "Women" : "Men")));
                    }}>
                      <option value="">Please select</option><option>Woman</option><option>Man</option>
                    </select>
                  </label>
                </div>
                <p className={styles.fieldHint} style={{ marginTop: 20 }}>Which team categories would work for you? Select all that apply.</p>
                <div className={styles.formVibes}>
                  {availableCategories.map((category) => (
                    <label key={category}><input type="checkbox" checked={preferredCategories.includes(category)} onChange={() => setPreferredCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category])} /><span>{category}</span></label>
                  ))}
                </div>
                {preferredCategories.length === 0 && <p className={styles.vibeRequirement}>Select your race classification and at least one team category.</p>}
              </>
            ) : (
              <div className={styles.fieldGrid}>
                <label><span>TEAM CATEGORY</span>
                  <select value={teamCategory} onChange={(event) => setTeamCategory(event.target.value)}>
                    <option>Men</option><option>Women</option><option>Mixed</option>
                  </select>
                </label>
                <label><span>WHO ARE YOU LOOKING FOR?</span>
                  <select value={seeking} disabled={teamCategory !== "Mixed"} onChange={(event) => setMixedSeeking(event.target.value)}>
                    {teamCategory === "Mixed" ? <><option>Anyone</option><option>Women</option><option>Men</option></> : <option>{teamCategory}</option>}
                  </select>
                </label>
              </div>
            )}
            <p className={styles.fieldHint} style={{ marginTop: 20 }}>These selections appear on your public listing. The finder helps you connect; it does not register you for the race.</p>
            {(listingType === "team" ? teamCategory === "Mixed" : preferredCategories.includes("Mixed")) && (
              <p className={styles.fieldHint}>Mixed road-race timing requires at least three finishers, including a woman and a man. <a href="https://www.808project.de/one-twenty/ausschreibung" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Read the race rules</a>.</p>
            )}
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>02</span>
              SHOW YOURSELF
            </legend>

            <PhotoPicker value={imagePreview} onChange={setImagePreview} onBusyChange={setPhotoBusy} />
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>03</span>
              THE BASICS
            </legend>

            <div className={styles.fieldGrid}>
              <label>
                <span>DISPLAY NAME</span>
                <input
                  type="text"
                  name="displayName"
                  maxLength={60}
                  placeholder={
                    listingType === "rider" ? "e.g. Mara" : "e.g. Team No Sleep"
                  }
                  required
                />
              </label>

              <label>
                <span>CITY / REGION</span>
                <input
                  type="text"
                  name="region"
                  maxLength={100}
                  placeholder="e.g. Hamburg"
                  required
                />
              </label>

              {listingType === "rider" && <label>
                <span>AGE <em>OPTIONAL</em></span>
                <input
                  type="number"
                  name="age"
                  min="16"
                  max="99"
                  inputMode="numeric"
                  placeholder="e.g. 34"
                />
              </label>}

              <label>
                <span>LANGUAGES</span>
                <input
                  type="text"
                  name="languages"
                  maxLength={100}
                  placeholder="e.g. EN, DE"
                  required
                />
              </label>

              {listingType === "team" && (
                <label>
                  <span>RIDERS NEEDED</span>
                  <select name="ridersNeeded" defaultValue="1" required>
                    <option value="1">1 rider</option>
                    <option value="2">2 riders</option>
                    <option value="3">3 riders</option>
                    <option value="4">4 riders</option>
                    <option value="5">5+ riders</option>
                  </select>
                </label>
              )}
            </div>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>04</span>
              WHAT KIND OF RIDE ARE YOU UP FOR?
            </legend>

            <p className={styles.fieldHint}>
              Select all that apply. You can be flexible depending on the team.
            </p>

            <div className={styles.formVibes}>
              {ridingVibes.map((vibe) => (
                <label key={vibe}>
                  <input
                    type="checkbox"
                    checked={selectedVibes.includes(vibe)}
                    onChange={() => toggleVibe(vibe)}
                  />
                  <span>{vibe}</span>
                </label>
              ))}
            </div>

            {selectedVibes.length === 0 && (
              <p className={styles.vibeRequirement}>
                Choose at least one Riding Vibe.
              </p>
            )}
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>05</span>
              TELL THEM ABOUT YOU
            </legend>

            <label className={styles.fullField}>
              <span>DESCRIPTION</span>
              <textarea
                name="description"
                rows={6}
                maxLength={700}
                placeholder="What should a potential team or rider know about you?"
                required
              />
            </label>

            <div className={styles.fieldGrid}>
              <label>
                <span>STRAVA <em>OPTIONAL</em></span>
                <input
                  type="url"
                  name="strava"
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  placeholder="https://strava.com/athletes/..."
                />
              </label>

              <label>
                <span>INSTAGRAM <em>OPTIONAL</em></span>
                <input
                  type="url"
                  name="instagram"
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  placeholder="https://instagram.com/..."
                />
              </label>

              <label className={styles.fullField}>
                <span>EMAIL — STAYS PRIVATE</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  required
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>06</span>
              BEFORE YOU GO LIVE
            </legend>

            <div className={styles.consentList}>
              <label>
                <input type="checkbox" required />
                <span>
                  I agree that my selected profile information will be shown
                  publicly in the Team Finder.
                </span>
              </label>

              {imagePreview && (
  <label key={imagePreview}>
    <input type="checkbox" required />
    <span>
      I confirm that I may use this photo and that it can be shown
      publicly in the Team Finder.
    </span>
  </label>
)}
            </div>
          </fieldset>

          <div className={styles.formSubmitArea}>
            <p>
  Your email stays private. This demo only previews your listing;
  nothing is published or sent. Finish or cancel your photo crop to continue.
</p>

            <button
              ref={previewButtonRef}
              className={styles.formSubmit}
              type="submit"
              disabled={photoBusy || selectedVibes.length === 0 || (listingType === "rider" && (!riderGender || preferredCategories.length === 0))}
            >
              PREVIEW LISTING
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
