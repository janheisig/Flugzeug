// Flugzeug-Relay für Cloudflare Workers (Version 2)
// Holt Live-Flugzeugpositionen (ADS-B) und gibt sie mit CORS-Freigabe an die Web-App weiter.
// Quellen der Reihe nach: adsb.lol, adsb.fi, OpenSky Network (umgerechnet ins gleiche Format).
//
// Aufruf:  https://<dein-worker>.workers.dev/?lat=50.113&lon=8.704&r=40   (r = Radius in Seemeilen, max. 100)
// Diagnose: https://<dein-worker>.workers.dev/?lat=50.113&lon=8.704&debug=1

const UA = "Mozilla/5.0 (compatible; flugzeug-fenster/2.0; +https://github.com/janheisig/Flugzeug)";

export default {
  async fetch(req, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers": "X-Source",
      "Cache-Control": "no-store",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const r = Math.min(Math.max(parseFloat(url.searchParams.get("r") || "40"), 1), 100);
    const debug = url.searchParams.has("debug");
    const json = (obj, status = 200, extra = {}) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

    if (!isFinite(lat) || !isFinite(lon)) return json({ error: "Parameter lat und lon fehlen" }, 400);

    // short shared cache so several open apps do not multiply requests
    const cacheKey = new Request(`https://cache.local/?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&r=${Math.round(r)}`);
    const cache = caches.default;
    if (!debug) {
      const hit = await cache.match(cacheKey);
      if (hit) return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": (hit.headers.get("X-Source") || "") + " (cache)" } });
    }

    const la = lat.toFixed(4), lo = lon.toFixed(4), rr = r.toFixed(0);
    const tried = [];
    const sources = [
      { name: "adsb.lol", url: `https://api.adsb.lol/v2/point/${la}/${lo}/${rr}` },
      { name: "adsb.fi", url: `https://opendata.adsb.fi/api/v3/lat/${la}/lon/${lo}/dist/${rr}` },
      { name: "opensky", url: openskyUrl(lat, lon, r), convert: fromOpenSky },
    ];
    for (const s of sources) {
      try {
        const res = await fetch(s.url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
        const text = await res.text();
        tried.push({ source: s.name, status: res.status, sample: text.slice(0, 120) });
        if (!res.ok) continue;
        let body = text;
        if (s.convert) body = JSON.stringify(s.convert(JSON.parse(text)));
        else if (!text.includes('"ac"')) continue;
        if (debug) return json({ ok: s.name, tried });
        const out = new Response(body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": s.name, "Cache-Control": "max-age=3" } });
        ctx.waitUntil(cache.put(cacheKey, out.clone()));
        return out;
      } catch (e) {
        tried.push({ source: s.name, error: String(e).slice(0, 120) });
      }
    }
    return json({ error: "Keine Datenquelle erreichbar", tried }, 502);
  },
};

function openskyUrl(lat, lon, rNm) {
  const dLat = rNm / 60, dLon = rNm / 60 / Math.cos(lat * Math.PI / 180);
  return `https://opensky-network.org/api/states/all?lamin=${(lat - dLat).toFixed(3)}&lomin=${(lon - dLon).toFixed(3)}&lamax=${(lat + dLat).toFixed(3)}&lomax=${(lon + dLon).toFixed(3)}`;
}

// OpenSky state vectors -> adsb.lol-like objects
function fromOpenSky(j) {
  const now = (j.time || Date.now() / 1000);
  const ac = (j.states || []).map(s => ({
    hex: s[0], flight: (s[1] || "").trim(), lat: s[6], lon: s[5],
    alt_baro: s[8] ? "ground" : (s[7] != null ? Math.round(s[7] / 0.3048) : undefined),
    alt_geom: s[13] != null ? Math.round(s[13] / 0.3048) : undefined,
    gs: s[9] != null ? s[9] * 1.943844 : undefined, track: s[10],
    baro_rate: s[11] != null ? Math.round(s[11] * 196.85) : undefined,
    seen_pos: s[3] ? Math.max(0, now - s[3]) : 0, squawk: s[14],
  })).filter(a => a.lat != null && a.lon != null);
  return { ac, now: now * 1000, source: "opensky" };
}
