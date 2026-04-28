import { mkdir, writeFile, unlink, stat, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, sep, extname } from "path";
import { randomUUID } from "crypto";

/// Max upload size in bytes — mirrored on the Flutter side.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase());
}

/**
 * Root directory for user-uploaded photos. Configured via PHOTOS_DIR
 * env var and mounted as a Render Persistent Disk in production.
 * Defaults to `./uploads` for local dev.
 */
export const PHOTOS_DIR = resolve(process.env.PHOTOS_DIR ?? "./uploads");

/**
 * Mapping of upload kind → root folder under PHOTOS_DIR. Keeps the path
 * layout consistent across the three upload surfaces we serve.
 */
const KIND_FOLDER: Record<
  "profile" | "portfolio" | "user" | "report",
  string
> = {
  // Barber face photo + portfolio + customer avatars all live together
  // under `barber-photos/` so they share a single top-level directory.
  profile: "barber-photos",
  portfolio: "barber-photos",
  user: "barber-photos",
  // Report evidence lives separately — easier to clean up and the path
  // reflects purpose.
  report: "report-images",
};

/**
 * Public-facing origin for photo URLs. Behind a reverse proxy (Render,
 * Vercel, Cloudflare) the Node.js process's view of `request.url` is the
 * internal address (e.g. `https://localhost:10000`), not the URL devices
 * use. Resolution order:
 *   1. `PUBLIC_BASE_URL` env var (set this on Render to the public URL)
 *   2. `X-Forwarded-Proto` + `X-Forwarded-Host` headers
 *   3. Fallback: `request.url` origin (correct for local dev)
 */
export function getPublicOrigin(request: Request): string {
  const fromEnv = process.env.PUBLIC_BASE_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

/**
 * Persist an uploaded file to the photos disk. Returns a disk-relative
 * path like `barber-photos/{userId}/profile-{uuid}.jpg` and the public URL
 * that the app can render directly (served by GET /api/v1/photos/[...path]).
 */
export async function saveToDisk(params: {
  bytes: Uint8Array;
  userId: string;
  kind: "profile" | "portfolio" | "user" | "report";
  contentType: string;
  origin: string;
}): Promise<{ storagePath: string; url: string }> {
  const ext = extensionFor(params.contentType);
  const id = randomUUID();
  const filename = `${params.kind}-${id}.${ext}`;
  const subdir = join(KIND_FOLDER[params.kind], params.userId);

  const destDir = join(PHOTOS_DIR, subdir);
  await mkdir(destDir, { recursive: true });
  await writeFile(join(destDir, filename), params.bytes);

  // storagePath is always forward-slashed so it round-trips cleanly with
  // the URL; we re-resolve with `join()` on read so Windows dev hosts
  // still work.
  const storagePath = `${subdir.split(sep).join("/")}/${filename}`;
  const url = `${stripTrailingSlash(params.origin)}/api/v1/photos/${storagePath}`;
  return { storagePath, url };
}

/**
 * Best-effort delete. Silent on missing file or unreadable path —
 * an orphan blob is cheaper than blocking a user delete flow on IO.
 */
export async function deleteFromDisk(storagePath: string): Promise<void> {
  try {
    const abs = resolveSafe(storagePath);
    if (abs && existsSync(abs)) {
      await unlink(abs);
    }
  } catch {
    // Silent — see doc above.
  }
}

/**
 * Read a file back. Used by GET /api/v1/photos/[...path].
 * Returns null if the path escapes PHOTOS_DIR or the file is missing.
 *
 * Reads as a Buffer rather than streaming because Next.js's webpack
 * mangles `createReadStream(...).toWeb()` — the bundled return type loses
 * its prototype methods. Photos are capped at MAX_UPLOAD_BYTES (5 MB) so
 * fully-buffered reads are fine memory-wise.
 */
export async function openForRead(
  storagePath: string
): Promise<{ bytes: Uint8Array; size: number; contentType: string } | null> {
  const abs = resolveSafe(storagePath);
  if (!abs) return null;
  if (!existsSync(abs)) return null;

  const st = await stat(abs);
  if (!st.isFile()) return null;

  // readFile returns Node's Buffer (= Uint8Array<ArrayBufferLike>). TypeScript
  // 5.7 tightened BodyInit / BlobPart to require Uint8Array<ArrayBuffer> —
  // SharedArrayBuffer-backed views are no longer accepted. Copy into a fresh
  // ArrayBuffer-backed Uint8Array so the route can pass it to Response()
  // without unsafe casts. The constructor overload `new Uint8Array(arrayLike)`
  // returns Uint8Array<ArrayBuffer> with a brand-new backing buffer.
  const fileBuffer = await readFile(abs);
  const bytes = new Uint8Array(fileBuffer);
  return {
    bytes,
    size: st.size,
    contentType: contentTypeFor(abs),
  };
}

// ─── Helpers ───

function extensionFor(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/heic": return "heic";
    case "image/heif": return "heif";
    default: return "bin";
  }
}

function contentTypeFor(absPath: string): string {
  const ext = extname(absPath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".heic": return "image/heic";
    case ".heif": return "image/heif";
    default: return "application/octet-stream";
  }
}

/**
 * Resolve a relative storage path against PHOTOS_DIR, rejecting anything
 * that would escape the root (i.e. `..` traversal). Returns null on
 * rejection; otherwise an absolute filesystem path safe to open.
 */
function resolveSafe(storagePath: string): string | null {
  // Reject absolute paths and URL-encoded escapes outright.
  if (!storagePath || storagePath.startsWith("/") || storagePath.includes("\0")) {
    return null;
  }
  const abs = resolve(PHOTOS_DIR, storagePath);
  // Must live under PHOTOS_DIR. Trailing separator check blocks
  // `/data/photosSIBLING/...`.
  if (abs !== PHOTOS_DIR && !abs.startsWith(PHOTOS_DIR + sep)) {
    return null;
  }
  return abs;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
