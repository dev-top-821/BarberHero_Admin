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
export const TERMS_VERSION = "draft-0";
