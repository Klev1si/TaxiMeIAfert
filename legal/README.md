# TaxiMeIAfert — Legal pages

Privacy Policy + Terms of Service as a static site, ready to drop into GitHub Pages.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page with cards linking to the two policies |
| `privacy.html` | Privacy Policy (Kosovo / GDPR-friendly) |
| `terms.html` | Terms of Service (passenger / driver / company sections) |
| `delete-account.html` | Account deletion instructions and data-retention notes |
| `track.html` | Per-ride live tracking view (kept out of search with `noindex`) |
| `robots.txt` | Allows crawling, disallows `track.html`, points to the sitemap |
| `sitemap.xml` | Lists the four indexable pages for search engines |
| `favicon.svg` | Site icon (scalable taxi mark) |
| `og-image.png` | 1200×630 social-share preview image |
| `CNAME` | GitHub Pages custom domain (`taximeiafert.com`) |

The HTML files are self-contained — no JavaScript (except `track.html`), no build
step, no external CSS. Just open them in a browser and they work.

## SEO

Every indexable page carries a `<title>`, meta description, canonical URL, Open
Graph + Twitter Card tags, favicon, and `theme-color`. `index.html` also embeds an
`Organization` JSON-LD block. All absolute URLs use the production domain
`https://taximeiafert.com/` — if you deploy to a different host, update the
canonical/OG URLs, `sitemap.xml`, `robots.txt`, and `CNAME` to match.

## Quick GitHub Pages setup (~5 min)

Two options, depending on whether you want them on a separate repo or inside this one.

### Option A — Separate dedicated repo (recommended, cleanest URL)

1. Create a new GitHub repo named **`taximelafert-legal`** (or anything you like)
2. Copy these three HTML files (and this README) into the repo root
3. Push to GitHub
4. Repo → **Settings** → **Pages** → Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)` → Save
5. Wait 1-2 minutes — your URL becomes:

   ```
   https://<your-github-username>.github.io/taximelafert-legal/
   ```

   For Klev1si this would be: `https://klev1si.github.io/taximelafert-legal/`

6. Privacy URL to paste into Play Console:

   ```
   https://klev1si.github.io/taximelafert-legal/privacy.html
   ```

### Option B — Inside the existing TaxiMeIAfert repo (one-step)

1. The `legal/` folder is already in the main repo
2. GitHub → your TaxiMeIAfert repo → **Settings** → **Pages**
3. Source: `Deploy from a branch` → Branch: `main` → Folder: `/legal` → Save
4. URL becomes: `https://klev1si.github.io/TaxiMeIAfert/`
5. Privacy URL: `https://klev1si.github.io/TaxiMeIAfert/privacy.html`

⚠️ Option B exposes the entire repo as a static site, including the source code. The
code is already on GitHub publicly so it doesn't leak anything new — but for a cleaner
separation, Option A is nicer.

## Updating the content

Just edit the HTML files and push. GitHub Pages rebuilds automatically (~30 seconds).

If you make material changes that affect users — for example, adding a new data processor
or changing the commission structure — you should also:

1. Bump the **Effective date** at the top of the changed document
2. Send users an in-app notice or email 14 days before the change takes effect, as
   promised in section 11 of the Privacy Policy and section 16 of the Terms

## Albanian translation

When ready, you can add `privacy.sq.html` and `terms.sq.html` files with Albanian
translations. The `<html lang="sq">` attribute should be set accordingly. Update the
landing `index.html` to offer the language choice. Most Kosovo users will appreciate the
Albanian version even if they understand English.
