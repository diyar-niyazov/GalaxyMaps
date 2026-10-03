# Submission checklist: BigRed//Hacks 2026

**Hard deadline:** Sunday, October 4, 2026, 8:30 AM America/New_York.
**Internal target:** 6:30 AM. Submit a complete version early and edit it afterwards; don't wait for perfection.

## Required by organizers

- [ ] **Entire-project link.** Push the whole repository (source, `public/data`, `docs/`) to a public host such as GitHub and paste the link on Devpost.
  - `node_modules/`, `dist/` and `.env` are git-ignored. **Never commit `.env`.**
  - The repository currently has no commits. Run `git add -A && git commit -m "SpaceMaps"`, add a remote, then push.
  - `public/media` is about 30 MB, which is fine for GitHub (no file is over 50 MB).
- [ ] **Google Drive link to the PDF deck.** Upload `docs/SpaceMaps-deck.pdf` to Google Drive, set sharing to "Anyone with the link can view", and paste the link on Devpost. Open the link in a private window to confirm it works.
- [ ] Devpost text: paste the sections from `docs/DEVPOST.md`. Re-read the bracketed Grok sentence and make it match what was actually tested.
- [ ] Screenshots for the Devpost gallery are in `docs/screenshots/` (route-polaris, place-saturn, milky-way, transfer, guide, …).
- [ ] Select tracks (see the eligibility notes below).
- [ ] All four team members are added to the Devpost project.

## Before judging

- [ ] `npm install && npm run build && npm start` works on the demo laptop. Open http://localhost:8787.
- [ ] `npm test` passes, and `npm run smoke` passes against the running server.
- [ ] Rehearse `docs/DEMO.md`: the 2-minute version at least twice and the 4-minute version once, with a timer.
- [ ] Laptop is charged, notifications are off, browser zoom is 100%, and fallback URLs are bookmarked.
- [ ] Optional: record a backup screen capture of the 2-minute demo in case of venue Wi-Fi or GPU trouble. The app itself runs offline.

## Track eligibility notes

Confirm the exact criteria in the official BigRed//Hacks rules or with the organizers. These notes reflect only what the project actually does.

| Track | Status | Notes |
| --- | --- | --- |
| BigRed (overall) | Eligible to submit | Fits the Navigation theme directly. |
| Software | Eligible to submit | A full-stack web app with a custom WebGL engine, a data pipeline and tests. |
| Design | Eligible to submit | Google-Maps-style interaction model, two visual layers, keyboard and reduced-motion support. |
| Beginner | **Check the rules** | The team is four first-time hackers. Confirm the definition (e.g. every member must be first-time) with the organizers. |
| People's Choice | Eligible to submit | Depends on the audience vote. |
| **SpaceX sponsor challenge** | **Not yet eligible. Do not claim it.** | See below. |

### SpaceX challenge: what's met and what's missing

The challenge requires (1) building with Cursor and (2) using the Grok Imagine or Grok Voice API with real space data.

- **Met:** the project was built with Cursor, and it uses real space data (JPL Horizons, SIMBAD, HYG, the NASA Exoplanet Archive).
- **Implemented but not verified:**
  - Grok Voice uses the xAI realtime WebSocket with ephemeral tokens and validated tool calls over the real catalog.
  - Grok Imagine generates destination images from catalog facts.
  - Neither has been exercised with a live API key, because none was configured during development.
- **To become eligible:**
  1. Get an xAI API key with credit from https://console.x.ai and put it in `.env` as `XAI_API_KEY=...`, server-side only.
  2. Restart with `npm run build && npm start`. The Guide pill should read "Grok Voice available".
  3. Click **Talk to Grok** and ask "Take me from Earth to Polaris". Confirm that Grok speaks, the route appears, and "Map action" lines show the tool calls.
  4. Open a featured destination card (e.g. Saturn) and click **AI view**. Confirm that an image labeled "AI reconstruction" appears.
  5. Fix anything that fails, ideally with time to spare. Only then select the SpaceX track and update the Devpost wording.
- If no key is available by the deadline, leave the SpaceX track unselected. The app still works fully with the offline guide.

Do not describe the offline scripted guide or browser speech as Grok anywhere: not on Devpost, in the deck or in the presentation.
