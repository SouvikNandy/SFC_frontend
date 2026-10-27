# Deployment: HTTP 301 redirects and HTTP 404 status

Audience: whoever owns hosting (web server / CDN / reverse proxy) for quantsfc.com.

**Status: NOT DONE. These behaviours cannot be delivered by the Angular app and have not been implemented or verified anywhere.**

## Why this is outside the app
QuantSFC is a client-rendered single-page app: `ng build` produces static files (no SSR or prerender), and this repository
contains no hosting configuration. The current deployment answers **HTTP 200 with `index.html` for every URL**. A browser-side
router cannot change an HTTP status.

What the app does in the browser (useful for users, but **not** an HTTP 301 or 404):
- `/` renders the dashboard Home directly. `/dashboard` and `/dashboard/home` redirect to `/`.
- The retired paths below redirect to `/`.
- Unknown URLs show the app's "Page Not Found" view (kept), at the address that was requested.

## Required server behaviour

### 1. HTTP 301 (permanent) redirects
| Request path (exact match, optional trailing slash) | Status | Location |
|---|---|---|
| `/about` | 301 | `/` |
| `/services` | 301 | `/` |
| `/blog` | 301 | `/` |
| `/contact` | 301 | `/` |
| `/home` | 301 | `/` |
| `/data` | 301 | `/` |
| `/faq` | 301 | `/` |
| `/dashboard/price-alerts` | 301 | `/` |
| `/dashboard/blog-reports` | 301 | `/` |
| `/dashboard`, `/dashboard/home` (optional, the app already does this) | 301 | `/` |

The client's "old landing path" was never named. `/home` is the only other candidate; confirm with the client.

### 2. HTTP 200 (serve `index.html`) only for real app routes
```
/
/dashboard/portfolio  /dashboard/options-chain  /dashboard/eod  /dashboard/multi-leg-eod  /dashboard/closed-trades
/dashboard/greeks  /dashboard/probability  /dashboard/historical-volatility  /dashboard/implied-volatility  /dashboard/payoff
/privacy-policy  /terms-conditions  /termsconditions  /disclaimer
/login  /register  /reset-password  /verify-otp  /verify-email-success  /invalid-reset-link
/404
```
Static files (hashed `*.js`, `*.css`, `assets/`, `favicon.ico`) are served as they are. This list mirrors `src/app/app.routes.ts`;
`app.routes.spec.ts` guards the retired and hidden paths. Update it whenever routes change.

### 3. HTTP 404 for everything else
Any other URL must return status **404**. Using `index.html` as the response body is fine: the app then shows its "Page Not Found" view.

## Acceptance checks (to run after the deployment owner has made the change)
```
curl -sI https://quantsfc.com/about                   # expect 301, Location: /
curl -sI https://quantsfc.com/faq                     # expect 301, Location: /
curl -sI https://quantsfc.com/dashboard/price-alerts  # expect 301, Location: /
curl -sI https://quantsfc.com/                        # expect 200
curl -sI https://quantsfc.com/disclaimer              # expect 200
curl -sI https://quantsfc.com/termsconditions         # expect 200 (the client's spelling stays; no redirect)
curl -sI https://quantsfc.com/no-such-page            # expect 404
```
No server configuration is provided here because the hosting stack is unknown; an untested snippet should not be deployed.

## Related open question
The "Live data - Premium" tabs on the tools still exist: the client's list names Login, Register, dashboard Home and the meta
description only. Confirm whether those tabs are in scope for "no live wording".
