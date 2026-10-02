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
  kind: "rider" | "team";
};

export default function CreateListingForm({
  onClose,
  onSaved,
  email,
  initial,
  kind,
}: CreateListingFormProps) {
  const listingType = initial?.type ?? kind;
  const [riderGender, setRiderGender] = useState(initial?.riderGender ?? "");
  const [riderPreference, setRiderPreference] = useState(
    initial?.type === "rider" ? (initial.categories.includes("Mixed") ? "Mixed" : "Not mixed") : "",
  );
  const [seeking, setSeeking] = useState(initial?.type === "team" ? initial.seeking ?? "" : "");
  const looking = listingType === "team" ? Boolean(seeking) : true;
  const [selectedVibes, setSelectedVibes] = useState<string[]>(initial?.vibes ?? []);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(initial?.image_path));
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
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
    let stagedPhoto: string | null = null;
    try {
      const riderCategory =
        riderPreference === "Mixed"
          ? "Mixed"
          : riderGender === "Woman"
            ? "Women"
            : riderGender === "Man"
              ? "Men"
              : "";
      const input: ListingInput = {
        type: listingType,
        looking,
        name: preview.displayName,
        region: listingType === "rider" ? preview.region : "",
        description: preview.description,
        languages: listingType === "rider" ? preview.languages : "",
        age: listingType === "rider" && preview.age ? Number(preview.age) : null,
        ridersNeeded: listingType === "team" && looking && preview.ridersNeeded ? Number(preview.ridersNeeded) : null,
        riderGender: listingType === "rider" ? riderGender || null : null,
        seeking: listingType === "team" ? seeking || null : null,
        categories: listingType === "rider" && riderCategory ? [riderCategory] : [],
        vibes: selectedVibes,
        strava: preview.strava,
        instagram: preview.instagram,
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
        path = result.path; stagedPhoto = path;
      }
      await rpc<Listing>("save_listing", { p_id: id, p_data: { ...input, image_path: path }, p_revision: savedRecord.current?.revision ?? 0, p_publish: true, p_consent: true, p_photo_consent: Boolean(imagePreview) });
      stagedPhoto = null;
      // Old photos are no longer publicly readable once the database points at the new one.
      if (oldPath && oldPath !== path) await browserSupabase().storage.from("listing-photos").remove([oldPath]);
      onSaved();
    } catch (error) {
      if (stagedPhoto) await browserSupabase().storage.from("listing-photos").remove([stagedPhoto]);
      setSaveError(message(error));
    } finally { setSaving(false); }
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

  function markDirty() {
    setDirty(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function toggleVibe(vibe: string) {
    markDirty();
    setSelectedVibes((current) =>
      current.includes(vibe)
        ? current.filter((item) => item !== vibe)
        : [...current, vibe],
    );
  }

  function clearValidationError(field: string) {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photoBusy || photoLoading || photoLoadFailed) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = listingType === "rider"
      ? ["displayName", "region", "age", "languages", "description", "strava", "instagram"]
      : ["displayName", "ridersNeeded", "description", "strava", "instagram"];
    const publicFields: Record<string, string> = {};
    for (const field of fields) {
      publicFields[field] = String(data.get(field) ?? "").trim();
    }

    const errors: Record<string, string> = {};
    if (listingType === "rider" && !riderGender) errors.riderGender = "Choose Man or Woman.";
    if (listingType === "rider" && !riderPreference) errors.riderPreference = "Choose Mixed or Not mixed.";
    if (!publicFields.displayName) errors.displayName = listingType === "team" ? "Enter your team name." : "Enter your display name.";
    if (listingType === "rider" && !publicFields.region) errors.region = "Enter your city or region.";
    if (listingType === "rider" && !publicFields.languages) errors.languages = "Add at least one language.";

    const socialRules: Record<string, RegExp> = {
      strava: /^https:\/\/(www\.)?strava\.com\//,
      instagram: /^https:\/\/(www\.)?instagram\.com\//,
    };
    for (const field of ["strava", "instagram"]) {
      if (publicFields[field] && !socialRules[field].test(publicFields[field])) {
        errors[field] = `Use a full https://${field}.com link.`;
      }
    }

    if (!data.get("publicationConsent")) {
      errors.publicationConsent = "Confirm that your profile can be shown publicly.";
    }
    if (imagePreview && !data.get("photoConsent")) {
      errors.photoConsent = "Confirm that you may publish this photo.";
    }

    if (Object.keys(errors).length) {
      setValidationErrors(errors);
      requestAnimationFrame(() => {
        validationSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        validationSummaryRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    setValidationErrors({});
    if (listingType === "team") {
      delete publicFields.age;
      delete publicFields.region;
      delete publicFields.languages;
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
              {preview
                ? listingType === "team" ? "YOUR TEAM PREVIEW" : "YOUR RIDER PREVIEW"
                : initial
                  ? listingType === "team" ? "EDIT YOUR TEAM" : "EDIT YOUR RIDER PROFILE"
                  : listingType === "team" ? "CREATE YOUR TEAM" : "CREATE YOUR RIDER PROFILE"}
            </h2>
          </div>

          <button
            className={styles.formClose}
            type="button"
            onClick={requestClose}
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
                {looking ? (listingType === "rider" ? "LOOKING FOR A TEAM" : "LOOKING FOR RIDERS") : (listingType === "team" ? "TEAM PROFILE" : "RIDER PROFILE")}
              </p>
              <h3 style={{ fontSize: "clamp(2rem, 7vw, 3.5rem)", lineHeight: 1.1 }}>
                {preview.displayName}
              </h3>
              {listingType === "rider" && <p className={styles.profileRegion}>{preview.region}</p>}
              {listingType === "rider" ? (
                <div className={styles.profileSection}>
                  <p className={styles.profileLabel}>RIDER</p>
                  <div className={styles.categoryTags}>
                    <span>I am: {riderGender}</span>
                    <span>Looking for: {riderPreference === "Mixed" ? "Mixed Team" : riderGender === "Woman" ? "Women’s Team" : "Men’s Team"}</span>
                  </div>
                </div>
              ) : looking ? (
                <div className={styles.profileSection}>
                  <p className={styles.profileLabel}>LOOKING FOR</p>
                  <div className={styles.categoryTags}><span>{seeking}</span></div>
                </div>
              ) : null}
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
                {listingType === "rider" && <div><dt>Languages</dt><dd>{preview.languages}</dd></div>}
                {listingType === "rider" && preview.age && <div><dt>Age</dt><dd>{preview.age}</dd></div>}
                {listingType === "team" && looking && preview.ridersNeeded && (
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
              <button className={styles.formSubmit} type="button" disabled={saving} onClick={() => void publish()}>
                {saving ? "SAVING…" : listingType === "team" ? "PUBLISH TEAM" : "PUBLISH RIDER PROFILE"}
                <svg className={styles.publishArrow} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M4 12L12 4M6 4h6v6" />
                </svg>
              </button>
              <button className={styles.profileButton} type="button" disabled={saving} onClick={() => setPreview(null)}>
                BACK TO EDIT <span aria-hidden="true">←</span>
              </button>
              <p>{initial?.expires_at ? `Your original deletion date remains ${dateLabel(initial.expires_at)}.` : "Your profile is stored for up to ten months from its first publication."} You can hide or delete it in My Paddock.</p>
            </div>
          </div>
        )}

        <form
          className={styles.listingForm}
          onSubmit={handleSubmit}
          noValidate
          onInput={(event) => {
            const field = event.target;
            if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
              if (field.name) clearValidationError(field.name);
              if (field.name && !["publicationConsent", "photoConsent", "email"].includes(field.name)) markDirty();
            }
          }}
          style={preview ? { display: "none" } : undefined}
        >
          {Object.keys(validationErrors).length > 0 && (
            <div
              ref={validationSummaryRef}
              className={styles.validationSummary}
              role="alert"
              tabIndex={-1}
            >
              <strong>ALMOST THERE.</strong>
              <p>Please complete the highlighted fields before you continue.</p>
              <ul>
                {Object.values(validationErrors).map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}
          <fieldset className={styles.formSection}>
            <legend>{listingType === "rider" ? "YOUR RIDER PROFILE" : "YOUR TEAM"}</legend>
            <p className={styles.fieldHint}>{listingType === "rider" ? "This is your rider profile. You need it before you can join or create a team." : "Your team is built from rider profiles. City, languages and team composition update automatically from the current members."}</p>
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>{listingType === "rider" ? "YOU & YOUR TEAM SEARCH" : "LOOKING FOR"}</legend>
            {listingType === "rider" ? (
              <>
                <p className={styles.profileLabel}>I AM</p>
                <div className={styles.formVibes} aria-invalid={Boolean(validationErrors.riderGender)}>
                  {["Man", "Woman"].map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="riderGender"
                        checked={riderGender === value}
                        onChange={() => {
                          markDirty();
                          setRiderGender(value);
                          clearValidationError("riderGender");
                        }}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                {validationErrors.riderGender && <p className={styles.fieldError}>{validationErrors.riderGender}</p>}
                <p className={styles.profileLabel} style={{ marginTop: 24 }}>LOOKING FOR A TEAM</p>
                <div className={styles.formVibes} aria-invalid={Boolean(validationErrors.riderPreference)}>
                  {["Mixed", "Not mixed"].map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="riderPreference"
                        checked={riderPreference === value}
                        onChange={() => {
                          markDirty();
                          setRiderPreference(value);
                          clearValidationError("riderPreference");
                        }}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                {validationErrors.riderPreference && <p className={styles.fieldError}>{validationErrors.riderPreference}</p>}
                <p className={styles.fieldHint} style={{ marginTop: 20 }}>
                  Not mixed means a Men’s Team for men and a Women’s Team for women. Mixed means you’re looking for a Mixed Team. This is only your current preference. After publishing, you can still build your own team.
                </p>
              </>
            ) : (
              <>
                <p className={styles.profileLabel}>
                  WHO ARE YOU LOOKING FOR? <em className={styles.optionalLabel}>OPTIONAL</em>
                </p>
                <div className={styles.formVibes}>
                  {[
                    { label: "Not looking right now", value: "" },
                    { label: "Men", value: "Men" },
                    { label: "Women", value: "Women" },
                    { label: "Mixed", value: "Mixed" },
                  ].map((option) => (
                    <label key={option.label}>
                      <input
                        type="radio"
                        name="teamSeeking"
                        checked={seeking === option.value}
                        onChange={() => {
                          markDirty();
                          setSeeking(option.value);
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.fieldHint} style={{ marginTop: 20 }}>
                  This only says who you want to add. Your current team composition is calculated automatically from the riders in your team.
                </p>
              </>
            )}
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>02</span>
              SHOW YOURSELF
            </legend>

            {photoLoading ? <p role="status">Loading your photo…</p> : <PhotoPicker value={imagePreview} onChange={(value) => { markDirty(); setPhotoChanged(true); setImagePreview(value); }} onBusyChange={setPhotoBusy} />}
            {saveError && !preview && <p role="alert" className={styles.notice}>{saveError}</p>}
          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>03</span>
              THE BASICS
            </legend>

            <div className={styles.fieldGrid}>
              <label>
                <span>{listingType === "team" ? "TEAM NAME" : "DISPLAY NAME"}</span>
                <input
                  type="text"
                  name="displayName"
                  aria-invalid={Boolean(validationErrors.displayName)}
                  defaultValue={initial?.name}
                  maxLength={60}
                  placeholder={
                    listingType === "rider" ? "e.g. Mara" : "e.g. Team No Sleep"
                  }
                />
                {validationErrors.displayName && <small className={styles.fieldError}>{validationErrors.displayName}</small>}
              </label>

              {listingType === "rider" && <label>
                <span>CITY / REGION</span>
                <input
                  type="text"
                  name="region"
                  aria-invalid={Boolean(validationErrors.region)}
                  defaultValue={initial?.region}
                  maxLength={100}
                  placeholder="e.g. Hamburg"
                />
                {validationErrors.region && <small className={styles.fieldError}>{validationErrors.region}</small>}
              </label>}

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

              {listingType === "rider" && <label>
                <span>LANGUAGES</span>
                <input
                  type="text"
                  name="languages"
                  aria-invalid={Boolean(validationErrors.languages)}
                  defaultValue={initial?.languages}
                  maxLength={100}
                  placeholder="e.g. EN, DE"
                />
                {validationErrors.languages && <small className={styles.fieldError}>{validationErrors.languages}</small>}
              </label>}

              {listingType === "team" && looking && (
                <label>
                  <span>RIDERS NEEDED <em>OPTIONAL</em></span>
                  <select name="ridersNeeded" defaultValue={initial?.looking ? initial.ridersNeeded || "" : ""}>
                    <option value="">No number specified</option>
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


          </fieldset>

          <fieldset className={styles.formSection}>
            <legend>
              <span>05</span>
              {listingType === "team" ? "DESCRIBE YOUR TEAM" : "TELL US ABOUT YOU"}
            </legend>

            <label className={styles.fullField}>
              <span>DESCRIPTION</span>
              <textarea
                name="description"
                defaultValue={initial?.description}
                rows={6}
                maxLength={700}
                placeholder={listingType === "team" ? "Tell us what your team is about." : "What should people know about you?"}
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
                  aria-invalid={Boolean(validationErrors.strava)}
                  placeholder="https://strava.com/athletes/..."
                />
                {validationErrors.strava && <small className={styles.fieldError}>{validationErrors.strava}</small>}
              </label>

              <label>
                <span>INSTAGRAM <em>OPTIONAL</em></span>
                <input
                  type="url"
                  name="instagram"
                  defaultValue={initial?.instagram}
                  maxLength={500}
                  aria-invalid={Boolean(validationErrors.instagram)}
                  placeholder="https://instagram.com/..."
                />
                {validationErrors.instagram && <small className={styles.fieldError}>{validationErrors.instagram}</small>}
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
              <p className={styles.fieldHint}>Read about public profiles, photos and deletion in our <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>privacy notice (opens a new tab)</a>.</p>
              <label className={validationErrors.publicationConsent ? styles.invalidChoice : undefined}>
                <input
                  type="checkbox"
                  name="publicationConsent"
                  onChange={() => clearValidationError("publicationConsent")}
                />
                <span>
                  I agree that my selected profile information will be shown
                  publicly in the RAD RACE ONETWENTY Paddock.
                </span>
              </label>
              {validationErrors.publicationConsent && <p className={styles.fieldError}>{validationErrors.publicationConsent}</p>}

              {imagePreview && (
  <>
    <label key={imagePreview} className={validationErrors.photoConsent ? styles.invalidChoice : undefined}>
      <input
        type="checkbox"
        name="photoConsent"
        onChange={() => clearValidationError("photoConsent")}
      />
      <span>
        I confirm that I may use this photo and that it can be shown
        publicly in the RAD RACE ONETWENTY Paddock.
      </span>
    </label>
    {validationErrors.photoConsent && <p className={styles.fieldError}>{validationErrors.photoConsent}</p>}
  </>
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
              disabled={photoBusy || photoLoading || photoLoadFailed}
            >
              PREVIEW PROFILE
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
        {confirmClose && (
          <div className={styles.discardOverlay} role="presentation">
            <section
              className={styles.discardDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="discard-title"
              aria-describedby="discard-copy"
            >
              <p className={styles.formEyebrow}>UNPUBLISHED CHANGES</p>
              <h3 id="discard-title">DISCARD UNPUBLISHED CHANGES?</h3>
              <p id="discard-copy">
                Changes you have not published will not be saved.
              </p>
              <div className={styles.discardActions}>
                <button
                  type="button"
                  className={styles.formSubmit}
                  onClick={() => setConfirmClose(false)}
                >
                  KEEP EDITING
                </button>
                <button
                  type="button"
                  className={styles.photoButton}
                  onClick={onClose}
                >
                  DISCARD CHANGES
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
