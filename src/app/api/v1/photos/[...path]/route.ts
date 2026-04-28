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
      return new Response("Not found", { status: 404 });
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
    // placeholder instead of a hard error.
    return new Response("Not found", { status: 404 });
  }
}
