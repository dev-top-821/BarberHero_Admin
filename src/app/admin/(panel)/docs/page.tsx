"use client";

import { useEffect } from "react";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

const GROUP_NAMES = ["Admin Panel", "Mobile App"];

const customCss = `
  /* Hide "Ask AI" CSS fallback */
  button[aria-label*="Ask AI" i],
  button[title*="Ask AI" i],
  [class*="ask-ai" i],
  [data-testid*="ask-ai" i] {
    display: none !important;
  }

  /* Hide Scalar footer ("Powered by Scalar") */
  .references-footer,
  [class*="references-footer"] {
    display: none !important;
  }

  /* Tag-group headings (marked by our observer below) */
  .ba-tag-group {
    margin-top: 24px !important;
    padding-top: 16px !important;
    border-top: 1px solid var(--scalar-border-color, rgba(255,255,255,0.1)) !important;
    font-size: 0.75rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    color: var(--scalar-color-2, #888) !important;
  }
`;

function useScalarTweaks() {
  useEffect(() => {
    function tweak() {
      // Hide any button labelled "Ask AI"
      document.querySelectorAll<HTMLElement>("button, [role='button']").forEach((b) => {
        if (/ask\s*ai/i.test(b.textContent ?? "") && b.style.display !== "none") {
          b.style.display = "none";
        }
      });

      // Hide any "Powered by Scalar" text node's ancestor
      document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
        const text = el.textContent?.trim();
        if (
          text === "Powered by Scalar" &&
          el.children.length === 0 &&
          el.style.display !== "none"
        ) {
          (el.closest("footer, [class*='footer']") ?? el).setAttribute(
            "style",
            "display: none !important"
          );
        }
      });

      // Mark tag-group headings so CSS can style them
      document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
        const text = el.textContent?.trim();
        if (
          text &&
          GROUP_NAMES.includes(text) &&
          el.children.length === 0 &&
          !el.classList.contains("ba-tag-group")
        ) {
          el.classList.add("ba-tag-group");
        }
      });
    }
    tweak();
    const observer = new MutationObserver(tweak);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

export default function DocsPage() {
  useScalarTweaks();

  return (
    <div className="h-full">
      <ApiReferenceReact
        configuration={
          {
            url: "/api/openapi",
            theme: "default",
            darkMode: false,
            showToolbar: "never",
            hideClientButton: true,
            hideDownloadButton: true,
            customCss,
          } as Parameters<typeof ApiReferenceReact>[0]["configuration"]
        }
      />
    </div>
  );
}
