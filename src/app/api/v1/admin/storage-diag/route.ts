import { NextRequest } from "next/server";
import { existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { PHOTOS_DIR } from "@/lib/storage";

// GET /api/v1/admin/storage-diag
// Admin-only diagnostic: reports what the running server actually sees
// for the photos disk. Use to debug "uploads succeed but reads 404"
// (mismatched env vars, persistent disk not mounted, etc).
//
// Optional ?path=<relative-storage-path> probes a specific file.
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { searchParams } = new URL(request.url);
    const probe = searchParams.get("path");

    const envValue = process.env.PHOTOS_DIR ?? null;
    const cwd = process.cwd();
    const resolvedRoot = resolve(PHOTOS_DIR);
    const rootExists = existsSync(resolvedRoot);
    const rootIsDir = rootExists && statSync(resolvedRoot).isDirectory();

    let topLevelEntries: string[] = [];
    let totalFiles = 0;
    let firstFiveFiles: string[] = [];
    if (rootIsDir) {
      try {
        topLevelEntries = readdirSync(resolvedRoot);
      } catch {
        // permission error or similar
      }
      // Walk barber-photos/* subdirs to count files (small operation)
      try {
        const barberPhotos = resolve(resolvedRoot, "barber-photos");
        if (existsSync(barberPhotos)) {
          for (const userId of readdirSync(barberPhotos)) {
            const userDir = resolve(barberPhotos, userId);
            if (!statSync(userDir).isDirectory()) continue;
            for (const f of readdirSync(userDir)) {
              totalFiles++;
              if (firstFiveFiles.length < 5) {
                firstFiveFiles.push(`${userId}/${f}`);
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    const probeResult = probe
      ? (() => {
          const abs = resolve(resolvedRoot, probe);
          const inside =
            abs === resolvedRoot || abs.startsWith(resolvedRoot + "/");
          return {
            requested: probe,
            absolutePath: abs,
            insidePhotosDir: inside,
            exists: inside ? existsSync(abs) : false,
          };
        })()
      : null;

    return jsonResponse({
      env: { PHOTOS_DIR: envValue },
      cwd,
      resolved: {
        path: resolvedRoot,
        exists: rootExists,
        isDirectory: rootIsDir,
      },
      contents: {
        topLevelEntries,
        barberPhotosFileCount: totalFiles,
        firstFiveFiles,
      },
      probe: probeResult,
      nodeVersion: process.version,
    });
  } catch (e) {
    return errorResponse(
      "SERVER_ERROR",
      `Diag failed: ${(e as Error).message}`,
      500
    );
  }
}
