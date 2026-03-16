# Radio Ravnica Paper Events

Live site: https://suppennudel.github.io/radio-ravnica-paper-events/

Static website for Magic: The Gathering paper events, intended for deployment via GitHub Pages.

The frontend reads event data from [data/events.json](data/events.json). There is no backend in this repository.

## Project Structure

- [index.html](index.html): page markup
- [styles.css](styles.css): site styling
- [app.js](app.js): filtering, rendering, and map logic
- [data/events.json](data/events.json): generated event data consumed by the site

## Local Development

This is a static site, so you can open [index.html](index.html) directly or serve the folder with any simple HTTP server.

If you use Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying To GitHub Pages

This repository is connected to:

- `https://github.com/SuppenNudel/radio-ravnica-paper-events.git`

Typical first push:

```bash
git add .
git commit -m "Initial GitHub Pages site"
git push -u origin main
```

Then enable GitHub Pages in the repository settings:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`.

After each push to `main`, GitHub Pages will publish the updated site.

## Updating Event Data

The site only serves committed files. That means [data/events.json](data/events.json) must be updated in this repository for the public site to change.

Recommended flow:

1. Your Discord bot project reads from SQLite.
2. The bot project converts the database contents into the JSON structure used here.
3. The bot project updates [data/events.json](data/events.json) in this repository.
4. GitHub Pages republishes automatically after the commit.

## Suggested Automation

The simplest integration is for the bot project to update this repository through the GitHub Contents API.

Required setup:

- a GitHub token stored in the bot project, for example as `PAGES_REPO_TOKEN`
- permission to write contents for this repository

The bot can then overwrite [data/events.json](data/events.json) with a commit message such as `Update events.json from Discord bot`.

Alternative approach:

- trigger a GitHub Actions workflow in this repository from the bot project
- let the workflow write and commit [data/events.json](data/events.json)

That keeps write access logic inside this repository, but requires more setup.

## Event Data Shape

The JSON file currently contains top-level metadata and an `events` array:

```json
{
  "generated_at": "2026-03-16T10:06:11.561004",
  "server_id": "783441128119730236",
  "count": 6,
  "events": []
}
```

Each event object is expected to include fields such as:

- `id`
- `title`
- `start_at`
- `end_at`
- `location_name`
- `location_address`
- `location_city`
- `event_type`
- `formats`
- `url`
- `image_url`

Optional `lat` and `lon` values can also be included to avoid client-side geocoding.

## Notes

- If `lat` and `lon` are missing, the frontend tries to geocode addresses in the browser.
- Precomputing coordinates in the bot project is preferable because it reduces external requests and speeds up page load.