# Fixtures

## search-results.html

A sanitized copy of a real StreetEasy search results page
(`/for-rent/nyc/...`), used so DOM-dependent tests (listing-card discovery,
JSON-LD coordinate extraction) run against real markup instead of the live
site. Live-site tests are flaky, anti-bot-protected, and put a third party
in CI's critical path.

- Captured: 2026-07-04
- Source URL shape: `https://streeteasy.com/for-rent/nyc/...` (a logged-in
  search results page)

### Refresh procedure

1. Open a StreetEasy search results page while logged in.
2. Chrome → Save As → "Webpage, HTML Only" → save to the repo root as
   `streeteasy-fixture.html` (gitignored — never commit the raw save).
3. Run `node scripts/sanitize-fixture.mjs` to regenerate
   `test/fixtures/search-results.html`. The script strips executable
   `<script>` tags (keeping only the `application/ld+json` block), inline
   event handlers, and known session/account leaks, then refuses to write
   the output if verification fails (missing listing cards, missing/invalid
   ld+json, or a leftover email/session identifier).
4. Review `git diff` on the fixture before committing — this is the
   DOM-drift early-warning system. If a downstream selector test starts
   failing after a refresh, that's StreetEasy markup drift, which is the
   fixture doing its job, not a bug in the refresh.
5. Commit the regenerated fixture (and update the "Captured" date above).
