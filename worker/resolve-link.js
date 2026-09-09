/* Cloudflare Worker: turns a short map link into the address it redirects to.
 *
 * The browser may make this request but is not allowed to read the answer, so
 * the hop happens here instead. Deploy with `wrangler deploy`, then put the
 * resulting URL into LINK_RESOLVER in index.html.
 *
 * Only map shorteners are followed, so this cannot be used as an open proxy,
 * and only the Location header is returned — never the page body.
 */
const ALLOWED = new Set([
  "maps.app.goo.gl", "goo.gl", "g.co",
  "maps.apple", "maps.apple.com",
  "maps.google.com", "www.google.com", "google.com"
]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const reply = (body, status) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, "content-type": "application/json"}});

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, {headers: CORS});
    if (request.method !== "GET") return reply({error: "Use GET."}, 405);

    const asked = new URL(request.url).searchParams.get("url");
    if (!asked) return reply({error: "No url given."}, 400);
    let target;
    try { target = new URL(asked); } catch { return reply({error: "That is not a URL."}, 400); }
    if (target.protocol !== "https:") return reply({error: "Only https links are followed."}, 400);
    if (!ALLOWED.has(target.hostname)) return reply({error: "Only map links are followed."}, 400);

    // Up to five hops: a short link occasionally lands on another shortener.
    let url = target.toString(), location = "";
    for (let hop = 0; hop < 5; hop++) {
      let response;
      try {
        response = await fetch(url, {redirect: "manual", headers: {"user-agent": "Mozilla/5.0"}});
      } catch { return reply({error: "The link could not be reached."}, 502); }
      location = response.headers.get("location") || "";
      if (!location) break;
      url = new URL(location, url).toString();
      if (response.status < 300 || response.status >= 400) break;
    }
    if (url === target.toString()) return reply({error: "That link did not redirect anywhere."}, 404);
    return reply({url}, 200);
  }
};
