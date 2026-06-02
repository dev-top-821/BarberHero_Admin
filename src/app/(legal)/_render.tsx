import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

// Renders one of the canonical legal markdown files (server-side).
//
// Source of truth is `Docs/terms/*.md` in the Barber_App repo. Because the two
// repos deploy separately, the agreed copies are mirrored here in `_content/`.
// When the wording changes, update Docs/terms, the apps' assets/legal, AND these
// files together (see shared_models/lib/src/legal.dart for the full procedure).
const CONTENT_DIR = join(process.cwd(), "src", "app", "(legal)", "_content");

export function LegalDoc({ file }: { file: string }) {
  const md = readFileSync(join(CONTENT_DIR, file), "utf8");
  const html = marked.parse(md, { async: false }) as string;
  return (
    <div
      className="space-y-4 leading-relaxed [&_a]:text-[#D42B2B] [&_a]:underline [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-7 [&_hr]:border-neutral-200 [&_li]:text-neutral-700 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_p]:text-neutral-700 [&_strong]:text-neutral-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
