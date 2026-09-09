/* Cloudflare Worker: turns a short map link into the address it redirects to.
 *
 * The browser may make this request but is not allowed to read the answer, so
 * the hop happens here instead. Deploy with `wrangler deploy`, then put the
 * resulting URL into LINK_RESOLVER in index.html.
 *
 * Safety rules, in order of importance:
 *   - Only the hosts in SHORTENERS are ever fetched. A redirect that leaves
 *     that set is returned as the answer, not followed, so this cannot be
 *     turned into a general-purpose fetcher for someone else's targets.
 *   - Only the Location header is read. No page body is ever returned.
 *   - Browsers are only answered for the origins in ORIGINS.
 *   - Nothing is stored, cached, or logged.
 */
const SHORTENERS = new Set([
  "maps.app.goo.gl", "goo.gl", "g.co",
  "maps.apple", "maps.apple.com",
  "maps.google.com", "www.google.com", "google.com"
]);

// Browsers are only served these origins. Add your own if you host a copy.
const ORIGINS = new Set([
  "https://adambrest.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const HOP_TIMEOUT = 6000, MAX_HOPS = 5, MAX_URL = 2048;

function cors(request) {
  const origin = request.headers.get("origin");
  const headers = {"Vary": "Origin", "Cache-Control": "no-store"};
  if (origin && ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}
const reply = (body, status, headers) =>
  new Response(JSON.stringify(body), {status, headers: {...headers, "content-type": "application/json"}});

export default {
  async fetch(request) {
    const headers = cors(request);
    const origin = request.headers.get("origin");
    // A request with no Origin is not a browser, so there is nothing to protect.
    if (origin && !ORIGINS.has(origin)) return reply({error: "Not an allowed origin."}, 403, headers);
    if (request.method === "OPTIONS") return new Response(null, {headers});
    if (request.method !== "GET") return reply({error: "Use GET."}, 405, headers);

    const asked = new URL(request.url).searchParams.get("url");
    if (!asked) return reply({error: "No url given."}, 400, headers);
    if (asked.length > MAX_URL) return reply({error: "That URL is too long."}, 400, headers);
    let target;
    try { target = new URL(asked); } catch { return reply({error: "That is not a URL."}, 400, headers); }
    if (target.protocol !== "https:") return reply({error: "Only https links are followed."}, 400, headers);
    if (!SHORTENERS.has(target.hostname)) return reply({error: "Only map links are followed."}, 400, headers);

    // Up to five hops: a short link occasionally lands on another shortener.
    // Each hop is checked against the allowlist before it is fetched, so the
    // last address we are willing to visit is still one we chose.
    let url = target.toString();
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let response;
      try {
        response = await fetch(url, {
          redirect: "manual",
          headers: {"user-agent": "Mozilla/5.0"},
          signal: AbortSignal.timeout(HOP_TIMEOUT)
        });
      } catch { return reply({error: "The link could not be reached."}, 502, headers); }
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      let next;
      try { next = new URL(location, url); } catch { break; }
      if (next.protocol !== "https:" && next.protocol !== "http:") break;
      url = next.toString();
      if (url.length > MAX_URL) return reply({error: "That link redirected somewhere too long."}, 502, headers);
      // Left the shorteners: this is the answer, and not somewhere we may visit.
      if (!SHORTENERS.has(next.hostname)) break;
    }
    if (url === target.toString()) return reply({error: "That link did not redirect anywhere."}, 404, headers);
    return reply({url}, 200, headers);
  }
};
