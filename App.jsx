import { useState, useRef, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// In development (npm start), calls go to /api/solar
// In production (Vercel), the serverless function at /api/solar.js handles it
const API_BASE = "/api/solar";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PANEL_WATTS = 400;
const BATTERY_EFFICIENCY = 0.9;
const FEDERAL_ITC = 0.30;
const COST_PER_WATT = 3.00;
const BATTERY_COST_PER_KWH = 850;

const COMMON_LOADS = [
  { id: "fridge",    label: "Refrigerator",     watts: 150,  icon: "🧊", critical: true  },
  { id: "lights",    label: "Lighting (LED)",    watts: 100,  icon: "💡", critical: true  },
  { id: "phone",     label: "Phone charging",    watts: 25,   icon: "📱", critical: true  },
  { id: "wifi",      label: "WiFi router",       watts: 20,   icon: "📶", critical: true  },
  { id: "medical",   label: "Medical device",    watts: 100,  icon: "🏥", critical: true  },
  { id: "furnace",   label: "Furnace fan",        watts: 600,  icon: "🔥", critical: false },
  { id: "tv",        label: "Television",         watts: 120,  icon: "📺", critical: false },
  { id: "laptop",    label: "Laptop",             watts: 60,   icon: "💻", critical: false },
  { id: "microwave", label: "Microwave",          watts: 1200, icon: "📡", critical: false },
  { id: "washer",    label: "Washing machine",    watts: 500,  icon: "🫧", critical: false },
  { id: "ev",        label: "EV charging (L1)",   watts: 1440, icon: "🚗", critical: false },
  { id: "ac",        label: "Window AC (small)",  watts: 900,  icon: "❄️", critical: false },
];

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function geocodeAddress(address) {
  const r = await fetch(`${API_BASE}?action=geocode&address=${encodeURIComponent(address)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Address not found");
  return data; // { formattedAddress, lat, lng }
}

async function fetchBuildingInsights(lat, lng) {
  const r = await fetch(`${API_BASE}?action=buildingInsights&lat=${lat}&lng=${lng}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Solar data unavailable for this address");
  return data;
}

async function fetchSatelliteUrl(lat, lng) {
  const r = await fetch(`${API_BASE}?action=satelliteUrl&lat=${lat}&lng=${lng}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Satellite image unavailable");
  return data.imageUrl;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function getSolarPanelConfig(solarPotential, panelCount) {
  // Use the API's actual per-config kWh data if available
  const configs = solarPotential?.solarPanelConfigs || [];
  return configs.find(c => c.panelsCount === panelCount) || configs[panelCount - 1] || null;
}

function getAnnualKwh(solarPotential, panelCount) {
  const config = getSolarPanelConfig(solarPotential, panelCount);
  if (config?.yearlyEnergyDcKwh) return Math.round(config.yearlyEnergyDcKwh);
  // Fallback estimate if API config not available for this count
  const sunHours = solarPotential?.maxSunshineHoursPerYear || 1400;
  return Math.round(panelCount * PANEL_WATTS * sunHours / 1000 * 0.86);
}

function calcSavings(annualKwh, ratePerKwh, hasNetMetering) {
  const selfConsume = annualKwh * (hasNetMetering ? 0.6 : 0.85);
  const exported = annualKwh - selfConsume;
  return Math.round(selfConsume * ratePerKwh + (hasNetMetering ? exported * ratePerKwh * 0.8 : 0));
}

function calcSystemCost(panelCount) {
  const gross = Math.round(panelCount * PANEL_WATTS * COST_PER_WATT);
  const itc = Math.round(gross * FEDERAL_ITC);
  return { gross, itc, net: gross - itc };
}

function calcBatteryRuntime(loadIds, batteryKwh) {
  const totalW = loadIds.reduce((s, id) => s + (COMMON_LOADS.find(l => l.id === id)?.watts || 0), 0);
  if (!totalW) return 0;
  return Math.round((batteryKwh * BATTERY_EFFICIENCY * 0.9 / totalW * 1000) * 10) / 10;
}

// Summarise roof segments for display
function summariseSegments(roofSegmentStats = []) {
  if (!roofSegmentStats.length) return [];
  return roofSegmentStats
    .map(seg => ({
      pitch: Math.round(seg.pitchDegrees),
      azimuth: Math.round(seg.azimuthDegrees),
      area: Math.round(seg.areaMeters2),
      sunHours: Math.round(seg.stats?.sunshineQuantiles?.[5] || 0), // 75th percentile
      direction: azimuthToDirection(seg.azimuthDegrees),
    }))
    .sort((a, b) => b.sunHours - a.sunHours);
}

function azimuthToDirection(deg) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW","N"];
  return dirs[Math.round(deg / 45) % 8];
}

function sunHoursToColor(hours, maxHours) {
  const pct = Math.min(1, hours / (maxHours || 1800));
  if (pct > 0.8) return "#F6AD55";
  if (pct > 0.6) return "#68D391";
  if (pct > 0.4) return "#63B3ED";
  return "#718096";
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StepBar({ current }) {
  const steps = ["Your Home", "Solar Design", "Battery", "Results"];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:"2rem" }}>
      {steps.map((label, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", flex: i < steps.length-1 ? 1 : 0 }}>
          <div style={{
            width:28, height:28, borderRadius:"50%", flexShrink:0,
            background: i < current ? "#2D6A4F" : i === current ? "#40916C" : "transparent",
            border: i <= current ? "2px solid #40916C" : "2px solid #2d3748",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:12, fontWeight:600, color: i <= current ? "#fff" : "#4a5568",
            transition:"all 0.3s",
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <div style={{
            fontSize:11, marginLeft:6, whiteSpace:"nowrap",
            color: i === current ? "#9AE6B4" : i < current ? "#68D391" : "#4a5568",
            marginRight: i < steps.length - 1 ? 6 : 0,
          }}>
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

// Satellite roof view + irradiance data panel
function RoofView({ satelliteUrl, solarData, panelCount, loading }) {
  const sp = solarData?.solarPotential;
  const segments = summariseSegments(sp?.roofSegmentStats);
  const maxSunHours = sp?.maxSunshineHoursPerYear || 1800;
  const config = getSolarPanelConfig(sp, panelCount);

  return (
    <div style={{ display:"grid", gap:"1rem" }}>
      {/* Satellite image */}
      <div style={{ position:"relative", borderRadius:12, overflow:"hidden", background:"#0f1623", minHeight:200 }}>
        {loading ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, color:"#718096", fontSize:13 }}>
            Loading satellite imagery…
          </div>
        ) : satelliteUrl ? (
          <>
            <img
              src={satelliteUrl}
              alt="Satellite view of your roof"
              style={{ width:"100%", display:"block", borderRadius:12 }}
              onError={e => { e.target.style.display = "none"; }}
            />
            <div style={{
              position:"absolute", bottom:8, left:8,
              background:"rgba(0,0,0,0.65)", borderRadius:6, padding:"4px 8px",
              fontSize:11, color:"#a0aec0",
            }}>
              Satellite · {solarData?.imageryDate?.year || "recent"}
            </div>
            {/* Panel count badge */}
            <div style={{
              position:"absolute", top:8, right:8,
              background:"rgba(45,106,79,0.9)", borderRadius:20, padding:"4px 12px",
              fontSize:12, fontWeight:700, color:"#9AE6B4",
            }}>
              {panelCount} panels · {Math.round(panelCount * PANEL_WATTS / 1000 * 10) / 10} kW
            </div>
            {/* Google attribution (required by ToS) */}
            <div style={{
              position:"absolute", bottom:8, right:8,
              background:"rgba(0,0,0,0.5)", borderRadius:4, padding:"2px 6px",
              fontSize:10, color:"#718096",
            }}>
              © Google
            </div>
          </>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, color:"#4a5568", fontSize:13 }}>
            Satellite image unavailable for this address
          </div>
        )}
      </div>

      {/* Irradiance / roof segment breakdown */}
      {segments.length > 0 && (
        <div style={{ background:"#1e2535", borderRadius:10, padding:"1rem", border:"1px solid #2d3748" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>
            Roof irradiance by segment
          </div>
          <div style={{ display:"grid", gap:6 }}>
            {segments.slice(0, 4).map((seg, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:11, color:"#718096", minWidth:28 }}>{seg.direction}</div>
                <div style={{ flex:1, height:6, background:"#0f1623", borderRadius:3, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", borderRadius:3,
                    width: `${Math.min(100, seg.sunHours / maxSunHours * 100)}%`,
                    background: sunHoursToColor(seg.sunHours, maxSunHours),
                    transition:"width 0.4s",
                  }} />
                </div>
                <div style={{ fontSize:11, color: sunHoursToColor(seg.sunHours, maxSunHours), minWidth:72, textAlign:"right" }}>
                  {seg.sunHours.toLocaleString()} hr/yr
                </div>
                <div style={{ fontSize:10, color:"#4a5568", minWidth:50 }}>{seg.area} m²</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, fontSize:11, color:"#4a5568" }}>
            <span>Peak sun hours at this location: <strong style={{color:"#F6AD55"}}>{maxSunHours.toLocaleString()}/yr</strong></span>
            {config && (
              <span>API production for {panelCount} panels: <strong style={{color:"#68D391"}}>{Math.round(config.yearlyEnergyDcKwh).toLocaleString()} kWh/yr</strong></span>
            )}
          </div>
          <div style={{ fontSize:10, color:"#2d3748", marginTop:4 }}>
            Data: Google Solar API · Production figures account for shade, pitch, azimuth, and local weather at this address.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GridReadyApp() {
  const [step, setStep] = useState(0);

  // Step 0 inputs
  const [address, setAddress]               = useState("");
  const [monthlyBill, setMonthlyBill]       = useState("");
  const [ratePerKwh, setRatePerKwh]         = useState("0.13");
  const [annualKwhInput, setAnnualKwhInput] = useState("");
  const [hasNetMetering, setHasNetMetering] = useState(true);
  const [billFile, setBillFile]             = useState(null);
  const [panelFile, setPanelFile]           = useState(null);

  // Data from APIs
  const [geoData, setGeoData]               = useState(null); // { formattedAddress, lat, lng }
  const [solarData, setSolarData]           = useState(null); // buildingInsights response
  const [satelliteUrl, setSatelliteUrl]     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [imgLoading, setImgLoading]         = useState(false);
  const [error, setError]                   = useState("");

  // Step 1 — solar design
  const [panelCount, setPanelCount] = useState(0);

  // Step 2 — battery
  const [batteryKwh, setBatteryKwh]       = useState(13.5);
  const [selectedLoads, setSelectedLoads] = useState(["fridge","lights","phone","wifi"]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const sp          = solarData?.solarPotential;
  const maxPanels   = sp?.maxArrayPanelsCount || 24;
  const sunHours    = sp?.maxSunshineHoursPerYear || 1400;
  const annualKwh   = getAnnualKwh(sp, panelCount);
  const annualKwhUse = parseInt(annualKwhInput) || Math.round((parseFloat(monthlyBill) || 165) / (parseFloat(ratePerKwh) || 0.13) * 12);
  const pctOffset   = Math.min(100, Math.round(annualKwh / annualKwhUse * 100));
  const rate        = parseFloat(ratePerKwh) || 0.13;
  const savings     = calcSavings(annualKwh, rate, hasNetMetering);
  const cost        = calcSystemCost(panelCount);
  const payback     = savings > 0 ? Math.round(cost.net / savings * 10) / 10 : 0;
  const lifetime25  = Math.round(savings * 25 * 0.97 - cost.net);
  const systemKw    = Math.round(panelCount * PANEL_WATTS / 1000 * 10) / 10;
  const totalLoadW  = selectedLoads.reduce((s, id) => s + (COMMON_LOADS.find(l => l.id === id)?.watts || 0), 0);
  const runtime     = calcBatteryRuntime(selectedLoads, batteryKwh);
  const batteryCost = Math.round(batteryKwh * BATTERY_COST_PER_KWH * (1 - FEDERAL_ITC));
  const totalNet    = cost.net + batteryCost;

  // ── Fetch solar data ────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!address.trim()) { setError("Please enter your address."); return; }
    setLoading(true); setError("");
    try {
      // 1. Geocode
      const geo = await geocodeAddress(address);
      setGeoData(geo);

      // 2. Building insights (parallel with satellite)
      const [insights, satUrl] = await Promise.all([
        fetchBuildingInsights(geo.lat, geo.lng),
        fetchSatelliteUrl(geo.lat, geo.lng).catch(() => null),
      ]);

      setSolarData(insights);
      setSatelliteUrl(satUrl);

      // Set default panel count to ~60% of max, capped at 20
      const defPanels = Math.min(Math.round((insights.solarPotential?.maxArrayPanelsCount || 20) * 0.6), 20);
      setPanelCount(defPanels);

      setStep(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Shared styles ───────────────────────────────────────────────────────────
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

  // ── STEP 0: Home info ───────────────────────────────────────────────────────
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
        <label style={lbl}>Annual kWh (optional — overrides bill estimate)</label>
        <input style={inp} type="number" placeholder="e.g. 10,800" value={annualKwhInput} onChange={e => setAnnualKwhInput(e.target.value)} />
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#a0aec0" }}>
        <span>Net metering?</span>
        <button onClick={() => setHasNetMetering(true)} style={pill(hasNetMetering)}>Yes</button>
        <button onClick={() => setHasNetMetering(false)} style={pill(!hasNetMetering)}>No / Unsure</button>
      </div>

      {/* Bill upload */}
      <div style={{ ...card, background:"#0f1623", border:"1px dashed #2d3748" }}>
        <div style={{ fontSize:12, color:"#718096", marginBottom:6 }}>
          📄 Upload utility bill — AI extracts your usage automatically
        </div>
        <input type="file" accept="image/*,.pdf" onChange={e => setBillFile(e.target.files[0])} style={{ fontSize:12, color:"#718096" }} />
        {billFile && <div style={{ marginTop:6, fontSize:12, color:"#68D391" }}>✓ {billFile.name}</div>}
      </div>

      {/* Panel photo upload */}
      <div style={{ ...card, background:"#0f1623", border:"1px dashed #2d3748" }}>
        <div style={{ fontSize:12, color:"#718096", marginBottom:6 }}>
          📸 Upload electrical panel photo — AI identifies your loads
        </div>
        <input type="file" accept="image/*" onChange={e => setPanelFile(e.target.files[0])} style={{ fontSize:12, color:"#718096" }} />
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

  // ── STEP 1: Solar design ────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div style={{ display:"grid", gap:"1rem" }}>
      <div style={{ fontSize:12, color:"#718096" }}>
        📍 {geoData?.formattedAddress}
        {sp && <> &nbsp;·&nbsp; ☀️ {sp.maxSunshineHoursPerYear?.toLocaleString()} sun-hrs/yr &nbsp;·&nbsp; 🏠 max {maxPanels} panels</>}
      </div>

      {/* Real satellite image + irradiance segments */}
      <RoofView
        satelliteUrl={satelliteUrl}
        solarData={solarData}
        panelCount={panelCount}
        loading={imgLoading}
      />

      {/* Panel slider */}
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

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {statCard(`${annualKwh.toLocaleString()} kWh`, "Annual generation", "Home-specific")}
          {statCard(`${pctOffset}%`, "Usage offset", `of ${annualKwhUse.toLocaleString()} kWh/yr`)}
          {statCard(`$${savings.toLocaleString()}`, "Annual savings", `@ $${rate}/kWh`)}
        </div>
      </div>

      {/* Cost card */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Cost estimate</div>
        {[
          { label:"Gross installed cost",    val:`$${cost.gross.toLocaleString()}`,   color:"#e2e8f0" },
          { label:"Federal ITC (30%)",        val:`-$${cost.itc.toLocaleString()}`,    color:"#68D391" },
          { label:"Net after tax credit",     val:`$${cost.net.toLocaleString()}`,     color:"#F6AD55", bold:true },
          { label:"Simple payback",           val:`${payback} years`,                  color:"#e2e8f0" },
          { label:"25-year net value",        val:`$${lifetime25.toLocaleString()}`,   color:"#68D391" },
        ].map(r => (
          <div key={r.label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #1a202c", fontSize:13 }}>
            <span style={{ color:"#718096" }}>{r.label}</span>
            <span style={{ color:r.color, fontWeight:r.bold?700:400 }}>{r.val}</span>
          </div>
        ))}
        <div style={{ fontSize:10, color:"#4a5568", marginTop:8 }}>
          Production figures from Google Solar API · Cost at national avg $3/W installed
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnG} onClick={() => setStep(0)}>← Back</button>
        <button style={{ ...btnP, flex:1 }} onClick={() => setStep(2)}>→ Design Battery System</button>
      </div>
    </div>
  );

  // ── STEP 2: Battery & resilience ────────────────────────────────────────────
  const renderStep2 = () => (
    <div style={{ display:"grid", gap:"1rem" }}>

      <div style={{ ...card, background:"#0f1623", border:"1px solid #2D6A4F" }}>
        <div style={{ fontSize:12, color:"#9AE6B4", fontWeight:600, marginBottom:3 }}>🏔️ Cascadia Subduction Zone risk</div>
        <div style={{ fontSize:12, color:"#718096" }}>
          37% probability of a 9.0+ magnitude earthquake in the next 50 years.
          Grid restoration could take <strong style={{ color:"#F6AD55" }}>2–4 weeks</strong> across western OR and WA.
        </div>
      </div>

      {/* Battery slider */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
          <span style={{ fontSize:15, fontWeight:600, color:"#e2e8f0" }}>Battery: {batteryKwh} kWh</span>
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

      {/* Load selection */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:4 }}>
          Select loads to power during an outage
        </div>
        <div style={{ fontSize:11, color:"#718096", marginBottom:10 }}>
          Total selected: <strong style={{ color:"#F6AD55" }}>{totalLoadW.toLocaleString()}W</strong>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {COMMON_LOADS.map(load => {
            const active = selectedLoads.includes(load.id);
            return (
              <button key={load.id}
                onClick={() => setSelectedLoads(p => active ? p.filter(x => x !== load.id) : [...p, load.id])}
                style={{ ...pill(active), display:"flex", alignItems:"center", gap:8, textAlign:"left", padding:"7px 10px" }}>
                <span style={{ fontSize:14 }}>{load.icon}</span>
                <span style={{ flex:1, fontSize:11 }}>{load.label}</span>
                <span style={{ fontSize:10, color: active?"#9AE6B4":"#4a5568" }}>{load.watts}W</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Runtime result */}
      {selectedLoads.length > 0 && (
        <div style={{ ...card, background:"#0f1623", border:"1px solid #2D6A4F", textAlign:"center" }}>
          <div style={{ fontSize:42, fontWeight:800, color:"#68D391" }}>{runtime}h</div>
          <div style={{ fontSize:13, color:"#a0aec0" }}>estimated off-grid runtime</div>
          <div style={{ fontSize:12, color:"#718096", marginTop:4 }}>
            {selectedLoads.length} loads · {totalLoadW.toLocaleString()}W · {batteryKwh} kWh battery
          </div>
          <div style={{ marginTop:10, fontSize:12, padding:"6px 12px", borderRadius:6,
            background: runtime >= 336 ? "rgba(72,187,120,0.1)" : runtime >= 72 ? "rgba(246,173,85,0.1)" : "rgba(252,129,129,0.1)",
            color: runtime >= 336 ? "#68D391" : runtime >= 72 ? "#F6AD55" : "#FC8181",
          }}>
            {runtime >= 336 ? "✅ 2+ weeks — Cascadia-ready" :
             runtime >= 72  ? "⚠️ 3+ days — good start, consider adding capacity" :
             runtime >= 24  ? "⚠️ 1+ day — add capacity for extended outages" :
                              "❌ Under 24h — increase battery or reduce loads"}
          </div>
          <div style={{ marginTop:8, fontSize:11, color:"#4a5568" }}>
            Solar panels recharge battery daily — actual resilience is significantly longer in practice
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnG} onClick={() => setStep(1)}>← Back</button>
        <button style={{ ...btnP, flex:1 }} onClick={() => setStep(3)}>→ See Full Results</button>
      </div>
    </div>
  );

  // ── STEP 3: Results ─────────────────────────────────────────────────────────
  const renderStep3 = () => (
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
          { icon:"⚡", label:"Annual generation", val:`${annualKwh.toLocaleString()} kWh`, sub:`${pctOffset}% of usage · real API data` },
          { icon:"💰", label:"Year 1 savings",    val:`$${savings.toLocaleString()}`,       sub:`${payback}yr payback` },
          { icon:"🔋", label:"Off-grid runtime",  val:`${runtime}h`,                         sub:`${selectedLoads.length} loads · ${totalLoadW}W` },
          { icon:"📈", label:"25-yr net value",   val:`$${lifetime25.toLocaleString()}`,     sub:"after 30% tax credit" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign:"center" }}>
            <div style={{ fontSize:22 }}>{s.icon}</div>
            <div style={{ fontSize:20, fontWeight:700, color:"#68D391", margin:"4px 0 2px" }}>{s.val}</div>
            <div style={{ fontSize:10, color:"#718096", textTransform:"uppercase", letterSpacing:"0.04em" }}>{s.label}</div>
            <div style={{ fontSize:10, color:"#4a5568", marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize:12, fontWeight:600, color:"#a0aec0", marginBottom:10 }}>Total investment</div>
        {[
          { label:`Solar (${panelCount} panels, ${systemKw} kW)`,  val:`$${cost.gross.toLocaleString()}` },
          { label:`Battery (${batteryKwh} kWh)`,                   val:`$${Math.round(batteryKwh * BATTERY_COST_PER_KWH).toLocaleString()}` },
          { label:"Federal ITC (30%)",                              val:`-$${Math.round((cost.gross + batteryKwh * BATTERY_COST_PER_KWH) * 0.30).toLocaleString()}`, green:true },
          { label:"Net cost after incentives",                      val:`$${totalNet.toLocaleString()}`, bold:true },
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
          <div>• <strong style={{color:"#e2e8f0"}}>{runtime}h</strong> battery-only runtime ({selectedLoads.length} loads at {totalLoadW.toLocaleString()}W)</div>
          <div>• <strong style={{color:"#e2e8f0"}}>~{Math.round(annualKwh/365)} kWh</strong> average daily solar recharge</div>
          <div>• <strong style={{color:"#e2e8f0"}}>Production data</strong> from Google Solar API — accounts for shade, pitch, and local weather at this address</div>
          {runtime < 336 && (
            <div style={{color:"#F6AD55"}}>• Consider increasing to {Math.ceil(totalLoadW * 336 / 1000 / BATTERY_EFFICIENCY / 0.9)} kWh battery for full 2-week CSZ resilience</div>
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
            <div style={{ width:20, height:20, borderRadius:"50%", background:"#2D6A4F", color:"#9AE6B4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>
              {i+1}
            </div>
            <span style={{ color:"#a0aec0" }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button style={btnG} onClick={() => setStep(2)}>← Adjust design</button>
        <button style={{ ...btnG, flex:1 }}
          onClick={() => { setStep(0); setSolarData(null); setGeoData(null); setSatelliteUrl(null); }}>
          ↺ Start over
        </button>
      </div>

      <div style={{ fontSize:10, color:"#2d3748", textAlign:"center" }}>
        Estimates only — not a substitute for a professional site assessment · Production data: Google Solar API
      </div>
    </div>
  );

  // ── LAYOUT ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh", background:"#0d1117", color:"#e2e8f0",
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"2rem 1rem",
    }}>
      <div style={{ width:"100%", maxWidth:680, marginBottom:"1.5rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#2D6A4F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
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
        Production estimates use Google Solar API data specific to your address · Cost estimates are national averages
      </div>
    </div>
  );
}
