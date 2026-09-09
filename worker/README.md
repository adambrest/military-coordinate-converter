# Map link resolver

A browser may request a short map link but is not allowed to read where it
leads, so this follows the redirect off the device and returns the address.

## Deploying

    npm install -g wrangler     # once
    cd worker
    wrangler login              # opens a browser; a free account is enough
    wrangler deploy

Deploying prints a URL. Put it in `LINK_RESOLVER` near the top of the script in
`index.html`:

    const LINK_RESOLVER = "https://map-link-resolver.<your-subdomain>.workers.dev";

Short links then resolve themselves when pasted. Left blank, they explain what
to do by hand instead, which is how the app ships.

## What keeps it safe

- **It only ever fetches map shorteners.** Every hop is checked against the
  allowlist before it is visited, so a redirect that leaves that set is
  reported back but not followed. Without that check a Google open-redirect
  would let anyone aim the worker at an address of their choosing.
- **It only reads the `Location` header.** No page body is fetched back to the
  caller, so it cannot be used to read anything.
- **Browsers are only answered for the origins in `ORIGINS`.** Edit that list
  if you host your own copy. This stops other websites using the endpoint from
  a browser; it does not stop `curl`, and it is not meant to.
- **Nothing is stored.** No cache, no KV, no logging. Workers keep no request
  logs unless you turn on Logpush or the observability setting.

## What it does not protect

The endpoint is public, and every short link pasted into the app passes through
it. Cloudflare's edge therefore sees those links, and a map link is a location.
If that matters for how the app is used, leave `LINK_RESOLVER` empty: pasting a
short link then explains how to resolve it by hand, and nothing leaves the
device.
