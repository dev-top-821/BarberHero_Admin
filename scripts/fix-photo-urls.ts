// Rewrites stored photo URLs whose origin points at a private/internal
// host (e.g. `https://localhost:10000/...`) to the public origin. Reads
// the target origin from PUBLIC_BASE_URL.
//
// Usage:
//   PUBLIC_BASE_URL="https://barberhero-admin.onrender.com" \
//     npx tsx scripts/fix-photo-urls.ts
//
// Idempotent: rerunning is a no-op once URLs already match the new origin.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TARGET_ORIGIN = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
if (!TARGET_ORIGIN) {
  console.error(
    "PUBLIC_BASE_URL is required (e.g. https://barberhero-admin.onrender.com)"
  );
  process.exit(1);
}

// Match anything up to and including `/api/v1/photos/` so we keep only the
// disk-relative path on the right-hand side.
const PHOTOS_PATH_RE = /^https?:\/\/[^/]+(\/api\/v\d+\/photos\/.+)$/;

function rewrite(url: string | null): string | null {
  if (!url) return url;
  const m = url.match(PHOTOS_PATH_RE);
  if (!m) return url;
  return `${TARGET_ORIGIN}${m[1]}`;
}

async function main() {
  let userPatched = 0;
  let photoPatched = 0;
  let reportPatched = 0;

  // ─── User.profilePhoto ───
  const users = await prisma.user.findMany({
    where: { profilePhoto: { not: null } },
    select: { id: true, profilePhoto: true },
  });
  for (const u of users) {
    const next = rewrite(u.profilePhoto);
    if (next && next !== u.profilePhoto) {
      await prisma.user.update({
        where: { id: u.id },
        data: { profilePhoto: next },
      });
      userPatched++;
    }
  }

  // ─── BarberPhoto.url ───
  const photos = await prisma.barberPhoto.findMany({
    select: { id: true, url: true },
  });
  for (const p of photos) {
    const next = rewrite(p.url);
    if (next && next !== p.url) {
      await prisma.barberPhoto.update({
        where: { id: p.id },
        data: { url: next },
      });
      photoPatched++;
    }
  }

  // ─── Report images (if the model has a photoUrls array on Report) ───
  // Guarded against missing field at runtime.
  try {
    const reports = await (prisma as unknown as {
      report: {
        findMany: (args: unknown) => Promise<
          Array<{ id: string; photoUrls?: string[] | null }>
        >;
        update: (args: unknown) => Promise<unknown>;
      };
    }).report.findMany({ select: { id: true, photoUrls: true } });
    for (const r of reports) {
      if (!Array.isArray(r.photoUrls)) continue;
      const nextUrls = r.photoUrls.map((u) => rewrite(u) ?? u);
      const changed = nextUrls.some((u, i) => u !== r.photoUrls![i]);
      if (changed) {
        await (prisma as unknown as {
          report: { update: (args: unknown) => Promise<unknown> };
        }).report.update({
          where: { id: r.id },
          data: { photoUrls: nextUrls },
        });
        reportPatched++;
      }
    }
  } catch {
    // Report model has no photoUrls field — skip silently.
  }

  console.log(
    `Patched: ${userPatched} user avatars, ${photoPatched} portfolio photos, ${reportPatched} reports`
  );
  console.log(`Target origin: ${TARGET_ORIGIN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
