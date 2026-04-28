import { NextRequest } from "next/server";
import { existsSync } from "fs";
import { resolve } from "path";
import { openForRead, PHOTOS_DIR } from "@/lib/storage";

// GET /api/v1/photos/[...path]
//
// Public read. Streams user-uploaded photos from the Render Persistent
// Disk mounted at PHOTOS_DIR. Path-traversal and symlink-escape are
// guarded in `openForRead` (it resolves against PHOTOS_DIR and rejects
// anything that doesn't stay under the root).
//
// One year `Cache-Control: immutable` because filenames are UUIDs —
// the same path never resolves to different bytes, so browsers + CDNs
// can cache forever.

// Force the route to always run on the server. Next.js 15 has aggressive
// route caching that can otherwise cache a 404 response from when the
// disk wasn't yet mounted.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  let storagePath: string | null = null;
  let absForLog: string | null = null;
  try {
    const { path } = await params;
    storagePath = path.join("/");
    absForLog = resolve(PHOTOS_DIR, storagePath);

    const opened = await openForRead(storagePath);
    if (!opened) {
      // Use console.error so Render shows it at high visibility — a
      // console.warn was being filtered out of the default Logs view.
      // Also include filesystem listing for the user dir so we can spot
      // case-sensitivity / encoding issues (e.g. NFD vs NFC unicode).
      let parentDirListing: string[] = [];
      try {
        const { readdirSync } = await import("fs");
        const { dirname } = await import("path");
        parentDirListing = readdirSync(dirname(absForLog!));
      } catch {
        // Parent dir might not exist — that itself is data.
      }
      console.error("[photos] 404", {
        storagePath,
        abs: absForLog,
        existsSync: existsSync(absForLog!),
        photosDir: PHOTOS_DIR,
        parentDirListing,
      });
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // openForRead returns a Uint8Array<ArrayBuffer>, which is a valid
    // BodyInit — Response can take it directly with no Blob wrapper.
    return new Response(opened.bytes, {
      status: 200,
      headers: {
        "Content-Type": opened.contentType,
        "Content-Length": String(opened.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[photos] error", {
      storagePath,
      abs: absForLog,
      message: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 5).join("\n"),
    });
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
