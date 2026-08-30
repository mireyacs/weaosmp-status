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
- **Recent checks** — an uptime strip and a player-count sparkline built from your own visits
- **Themes** — all nine from WEAO's own picker (Dark, Light, Amoled, Kyoto, voxlis.NET, Pulsery, Sirmeme, Revision, Ball 2.0), remembered between visits
- **Back to top** — a circular button appears in the bottom-right once you scroll past 320px

## How it works

Everything runs in the browser, so it can be hosted as a plain static site on
GitHub Pages with no backend.

| Piece | Source |
| --- | --- |
| Server ping | [mcstatus.io](https://mcstatus.io) `v2/status/java`, falling back to [mcsrvstat.us](https://mcsrvstat.us) `v3` |
| Player heads | [mc-heads.net](https://mc-heads.net) |
| History | `localStorage` — it never leaves your browser and starts when you first open the page |
| Theme tokens | Extracted from weao.gg's compiled stylesheet, so the palettes are exact rather than approximated |

### Assets

Both live in `assets/img/` and ship with the page rather than being hotlinked:

- `favicon.ico` — WEAO's own favicon
- `server-icon.webp` — the SMP's Discord icon, shown beside the address. It
  renders in full colour while the server is up and desaturates to grayscale
  whenever the server is down or the status API is unreachable.

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
