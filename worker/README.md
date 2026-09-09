# Map helper

Two things a browser cannot do for itself.

`/resolve?url=` follows a short map link. The browser may make the request but
is not allowed to read where it leads, so the hop happens here instead.

`/where` reports roughly where the request came from, so the map opens near the
reader instead of over the ocean. Cloudflare works this out from the address the
request arrived from, at the nearest edge, so the answer comes back far faster
than a lookup across the world and no third party is told anything. It is city
accuracy at best, and on a mobile network it may name the city the carrier
leaves the internet from rather than the one the reader is in — so the timezone
comes back with it and the app keeps its own view when the two disagree.

## Deploying

    npm install -g wrangler     # once
    cd worker
    wrangler login              # opens a browser; a free account is enough
    wrangler deploy

Deploying prints a URL. Put it in `LINK_RESOLVER` near the top of the script in
`index.html`:

    const MAP_HELPER = "https://map-link-resolver.<your-subdomain>.workers.dev";

Short links then resolve themselves when pasted and the map opens near the
reader. Left blank, short links explain what to do by hand and the opening view
comes from the device timezone, which is how the app ships.

Check `/where` once after deploying — `curl https://<your-worker>/where` — as
Cloudflare does not fill every field in for every address.

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
- **`/where` answers coarsely.** Coordinates are rounded to two decimals, about
  a kilometre, before they are sent. Nothing finer is ever transmitted, because
  nothing finer is needed to choose an opening view.

## What it does not protect

The endpoint is public, and every short link pasted into the app passes through
it. Cloudflare's edge therefore sees those links, and a map link is a location.

`/where` is called once per session, which means the endpoint sees each reader's
address on the first load. That is not new — the app asks ipapi.co the same
question today — but it moves from a third party to one you control.

If either matters for how the app is used, leave `MAP_HELPER` empty. Short links
then explain how to resolve them by hand, the opening view comes from the device
clock alone, and nothing leaves the device.
