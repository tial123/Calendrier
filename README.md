# Calendrier

A simple, clean calendar for iPhone: plans, work shifts, the gym and anything else.

It's an installable web app. Add it to your Home Screen and it opens full-screen like a regular app and works offline. Your events stay on your phone.

## Features

- **Month view** with colored dots per category. Swipe left/right to change month. Tap a day to see its events.
- **Upcoming** list for the next 90 days, with a **this week** summary (for example "Work: 32h, 4 events"). You can filter by category.
- **Categories**: Plans, Work, Gym and Other to start with. You can rename them, recolor them or add your own in Settings.
- **Repeating events**: every day, every weekday, weekly, every 2 weeks or monthly, with an optional end date. You can edit or delete just one occurrence, or that occurrence and all later ones.
- **Shift-friendly**:
  - Overnight shifts (22:00 → 06:00) work, with the length shown.
  - A new event remembers the last times you used for its category, so a new Work event starts at your usual shift hours.
- 12h or 24h time, and the week can start on Sunday or Monday.
- Light and dark mode follow your iPhone setting.
- **Backup**: export to a file (save it to Files, AirDrop it, email it) and restore it later.

## Put it on your iPhone

1. Host the folder on GitHub Pages (free):
   - On GitHub, open the repository and go to **Settings → Pages**.
   - Under **Build and deployment**, pick **Deploy from a branch**.
   - Choose the branch (`main`) and the **/ (root)** folder, then **Save**.
   - After a minute the site is live at `https://<your-username>.github.io/calendrier/`.
2. Open that link in **Safari** on your iPhone.
3. Tap the **Share** button, then **Add to Home Screen**.

Calendrier now has its own icon and opens like any other app.

> Events are saved on the device, in the app's own storage. Use **Settings → Export Backup** now and then, especially before changing phones.

## Run it locally

No build step and no dependencies. Serve the folder with any static server:

```sh
npm start          # or: python3 -m http.server 8080
```

Then open http://localhost:8080.

## Tests

```sh
npm test
```

These are unit tests for the date math, the repeat rules and storage (Node's built-in test runner).

## Project layout

```
index.html            app shell
css/app.css           all styles (light and dark)
js/app.js             UI: views, editor, settings
js/dates.js           date helpers ("YYYY-MM-DD" keys, formatting)
js/events.js          repeat rules, sorting, weekly totals
js/store.js           data model, saving to localStorage, backups
sw.js                 offline cache
manifest.webmanifest  home-screen app metadata
icons/                app icons
```

If you add or rename a file, list it in `sw.js` and bump `CACHE` so installed copies pick up the change.
