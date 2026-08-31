# WeaoSMP.xyz — Server Status

A live status page for the **weaosmp.xyz** Minecraft server, styled after the
[WEAO](https://weao.gg) design system (Poppins, `#1a1a1a` base, the green
`#3bea57` / red `#ec3b47` accent pair, glass topbar and its theme switcher).

**Live:** https://mireyacs.github.io/weaosmp-status/

## What it shows

- **Online / offline badge** for `weaosmp.xyz:25565`, re-checked every 60 seconds
- **Currently playing** — player heads and names from the server's ping sample list
- **Stats** — player count, slot capacity bar, version + protocol, resolved IP, server software, plugin/mod counts
- **MOTD** rendered with full Minecraft `§` colour and format codes (including Bungee `§x` hex)
- **Recent checks** — an uptime strip and a player-count sparkline built from your own visits.
  Time the page was closed is drawn as "No data" rather than being closed over, so a
  gap of hours never masquerades as two checks a minute apart
- **Themes** — all nine from WEAO's own picker (Dark, Light, Amoled, Kyoto, voxlis.NET, Pulsery, Sirmeme, Revision, Ball 2.0), remembered between visits, with their signature effects:
  - **voxlis.NET** rains red hearts, and clicking anywhere spawns more
  - **Sirmeme** rains the Sirmeme emblem
  - **Ball 2.0** paints its image over the page and every element on it
  - **Israel** uses the flag's white and `#0038b8`, switches the whole
    interface to Hebrew with a right-to-left layout, rains Stars of David,
    carries the flag's twin stripes under the topbar and over the footer, and
    sets a faint menorah watermark behind the page. Its picker swatch is the
    flag itself rather than the usual colour quadrants.
- **Back to top** — a circular button appears in the bottom-right once you scroll past 320px

## How it works

Everything runs in the browser, so it can be hosted as a plain static site on
GitHub Pages with no backend.

