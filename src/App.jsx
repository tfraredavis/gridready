import { useState, useRef, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = "/api/solar";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PANEL_WATTS          = 400;
const BATTERY_EFFICIENCY   = 0.9;
const FEDERAL_ITC          = 0.30;
const COST_PER_WATT        = 3.00;
const BATTERY_COST_PER_KWH = 850;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function geocodeAddress(address) {
  const r = await fetch(`${API_BASE}?action=geocode&address=${encodeURIComponent(address)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Address not found");
  return data;
}

async function fetchBuildingInsights(lat, lng) {
  const r = await fetch(`${API_BASE}?action=buildingInsights&lat=${lat}&lng=${lng}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Solar data unavailable for this address");
  return data;
}

async function fetchMapsJsKey() {
  const r = await fetch(`${API_BASE}?action=mapsJsKey`);
  const data = await r.json();
  if (!r.ok) return null;
  return data.key;
}

// Convert file to base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callParsePanel(file) {
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "parsePanel", imageBase64, mediaType: file.type }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Panel parsing failed");
  return data; // { breakers: [{name, amps, estimatedWatts}] }
}

async function callParseBill(file) {
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "parseBill", imageBase64, mediaType: file.type }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Bill parsing failed");
  return data; // { monthlyKwh: { Jan: 806, ... } }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function getConfigForCount(sp, count) {
  const configs = sp?.solarPanelConfigs || [];
  return configs.find(c => c.panelsCount === count)
      || configs[Math.min(count - 1, configs.length - 1)]
      || null;
}

function getAnnualKwh(sp, panelCount) {
  const config = getConfigForCount(sp, panelCount);
  if (config?.yearlyEnergyDcKwh) return Math.round(config.yearlyEnergyDcKwh);
  const sunHours = sp?.maxSunshineHoursPerYear || 1400;
  return Math.round(panelCount * PANEL_WATTS * sunHours / 1000 * 0.86);
}

function calcSavings(annualKwh, rate, hasNetMetering) {
  const self = annualKwh * (hasNetMetering ? 0.6 : 0.85);
  const exp  = annualKwh - self;
  return Math.round(self * rate + (hasNetMetering ? exp * rate * 0.8 : 0));
}

function calcSystemCost(panelCount) {
  const gross = Math.round(panelCount * PANEL_WATTS * COST_PER_WATT);
  const itc   = Math.round(gross * FEDERAL_ITC);
  return { gross, itc, net: gross - itc };
}

function azimuthToDirection(deg) {
  return ["N","NE","E","SE","S","SW","W","NW","N"][Math.round(deg / 45) % 8];
}

function sunHoursToColor(hours, max) {
  const p = Math.min(1, hours / (max || 1800));
  if (p > 0.8) return "#F6AD55";
  if (p > 0.6) return "#68D391";
  if (p > 0.4) return "#63B3ED";
  return "#718096";
}

// ─── PANEL COORDINATE MATH ───────────────────────────────────────────────────
function panelToCorners(centerLat, centerLng, heightM, widthM, orientation) {
  const EARTH_R = 6371000;
  const h = orientation === "LANDSCAPE" ? widthM  : heightM;
  const w = orientation === "LANDSCAPE" ? heightM : widthM;
  const dLat = (h / 2) / EARTH_R * (180 / Math.PI);
  const dLng = (w / 2) / EARTH_R * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);
  return [
    { lat: centerLat + dLat, lng: centerLng - dLng },
    { lat: centerLat + dLat, lng: centerLng + dLng },
    { lat: centerLat - dLat, lng: centerLng + dLng },
    { lat: centerLat - dLat, lng: centerLng - dLng },
  ];
}

