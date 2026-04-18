// api/solar.js  —  Vercel Serverless Function
// Proxies all Google API calls so the API key never touches the browser
// except for the Maps JS API key (which must be in the browser by design).
//
// Set GOOGLE_MAPS_API_KEY in Vercel dashboard → Settings → Environment Variables
// IMPORTANT: In Google Cloud Console, restrict this key:
//   - Maps JavaScript API: restrict to your domain (e.g. gridready.vercel.app)
//   - All other APIs (Geocoding, Solar, Maps Static): restrict to no HTTP referrers

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY not configured in environment variables" });
  }

  const { action, address, lat, lng } = req.query;

  try {

    // ── 1. GEOCODE ────────────────────────────────────────────────────────────
    if (action === "geocode") {
      if (!address) return res.status(400).json({ error: "address required" });
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
      const r = await fetch(url);
      const data = await r.json();
      if (data.status !== "OK" || !data.results?.length) {
        return res.status(404).json({ error: "Address not found", details: data.status });
      }
      const result = data.results[0];
      return res.status(200).json({
        formattedAddress: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
      });
    }

    // ── 2. BUILDING INSIGHTS ──────────────────────────────────────────────────
    // Returns roof segments, max panels, solarPanels[] with lat/lng per panel,
    // and solarPanelConfigs[] with yearlyEnergyDcKwh per configuration.
    if (action === "buildingInsights") {
      if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
      const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${API_KEY}`;
      const r = await fetch(url);
      if (!r.ok) {
        const errBody = await r.text();
        return res.status(r.status).json({
          error: "Solar API error",
          details: errBody,
          hint: "This address may not have Solar API coverage yet. Try a nearby city address."
        });
      }
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 3. SATELLITE IMAGE URL (fallback when Maps JS API not available) ───────
    if (action === "satelliteUrl") {
      if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
      const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x400&maptype=satellite&key=${API_KEY}`;
      return res.status(200).json({ imageUrl });
    }

    // ── 4. MAPS JS KEY ────────────────────────────────────────────────────────
    // The Maps JS API key MUST be browser-visible by design — this is unavoidable.
    // SECURITY: Restrict this key in Google Cloud Console:
    //   APIs & Services → Credentials → your key → HTTP referrers
    //   Add: https://your-domain.vercel.app/*
    if (action === "mapsJsKey") {
      return res.status(200).json({ key: API_KEY });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("Solar proxy error:", err);
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
}
