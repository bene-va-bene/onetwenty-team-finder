"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import styles from "./page.module.css";

type Source = { url: string; image: HTMLImageElement; name: string };
type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  onBusyChange: (busy: boolean) => void;
};

// All processing stays in this browser. Server validation is still required later.
export default function PhotoPicker({ value, onChange, onBusyChange }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const sequence = useRef(0);
  const sourceUrls = useRef(new Set<string>());
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const urls = sourceUrls.current;
    return () => {
      sequence.current += 1;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    onBusyChange(editing || loading || saving);
  }, [editing, loading, saving, onBusyChange]);

  useEffect(() => {
    if (editing) cropRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const width = source?.image.naturalWidth ?? 1;
  const height = source?.image.naturalHeight ?? 1;
  const side = Math.min(width, height) / zoom;
  const sx = (width - side) * x / 100;
  const sy = (height - side) * y / 100;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // Allows selecting the same file after removing it.
    if (!file) return;
    const token = ++sequence.current;
    setError("");
    if (file.size > 40 * 1024 * 1024) {
      setError("This photo is larger than 40 MB. Please choose a smaller copy.");
      return;
    }
    if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) {
      setError("Please choose a JPG, PNG, WebP or HEIC/HEIF photo, not a video or other file.");
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file);
    sourceUrls.current.add(url);
    const image = new window.Image();
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("timeout")); }, 15000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("decode")); };
        image.src = url;
      });
      if (token !== sequence.current) return;
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 80_000_000) throw new Error("dimensions");
      sourceUrls.current.forEach((old) => { if (old !== url) { URL.revokeObjectURL(old); sourceUrls.current.delete(old); } });
      setSource({ image, url, name: file.name });
      setZoom(1); setX(50); setY(50); setEditing(true);
    } catch (reason) {
      URL.revokeObjectURL(url); sourceUrls.current.delete(url);
      if (token !== sequence.current) return;
      setError(reason instanceof Error && reason.message === "dimensions"
        ? "This photo is too large to process here. Please choose a smaller copy."
        : /hei[cf]/i.test(file.name + file.type)
          ? "This browser cannot open this HEIC/HEIF photo yet. For this demo, please choose a JPG or PNG copy."
          : "We could not open this photo. Please try another JPG, PNG or WebP file.");
    } finally {
      if (token === sequence.current) setLoading(false);
    }
  }

  async function applyCrop() {
    if (!source || saving) return;
    setSaving(true); setError("");
    const token = sequence.current;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(1200, Math.max(1, Math.floor(side)));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source.image, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode")), "image/jpeg", 0.88));
      if (token !== sequence.current) return;
      onChange(URL.createObjectURL(blob));
      setEditing(false);
      chooseRef.current?.focus({ preventScroll: true });
    } catch {
      if (token === sequence.current) setError("The crop could not be saved. Please try again or choose a smaller photo.");
    } finally {
      if (token === sequence.current) setSaving(false);
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const size = event.currentTarget.getBoundingClientRect().width;
    if (width > side) setX(clamp(start.startX - (event.clientX - start.x) / size * side / (width - side) * 100));
    if (height > side) setY(clamp(start.startY - (event.clientY - start.y) / size * side / (height - side) * 100));
  }

  return (
    <div>
      <div className={styles.uploadGrid}>
        <div className={styles.uploadPreview}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Your selected square photo" />
          ) : <div><strong>YOUR PHOTO</strong><span>OPTIONAL</span></div>}
        </div>
        <div className={styles.uploadCopy}>
          <p>Choose a photo, adjust the square crop and confirm it.</p>
          <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={choosePhoto} />
          <div className={styles.photoActions}>
            <button ref={chooseRef} className={styles.photoButton} type="button" disabled={loading || saving} onClick={() => inputRef.current?.click()}>{value ? "REPLACE PHOTO" : "CHOOSE PHOTO"}</button>
            {value && <button className={styles.photoButton} type="button" disabled={loading || saving} onClick={() => {
              sequence.current += 1;
              onChange(null); setSource(null); setEditing(false); setError("");
              sourceUrls.current.forEach((url) => URL.revokeObjectURL(url)); sourceUrls.current.clear();
              chooseRef.current?.focus();
            }}>REMOVE PHOTO</button>}
          </div>
          <small>Up to 40 MB. Nothing is uploaded in this demo.</small>
          {loading && <p role="status">Opening photo…</p>}
        </div>
      </div>
      {error && <p className={styles.photoError} role="alert">{error}</p>}
      {editing && source && (
        <div className={styles.cropEditor}>
          <p id="crop-help" className={styles.fieldHint}>Drag to position your photo. Use the sliders to zoom or adjust the position.</p>
          <div ref={cropRef} className={styles.cropCanvas} tabIndex={-1} role="group" aria-label="Square photo crop" aria-describedby="crop-help"
            onPointerDown={(event) => {
              if (event.button !== 0 || saving || drag.current) return;
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: x, startY: y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source.url} draggable={false} alt="Photo crop preview" style={{ width: `${width / side * 100}%`, height: `${height / side * 100}%`, left: `${-sx / side * 100}%`, top: `${-sy / side * 100}%` }} />
          </div>
          <div className={styles.cropControls}>
            <label>Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} disabled={saving} onChange={(event) => setZoom(Number(event.target.value))} /></label>
            <label>Horizontal position <input type="range" min="0" max="100" step="0.1" value={x} disabled={saving || width <= side} onChange={(event) => setX(Number(event.target.value))} /></label>
            <label>Vertical position <input type="range" min="0" max="100" step="0.1" value={y} disabled={saving || height <= side} onChange={(event) => setY(Number(event.target.value))} /></label>
          </div>
          <div className={styles.photoActions}>
            <button type="button" className={styles.photoButton} disabled={saving || loading} onClick={applyCrop}>{saving ? "PREPARING…" : "USE THIS PHOTO"}</button>
            <button type="button" className={styles.photoButton} disabled={saving || loading} onClick={() => { setEditing(false); setError(""); chooseRef.current?.focus(); }}>CANCEL CROP</button>
          </div>
          <p className={styles.privacyNote}>Your current photo stays unchanged until you select “Use this photo”.</p>
        </div>
      )}
    </div>
  );
}
