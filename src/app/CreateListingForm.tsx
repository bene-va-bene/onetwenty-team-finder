"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import PhotoPicker from "./PhotoPicker";
import { browserSupabase } from "@/lib/supabase";
import { dateLabel, message, rpc, type Listing, type ListingInput } from "@/lib/listings";

const ridingVibes = [
  "Just for the views",
  "Good times, good pace",
  "Sporty but social",
  "Let’s shred",
  "Race to win",
];

type CreateListingFormProps = {
  onClose: () => void;
  onSaved: () => void;
  email: string;
  initial?: Listing;
};

export default function CreateListingForm({
  onClose,
  onSaved,
  email,
  initial,
}: CreateListingFormProps) {
  const [listingType, setListingType] = useState<"rider" | "team">(initial?.type ?? "rider");
  const [riderGender, setRiderGender] = useState(initial?.riderGender ?? "");
  const [teamCategory, setTeamCategory] = useState(initial?.type === "team" ? initial.categories[0] : "Mixed");
  const [preferredCategories, setPreferredCategories] = useState<string[]>(initial?.type === "rider" ? initial.categories : []);
  const [mixedSeeking, setMixedSeeking] = useState(initial?.seeking ?? "Anyone");
  const seeking = teamCategory === "Mixed" ? mixedSeeking : teamCategory;
  const availableCategories = riderGender === "Woman" ? ["Women", "Mixed"] : riderGender === "Man" ? ["Men", "Mixed"] : [];
  const [selectedVibes, setSelectedVibes] = useState<string[]>(initial?.vibes ?? []);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(initial?.image_path));
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savedRecord = useRef<Listing | undefined>(initial);
  const newId = useRef<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const editScrollPosition = useRef(0);
  const wasPreview = useRef(false);

  useEffect(() => {
    if (!initial?.image_path) return;
    let cancelled = false;
    browserSupabase().storage.from("listing-photos").download(initial.image_path).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setPhotoLoadFailed(true); setSaveError("Your saved photo could not be loaded. Close the form and try again."); }
      else setImagePreview(URL.createObjectURL(data));
      setPhotoLoading(false);
    }).catch(() => { if (!cancelled) { setPhotoLoading(false); setPhotoLoadFailed(true); setSaveError("Your photo could not be loaded. Please reopen this form."); } });
    return () => { cancelled = true; };
  }, [initial]);

  async function publish() {
    if (!preview || saving || photoLoadFailed) return;
    setSaving(true); setSaveError("");
    try {
      const input: ListingInput = {
        type: listingType, name: preview.displayName, region: preview.region,
        description: preview.description, languages: preview.languages,
        age: listingType === "rider" && preview.age ? Number(preview.age) : null,
        ridersNeeded: listingType === "team" ? Number(preview.ridersNeeded) : null,
        riderGender: listingType === "rider" ? riderGender : null,
        seeking: listingType === "team" ? seeking : null,
        categories: listingType === "rider" ? preferredCategories : [teamCategory],
        vibes: selectedVibes, strava: preview.strava, instagram: preview.instagram,
      };
      const id = savedRecord.current?.id ?? (newId.current ??= crypto.randomUUID());
      const oldPath = savedRecord.current?.image_path ?? null;
      let path = photoChanged ? null : oldPath;
      if (imagePreview && photoChanged) {
        if (!savedRecord.current) savedRecord.current = await rpc<Listing>("save_listing", { p_id: id, p_data: input, p_revision: 0, p_publish: false, p_consent: false, p_photo_consent: false });
        const { data: { session } } = await browserSupabase().auth.getSession();
        if (!session) throw new Error("Please sign in again.");
        const blob = await (await fetch(imagePreview)).blob();
        const response = await fetch(`/api/photos?id=${id}`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "image/jpeg" }, body: blob });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Photo upload failed.");
        path = result.path;
      }
      await rpc<Listing>("save_listing", { p_id: id, p_data: { ...input, image_path: path }, p_revision: savedRecord.current?.revision ?? 0, p_publish: true, p_consent: true, p_photo_consent: Boolean(imagePreview) });
      // Old photos are no longer publicly readable once the database points at the new one.
      if (oldPath && oldPath !== path) await browserSupabase().storage.from("listing-photos").remove([oldPath]);
      onSaved();
    } catch (error) { setSaveError(message(error)); } finally { setSaving(false); }
  }

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

    if (photoBusy || photoLoading || photoLoadFailed || selectedVibes.length === 0 || (listingType === "rider" && (!riderGender || preferredCategories.length === 0))) {
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
      const allowed = field === "strava" ? /^https:\/\/(www\.)?strava\.com\// : /^https:\/\/(www\.)?instagram\.com\//;
      if (publicFields[field] && !allowed.test(publicFields[field])) {
        input.setCustomValidity(`Please enter an https:// link to ${field}.com.`);
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
        data-busy={saving}
        aria-modal="true"
        aria-labelledby="create-listing-title"
      >
        <header className={styles.formHeader}>
          <div>
            <p className={styles.formEyebrow}>ONETWENTY 2027</p>
            <h2 id="create-listing-title" ref={headingRef} tabIndex={-1}>
              {preview ? "YOUR LISTING PREVIEW" : initial ? "EDIT YOUR LISTING" : "CREATE A LISTING"}
            </h2>
          </div>

          <button
            className={styles.formClose}
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close form"
          >
            CLOSE ×
          </button>
        </header>

        {preview && (
          <div className={styles.listingForm}>
            <p className={styles.fieldHint}>
              Check the public details below before publishing. Your email is not part of your public profile.
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
              {saveError && <p role="alert" className={styles.notice}>{saveError}</p>}
              <button className={styles.formSubmit} type="button" disabled={saving} onClick={() => void publish()}>{saving ? "SAVING…" : "PUBLISH LISTING"} <span aria-hidden="true">↗</span></button>
              <button className={styles.profileButton} type="button" disabled={saving} onClick={() => setPreview(null)}>
                BACK TO EDIT <span aria-hidden="true">←</span>
              </button>
              <p>{initial?.expires_at ? `Your original deletion date remains ${dateLabel(initial.expires_at)}.` : "Your listing is stored for up to ten months from its first publication."} You can close or delete it in My listings.</p>
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

            {photoLoading ? <p role="status">Loading your photo…</p> : <PhotoPicker value={imagePreview} onChange={(value) => { setPhotoChanged(true); setImagePreview(value); }} onBusyChange={setPhotoBusy} />}
            {saveError && !preview && <p role="alert" className={styles.notice}>{saveError}</p>}
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
                  defaultValue={initial?.name}
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
                  defaultValue={initial?.region}
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
                  defaultValue={initial?.age ?? ""}
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
                  defaultValue={initial?.languages}
                  maxLength={100}
                  placeholder="e.g. EN, DE"
                  required
                />
              </label>

              {listingType === "team" && (
                <label>
                  <span>RIDERS NEEDED</span>
                  <select name="ridersNeeded" defaultValue={initial?.ridersNeeded ?? 1} required>
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
                defaultValue={initial?.description}
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
                  defaultValue={initial?.strava}
                  maxLength={500}
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  placeholder="https://strava.com/athletes/..."
                />
              </label>

              <label>
                <span>INSTAGRAM <em>OPTIONAL</em></span>
                <input
                  type="url"
                  name="instagram"
                  defaultValue={initial?.instagram}
                  maxLength={500}
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  placeholder="https://instagram.com/..."
                />
              </label>

              <label className={styles.fullField}>
                <span>EMAIL — STAYS PRIVATE</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  readOnly
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
              <p className={styles.fieldHint}>Read about public listings, photos and deletion in our <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>privacy notice (opens a new tab)</a>.</p>
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
  Your email stays private. Nothing goes public until you confirm the preview.
  Finish or cancel your photo crop to continue.
</p>

            <button
              ref={previewButtonRef}
              className={styles.formSubmit}
              type="submit"
              disabled={photoBusy || photoLoading || photoLoadFailed || selectedVibes.length === 0 || (listingType === "rider" && (!riderGender || preferredCategories.length === 0))}
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
