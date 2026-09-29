// Flugzeug-Relay für Cloudflare Workers
// Holt Live-Flugzeugpositionen (ADS-B) von adsb.lol bzw. adsb.fi und gibt sie mit
// CORS-Freigabe an die Web-App weiter. Kostenlos im Cloudflare-Free-Plan.
//
// Aufruf: https://<dein-worker>.workers.dev/?lat=50.113&lon=8.704&r=40   (r = Radius in Seemeilen, max. 100)

export default {
  async fetch(req) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const r = Math.min(Math.max(parseFloat(url.searchParams.get("r") || "40"), 1), 100);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (!isFinite(lat) || !isFinite(lon)) return json({ error: "Parameter lat und lon fehlen" }, 400);

    const la = lat.toFixed(4), lo = lon.toFixed(4), rr = r.toFixed(0);
    const sources = [
      `https://api.adsb.lol/v2/point/${la}/${lo}/${rr}`,
      `https://opendata.adsb.fi/api/v3/lat/${la}/lon/${lo}/dist/${rr}`,
    ];
    for (const src of sources) {
      try {
        const res = await fetch(src, {
          headers: { "User-Agent": "flugzeug-fenster (github.com/janheisig/flugzeug)" },
          cf: { cacheTtl: 2, cacheEverything: true },
        });
        if (res.ok) {
          return new Response(await res.text(), {
            headers: { ...cors, "Content-Type": "application/json", "X-Source": new URL(src).host },
          });
        }
      } catch (e) { /* nächste Quelle probieren */ }
    }
    return json({ error: "Keine Datenquelle erreichbar" }, 502);
  },
};
