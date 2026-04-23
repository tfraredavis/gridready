// api/solar.js — Vercel Serverless Function
// Set in Vercel environment variables:
//   GOOGLE_MAPS_API_KEY  — for geocoding, Solar API, Maps JS
//   ANTHROPIC_API_KEY    — for panel photo and bill parsing

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const GOOGLE_KEY    = process.env.GOOGLE_MAPS_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  // POST actions (panel + bill parsing send image data)
  if (req.method === "POST") {
    const { action, imageBase64, mediaType } = req.body || {};

    // ── PARSE PANEL PHOTO ────────────────────────────────────────────────────
    // Sends electrical panel photo to Claude Vision.
    // Returns array of { name, amps, estimatedWatts }
    if (action === "parsePanel") {
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
      if (!imageBase64)   return res.status(400).json({ error: "imageBase64 required" });

      const prompt = `You are analyzing a photo of a residential electrical panel (breaker box).

Your job is to identify every circuit breaker visible in the panel.

For each breaker, extract:
1. The label/name written on or next to it (e.g. "Kitchen", "HVAC", "Dryer", "Garage")
2. The amperage rating printed on the breaker itself (e.g. 15, 20, 30, 50)
3. Your best estimate of the typical running watts for that circuit type

Rules:
- If you cannot read a label clearly, use "Unknown"
- Include ALL breakers you can see, including double-pole breakers (240V)
- For double-pole breakers, note the full amperage (e.g. a 2-pole 30A = 30A)
- Estimate running watts based on the circuit name and amperage:
  * Lighting circuits (15A): 200-400W
  * General outlets (15-20A): 300-500W  
  * Kitchen outlets (20A): 500-1500W
  * Refrigerator (20A): 150-200W
  * Dishwasher (20A): 1200-1500W
  * Microwave (20A): 1000-1500W
  * Washer (20A): 500W
  * Dryer (30A 240V): 4000-5500W
  * Range/Oven (50A 240V): 3000-5000W
  * HVAC/AC (varies): calculate from amps × voltage × 0.8
  * Water heater (30A 240V): 3000-4500W
  * EV charger (50A 240V): 7200W
  * Garage (20A): 500W
  * Outdoor (20A): 300W

Respond ONLY with valid JSON in this exact format, no other text:
{
  "breakers": [
    { "name": "Kitchen", "amps": 20, "estimatedWatts": 1200 },
    { "name": "Master Bedroom", "amps": 15, "estimatedWatts": 300 },
    { "name": "Unknown", "amps": 20, "estimatedWatts": 400 }
  ]
}`;

      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-5",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType || "image/jpeg",
                    data: imageBase64,
                  },
                },
                { type: "text", text: prompt },
              ],
            }],
          }),
        });

        if (!r.ok) {
          const err = await r.text();
          return res.status(r.status).json({ error: "Claude API error", details: err });
        }

        const data = await r.json();
        const text = data.content?.[0]?.text || "";

        // Strip any markdown fences just in case
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({ error: "Panel parsing failed", details: err.message });
      }
    }

    // ── PARSE UTILITY BILL ───────────────────────────────────────────────────
    // Sends utility bill photo to Claude Vision.
    // Returns monthly kWh usage for up to 12 months.
    if (action === "parseBill") {
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
      if (!imageBase64)   return res.status(400).json({ error: "imageBase64 required" });

      const prompt = `You are analyzing a photo of a residential utility bill or electricity usage chart.

Extract the monthly electricity usage in kWh for every month shown.

Rules:
- Look for a usage history chart, table, or graph — most bills show 12–13 months
- Extract the kWh value for each month shown
- Use 3-letter month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
- If a month appears twice (current vs prior year), use the most recent value
- If a month is not shown, omit it — do not guess

Respond ONLY with valid JSON in this exact format, no other text:
{
  "monthlyKwh": {
    "Jan": 806,
    "Feb": 840,
    "Mar": 930,
    "Apr": 840,
    "May": 744,
    "Jun": 900,
    "Jul": 1209,
    "Aug": 1302,
    "Sep": 1140,
    "Oct": 775,
    "Nov": 750,
    "Dec": 806
  }
}

Only include months that are actually shown in the bill. Omit months with no data.`;

      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-5",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType || "image/jpeg",
                    data: imageBase64,
                  },
                },
                { type: "text", text: prompt },
              ],
            }],
          }),
        });

        if (!r.ok) {
          const err = await r.text();
          return res.status(r.status).json({ error: "Claude API error", details: err });
        }

        const data = await r.json();
        const text = data.content?.[0]?.text || "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({ error: "Bill parsing failed", details: err.message });
      }
    }

    // ── PARSE ENERGY DOCUMENT ────────────────────────────────────────────────
    // Handles utility bills, solar production reports, screenshots of graphs,
    // Excel/CSV exports. Returns any combination of monthlyUsageKwh,
    // monthlySolarKwh, and ratePerKwh depending on what the document contains.
    // hint: "usage" | "solar" | "both" (tells Claude what to look for)
    if (action === "parseEnergyDoc") {
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

      const { imageBase64, fileBase64, mediaType, hint } = req.body || {};
      const isSpreadsheet = mediaType && (
        mediaType.includes("spreadsheet") ||
        mediaType.includes("excel") ||
        mediaType.includes("csv") ||
        mediaType.includes("text/plain") ||
        mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mediaType === "application/vnd.ms-excel"
      );

      const hintText = hint === "solar"
        ? "This document is a solar production report. Focus on extracting monthly solar energy production in kWh."
        : hint === "usage"
        ? "This document is a utility bill or energy usage report. Focus on extracting monthly electricity consumption in kWh and the per-kWh rate."
        : "This document may contain utility usage data, solar production data, or both.";

      const prompt = `You are analyzing an energy data document. It may be a utility bill, a solar production report, a screenshot of a graph or chart, an Excel spreadsheet, or a CSV file.

${hintText}

Your job: extract all energy data you can find. Specifically:

1. Monthly electricity USAGE in kWh (from utility bills, usage history charts)
2. Monthly SOLAR PRODUCTION in kWh (from solar monitoring reports, inverter exports)
3. The utility rate in $/kWh (from utility bills — look for the energy charge rate)

Rules:
- Use 3-letter month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
- Only include months where you can clearly read a value — do not guess
- If a month appears twice, use the most recent value
- For Excel/CSV: look at column headers to identify which columns contain usage vs solar vs date
- For graphs/charts: read the approximate bar heights or line values for each month
- For the rate: look for "energy charge", "per kWh", "$/kWh" — ignore taxes, fees, and demand charges

Respond ONLY with valid JSON. Include only the keys that you found data for:
{
  "monthlyUsageKwh": {
    "Jan": 806,
    "Feb": 750
  },
  "monthlySolarKwh": {
    "Jan": 200,
    "Feb": 280
  },
  "ratePerKwh": 0.20
}

If you only find usage data, return only "monthlyUsageKwh".
If you only find solar data, return only "monthlySolarKwh".
If you find both, return both.
If you find a rate, include "ratePerKwh".
Never return keys with empty objects or null values.`;

      try {
        let messageContent;

        if (isSpreadsheet && fileBase64) {
          // For Excel/CSV: send as a document with text extraction
          messageContent = [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType.includes("csv") ? "text/plain" : "application/pdf",
                data: fileBase64,
              },
            },
            { type: "text", text: prompt },
          ];
        } else if (imageBase64) {
          // Image or PDF screenshot
          messageContent = [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ];
        } else {
          return res.status(400).json({ error: "No file data provided" });
        }

        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-5",
            max_tokens: 1500,
            messages: [{ role: "user", content: messageContent }],
          }),
        });

        if (!r.ok) {
          const err = await r.text();
          return res.status(r.status).json({ error: "Claude API error", details: err });
        }

        const data = await r.json();
        const text = data.content?.[0]?.text || "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({ error: "Energy document parsing failed", details: err.message });
      }
    }

    return res.status(400).json({ error: "Unknown POST action" });
  }

  // GET actions
  if (!GOOGLE_KEY) {
    return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY not configured in environment variables" });
  }

  const { action, address, lat, lng } = req.query;

  try {
    // ── GEOCODE ──────────────────────────────────────────────────────────────
    if (action === "geocode") {
      if (!address) return res.status(400).json({ error: "address required" });
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
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

    // ── BUILDING INSIGHTS ────────────────────────────────────────────────────
    if (action === "buildingInsights") {
      if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
      const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${GOOGLE_KEY}`;
      const r = await fetch(url);
      if (!r.ok) {
        const errBody = await r.text();
        return res.status(r.status).json({
          error: "Solar API error",
          details: errBody,
          hint: "This address may not have Solar API coverage yet.",
        });
      }
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── SATELLITE URL ────────────────────────────────────────────────────────
    if (action === "satelliteUrl") {
      if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
      const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x400&maptype=satellite&key=${GOOGLE_KEY}`;
      return res.status(200).json({ imageUrl });
    }

    // ── MAPS JS KEY ──────────────────────────────────────────────────────────
    if (action === "mapsJsKey") {
      return res.status(200).json({ key: GOOGLE_KEY });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("Solar proxy error:", err);
    return res.status(500).json({ error: "Proxy error", details: err.message });
  }
}