| Piece | Source |
| --- | --- |
| Server ping | [mcstatus.io](https://mcstatus.io) `v2/status/java`, falling back to [mcsrvstat.us](https://mcsrvstat.us) `v3` |
| Player heads | [mc-heads.net](https://mc-heads.net) |
| History | `localStorage` — it never leaves your browser, and only covers time the page was open |
| Theme tokens | Extracted from weao.gg's compiled stylesheet, so the palettes are exact rather than approximated |

### Assets

Both live in `assets/img/` and ship with the page rather than being hotlinked:

- `favicon.ico` — WEAO's own favicon
- `server-icon.webp` — the SMP's Discord icon, shown beside the address. It
  renders in full colour while the server is up and desaturates to grayscale
  whenever the server is down or the status API is unreachable.
- `red-heart.svg`, `sirmeme.png`, `ball2.0.png` — the emblems the voxlis.NET,
  Sirmeme and Ball 2.0 themes use. Each only loads when its theme is picked.
- `og-image.png` — the 1200x630 link preview thumbnail
- `apple-touch-icon.png` — 180x180 home-screen icon
- `star-of-david.svg`, `israel-flag.svg`, `menorah.svg` — hand-drawn geometry
  for the Israel theme, in the flag's `#0038b8`. They are plain paths rather
  than traced artwork, so they stay crisp at any size and total under 2 KB.

Theme rain is skipped entirely under `prefers-reduced-motion`.

## Link previews

`index.html` carries a full Open Graph + Twitter card block aimed primarily at
Discord. Every URL in it is absolute, since scrapers do not resolve relative
ones — if the site ever moves, those need updating along with `og:url` and the
canonical link.

Two things worth knowing:

- **Discord colours an embed's left bar from `theme-color`.** The page declares
  the WEAO green first for Discord, then repeats a dark value with a
  `prefers-color-scheme` media attribute; browsers prefer the media-matched tag,
  so the mobile address bar stays dark while the embed bar stays green.
- **Discord caches aggressively.** After changing the tags or the image, re-scrape
  with <https://discord.com/developers/embed?url=...> or by adding a throwaway
  query string (`?v=2`) to the link. It caches per exact URL.

### Regenerating the thumbnail

The thumbnail is a rendered web page, not a hand-made image, so it stays in
sync with the site's type and palette:

```bash
./tools/render-og.sh                          # needs Chrome on PATH
CHROME="flatpak run com.google.Chrome" ./tools/render-og.sh   # or point at one
```

It serves the repo over HTTP, screenshots `tools/og-image.html` at exactly
1200x630, and writes `assets/img/og-image.png`. A sandboxed browser cannot write
into the repo, so the script stages the render through `$HOME/Downloads` (or
`$OG_STAGE`) and moves it into place.

## Developer mode

Type `developermode` anywhere on the page (outside a text field) to unlock a
debug panel. It stays unlocked across reloads until you press **Lock**.

| Tool | What it does |
| --- | --- |
| Server target | Point the page at any Minecraft server, host and port |
| Source | Pin the fetch to mcstatus.io or mcsrvstat.us instead of failing over |
| Interval | Override the 60s refresh, 5–600s |
| Force UI state | Render against a synthetic online/offline/error response |
| Last response | The untouched API JSON, with a copy button |
| Diagnostics | Target, theme, language, history size, storage use, viewport, agent |
| Clear history | Drop the uptime history only |
| Purge site cache | Clear all `weaosmp:` keys, session storage, Cache Storage and any service worker, then reload past the HTTP cache |

Notes for anyone extending it:

- **This is a convenience, not a security boundary.** Everything it does runs
  client-side and is visible in the source; it is hidden to stay out of the way,
  not to keep anyone out.
- Whenever the page is pointed somewhere other than the default, or a state is
  forced, an amber banner says so. Retargeting blanks the previous server's
  figures immediately rather than leaving them under the new name.
- **Force UI state** is the useful one day to day: weaosmp is often down, and
  the synthetic response carries a coloured MOTD, real player UUIDs and plugin
  counts, so the whole render path can be worked on without a live server.
- Purge caps the Cache Storage and service-worker sweeps at 1.5s and reloads
  regardless. Both can be pathologically slow — `getRegistrations()` was
  measured at 23s here — and the reload must not wait on them.
- The panel is deliberately `dir="ltr"` and untranslated, including under the
  Hebrew theme. It is a debug surface, not part of the site.

## Translations

A theme may carry a language: `{ id: 'israel', …, lang: 'he' }` in the `THEMES`
array is what makes picking it switch the page to Hebrew. Everything else falls
back to English, and switching away restores it.

Strings live in one `I18N` table in `assets/js/app.js`:

- **Static markup** is tagged in `index.html` — `data-i18n` for text,
  `data-i18n-html` for strings containing links, `data-i18n-title` and
  `data-i18n-aria-label` for attributes.
- **Live strings** go through `t('key', { placeholder: value })`, or
  `tn('key', count)` where a `key_one` entry supplies the singular.

`applyLanguage()` repaints the static markup first and then re-renders the last
response over it, so switching language mid-session updates the player list,
status line and uptime figures rather than resetting them to their placeholders.
Anything JS owns outright (`#last-checked`) is deliberately *not* tagged, or the
static pass would overwrite the live value.

For Hebrew the page sets `lang="he" dir="rtl"` and swaps Poppins for Rubik,
which carries both scripts. Identifiers that must stay left-to-right inside
right-to-left prose — the address, IP, MOTD, version and player names — are
pinned with `direction: ltr`.

### One thing to watch when editing themes

The theme palettes are scoped to `html[data-theme=…]` / `body[data-theme=…]`
rather than a bare `[data-theme=…]`, and the picker buttons deliberately use
`data-theme-id`. A bare attribute selector matches the buttons too, which
silently repaints each row's label in the palette it is offering.

MOTD and player names come back from the API as `§`-coded strings and are parsed
into DOM nodes locally; no API HTML is ever injected into the page.

### Player list caveat

The Minecraft ping protocol only returns a *sample* of online players, and
servers can disable it entirely. When the list is empty the page still shows the
accurate count and says so explicitly.

## Configuration

Everything is in the `CONFIG` object at the top of `assets/js/app.js`:

```js
var CONFIG = {
  host: 'weaosmp.xyz',
  port: 25565,
  refreshMs: 60000,
  // …
};
```

## Local development

No build step — it is three static files.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

GitHub Pages serves the repository root of `main` directly (Settings → Pages →
*Deploy from a branch*), so a plain `git push` publishes. `.nojekyll` keeps
Jekyll from touching the files.

---

Unofficial community status page. Not affiliated with Mojang, Microsoft, or WEAO.
