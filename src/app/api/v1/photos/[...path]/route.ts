import { NextRequest } from "next/server";
import { openForRead } from "@/lib/storage";

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
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const storagePath = path.join("/");

    const opened = await openForRead(storagePath);
    if (!opened) {
      // Tell clients NOT to cache the 404. Otherwise an image that's
      // missing now (e.g. file upload race, ephemeral-disk hangover)
      // stays "broken" on the device even after the file lands on disk.
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(opened.stream, {
      status: 200,
      headers: {
        "Content-Type": opened.contentType,
        "Content-Length": String(opened.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // Read errors (missing disk mount, permissions, stream conversion)
    // shouldn't crash the route — surface as 404 so the client renders a
    // placeholder instead of a hard error. Same no-store rule as above.
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
