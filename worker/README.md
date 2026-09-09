# Map link resolver

A browser may request a short map link but is not allowed to read where it
leads, so this follows the redirect off the device and returns the address.

    npm install -g wrangler     # once
    cd worker && wrangler deploy

Deploying prints a URL. Put it in `LINK_RESOLVER` near the top of the script in
`index.html`:

    const LINK_RESOLVER = "https://map-link-resolver.<your-subdomain>.workers.dev";

Short links then resolve themselves when pasted. Left blank, they explain what
to do by hand instead, which is how the app ships.

Only map shorteners are followed and only the address landed on is returned, so
this cannot be used as a general proxy. Every short link pasted into the app
passes through it, so it should be an endpoint you control.
