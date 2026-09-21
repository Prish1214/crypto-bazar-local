# Plan — KryptoBazar Branding and AI Dispute Guidance

## Branding and visual surfaces
- Replace any remaining user-visible `CryptoBazar` text with `KryptoBazar`, including labels embedded in chat/dispute empty states and onboarding copy.
- Add a compact KryptoBazar brand mark component and reuse it in the site header, onboarding graphics, and relevant branded empty states so the renamed brand is visible beyond plain text.
- Create a matching square favicon in `public/`, reference it from the root page metadata, and remove any stale default favicon if present.
- Preserve technical identifiers such as package names, database keys, encryption salts, API hosts, app IDs, storage keys, and route names.

## Browser, sharing, and install metadata
- Make browser titles and leaf-page metadata consistently use KryptoBazar.
- Complete the root and landing-page Open Graph/Twitter labels for the renamed brand.
- Add a web app manifest with `name` and `short_name` set to KryptoBazar, theme colors, display mode, and generated app icons; link it from the root page.
- Do not edit the protected native-shell files (`capacitor.config.ts`, `mobile/`, `vite.mobile.config.ts`, `src/mobile-entry.tsx`, or `android/`). The web install experience will use KryptoBazar; the externally managed Android shell still needs its display name changed in that managed source.

## AI-assisted dispute intake
- Expand the existing “Open a dispute” dialog into a compact mobile-first intake with:
  - detailed account of what happened,
  - requested resolution,
  - optional photo/video evidence,
  - an “Analyze case” action,
  - a clearly labeled AI summary and suggested next steps.
- Keep filing under the trader’s control: AI analysis never opens, resolves, or changes a dispute automatically.
- Submit the AI summary alongside the trader’s original wording in the existing dispute record, without changing the current schema.

## Secure AI endpoint
- Add an authenticated `/api/disputes/analyze` endpoint using the enabled AI Gateway and the required `openai/gpt-6-astra` model.
- Verify the signed-in user is the buyer or seller for the supplied deal before reading or analyzing it.
- Validate and limit all user input; send only the minimum case and deal facts needed for the analysis.
- Return structured, neutral guidance: a concise case summary, missing evidence, immediate safety steps, and recommended next actions.
- Include a visible disclaimer that this is AI-generated guidance for preparation, not a final dispute decision.
- Apply the project’s required Android API conventions: `apiUrl()` in the client and `withCorsHandlers()` for the API route.

## Verification
- Check that no visible `CryptoBazar` references remain while technical identifiers stay unchanged.
- Verify the manifest, favicon, titles, and social metadata are served.
- Exercise the dispute dialog’s validation, analysis, evidence selection, and final submission flow.
- Verify the AI endpoint rejects unauthenticated users and users unrelated to the deal.
- Check the updated screens at the current mobile viewport and a desktop viewport.

## Technical details
- New files: brand mark/icon assets, `public/manifest.webmanifest`, AI Gateway server helper, and the authenticated dispute-analysis API route.
- Updated files: root metadata, branding surfaces, onboarding visuals, selected empty states, dispute dialog, and dispute display typing as needed.
- AI output remains advisory and does not replace admin review.
