# Email setup (Brevo + taximeiafert.com)

This is the end-to-end guide to getting transactional email
(password-reset codes, ride receipts, subscription reminders) delivered
reliably from `@taximeiafert.com` through **Brevo**.

There are two halves and **both are required**:

1. **Code / config** (this repo) — already done, see [Backend config](#3-backend-config).
2. **Brevo + DNS** (dashboards) — the part you do by hand. Without it,
   Gmail/Yahoo/Microsoft reject or spam-bin our mail.

---

## 0. How sending works here

The backend (`src/mailer/mailer.service.ts`) sends through **Brevo's HTTPS
API** when `BREVO_API_KEY` is set (preferred — port 443 is never blocked by
Railway), and falls back to SMTP only if no API key is present. Set
`SMTP_MOCK=false` to actually send.

The **From** address is `SMTP_FROM` (default
`TaxiMeIAfert <no-reply@taximeiafert.com>`); the support address shown in
email footers is `SUPPORT_EMAIL` (default `support@taximeiafert.com`).

> **Important distinction — sending vs. receiving.**
> Brevo only *sends* email; it does not host mailboxes.
> - `no-reply@taximeiafert.com` needs **no inbox** — nobody should reply to it.
> - `support@taximeiafert.com` should **receive** replies, so it needs
>   mailbox/forwarding set up separately (see [step 4](#4-create-the-addresses)).

---

## 1. (Optional but recommended) Move DNS to Cloudflare

The domain is registered at **Porkbun**. You can manage DNS at Porkbun
directly, or move DNS hosting to **Cloudflare** (registration stays at
Porkbun — only the nameservers change). Cloudflare is recommended because:

- Fast, free DNS with an easy record editor and instant propagation.
- **Cloudflare Email Routing** (free) forwards `support@taximeiafert.com`
  to a real inbox (e.g. your Gmail) — the simplest way to receive support mail.

**To move DNS to Cloudflare:**
1. Cloudflare dashboard → **Add a site** → `taximeiafert.com` → pick the Free plan.
2. Cloudflare imports your existing records and gives you **two nameservers**
   (e.g. `xxx.ns.cloudflare.com`).
3. Porkbun → your domain → **Authoritative Nameservers** → replace Porkbun's
   nameservers with the two Cloudflare ones.
4. Wait for Cloudflare to show the domain **Active** (minutes to a few hours).

If you'd rather keep DNS at Porkbun, that's fine — every DNS record below is
added the same way, just in Porkbun's DNS editor. For receiving `support@`
without Cloudflare, use **Porkbun Email Forwarding** instead (step 4).

---

## 2. Authenticate the domain in Brevo

Log in to Brevo → **Senders, Domains & Dedicated IPs** → **Domains** →
**Add a domain** → enter `taximeiafert.com` → **Authenticate this domain**.

Brevo shows you the exact records to add. Add these in your DNS provider
(Cloudflare or Porkbun). Values marked *(from Brevo)* are unique to your
account — copy them from the Brevo screen, do not guess them.

| Purpose | Type | Host / Name | Value |
|---|---|---|---|
| Brevo verification code | `TXT` | `@` (root) | `brevo-code:…` *(from Brevo)* |
| DKIM | `CNAME` | `brevo1._domainkey` | *(from Brevo)* |
| DKIM | `CNAME` | `brevo2._domainkey` | *(from Brevo)* |
| SPF | `TXT` | `@` (root) | `v=spf1 include:spf.brevo.com ~all` |
| DMARC | `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |

Notes:
- **SPF:** if a `v=spf1` TXT record already exists on the root, don't add a
  second one — edit the existing record to include `include:spf.brevo.com`
  before the `~all`. A domain may have only one SPF record.
- **DMARC:** likewise, only one `_dmarc` record. If one exists, append
  `rua=mailto:rua@dmarc.brevo.com`. Start with `p=none` (monitor only); you
  can tighten to `p=quarantine` later once you confirm mail is passing.
- On **Cloudflare**, set these records to **DNS only** (grey cloud), not
  proxied.
- After adding them, click **Verify / Authenticate** in Brevo. DNS can take
  from a few minutes up to a few hours to propagate.

You want Brevo to show the domain as **Authenticated** with DKIM and the
Brevo code green before sending production mail.

---

## 3. Backend config

Set these environment variables on the API host (Railway → the API service →
**Variables**). See `.env.example` for the annotated list.

```env
SMTP_MOCK=false
BREVO_API_KEY=xkeysib-…          # Brevo → SMTP & API → API Keys → Generate a new key
APP_NAME=TaxiMeIAfert
SMTP_FROM=TaxiMeIAfert <no-reply@taximeiafert.com>
SUPPORT_EMAIL=support@taximeiafert.com
```

- Use the **API key** (starts with `xkeysib-`), not an SMTP key — the code
  prefers the HTTPS API.
- `SMTP_FROM`'s domain **must** be the authenticated domain, or Brevo rejects
  the send.
- The `SMTP_HOST/PORT/USER/PASS` vars are only a fallback for non-Brevo/SMTP
  setups and can be left unset when `BREVO_API_KEY` is present.

---

## 4. Create the addresses

### `no-reply@taximeiafert.com` (send-only)
Nothing to host — it only appears in the `From` header. Just make sure it's
listed/verified as a sender in Brevo if Brevo asks you to verify the sender
address (Brevo → **Senders** → add `no-reply@taximeiafert.com`). Once the
domain is authenticated, any address on it can send.

### `support@taximeiafert.com` (must receive replies)
Pick **one** of:

- **Cloudflare Email Routing** (free, recommended if you moved DNS to
  Cloudflare): Cloudflare → **Email** → **Email Routing** → enable → add a
  custom address `support@taximeiafert.com` → forward to your real inbox
  (e.g. your Gmail). Cloudflare adds the required MX + SPF records for you.
- **Porkbun Email Forwarding** (if DNS stays at Porkbun): Porkbun → your
  domain → **Email** → add a forward from `support@` to your real inbox.
- A full mailbox (Google Workspace, Zoho Mail, etc.) if you want to send
  *from* `support@` and store mail — heavier, only if you need it.

> Email Routing / forwarding adds **MX** records. MX (receiving) and Brevo's
> SPF/DKIM (sending) are independent and don't conflict — keep both.

---

## 5. Test

1. Redeploy the API so the new env vars load.
2. Trigger a real send — e.g. request a password reset in the app, or from
   the API host run a quick send against `POST https://api.brevo.com/v3/smtp/email`
   with your key.
3. Check the recipient inbox, and **View original / Show headers** →
   confirm `SPF=pass`, `DKIM=pass`, `DMARC=pass`.
4. Brevo → **Transactional → Logs / Statistics** shows delivered/blocked
   events for debugging.
5. Reply to a test email to confirm `support@` forwarding reaches your inbox.

Once SPF/DKIM/DMARC all pass and the support forward works, email is fixed.

---

## Quick checklist

- [ ] (Optional) DNS moved to Cloudflare, domain **Active**
- [ ] Brevo code TXT added → domain shows the code verified
- [ ] Both DKIM CNAMEs added → DKIM green in Brevo
- [ ] SPF TXT includes `include:spf.brevo.com` (one record only)
- [ ] DMARC TXT present (`p=none` to start)
- [ ] Brevo shows domain **Authenticated**
- [ ] `BREVO_API_KEY`, `SMTP_MOCK=false`, `SMTP_FROM`, `SUPPORT_EMAIL` set on Railway
- [ ] `support@` forwarding/mailbox set up and tested
- [ ] Test email passes SPF + DKIM + DMARC
