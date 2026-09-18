import sharp from "sharp";
import { requestSupabase } from "@/lib/supabase";
import type { Listing } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limit = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function error(message: string, status = 400) { return Response.json({ error: message }, { status, headers }); }

export async function POST(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!uuid.test(id)) return error("Invalid listing.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error("Please sign in.", 401);
  try {
    const client = requestSupabase(token);
    const { data, error: authError } = await client.auth.getUser(token);
    if (authError || !data.user?.email_confirmed_at) return error("Please sign in again.", 401);
    const mine = await client.rpc("my_listings");
    if (mine.error || !(mine.data as Listing[]).some((listing) => listing.id === id)) return error("Listing not found.", 404);
    if (Number(request.headers.get("content-length")) > limit) return error("Please crop a smaller photo.", 413);
    const reader = request.body?.getReader();
    if (!reader) return error("Please choose a photo.");
    const parts: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); return error("Please crop a smaller photo.", 413); }
      parts.push(value);
    }
    // Decode and encode again. This verifies content and strips EXIF/GPS, even if
    // a caller bypasses the browser cropper. Originals are never stored.
    const image = await sharp(Buffer.concat(parts), { limitInputPixels: 40_000_000 }).rotate()
      .resize(1200, 1200, { fit: "cover", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    const path = `${id}/${crypto.randomUUID()}.jpg`;
    const upload = await client.storage.from("listing-photos").upload(path, image, { contentType: "image/jpeg", upsert: false });
    if (upload.error) return error("Could not save your photo. Please try again.", 503);
    return Response.json({ path }, { headers });
  } catch { return error("This photo could not be processed. Please choose a JPG, PNG or WebP photo."); }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!uuid.test(id)) return error("Photo not found.", 404);
  try {
    // Fresh anonymous client: no privileged key and no shared server session.
    const client = requestSupabase();
    const { data, error: lookupError } = await client.rpc("public_listing", { p_id: id });
    if (lookupError || !data?.image_path) return error("Photo not found.", 404);
    const photo = await client.storage.from("listing-photos").download(data.image_path);
    if (photo.error || !photo.data) return error("Photo not found.", 404);
    const image = await sharp(Buffer.from(await photo.data.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate().resize(1200, 1200, { fit: "cover", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return new Response(new Uint8Array(image), { headers: { ...headers, "Content-Type": "image/jpeg" } });
  } catch { return error("Photo not found.", 404); }
}
