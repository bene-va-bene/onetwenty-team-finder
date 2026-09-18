// Keep an explicit response for stale browser tabs using the retired email endpoint.
export async function POST() {
  return Response.json({ error: "Messages have moved into the app. Please refresh the Team Finder." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
