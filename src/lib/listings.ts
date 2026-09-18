import { browserSupabase } from "./supabase";

export const vibes = ["Just for the views", "Good times, good pace", "Sporty but social", "Let’s shred", "Race to win"];
export type Listing = {
  id: string; type: "rider" | "team"; name: string; region: string;
  description: string; vibes: string[]; categories: string[];
  riderGender: string | null; seeking: string | null; age: number | null;
  languages: string; ridersNeeded: number | null; strava: string; instagram: string;
  image_path: string | null; status: "draft" | "active" | "closed";
  published_at: string | null; expires_at: string | null; revision: number;
  created_at: string; updated_at: string;
};
export type ListingInput = Pick<Listing, "type" | "name" | "region" | "description" | "vibes" | "categories" | "riderGender" | "seeking" | "age" | "languages" | "ridersNeeded" | "strava" | "instagram">;
export function meta(listing: Listing) {
  return listing.type === "rider" ? "Rider looking for a team" : `Team looking for ${listing.ridersNeeded === 5 ? "5+" : listing.ridersNeeded} rider${listing.ridersNeeded === 1 ? "" : "s"}`;
}
export function photoUrl(listing: Listing) {
  return listing.image_path ? `/api/photos?id=${listing.id}&v=${listing.revision}` : "/rider-placeholder.svg";
}
export function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not published";
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Something went wrong. Please try again.";
}
export async function rpc<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await browserSupabase().rpc(name, args);
  if (error) throw new Error(["23514", "23502", "22P02"].includes(error.code) ? "Please check the required fields, category, age and social profile links." : error.message);
  return data as T;
}
export async function removeListing(listing: Listing) {
  // Close first: a failed storage request must never leave a public listing half deleted.
  const closed = await rpc<Listing>("set_listing_status", { p_id: listing.id, p_status: "closed", p_revision: listing.revision });
  const storage = browserSupabase().storage.from("listing-photos");
  while (true) {
    const { data, error } = await storage.list(listing.id, { limit: 100 });
    if (error) throw error;
    if (!data?.length) break;
    const removed = await storage.remove(data.map((item) => `${listing.id}/${item.name}`));
    if (removed.error) throw removed.error;
  }
  await rpc("delete_listing", { p_id: listing.id, p_revision: closed.revision });
}