// ─── LOAD GOOGLE MAPS ────────────────────────────────────────────────────────
let mapsLoadPromise = null;
function loadGoogleMapsApi(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta`;
    script.async = true;
    script.onload  = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

// ─── ROOF MAP COMPONENT ───────────────────────────────────────────────────────
function RoofMap({ solarData, geoData, panelCount, mapsApiKey }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const polygonsRef = useRef([]);
  const [mapError, setMapError] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const sp     = solarData?.solarPotential;
  const panels = sp?.solarPanels || [];
  const panelH = sp?.panelHeightMeters || 1.65;
  const panelW = sp?.panelWidthMeters  || 0.99;

  useEffect(() => {
    if (!mapsApiKey || !solarData || !mapRef.current) return;
    loadGoogleMapsApi(mapsApiKey).then(() => {
      const center = {
        lat: solarData.center?.latitude  || geoData.lat,
        lng: solarData.center?.longitude || geoData.lng,
      };
      const map = new window.google.maps.Map(mapRef.current, {
        center, zoom: 20, mapTypeId: "satellite", tilt: 0,
        disableDefaultUI: true, gestureHandling: "cooperative",
      });
      mapInstance.current = map;
      const newPolygons = panels.map(panel => {
        const corners = panelToCorners(
          panel.center.latitude, panel.center.longitude, panelH, panelW, panel.orientation
        );
        return new window.google.maps.Polygon({
          paths: corners, strokeColor: "#40916C", strokeWeight: 1,
          fillColor: "#9AE6B4", fillOpacity: 0.55, map: null,
        });
      });
      polygonsRef.current = newPolygons;
      setMapReady(true);
    }).catch(err => { console.error(err); setMapError("Could not load interactive map"); });
    return () => { polygonsRef.current.forEach(p => p.setMap(null)); polygonsRef.current = []; };
  }, [mapsApiKey, solarData]); // eslint-disable-line

  useEffect(() => {
    if (!mapReady || !polygonsRef.current.length || !mapInstance.current) return;
    polygonsRef.current.forEach((poly, idx) => {
      poly.setMap(idx < panelCount ? mapInstance.current : null);
    });
  }, [panelCount, mapReady]);

  if (!mapsApiKey) return (
    <div style={{ height:300, display:"flex", alignItems:"center", justifyContent:"center",
      background:"#0f1623", borderRadius:12, color:"#4a5568", fontSize:13, textAlign:"center", padding:"1rem" }}>
      Interactive map requires a Google Maps API key.
    </div>
  );
  if (mapError) return (
    <div style={{ height:300, display:"flex", alignItems:"center", justifyContent:"center",
      background:"#0f1623", borderRadius:12, color:"#718096", fontSize:13 }}>{mapError}</div>
  );

  return (
    <div style={{ position:"relative", borderRadius:12, overflow:"hidden" }}>
      <div ref={mapRef} style={{ width:"100%", height:300, background:"#0f1623" }} />
      <div style={{ position:"absolute", top:10, right:10, background:"rgba(45,106,79,0.92)",
        borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#9AE6B4", pointerEvents:"none" }}>
        {panelCount} panels · {Math.round(panelCount * PANEL_WATTS / 1000 * 10) / 10} kW
      </div>
      <div style={{ position:"absolute", bottom:4, right:6, fontSize:10,
        color:"rgba(255,255,255,0.5)", pointerEvents:"none" }}>© Google</div>
      {!mapReady && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", background:"rgba(15,22,35,0.7)", fontSize:13, color:"#718096" }}>
          Loading map…
        </div>
      )}
    </div>
  );
}

// ─── IRRADIANCE BARS ─────────────────────────────────────────────────────────
function IrradianceBars({ solarData, panelCount }) {
  const sp  = solarData?.solarPotential;
  const max = sp?.maxSunshineHoursPerYear || 1800;
  const segs = (sp?.roofSegmentStats || [])
    .map(seg => ({
      direction: azimuthToDirection(seg.azimuthDegrees),
      sunHours:  Math.round(seg.stats?.sunshineQuantiles?.[5] || 0),
      area:      Math.round(seg.areaMeters2),
    }))
    .sort((a, b) => b.sunHours - a.sunHours).slice(0, 4);
  const config = getConfigForCount(sp, panelCount);
  if (!segs.length) return null;
  return (
    <div style={{ background:"#1e2535", borderRadius:10, padding:"1rem", border:"1px solid #2d3748" }}>
      <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Roof irradiance by segment</div>
      <div style={{ display:"grid", gap:6 }}>
        {segs.map((seg, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:11, color:"#718096", minWidth:28 }}>{seg.direction}</div>
            <div style={{ flex:1, height:6, background:"#0f1623", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:3, background: sunHoursToColor(seg.sunHours, max),
                width: `${Math.min(100, seg.sunHours / max * 100)}%`, transition:"width 0.4s" }} />
            </div>
            <div style={{ fontSize:11, color: sunHoursToColor(seg.sunHours, max), minWidth:72, textAlign:"right" }}>
              {seg.sunHours.toLocaleString()} hr/yr
            </div>
            <div style={{ fontSize:10, color:"#4a5568", minWidth:50 }}>{seg.area} m²</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, fontSize:11, color:"#4a5568" }}>
        <span>Peak sun hours: <strong style={{color:"#F6AD55"}}>{max.toLocaleString()}/yr</strong></span>
        {config && <span>Production for {panelCount} panels: <strong style={{color:"#68D391"}}>{Math.round(config.yearlyEnergyDcKwh).toLocaleString()} kWh/yr</strong></span>}
      </div>
    </div>
  );
}

// ─── BACKUP HOURS CHART ───────────────────────────────────────────────────────
// Simple inline bar chart — no external library needed
function BackupHoursChart({ monthlyKwh, demandPct, batteryKwh }) {
  const usableBattery = batteryKwh * BATTERY_EFFICIENCY;

  const bars = MONTHS.map(m => {
    const monthly = monthlyKwh[m];
    if (!monthly || !demandPct) return { month: m, hours: null };
    const dailyKwh   = monthly / 30;
    const demandKwh  = dailyKwh * (demandPct / 100);
    const hours      = demandKwh > 0 ? Math.round((usableBattery / demandKwh) * 10) / 10 : null;
    return { month: m, hours };
  });

  const maxHours = Math.max(...bars.map(b => b.hours || 0), 1);
  const hasData  = bars.some(b => b.hours !== null);

  if (!hasData) return (
    <div style={{ textAlign:"center", padding:"2rem", color:"#4a5568", fontSize:13 }}>
      Enter monthly kWh data above to see the backup hours graph.
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:160, padding:"0 4px" }}>
        {bars.map(({ month, hours }) => {
          const pct    = hours ? Math.min(1, hours / maxHours) : 0;
          const color  = hours >= 72 ? "#68D391" : hours >= 24 ? "#F6AD55" : "#FC8181";
          return (
            <div key={month} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              {hours !== null && (
                <div style={{ fontSize:9, color, fontWeight:600 }}>{hours}h</div>
              )}
              <div style={{ width:"100%", background:"#0f1623", borderRadius:"3px 3px 0 0",
                height: `${Math.max(4, pct * 130)}px`, transition:"height 0.4s",
                background: hours !== null ? color : "#1e2535", opacity: hours !== null ? 0.85 : 0.3 }} />
              <div style={{ fontSize:9, color:"#718096" }}>{month}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:16, marginTop:12, justifyContent:"center", flexWrap:"wrap" }}>
        {[
          { color:"#68D391", label:"72+ hours (3+ days)" },
          { color:"#F6AD55", label:"24–72 hours (1–3 days)" },
          { color:"#FC8181", label:"Under 24 hours" },
        ].map(l => (
          <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#718096" }}>
            <div style={{ width:8, height:8, borderRadius:2, background:l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STEP BAR ─────────────────────────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ["Your Home", "Solar Design", "Battery", "Results"];
  return (
    <div style={{ display:"flex", alignItems:"center", marginBottom:"2rem" }}>
      {steps.map((label, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", flex: i < steps.length-1 ? 1 : 0 }}>
          <div style={{
            width:28, height:28, borderRadius:"50%", flexShrink:0,
            background: i < current ? "#2D6A4F" : i === current ? "#40916C" : "transparent",
            border: i <= current ? "2px solid #40916C" : "2px solid #2d3748",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:12, fontWeight:600, color: i <= current ? "#fff" : "#4a5568", transition:"all 0.3s",
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{ fontSize:11, marginLeft:6, whiteSpace:"nowrap",
            color: i === current ? "#9AE6B4" : i < current ? "#68D391" : "#4a5568",
            marginRight: i < steps.length - 1 ? 6 : 0 }}>
            {label}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex:1, height:1, margin:"0 6px", background: i < current ? "#2D6A4F" : "#1e2535" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GridReadyApp() {
  const [step, setStep] = useState(0);

  // Step 0
  const [address, setAddress]               = useState("");
  const [monthlyBill, setMonthlyBill]       = useState("");
  const [ratePerKwh, setRatePerKwh]         = useState("0.13");
  const [annualKwhInput, setAnnualKwhInput] = useState("");
  const [hasNetMetering, setHasNetMetering] = useState(true);
  const [billFile, setBillFile]             = useState(null);
  const [panelFile, setPanelFile]           = useState(null);

  // API data
  const [geoData, setGeoData]       = useState(null);
  const [solarData, setSolarData]   = useState(null);
  const [mapsApiKey, setMapsApiKey] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Step 1
  const [panelCount, setPanelCount] = useState(0);

  // Step 2 — battery design
  const [batteryKwh, setBatteryKwh]         = useState(13.5);
  const [breakers, setBreakers]             = useState([]);   // [{id, name, amps, estimatedWatts, selected}]
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [demandOverride, setDemandOverride] = useState("");   // e.g. "33" (percent, no % sign)
  const [monthlyKwh, setMonthlyKwh]         = useState({});   // { Jan: 806, Feb: 840, ... }
  const [parsingPanel, setParsingPanel]     = useState(false);
  const [parsingBill, setParsingBill]       = useState(false);
  const [parseError, setParseError]         = useState("");

  // ── Derived values ────────────────────────────────────────────────────────
  const sp           = solarData?.solarPotential;
  const maxPanels    = sp?.maxArrayPanelsCount || 24;
  const annualKwh    = getAnnualKwh(sp, panelCount);
  const annualKwhUse = parseInt(annualKwhInput) || Math.round((parseFloat(monthlyBill) || 165) / (parseFloat(ratePerKwh) || 0.13) * 12);
  const pctOffset    = Math.min(100, Math.round(annualKwh / annualKwhUse * 100));
  const rate         = parseFloat(ratePerKwh) || 0.13;
  const savings      = calcSavings(annualKwh, rate, hasNetMetering);
  const cost         = calcSystemCost(panelCount);
  const payback      = savings > 0 ? Math.round(cost.net / savings * 10) / 10 : 0;
  const lifetime25   = Math.round(savings * 25 * 0.97 - cost.net);
  const systemKw     = Math.round(panelCount * PANEL_WATTS / 1000 * 10) / 10;
  const batteryCost  = Math.round(batteryKwh * BATTERY_COST_PER_KWH * (1 - FEDERAL_ITC));
  const totalNet     = cost.net + batteryCost;

  // Battery demand calculations
  const totalPanelWatts    = breakers.reduce((s, b) => s + b.estimatedWatts, 0);
  const selectedWatts      = breakers.filter(b => selectedIds.has(b.id)).reduce((s, b) => s + b.estimatedWatts, 0);
  const calculatedDemandPct = totalPanelWatts > 0 ? Math.round(selectedWatts / totalPanelWatts * 100) : 0;
  const effectiveDemandPct  = demandOverride !== "" ? parseFloat(demandOverride) : calculatedDemandPct;

  // ── Analyze address ───────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!address.trim()) { setError("Please enter your address."); return; }
    setLoading(true); setError("");
    try {
      const geo = await geocodeAddress(address);
      setGeoData(geo);
      const [insights, key] = await Promise.all([
        fetchBuildingInsights(geo.lat, geo.lng),
        fetchMapsJsKey().catch(() => null),
      ]);
      setSolarData(insights);
      setMapsApiKey(key);
      const defPanels = Math.min(Math.round((insights.solarPotential?.maxArrayPanelsCount || 20) * 0.6), 20);
      setPanelCount(defPanels);

      // If bill file was uploaded, parse it now
      if (billFile) {
        setParsingBill(true);
        try {
          const billData = await callParseBill(billFile);
          if (billData.monthlyKwh) setMonthlyKwh(billData.monthlyKwh);
        } catch (e) {
          console.warn("Bill parsing failed:", e.message);
        } finally {
          setParsingBill(false);
        }
      }

      setStep(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Parse panel photo ─────────────────────────────────────────────────────
  const handleParsePanel = async (file) => {
    if (!file) return;
    setParsingPanel(true); setParseError("");
    try {
      const result = await callParsePanel(file);
      if (!result.breakers?.length) throw new Error("No breakers detected in photo");
      const withIds = result.breakers.map((b, i) => ({
        ...b,
        id: `b_${i}`,
        name: b.name || "Unknown",
      }));
      setBreakers(withIds);
      // Pre-select all by default
      setSelectedIds(new Set(withIds.map(b => b.id)));
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsingPanel(false);
    }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card  = { background:"#1e2535", borderRadius:12, padding:"1.25rem", border:"1px solid #2d3748" };
  const inp   = { width:"100%", background:"#0f1623", border:"1px solid #2d3748", borderRadius:8, color:"#e2e8f0", padding:"10px 14px", fontSize:14, outline:"none", boxSizing:"border-box" };
  const lbl   = { fontSize:11, color:"#718096", marginBottom:4, display:"block", fontWeight:500, letterSpacing:"0.05em", textTransform:"uppercase" };
  const btnP  = { padding:"12px 24px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:600, background:"#2D6A4F", color:"#fff" };
  const btnG  = { padding:"10px 20px", borderRadius:8, cursor:"pointer", fontSize:13, background:"transparent", border:"1px solid #2d3748", color:"#718096" };
  const pill  = active => ({ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:500, cursor:"pointer", background: active?"#2D6A4F":"#1a202c", color: active?"#9AE6B4":"#718096", border: active?"1px solid #2D6A4F":"1px solid #2d3748" });
  const statCard = (val, label, sub) => (
    <div style={{ background:"#0f1623", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
      <div style={{ fontSize:20, fontWeight:700, color:"#68D391" }}>{val}</div>
      <div style={{ fontSize:10, color:"#718096", marginTop:2, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:"#4a5568", marginTop:1 }}>{sub}</div>}
    </div>
  );

  // ── STEP 0 ────────────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <div style={{ display:"grid", gap:"1rem" }}>
      <div>
        <label style={lbl}>Home address</label>
        <input style={inp} placeholder="123 Main St, Portland, OR 97201"
          value={address} onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAnalyze()} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
        <div>
          <label style={lbl}>Monthly electric bill ($)</label>
          <input style={inp} type="number" placeholder="165" value={monthlyBill} onChange={e => setMonthlyBill(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Rate ($/kWh)</label>
          <input style={inp} type="number" step="0.01" placeholder="0.13" value={ratePerKwh} onChange={e => setRatePerKwh(e.target.value)} />
        </div>
      </div>
      <div>
        <label style={lbl}>Annual kWh (optional)</label>
        <input style={inp} type="number" placeholder="e.g. 10,800" value={annualKwhInput} onChange={e => setAnnualKwhInput(e.target.value)} />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#a0aec0" }}>
        <span>Net metering?</span>
        <button onClick={() => setHasNetMetering(true)}  style={pill(hasNetMetering)}>Yes</button>
        <button onClick={() => setHasNetMetering(false)} style={pill(!hasNetMetering)}>No / Unsure</button>
      </div>

      {/* Bill upload */}
      <div style={{ ...card, background:"#0f1623", border:"1px dashed #2d3748" }}>
        <div style={{ fontSize:12, color:"#718096", marginBottom:6 }}>
          📄 Upload utility bill — AI extracts your monthly usage automatically
        </div>
        <input type="file" accept="image/*,.pdf"
          onChange={e => setBillFile(e.target.files[0])}
          style={{ fontSize:12, color:"#718096" }} />
        {billFile && <div style={{ marginTop:6, fontSize:12, color:"#68D391" }}>✓ {billFile.name} — will be parsed when you click Analyze</div>}
      </div>

      {/* Panel photo upload */}
      <div style={{ ...card, background:"#0f1623", border:"1px dashed #2d3748" }}>
        <div style={{ fontSize:12, color:"#718096", marginBottom:6 }}>
          📸 Upload electrical panel photo — AI reads your breakers in Step 3
        </div>
        <input type="file" accept="image/*"
          onChange={e => setPanelFile(e.target.files[0])}
          style={{ fontSize:12, color:"#718096" }} />
        {panelFile && <div style={{ marginTop:6, fontSize:12, color:"#68D391" }}>✓ {panelFile.name}</div>}
      </div>

      {error && <div style={{ color:"#FC8181", fontSize:13, padding:"8px 12px", background:"rgba(252,129,129,0.1)", borderRadius:6 }}>⚠️ {error}</div>}

      <button style={{ ...btnP, width:"100%", padding:"14px", fontSize:15 }} onClick={handleAnalyze} disabled={loading}>
        {loading ? "Fetching roof data…" : "→ Analyze My Roof"}
      </button>
      <div style={{ fontSize:11, color:"#2d3748", textAlign:"center" }}>
        Uses Google Solar API · Real data for your specific home
      </div>
    </div>
  );

  // ── STEP 1 ────────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div style={{ display:"grid", gap:"1rem" }}>
      <div style={{ fontSize:12, color:"#718096" }}>
        📍 {geoData?.formattedAddress}
        {sp && <> &nbsp;·&nbsp; ☀️ {sp.maxSunshineHoursPerYear?.toLocaleString()} sun-hrs/yr &nbsp;·&nbsp; 🏠 max {maxPanels} panels</>}
      </div>

      <RoofMap solarData={solarData} geoData={geoData} panelCount={panelCount} mapsApiKey={mapsApiKey} />

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
          <span style={{ fontSize:15, fontWeight:600, color:"#e2e8f0" }}>Solar panels: {panelCount}</span>
          <span style={{ fontSize:12, color:"#718096" }}>{systemKw} kW system</span>
        </div>
        <input type="range" min={1} max={maxPanels} value={panelCount}
          onChange={e => setPanelCount(parseInt(e.target.value))}
          style={{ width:"100%", accentColor:"#40916C" }} />
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#4a5568", marginTop:3, marginBottom:12 }}>
          <span>1 (min)</span><span>{maxPanels} (roof max)</span>
        </div>
        <div style={{ fontSize:11, color:"#4a5568", marginBottom:12, fontStyle:"italic" }}>
          Panels appear on your roof above as you move the slider — placed on best roof planes first.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {statCard(`${annualKwh.toLocaleString()} kWh`, "Annual production", "From Solar API")}
          {statCard(`${pctOffset}%`, "Usage offset", `of ${annualKwhUse.toLocaleString()} kWh/yr`)}
          {statCard(`$${savings.toLocaleString()}`, "Annual savings", `@ $${rate}/kWh`)}
        </div>
      </div>

      <IrradianceBars solarData={solarData} panelCount={panelCount} />

      <div style={card}>
        <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Cost estimate</div>
        {[
          { label:"Gross installed cost",  val:`$${cost.gross.toLocaleString()}`, color:"#e2e8f0" },
          { label:"Federal ITC (30%)",      val:`-$${cost.itc.toLocaleString()}`,  color:"#68D391" },
          { label:"Net after tax credit",   val:`$${cost.net.toLocaleString()}`,   color:"#F6AD55", bold:true },
          { label:"Simple payback",         val:`${payback} years`,                color:"#e2e8f0" },
          { label:"25-year net value",      val:`$${lifetime25.toLocaleString()}`, color:"#68D391" },
        ].map(r => (
          <div key={r.label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #1a202c", fontSize:13 }}>
            <span style={{ color:"#718096" }}>{r.label}</span>
            <span style={{ color:r.color, fontWeight:r.bold?700:400 }}>{r.val}</span>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnG} onClick={() => setStep(0)}>← Back</button>
        <button style={{ ...btnP, flex:1 }} onClick={() => setStep(2)}>→ Design Battery System</button>
      </div>
    </div>
  );

  // ── STEP 2 — Battery design ───────────────────────────────────────────────
  const renderStep2 = () => (
    <div style={{ display:"grid", gap:"1.25rem" }}>

      {/* Cascadia callout */}
      <div style={{ ...card, background:"#0f1623", border:"1px solid #2D6A4F" }}>
        <div style={{ fontSize:12, color:"#9AE6B4", fontWeight:600, marginBottom:3 }}>🏔️ Cascadia Subduction Zone risk</div>
        <div style={{ fontSize:12, color:"#718096" }}>
          37% probability of a 9.0+ earthquake in the next 50 years.
          Grid restoration could take <strong style={{ color:"#F6AD55" }}>2–4 weeks</strong> across western OR and WA.
        </div>
      </div>

      {/* Battery size */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
          <span style={{ fontSize:15, fontWeight:600, color:"#e2e8f0" }}>Battery size: {batteryKwh} kWh</span>
          <span style={{ fontSize:12, color:"#718096" }}>
            {batteryKwh <= 13.5 ? "~1 Powerwall" : batteryKwh <= 27 ? "~2 Powerwalls" : "~3+ Powerwalls"}
          </span>
        </div>
        <input type="range" min={5} max={60} step={0.5} value={batteryKwh}
          onChange={e => setBatteryKwh(parseFloat(e.target.value))}
          style={{ width:"100%", accentColor:"#40916C" }} />
        <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
          {[10, 13.5, 20, 27, 40].map(k => (
            <button key={k} style={pill(batteryKwh === k)} onClick={() => setBatteryKwh(k)}>{k} kWh</button>
          ))}
        </div>
      </div>

      {/* ── PANEL PHOTO PARSER ── */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0", marginBottom:4 }}>
          Electrical panel loads
        </div>
        <div style={{ fontSize:12, color:"#718096", marginBottom:12 }}>
          {breakers.length > 0
            ? `${breakers.length} circuits detected from your panel photo.`
            : "Upload your electrical panel photo to see your actual loads."}
        </div>

        {/* Upload / parse button */}
        {breakers.length === 0 && (
          <div>
            {panelFile ? (
              <button
                style={{ ...btnP, width:"100%" }}
                onClick={() => handleParsePanel(panelFile)}
                disabled={parsingPanel}>
                {parsingPanel ? "Reading your panel…" : "→ Read Panel Photo"}
              </button>
            ) : (
              <div>
                <div style={{ fontSize:12, color:"#4a5568", marginBottom:8 }}>
                  No panel photo uploaded yet. Upload one in Step 1 or upload now:
                </div>
                <input type="file" accept="image/*"
                  onChange={e => {
                    setPanelFile(e.target.files[0]);
                    handleParsePanel(e.target.files[0]);
                  }}
                  style={{ fontSize:12, color:"#718096" }} />
              </div>
            )}
            {parseError && (
              <div style={{ marginTop:8, color:"#FC8181", fontSize:12 }}>⚠️ {parseError}</div>
            )}
          </div>
        )}

        {/* Breaker table */}
        {breakers.length > 0 && (
          <div>
            {/* Table header */}
            <div style={{ display:"grid", gridTemplateColumns:"24px 1fr 52px 72px 36px",
              gap:8, padding:"6px 8px", fontSize:10, color:"#4a5568",
              textTransform:"uppercase", letterSpacing:"0.05em", borderBottom:"1px solid #2d3748" }}>
              <div></div>
              <div>Circuit</div>
              <div style={{ textAlign:"right" }}>Amps</div>
              <div style={{ textAlign:"right" }}>Est. watts</div>
              <div></div>
            </div>

            <div style={{ maxHeight:320, overflowY:"auto" }}>
              {breakers.map(b => {
                const checked = selectedIds.has(b.id);
                return (
                  <div key={b.id} style={{
                    display:"grid", gridTemplateColumns:"24px 1fr 52px 72px 36px",
                    gap:8, padding:"7px 8px", alignItems:"center",
                    borderBottom:"1px solid #1a202c",
                    background: checked ? "rgba(45,106,79,0.08)" : "transparent",
                  }}>
                    {/* Checkbox */}
                    <input type="checkbox" checked={checked}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (checked) next.delete(b.id); else next.add(b.id);
                        setSelectedIds(next);
                        setDemandOverride(""); // clear override when loads change
                      }}
                      style={{ accentColor:"#40916C", width:14, height:14 }} />

                    {/* Name — editable if Unknown */}
                    {b.name === "Unknown" ? (
                      <input
                        style={{ ...inp, padding:"4px 8px", fontSize:12, height:28 }}
                        placeholder="Rename this circuit"
                        defaultValue=""
                        onBlur={e => {
                          const newName = e.target.value.trim() || "Unknown";
                          setBreakers(prev => prev.map(x => x.id === b.id ? { ...x, name: newName } : x));
                        }}
                      />
                    ) : (
                      <div style={{ fontSize:12, color: checked ? "#e2e8f0" : "#718096" }}>{b.name}</div>
                    )}

                    {/* Amps */}
                    <div style={{ fontSize:12, color:"#718096", textAlign:"right" }}>{b.amps}A</div>

                    {/* Watts — editable */}
                    <div style={{ display:"flex", alignItems:"center", gap:2, justifyContent:"flex-end" }}>
                      <input
                        type="number"
                        style={{ ...inp, padding:"3px 6px", fontSize:11, width:58, height:26, textAlign:"right" }}
                        value={b.estimatedWatts}
                        onChange={e => {
                          const w = parseInt(e.target.value) || 0;
                          setBreakers(prev => prev.map(x => x.id === b.id ? { ...x, estimatedWatts: w } : x));
                        }}
                      />
                      <span style={{ fontSize:10, color:"#4a5568" }}>W</span>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        setBreakers(prev => prev.filter(x => x.id !== b.id));
                        const next = new Set(selectedIds); next.delete(b.id); setSelectedIds(next);
                      }}
                      style={{ background:"none", border:"none", color:"#4a5568", cursor:"pointer", fontSize:14, padding:0 }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Re-parse button */}
            <div style={{ marginTop:10, display:"flex", gap:8 }}>
              <button style={{ ...btnG, fontSize:11 }}
                onClick={() => { setBreakers([]); setSelectedIds(new Set()); }}>
                ↺ Re-parse panel photo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── DEMAND DISPLAY & OVERRIDE ── */}
      {breakers.length > 0 && (
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0", marginBottom:12 }}>Outage demand</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
            <div style={{ background:"#0f1623", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:700, color:"#68D391" }}>{effectiveDemandPct}%</div>
              <div style={{ fontSize:10, color:"#718096", marginTop:2, textTransform:"uppercase" }}>demand during outage</div>
              {demandOverride !== "" && (
                <div style={{ fontSize:10, color:"#F6AD55", marginTop:2 }}>manual override</div>
              )}
            </div>
            <div style={{ background:"#0f1623", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:700, color:"#F6AD55" }}>{selectedWatts.toLocaleString()}W</div>
              <div style={{ fontSize:10, color:"#718096", marginTop:2, textTransform:"uppercase" }}>selected load watts</div>
              <div style={{ fontSize:10, color:"#4a5568", marginTop:1 }}>of {totalPanelWatts.toLocaleString()}W total</div>
            </div>
          </div>

          <div>
            <label style={lbl}>Override demand % (optional)</label>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input
                style={{ ...inp, width:100 }}
                type="number" min={1} max={100}
                placeholder={calculatedDemandPct.toString()}
                value={demandOverride}
                onChange={e => setDemandOverride(e.target.value)}
              />
              <span style={{ fontSize:13, color:"#718096" }}>%</span>
              {demandOverride !== "" && (
                <button style={{ ...btnG, fontSize:11, padding:"6px 12px" }}
                  onClick={() => setDemandOverride("")}>
                  Clear override
                </button>
              )}
            </div>
            <div style={{ fontSize:11, color:"#4a5568", marginTop:5 }}>
              Leave blank to use the calculated value from your selected loads above.
              Enter a number to override — e.g. 33 for one-third of total demand.
            </div>
          </div>
        </div>
      )}

      {/* ── MONTHLY KWH EDITOR ── */}
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0", marginBottom:4 }}>
          Monthly energy usage
        </div>
        <div style={{ fontSize:12, color:"#718096", marginBottom:12 }}>
          {Object.keys(monthlyKwh).length > 0
            ? "Parsed from your utility bill — edit any month below."
            : "Upload your utility bill in Step 1 to auto-populate, or enter manually."}
          {parsingBill && <span style={{ color:"#F6AD55" }}> Parsing bill…</span>}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {MONTHS.map(m => (
            <div key={m}>
              <label style={{ ...lbl, marginBottom:2 }}>{m}</label>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <input
                  type="number"
                  style={{ ...inp, padding:"6px 8px", fontSize:12 }}
                  placeholder="kWh"
                  value={monthlyKwh[m] || ""}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setMonthlyKwh(prev => ({ ...prev, [m]: isNaN(v) ? undefined : v }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BACKUP HOURS GRAPH ── */}
      {effectiveDemandPct > 0 && Object.keys(monthlyKwh).length > 0 && (
        <div style={card}>
          <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0", marginBottom:4 }}>
            Battery backup duration by month
          </div>
          <div style={{ fontSize:12, color:"#718096", marginBottom:14 }}>
            {batteryKwh} kWh battery · {effectiveDemandPct}% demand
            {demandOverride !== "" ? " (manual override)" : ` (${selectedIds.size} of ${breakers.length} circuits selected)`}
          </div>
          <BackupHoursChart
            monthlyKwh={monthlyKwh}
            demandPct={effectiveDemandPct}
            batteryKwh={batteryKwh}
          />
        </div>
      )}

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnG} onClick={() => setStep(1)}>← Back</button>
        <button style={{ ...btnP, flex:1 }} onClick={() => setStep(3)}>→ See Full Results</button>
      </div>
    </div>
  );

  // ── STEP 3 — Results ──────────────────────────────────────────────────────
  const renderStep3 = () => {
    const worstMonth = MONTHS.reduce((worst, m) => {
      if (!monthlyKwh[m]) return worst;
      const daily = monthlyKwh[m] / 30;
      const hrs   = effectiveDemandPct > 0 ? (batteryKwh * BATTERY_EFFICIENCY) / (daily * effectiveDemandPct / 100) : 0;
      if (!worst || hrs < worst.hours) return { month: m, hours: Math.round(hrs * 10) / 10 };
      return worst;
    }, null);

    const bestMonth = MONTHS.reduce((best, m) => {
      if (!monthlyKwh[m]) return best;
      const daily = monthlyKwh[m] / 30;
      const hrs   = effectiveDemandPct > 0 ? (batteryKwh * BATTERY_EFFICIENCY) / (daily * effectiveDemandPct / 100) : 0;
      if (!best || hrs > best.hours) return { month: m, hours: Math.round(hrs * 10) / 10 };
      return best;
    }, null);

    return (
      <div style={{ display:"grid", gap:"1rem" }}>
        <div style={{ background:"linear-gradient(135deg,#1a2e22,#0f1623)", border:"1px solid #2D6A4F", borderRadius:12, padding:"1.5rem", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9AE6B4", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>
            Your Home Energy System
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:"#e2e8f0" }}>
            {systemKw} kW Solar + {batteryKwh} kWh Battery
          </div>
          <div style={{ fontSize:12, color:"#718096", marginTop:4 }}>{geoData?.formattedAddress}</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            { icon:"⚡", label:"Annual generation", val:`${annualKwh.toLocaleString()} kWh`, sub:`${pctOffset}% of usage` },
            { icon:"💰", label:"Year 1 savings",    val:`$${savings.toLocaleString()}`,       sub:`${payback}yr payback` },
            worstMonth
              ? { icon:"🔋", label:`Worst month (${worstMonth.month})`, val:`${worstMonth.hours}h backup`, sub:`at ${effectiveDemandPct}% demand` }
              : { icon:"🔋", label:"Battery backup", val:`${batteryKwh} kWh`, sub:"configure loads in Step 3" },
            { icon:"📈", label:"25-yr net value",   val:`$${lifetime25.toLocaleString()}`,    sub:"after 30% ITC" },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign:"center" }}>
              <div style={{ fontSize:22 }}>{s.icon}</div>
              <div style={{ fontSize:20, fontWeight:700, color:"#68D391", margin:"4px 0 2px" }}>{s.val}</div>
              <div style={{ fontSize:10, color:"#718096", textTransform:"uppercase", letterSpacing:"0.04em" }}>{s.label}</div>
              <div style={{ fontSize:10, color:"#4a5568", marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Backup graph in results too */}
        {effectiveDemandPct > 0 && Object.keys(monthlyKwh).length > 0 && (
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:4 }}>Battery backup by month</div>
            <div style={{ fontSize:11, color:"#4a5568", marginBottom:12 }}>
              {batteryKwh} kWh · {effectiveDemandPct}% demand ·
              {worstMonth && ` worst: ${worstMonth.month} (${worstMonth.hours}h)`}
              {bestMonth  && ` · best: ${bestMonth.month} (${bestMonth.hours}h)`}
            </div>
            <BackupHoursChart monthlyKwh={monthlyKwh} demandPct={effectiveDemandPct} batteryKwh={batteryKwh} />
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Total investment</div>
          {[
            { label:`Solar (${panelCount} panels, ${systemKw} kW)`, val:`$${cost.gross.toLocaleString()}` },
            { label:`Battery (${batteryKwh} kWh)`,                  val:`$${Math.round(batteryKwh * BATTERY_COST_PER_KWH).toLocaleString()}` },
            { label:"Federal ITC (30%)",                             val:`-$${Math.round((cost.gross + batteryKwh * BATTERY_COST_PER_KWH) * 0.30).toLocaleString()}`, green:true },
            { label:"Net cost after incentives",                     val:`$${totalNet.toLocaleString()}`, bold:true },
          ].map(r => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #1a202c", fontSize:13 }}>
              <span style={{ color:"#718096" }}>{r.label}</span>
              <span style={{ color:r.green?"#68D391":r.bold?"#F6AD55":"#e2e8f0", fontWeight:r.bold?700:400 }}>{r.val}</span>
            </div>
          ))}
        </div>

        <div style={{ ...card, border:"1px solid #2D6A4F" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#9AE6B4", marginBottom:8 }}>🛡️ Cascadia resilience summary</div>
          <div style={{ display:"grid", gap:6, fontSize:12, color:"#a0aec0" }}>
            {worstMonth && <div>• Worst case: <strong style={{color:"#e2e8f0"}}>{worstMonth.hours}h</strong> backup in {worstMonth.month} at {effectiveDemandPct}% demand</div>}
            {bestMonth  && <div>• Best case: <strong style={{color:"#e2e8f0"}}>{bestMonth.hours}h</strong> backup in {bestMonth.month}</div>}
            <div>• <strong style={{color:"#e2e8f0"}}>~{Math.round(annualKwh/365)} kWh</strong> average daily solar recharge</div>
            <div>• Solar recharges battery daily — real resilience extends well beyond battery-only hours</div>
            {worstMonth && worstMonth.hours < 72 && (
              <div style={{color:"#F6AD55"}}>
                • Consider a larger battery to reach 72+ hours in your worst month
              </div>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Next steps</div>
          {[
            "Get 3+ quotes from certified local installers — use these numbers to evaluate them",
            "Ask each installer to confirm system size and verify off-grid configuration",
            "Review your utility's net metering policy before signing any contract",
            "Apply for federal tax credit (Form 5695) — consult your accountant",
          ].map((s, i) => (
            <div key={i} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:"1px solid #1a202c", fontSize:12 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background:"#2D6A4F", color:"#9AE6B4",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>
                {i+1}
              </div>
              <span style={{ color:"#a0aec0" }}>{s}</span>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button style={btnG} onClick={() => setStep(2)}>← Adjust battery design</button>
          <button style={{ ...btnG, flex:1 }}
            onClick={() => { setStep(0); setSolarData(null); setGeoData(null); setMapsApiKey(null);
              setBreakers([]); setSelectedIds(new Set()); setMonthlyKwh({}); setDemandOverride(""); }}>
            ↺ Start over
          </button>
        </div>

        <div style={{ fontSize:10, color:"#2d3748", textAlign:"center" }}>
          Estimates only · Production data: Google Solar API · Cost estimates are national averages
        </div>
      </div>
    );
  };

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh", background:"#0d1117", color:"#e2e8f0",
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"2rem 1rem",
    }}>
      <div style={{ width:"100%", maxWidth:680, marginBottom:"1.5rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#2D6A4F",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-0.02em" }}>GridReady</div>
            <div style={{ fontSize:10, color:"#4a5568", letterSpacing:"0.08em", textTransform:"uppercase" }}>
              Solar + Battery Microgrid Designer
            </div>
          </div>
        </div>
      </div>

      <div style={{ width:"100%", maxWidth:680, background:"#161b27", borderRadius:16, padding:"1.75rem", border:"1px solid #1e2535" }}>
        <StepBar current={step} />
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      <div style={{ marginTop:"1.5rem", fontSize:10, color:"#1e2535", maxWidth:600, textAlign:"center" }}>
        Production estimates use Google Solar API · Cost estimates are national averages
      </div>
    </div>
  );
}
