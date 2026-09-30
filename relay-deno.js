// Flugzeug-Relay für Deno Deploy
// Holt Live-Flugzeugpositionen (ADS-B) und gibt sie mit CORS-Freigabe an die Web-App weiter.
// Quellen der Reihe nach: adsb.lol, adsb.fi, OpenSky Network (umgerechnet ins gleiche Format).
//
// Aufruf:  https://<dein-projekt>.deno.dev/?lat=50.113&lon=8.704&r=40   (r = Radius in Seemeilen, max. 100)
// Diagnose: https://<dein-projekt>.deno.dev/?lat=50.113&lon=8.704&debug=1
// Flugverlauf: https://<dein-projekt>.deno.dev/?trace=3c66ba   (aktueller Flug eines Flugzeugs, ICAO-Hex)

const UA = "Mozilla/5.0 (compatible; flugzeug-fenster/2.0; +https://github.com/janheisig/Flugzeug)";
const cache = new Map(); // key -> {t, body, source}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "X-Source",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const traceHex = url.searchParams.get("trace");
  if (traceHex !== null) return traceResponse(traceHex.toLowerCase(), cors, url.searchParams.has("debug"));
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lon = parseFloat(url.searchParams.get("lon") ?? "");
  const r = Math.min(Math.max(parseFloat(url.searchParams.get("r") || "40"), 1), 100);
  const debug = url.searchParams.has("debug");
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "Parameter lat und lon fehlen" }, 400);

  // short shared cache so several open apps do not multiply requests
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(r)}`;
  const hit = cache.get(key);
  if (!debug && hit && Date.now() - hit.t < 3000) {
    return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": hit.source + " (cache)" } });
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
      const res = await fetch(s.url, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      tried.push({ source: s.name, status: res.status, sample: text.slice(0, 120) });
      if (!res.ok) continue;
      let body = text;
      if (s.convert) body = JSON.stringify(s.convert(JSON.parse(text)));
      else if (!text.includes('"ac"')) continue;
      if (debug) return json({ ok: s.name, tried });
      cache.set(key, { t: Date.now(), body, source: s.name });
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": s.name } });
    } catch (e) {
      tried.push({ source: s.name, error: String(e).slice(0, 120) });
    }
  }
  return json({ error: "Keine Datenquelle erreichbar", tried }, 502);
});

// ---------- flight trace (current leg) ----------
const traceCache = new Map(); // hex -> {t, body}
async function traceResponse(hex, cors, debug) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (!/^~?[0-9a-f]{6}$/.test(hex)) return json({ error: "Ungültige ICAO-Adresse" }, 400);
  const hit = traceCache.get(hex);
  if (!debug && hit && Date.now() - hit.t < 45000) return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": "cache" } });
  const tried = [];
  for (const kind of ["trace_full", "trace_recent"]) {
    const src = `https://adsb.lol/data/traces/${hex.slice(-2)}/${kind}_${hex}.json`;
    try {
      const res = await fetch(src, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
      tried.push({ source: kind, status: res.status });
      if (!res.ok) continue;
      const out = currentLeg(hex, await res.json());
      if (debug) return json({ ok: kind, tried, points: out.points.length, takeoff: out.takeoff, takeoffKnown: out.takeoffKnown });
      const body = JSON.stringify(out);
      traceCache.set(hex, { t: Date.now(), body });
      if (traceCache.size > 300) traceCache.delete(traceCache.keys().next().value);
      return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": "adsb.lol " + kind } });
    } catch (e) {
      tried.push({ source: kind, error: String(e).slice(0, 120) });
    }
  }
  return json({ error: "Kein Flugverlauf gefunden", tried }, 404);
}

// readsb trace: [dt, lat, lon, alt|"ground", gs, track, flags, ...]; flags & 2 = start of a new leg
function currentLeg(hex, d) {
  const t = d.trace || [], ts = d.timestamp || 0;
  let s = 0;
  for (let i = 0; i < t.length; i++) if (t[i][6] & 2) s = i;
  let lastGround = -1;
  for (let i = s; i < t.length; i++) if (t[i][3] === "ground") lastGround = i;
  const landed = lastGround === t.length - 1;
  let start = s, takeoffKnown = false;
  if (lastGround >= s && !landed) { start = lastGround + 1; takeoffKnown = true; }
  const pts = [];
  let last = null;
  for (let i = start; i < t.length; i++) {
    const p = t[i];
    if (typeof p[1] !== "number" || typeof p[2] !== "number") continue;
    const isLast = i === t.length - 1;
    if (!last || isLast || Math.abs(p[1] - last[0]) + Math.abs(p[2] - last[1]) > 0.02) {
      last = [+p[1].toFixed(4), +p[2].toFixed(4), p[3] === "ground" ? 0 : p[3], Math.round(ts + p[0])];
      pts.push(last);
    }
  }
  return {
    hex, r: d.r, t: d.t, desc: d.desc,
    takeoff: pts.length ? pts[0][3] : null, takeoffKnown, landed,
    points: pts, now: Math.round(Date.now() / 1000),
  };
}

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
