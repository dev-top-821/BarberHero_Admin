// ─── Legal document version — SINGLE SOURCE OF TRUTH ───
//
// Bump this string whenever the Terms & Conditions or Privacy Policy text
// changes. Acceptance records store the version that was accepted; the
// booking / submit-for-review gates require the CURRENT version, so any
// bump transparently forces every user to re-accept.
//
// ⚠️ This must stay in lock-step with `kLegalVersion` in
// Barber_App/packages/shared_models/lib/src/legal.dart (the apps render
// the text; the server only tracks the version). When the client supplies
// the final wording, replace the placeholder text in legal.dart and set
// BOTH constants to the same real version (e.g. "1.0").
// Explicit `: string` keeps the comparison below valid for either a real
// version or the placeholder sentinel `"draft-0"` — without it TS narrows
// to a literal type and rejects the dormancy check.
export const TERMS_VERSION: string = "1.0";

// While TERMS_VERSION is the placeholder sentinel `"draft-0"` the whole
// acceptance feature is DORMANT: server gates are skipped and the apps
// hide the checkbox, so the build behaves exactly as before the T&C work.
// Setting TERMS_VERSION to any other value (and kLegalVersion in
// legal.dart to the same value) flips everything on at once.
export const TERMS_ENABLED = TERMS_VERSION !== "draft-0";
