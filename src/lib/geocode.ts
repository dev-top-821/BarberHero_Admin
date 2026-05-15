// UK postcode → coordinates geocoding.
//
// Barbers only ever give us a UK postcode (the onboarding screen has no
// map pin), but the customer map query hard-requires non-null
// latitude/longitude (GET /api/v1/barbers/nearby). Without this step an
// approved barber never appears on the map.
//
// Uses postcodes.io — a free, open, no-API-key UK postcode service. The
// base URL is overridable via GEOCODE_API_URL so it can be swapped or
// pointed at a self-hosted mirror without code changes.

const GEOCODE_BASE_URL = (
  process.env.GEOCODE_API_URL ?? "https://api.postcodes.io"
).replace(/\/+$/, "");

// Don't let a slow/unreachable geocoder hang a registration or profile
// save — bail after this many ms and let the caller decide what to do.
const TIMEOUT_MS = 5000;

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

interface PostcodesIoSingle {
  status: number;
  result: { latitude: number; longitude: number } | null;
}

interface PostcodesIoBulk {
  status: number;
  result: Array<{
    query: string;
    result: { latitude: number; longitude: number } | null;
  }> | null;
}

function coordsFrom(
  r: { latitude: number; longitude: number } | null | undefined
): GeoCoords | null {
  if (
    !r ||
    typeof r.latitude !== "number" ||
    typeof r.longitude !== "number" ||
    Number.isNaN(r.latitude) ||
    Number.isNaN(r.longitude)
  ) {
    return null;
  }
  return { latitude: r.latitude, longitude: r.longitude };
}

/**
 * Resolve a single UK postcode to coordinates. Returns null on an
 * invalid/unknown postcode, a network error, or a timeout — callers
 * decide whether that is fatal (submit-for-review) or best-effort
 * (registration / profile save). Never throws.
 */
export async function geocodePostcode(
  postcode: string | null | undefined
): Promise<GeoCoords | null> {
  const pc = (postcode ?? "").trim();
  if (!pc) return null;

  try {
    const res = await fetch(
      `${GEOCODE_BASE_URL}/postcodes/${encodeURIComponent(pc)}`,
      { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    // 404 = postcode not found. Any non-2xx → treat as unresolved.
    if (!res.ok) return null;
    const body = (await res.json()) as PostcodesIoSingle;
    return coordsFrom(body.result);
  } catch {
    // Network failure, timeout, or malformed JSON — unresolved.
    return null;
  }
}

/**
 * Bulk-resolve postcodes (max 100 per call upstream). Returns a Map
 * keyed by the EXACT input string so callers can match results back to
 * their records. Unresolved postcodes are simply absent from the Map.
 * Never throws.
 */
export async function geocodePostcodesBulk(
  postcodes: string[]
): Promise<Map<string, GeoCoords>> {
  const out = new Map<string, GeoCoords>();
  const cleaned = postcodes.map((p) => (p ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return out;

  try {
    const res = await fetch(`${GEOCODE_BASE_URL}/postcodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: cleaned }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok) return out;
    const body = (await res.json()) as PostcodesIoBulk;
    for (const entry of body.result ?? []) {
      const coords = coordsFrom(entry.result);
      if (coords) out.set(entry.query, coords);
    }
  } catch {
    // Best-effort: return whatever we managed to resolve (possibly none).
  }
  return out;
}
