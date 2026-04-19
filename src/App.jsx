import { useState, useRef, useEffect } from "react";

const API_BASE = "/api/solar";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PANEL_WATTS        = 400;
const BATTERY_EFFICIENCY = 0.9;
const FEDERAL_ITC        = 0.30;
const COST_PER_WATT      = 3.00;
const MONTHS             = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN_MONTH      = [31,28,31,30,31,30,31,31,30,31,30,31];

// ─── BATTERY PRODUCTS ────────────────────────────────────────────────────────
const POWERWALL_IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCAEYARgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5tooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACijBooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAAJOAMk1bg0nUbr/AFFhczZ/uQs38hXoH7PyK/xj00MqtiKcjIzz5TV9hKSo4JA9jigD4Pt/A3iu6/1HhrV5M91spMfyrVg+EXj65GY/CmpDP9+LZ/MivtlpT3Yn8aYXFAHx3b/Af4iz9fD5hHrLcxL/AOzVpwfs4+PJR88emwf9dLwH/wBBBr6v8ykMlAHzHb/sw+Knx5+r6PD9Hkf/ANkrSh/Zavzjz/FVon/XO1dv5kV9EmSmGWgDwu3/AGXLFcfafFNw/wD1ys1X+bmtGH9mTwqhzNrWry+y+Wn/ALKa9hMvvUbzgAknAFAHmcP7O/gSH/WLqc/+/dAfyUVZPwV+HViMnRGmb0ku5W/9mFdjc6rjKxH/AIFWZJdkkknJoA5w/DnwVAf3XhqwH+8rP/6ETXH+PPg9H4g05b3wvb2dndWgKNZpGIhcDqCG6bh054+tenvNuFVXndIWCsRlj0+goA+Qr2xutNvJbS9t5ba4hba8cqlWU+hBqCvZfHE7zt4iaQls2EJG45x87AfpXjVABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB6b+z5/yWTTf+uNx/6Kavr5zivkL9nv/ksenf8AXC4/9FNX11IaAI2aoy9I5qMmgB5eml6jLU0tQBIZKYZKiaQAEk4FZt1qQXKxHJ/vf4UAXri8SBfmOT2A61kXN+8x5OF9BVOWcsSSSSfWq7yUATPMfWoWl561Ez1GWoAmMlV7gh7cFsFRJk56dO/44pS1MZj9mxgEGTBz9KTA8p8aECbxGP8Apwi/9GNXj9eteMmIuNeBOS2nRE/XzDXktCAKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAHp37Pf8AyWPT/wDrhcf+imr65kNfI37Pf/JYtP8A+uFx/wCijX1vIaAK7momNPc1A7YoAGaq1xdJAuWPPYDqarXWohcrFyf73asiWcuxLEknvQBsvY6he2/nlVit8ZBY8Y7dMmqGp6Te6aivcKoRjgEN3+lW/DGpSx63bRSTMYdrKFLcDIJ6fUViXl5JczOWkZlLswBOQMmgCJnqMtTS1NJoAUtTSaQmmk0AOzTokaS2YLjO89foKjqa2nijh2PIFkklxGvdjtyQPwBNJgeTfEHTruyfVr2eHy7e4tFhjYMCCwYkj24P868er6A+L/HhB/wCuoP5Gvn+hAFFFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD079nzj4w2H/XC4/9FmvrWU18k/s/nHxesD/0wn/9Fmvqe8v1QER4Y+vagAubhIVy5+g7msS7vnmyM7V9BTLmdnYliSaoySUAK8lQM9IzVGxoAfHO8Iskjbay9DUJNBNNzQAE0hNFNoACaSikoAU9KZZH/iqvD3/X+3/ol6dTLQhfFHh5mIAF+3JOB/qWoA5H4zgr4VkPbzh/Wvn6voL414Hg1z3+0qP518+0kAUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPQPgm5T4pWJBx+6mH/kM19Myy5WvmH4NHHxNsT/0zm/8ARZr6UMmRQBFM/NVWapJW5quxoAQmmk0hNITQAE0lFJQAlJS0lAAaSiigAq3p6q9rKGVWHmdCM9hVSrmnDNtL/wBdP6CkwOA+NX/IlD/r4T+teAV778aMnwV9LhP614FQgCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB3PweOPiTZH/pnL/6Aa+j93FfN3wh4+I9n/wBc5f8A0A19Gg0ARyHmoGNSyGoCaAEJpM0ZpKACjNGaSgApKDRQAUlBooAO1XtL/wCPeX/f/oKo9qu6Xu8qU8bQ/wCOcUmBwHxqAHgzj/n4T+teAV9AfGz/AJEz/t4T+tfP9CAKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAHb/CL/ko1n/1yl/9ANfRINfOvwj/AOSiWn/XKX/0A19EKaAGyHmoSalk61CaAEzSUUUAFFJRQAUUUlABRRRQAVf0r/j3m/3/AOlUKv6T/wAe83+//SkwPPvjXn/hDAf+nhP614BX0D8awP8AhBx7XKf1r5+oQBRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA7b4R/8lDtf+uUv/oBr6HWvnj4R/8AJQrX/rlL/wCgGvoVaAEk61Cask61CaAEooozQAUUZpKACiiigApM0UUAL2q7pZxBL/v/ANKo9qu6Z/qJv9/+lJgcH8a/+RJ/7eY/618/V9AfGrnwQP8Ar4j/AK18/wBCAKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAHbfCP/AJKFbf8AXGX/ANBNfQi189/CP/koNv8A9cZf/Qa+g1oASSojUj1EaAEoopM0ALRSZozQAtJRRQAUUUlAC9quaacQTf74/lVOrNgcQy/7/wDSkwOF+NBz4K/7eI/614BXvnxlbPgo/wDXxH/WvA6EAUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAO3+En/ACUC3/64y/8AoNfQK18/fCT/AJH+D/rjL/6DX0AtAA/WoTUr1CaACikzRmgBaKTNGaAFpM0UUAFFJRQAvap7M4ikHq/9Kg7VLanEUh/2/wClJgcH8YWz4Nb/AK+E/rXg9e6fF458HN/13SvC6EAUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAO3+En/I/wf8AXGX/ANBr39a8A+En/I/Q/wDXCX/0GvfloAHqI1I9RGgApKKSgB1FNooAXNFJRQAUtJmigB1IjlUcY4LdfwoqGR9sZ/3v6UmBwvxYfd4RYf8ATZP514jXs/xTk3eFXH/TVP514xQgCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB23wk/5H6H/AK4S/wDoNe/LXgPwl/5H2H/rhL/6DXvqmgBXqE1K9RGgBKKKKACiijFABSUuKSgAoopRQAoqjfPtjHu5/kKvCsfVpCjqM8cnFJgcP8S33eGHH/TVP515DXqvxDk3+HHH/TRP515VQgCiiimAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB23wl48eRf9cJf5V70rCvmDQtdu/DuqLf2Xl+cqlMSLuGD1rro/jDr6/ftrF/+AMP/ZqAPcycimGvGY/jRqi/f0y0b6M4/rU6/Gu6/j0WE/7s5H9KAPXqMV5SnxrT/lpojD/duB/8TVlPjTYH7+k3I+kqn+lAHpuKMV5ynxn0U/fsL5foEP8AWrEfxg8Ot96O+T6xA/yagDvsUYriU+LHhdutxcp9YD/Sp0+J/hR/+YkV/wB6Bx/SgDrsUuK5hPiH4Wk6axCP95WH9KsJ448NP01uy/GTH86AOg6Cub1+XZNEM9Qf6VbXxXoUo+TWLFv+26/41wvxC8XpYzWa6e9vdGRXLMsm4LyMdD9aAM7x0+/w/Jz/ABqf1rzStXU/EmoarAYZ2jEROdqJj9etZVJAFFFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k=";

const FRANKLIN_IMG = "data:image/jpeg;base64,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";

const BATTERIES = [
  { id:"pw3",  brand:"Tesla", name:"Powerwall 3",       powerKw:11.5, energyKwh:13.5, img:POWERWALL_IMG, requiresBase:false, note:null },
  { id:"pwdc", brand:"Tesla", name:"DC Expansion Pack",  powerKw:0,    energyKwh:13.5, img:POWERWALL_IMG, requiresBase:true,  note:"Requires at least 1 Powerwall 3" },
  { id:"fp2",  brand:"Franklin", name:"aPower 2",        powerKw:10,   energyKwh:15,   img:FRANKLIN_IMG,  requiresBase:false, note:null },
];

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
  if (!r.ok) throw new Error(data.error || "Solar data unavailable");
  return data;
}
async function fetchMapsJsKey() {
  const r = await fetch(`${API_BASE}?action=mapsJsKey`);
  const data = await r.json();
  if (!r.ok) return null;
  return data.key;
}
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
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ action:"parsePanel", imageBase64, mediaType:file.type }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Panel parsing failed");
  return data;
}
async function callParseBill(file) {
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(API_BASE, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ action:"parseBill", imageBase64, mediaType:file.type }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Bill parsing failed");
  return data;
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function getConfigForCount(sp, count) {
  const configs = sp?.solarPanelConfigs || [];
  return configs.find(c => c.panelsCount === count) || configs[Math.min(count-1, configs.length-1)] || null;
}
function getAnnualKwh(sp, panelCount) {
  const config = getConfigForCount(sp, panelCount);
  if (config?.yearlyEnergyDcKwh) return Math.round(config.yearlyEnergyDcKwh);
  return Math.round(panelCount * PANEL_WATTS * (sp?.maxSunshineHoursPerYear||1400) / 1000 * 0.86);
}
// Geometric series sum: rate * usage * ((1+esc)^years - 1) / esc
function geomSum(annualCost, escPct, years) {
  const esc = escPct / 100;
  return Math.round(annualCost * ((Math.pow(1+esc, years) - 1) / esc));
}
function panelToCorners(lat, lng, hM, wM, orientation) {
  const EARTH_R = 6371000;
  const h = orientation==="LANDSCAPE" ? wM : hM;
  const w = orientation==="LANDSCAPE" ? hM : wM;
  const dLat = (h/2)/EARTH_R*(180/Math.PI);
  const dLng = (w/2)/EARTH_R*(180/Math.PI)/Math.cos(lat*Math.PI/180);
  return [{lat:lat+dLat,lng:lng-dLng},{lat:lat+dLat,lng:lng+dLng},{lat:lat-dLat,lng:lng+dLng},{lat:lat-dLat,lng:lng-dLng}];
}
let mapsLoadPromise = null;
function loadGoogleMapsApi(key) {
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((res,rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=beta`;
    s.async = true; s.onload = res; s.onerror = () => rej(new Error("Maps load failed"));
    document.head.appendChild(s);
  });
  return mapsLoadPromise;
}

// ─── ROOF MAP ─────────────────────────────────────────────────────────────────
function RoofMap({ solarData, geoData, panelCount, mapsApiKey }) {
  const mapRef = useRef(null), mapInst = useRef(null), polys = useRef([]);
  const [ready, setReady] = useState(false), [err, setErr] = useState(null);
  const sp = solarData?.solarPotential;
  useEffect(() => {
    if (!mapsApiKey || !solarData || !mapRef.current) return;
    loadGoogleMapsApi(mapsApiKey).then(() => {
      const center = { lat: solarData.center?.latitude||geoData.lat, lng: solarData.center?.longitude||geoData.lng };
      const map = new window.google.maps.Map(mapRef.current, { center, zoom:20, mapTypeId:"satellite", tilt:0, disableDefaultUI:true, gestureHandling:"cooperative" });
      mapInst.current = map;
      polys.current = (sp?.solarPanels||[]).map(p => new window.google.maps.Polygon({
        paths: panelToCorners(p.center.latitude, p.center.longitude, sp.panelHeightMeters||1.65, sp.panelWidthMeters||0.99, p.orientation),
        strokeColor:"#D4A017", strokeWeight:1, fillColor:"#FFD700", fillOpacity:0.6, map:null,
      }));
      setReady(true);
    }).catch(e => { setErr("Map unavailable"); console.error(e); });
    return () => { polys.current.forEach(p => p.setMap(null)); polys.current = []; };
  }, [mapsApiKey, solarData]); // eslint-disable-line
  useEffect(() => {
    if (!ready || !mapInst.current) return;
    polys.current.forEach((p,i) => p.setMap(i < panelCount ? mapInst.current : null));
  }, [panelCount, ready]);

  if (!mapsApiKey || err) return (
    <div style={{height:280,display:"flex",alignItems:"center",justifyContent:"center",background:"#1a1a0a",borderRadius:12,color:"#888",fontSize:13}}>
      {err || "Interactive map requires API key"}
    </div>
  );
  return (
    <div style={{position:"relative",borderRadius:12,overflow:"hidden"}}>
      <div ref={mapRef} style={{width:"100%",height:280,background:"#1a1a0a"}} />
      <div style={{position:"absolute",top:8,right:8,background:"rgba(180,130,0,0.9)",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,color:"#fff"}}>
        {panelCount} panels · {Math.round(panelCount*PANEL_WATTS/1000*10)/10} kW
      </div>
      <div style={{position:"absolute",bottom:4,right:6,fontSize:10,color:"rgba(255,255,255,0.4)"}}>© Google</div>
      {!ready && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,15,5,0.7)",fontSize:13,color:"#888"}}>Loading map…</div>}
    </div>
  );
}

// ─── STEP BAR ─────────────────────────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ["Your Home", "On-Grid Savings", "Off-Grid Resilience", "Your Design"];
  return (
    <div style={{display:"flex",alignItems:"center",marginBottom:"1.75rem"}}>
      {steps.map((label, i) => (
        <div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:0}}>
          <div style={{
            width:26,height:26,borderRadius:"50%",flexShrink:0,
            background:i<current?"#2D6A4F":i===current?"#B8860B":"transparent",
            border:i<=current?`2px solid ${i===current?"#D4A017":"#2D6A4F"}`:"2px solid #333",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:600,color:i<=current?"#fff":"#555",transition:"all 0.3s",
          }}>{i<current?"✓":i+1}</div>
          <div style={{fontSize:10,marginLeft:5,whiteSpace:"nowrap",
            color:i===current?"#D4A017":i<current?"#68D391":"#444",
            marginRight:i<steps.length-1?5:0}}>{label}</div>
          {i<steps.length-1 && <div style={{flex:1,height:1,margin:"0 5px",background:i<current?"#2D6A4F":"#222"}} />}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GridReadyApp() {
  const [step, setStep] = useState(0);

  // Step 0
  const [address, setAddress]       = useState("");
  const [billFile, setBillFile]     = useState(null);
  const [panelFile, setPanelFile]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // API data
  const [geoData, setGeoData]       = useState(null);
  const [solarData, setSolarData]   = useState(null);
  const [mapsApiKey, setMapsApiKey] = useState(null);

  // Bill data (from AI parsing)
  const [ratePerKwh, setRatePerKwh]   = useState(null);   // parsed from bill
  const [monthlyKwh, setMonthlyKwh]   = useState({});     // { Jan:806, ... }
  const [escRate, setEscRate]         = useState(5);
  const [years, setYears]             = useState(25);
  const [parsingBill, setParsingBill] = useState(false);

  // Step 1 — solar
  const [panelCount, setPanelCount] = useState(0);

  // Step 2 — battery
  const [breakers, setBreakers]         = useState([]);
  const [deselectedIds, setDeselectedIds] = useState(new Set()); // unselected = grey
  const [parsingPanel, setParsingPanel] = useState(false);
  const [parseError, setParseError]     = useState("");
  const [batterySelections, setBatterySelections] = useState({}); // { pw3: 2, fp2: 0 }
  const [selectedBrand, setSelectedBrand] = useState(null);

  // Step 3 — lead form
  const [leadName, setLeadName]   = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadZip, setLeadZip]     = useState("");
  const [leadSent, setLeadSent]   = useState(false);

  // ── Derived values ────────────────────────────────────────────────────────
  const sp          = solarData?.solarPotential;
  const maxPanels   = sp?.maxArrayPanelsCount || 24;
  const annualSolar = getAnnualKwh(sp, panelCount);
  const annualUsage = Object.values(monthlyKwh).reduce((s,v)=>s+v,0) || 0;
  const rate        = ratePerKwh || 0.13;
  const annualCost  = Math.round(annualUsage * rate);
  const total25Cost = geomSum(annualCost, escRate, years);
  const annualSavings = Math.round(annualSolar * rate);
  const total25Savings = geomSum(annualSavings, escRate, years);
  const offsetPct   = annualUsage > 0 ? Math.min(100, Math.round(annualSolar/annualUsage*100)) : 0;
  const systemKw    = Math.round(panelCount*PANEL_WATTS/1000*10)/10;

  // Battery totals
  const totalBatteryKwh = BATTERIES.reduce((s,b) => s + (batterySelections[b.id]||0)*b.energyKwh, 0);
  const totalBatteryKw  = BATTERIES.reduce((s,b) => s + (batterySelections[b.id]||0)*b.powerKw, 0);

  // Demand calculation (hidden)
  const totalPanelW   = breakers.reduce((s,b) => s+b.estimatedWatts, 0);
  const selectedW     = breakers.filter(b => !deselectedIds.has(b.id)).reduce((s,b) => s+b.estimatedWatts, 0);
  const demandPct     = totalPanelW > 0 ? Math.round(selectedW/totalPanelW*100) : 0;

  // ── Analyze ───────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!address.trim()) { setError("Please enter your home address."); return; }
    setLoading(true); setError("");
    try {
      const geo = await geocodeAddress(address);
      setGeoData(geo);
      const [insights, key] = await Promise.all([
        fetchBuildingInsights(geo.lat, geo.lng),
        fetchMapsJsKey().catch(()=>null),
      ]);
      setSolarData(insights);
      setMapsApiKey(key);
      setPanelCount(Math.min(Math.round((insights.solarPotential?.maxArrayPanelsCount||20)*0.6), 20));

      // Parse bill if uploaded
      if (billFile) {
        setParsingBill(true);
        try {
          const bd = await callParseBill(billFile);
          if (bd.monthlyKwh)  setMonthlyKwh(bd.monthlyKwh);
          if (bd.ratePerKwh)  setRatePerKwh(bd.ratePerKwh);
        } catch(e) { console.warn("Bill parse failed:", e.message); }
        finally { setParsingBill(false); }
      }
      setStep(1);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleParsePanel = async (file) => {
    if (!file) return;
    setParsingPanel(true); setParseError("");
    try {
      const result = await callParsePanel(file);
      if (!result.breakers?.length) throw new Error("No breakers detected");
      setBreakers(result.breakers.map((b,i) => ({ ...b, id:`b_${i}`, name:b.name||"Unknown" })));
      setDeselectedIds(new Set());
    } catch(e) { setParseError(e.message); }
    finally { setParsingPanel(false); }
  };

  const toggleBattery = (id, delta) => {
    const batt = BATTERIES.find(b => b.id===id);
    const brand = batt.brand;
    // Lock to one brand
    if (selectedBrand && selectedBrand !== brand) return;
    const cur = batterySelections[id] || 0;
    const next = Math.max(0, cur+delta);
    const newSel = { ...batterySelections, [id]:next };
    // Check pw3 dependency for pwdc
    if (id==="pwdc" && next > 0 && !(newSel.pw3 > 0)) return;
    setBatterySelections(newSel);
    const anySelected = Object.values(newSel).some(v=>v>0);
    setSelectedBrand(anySelected ? brand : null);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const dark  = { background:"#0d1117", color:"#e2e8f0" };
  const card  = { background:"#1e2535", borderRadius:12, padding:"1.25rem", border:"1px solid #2d3748" };
  const ycard = { background:"#1a1700", borderRadius:12, padding:"1.25rem", border:"1px solid #4a3800" };
  const inp   = { width:"100%", background:"#0f1623", border:"1px solid #2d3748", borderRadius:8, color:"#e2e8f0", padding:"10px 14px", fontSize:14, outline:"none", boxSizing:"border-box" };
  const yinp  = { width:"100%", background:"#0f0e00", border:"1px solid #4a3800", borderRadius:8, color:"#f0d060", padding:"10px 14px", fontSize:14, outline:"none", boxSizing:"border-box" };
  const lbl   = { fontSize:11, color:"#718096", marginBottom:4, display:"block", fontWeight:500, letterSpacing:"0.05em", textTransform:"uppercase" };
  const ylbl  = { fontSize:11, color:"#8a7030", marginBottom:4, display:"block", fontWeight:500, letterSpacing:"0.05em", textTransform:"uppercase" };
  const btnP  = { padding:"12px 24px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:600, background:"#B8860B", color:"#fff" };
  const btnG  = { padding:"10px 20px", borderRadius:8, cursor:"pointer", fontSize:13, background:"transparent", border:"1px solid #2d3748", color:"#718096" };
  const btnY  = { padding:"12px 24px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:600, background:"#D4A017", color:"#111" };

  // ── PAGE 0: Home Info ─────────────────────────────────────────────────────
  const renderStep0 = () => (
    <div style={{display:"grid",gap:"1.5rem"}}>
      <div style={{textAlign:"center",padding:"1rem 0 0.5rem"}}>
        <div style={{fontSize:28,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1.15,marginBottom:8}}>
          Build Your Own Resilience &amp; Savings
        </div>
        <div style={{fontSize:16,fontWeight:600,color:"#9AE6B4",marginBottom:6}}>
          Turn your home into a microgrid.
        </div>
        <div style={{fontSize:13,color:"#718096",maxWidth:480,margin:"0 auto",lineHeight:1.6}}>
          Microgrids can operate both on-grid to provide energy <strong style={{color:"#D4A017"}}>Savings</strong> and
          off-grid to provide energy <strong style={{color:"#68D391"}}>Resilience</strong>.
        </div>
      </div>

      <div style={{...card,borderColor:"#2D6A4F"}}>
        <div style={{fontSize:13,color:"#a0aec0",lineHeight:1.6,textAlign:"center",marginBottom:"1rem"}}>
          Build your energy resilience &amp; savings by uploading a copy of your electricity bill and
          a picture of your electrical panel.
        </div>

        <div style={{display:"grid",gap:"1rem"}}>
          <div>
            <label style={lbl}>Home address</label>
            <input style={inp} placeholder="123 Main St, Portland, OR 97201"
              value={address} onChange={e=>setAddress(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleAnalyze()} />
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
              <div style={{fontSize:12,color:"#718096",marginBottom:6}}>
                📄 Electricity bill
              </div>
              <input type="file" accept="image/*,.pdf"
                onChange={e=>setBillFile(e.target.files[0])}
                style={{fontSize:11,color:"#718096"}} />
              {billFile && <div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {billFile.name}</div>}
              {!billFile && <div style={{marginTop:5,fontSize:10,color:"#4a5568"}}>AI reads your rate & monthly usage</div>}
            </div>
            <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
              <div style={{fontSize:12,color:"#718096",marginBottom:6}}>
                📸 Electrical panel
              </div>
              <input type="file" accept="image/*"
                onChange={e=>setPanelFile(e.target.files[0])}
                style={{fontSize:11,color:"#718096"}} />
              {panelFile && <div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {panelFile.name}</div>}
              {!panelFile && <div style={{marginTop:5,fontSize:10,color:"#4a5568"}}>AI reads your circuit breakers</div>}
            </div>
          </div>
        </div>
      </div>

      {error && <div style={{color:"#FC8181",fontSize:13,padding:"8px 12px",background:"rgba(252,129,129,0.1)",borderRadius:6}}>⚠️ {error}</div>}

      <button style={{...btnP,width:"100%",padding:"14px",fontSize:15}} onClick={handleAnalyze} disabled={loading}>
        {loading ? (parsingBill ? "Reading your bill…" : "Analyzing your home…") : "→ Get My Energy Assessment"}
      </button>
    </div>
  );

  // ── PAGE 1: On-Grid Savings (yellow theme) ────────────────────────────────
  const renderStep1 = () => {
    const maxMonthlyKwh = Math.max(...MONTHS.map(m=>monthlyKwh[m]||0), 1);
    const config = getConfigForCount(sp, panelCount);

    return (
      <div style={{display:"grid",gap:"1.25rem"}}>
        {/* Header */}
        <div style={{...ycard,textAlign:"center"}}>
          <div style={{fontSize:11,color:"#8a7030",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>
            On-Grid
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#D4A017"}}>Your Energy Savings</div>
          <div style={{fontSize:12,color:"#8a7030",marginTop:4}}>📍 {geoData?.formattedAddress}</div>
        </div>

        {/* Bill summary */}
        {annualUsage > 0 ? (
          <div style={ycard}>
            <div style={{fontSize:13,color:"#D4A017",fontWeight:600,marginBottom:10}}>Your utility bill</div>
            <div style={{fontSize:13,color:"#c0a040",lineHeight:1.8}}>
              You currently pay <strong style={{color:"#FFD700"}}>${rate.toFixed(3)}/kWh</strong>.
              Over the last 12 months you used <strong style={{color:"#FFD700"}}>{annualUsage.toLocaleString()} kWh</strong>,
              costing <strong style={{color:"#FFD700"}}>${annualCost.toLocaleString()}</strong>.
            </div>
            <div style={{fontSize:13,color:"#c0a040",marginTop:6}}>
              If utilities keep raising rates{" "}
              <input type="number" min={1} max={20} value={escRate} onChange={e=>setEscRate(Number(e.target.value))}
                style={{...yinp,width:48,padding:"2px 6px",display:"inline",fontSize:13}} />
              % per year, over{" "}
              <input type="number" min={5} max={40} value={years} onChange={e=>setYears(Number(e.target.value))}
                style={{...yinp,width:48,padding:"2px 6px",display:"inline",fontSize:13}} />
              {" "}years you'll spend{" "}
              <strong style={{color:"#FFD700",fontSize:16}}>${total25Cost.toLocaleString()}</strong> on electricity.
            </div>
          </div>
        ) : (
          <div style={ycard}>
            <div style={{fontSize:12,color:"#8a7030"}}>
              {parsingBill ? "Reading your bill…" : "No bill data yet. You can enter your monthly usage below or upload a bill on the previous page."}
            </div>
            {/* Manual entry grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:10}}>
              {MONTHS.map(m => (
                <div key={m}>
                  <label style={ylbl}>{m}</label>
                  <input type="number" style={{...yinp,padding:"4px 6px",fontSize:11}}
                    placeholder="kWh" value={monthlyKwh[m]||""}
                    onChange={e => { const v=parseInt(e.target.value); setMonthlyKwh(p=>({...p,[m]:isNaN(v)?undefined:v})); }} />
                </div>
              ))}
            </div>
            <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center"}}>
              <label style={ylbl}>Rate ($/kWh)</label>
              <input type="number" step="0.001" style={{...yinp,width:80,padding:"4px 8px",fontSize:12}}
                value={ratePerKwh||""} placeholder="0.130"
                onChange={e=>setRatePerKwh(parseFloat(e.target.value))} />
            </div>
          </div>
        )}

        {/* Usage bar chart */}
        {annualUsage > 0 && (
          <div style={ycard}>
            <div style={{fontSize:12,color:"#8a7030",fontWeight:600,marginBottom:10}}>Monthly electricity usage (kWh)</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:100}}>
              {MONTHS.map(m => {
                const v = monthlyKwh[m] || 0;
                const pct = v/maxMonthlyKwh;
                return (
                  <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{fontSize:8,color:"#8a7030"}}>{v>0?v:""}</div>
                    <div style={{width:"100%",height:`${Math.max(4,pct*80)}px`,background:"#D4A017",borderRadius:"2px 2px 0 0",opacity:0.8}} />
                    <div style={{fontSize:8,color:"#8a7030"}}>{m}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Solar panel section */}
        <div style={ycard}>
          <div style={{fontSize:14,fontWeight:700,color:"#D4A017",marginBottom:4}}>
            Add solar panels to reduce your utility bill
          </div>
          <div style={{fontSize:12,color:"#8a7030",marginBottom:12}}>
            Move the slider to add panels to your roof. Panels appear on your roof in the map below.
          </div>

          <RoofMap solarData={solarData} geoData={geoData} panelCount={panelCount} mapsApiKey={mapsApiKey} />

          <div style={{marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
              <span style={{fontSize:14,fontWeight:600,color:"#D4A017"}}>{panelCount} panels · {systemKw} kW</span>
              <span style={{fontSize:11,color:"#8a7030"}}>max {maxPanels} on your roof</span>
            </div>
            <input type="range" min={1} max={maxPanels} value={panelCount}
              onChange={e=>setPanelCount(parseInt(e.target.value))}
              style={{width:"100%",accentColor:"#D4A017"}} />
          </div>

          {/* Solar output narrative */}
          <div style={{marginTop:12,fontSize:13,color:"#c0a040",lineHeight:1.8,background:"#0f0e00",borderRadius:8,padding:"10px 14px"}}>
            This <strong style={{color:"#FFD700"}}>{systemKw} kW</strong> solar system will generate approximately{" "}
            <strong style={{color:"#FFD700"}}>{annualSolar.toLocaleString()} kWh</strong> per year,
            which is <strong style={{color:"#FFD700"}}>${annualSavings.toLocaleString()}</strong> in first-year energy savings.
            If utilities continue raising rates{" "}
            <input type="number" min={1} max={20} value={escRate} onChange={e=>setEscRate(Number(e.target.value))}
              style={{...yinp,width:48,padding:"2px 6px",display:"inline",fontSize:12}} />% per year,
            the <input type="number" min={5} max={40} value={years} onChange={e=>setYears(Number(e.target.value))}
              style={{...yinp,width:48,padding:"2px 6px",display:"inline",fontSize:12}} />-year savings will be{" "}
            <strong style={{color:"#FFD700",fontSize:15}}>${total25Savings.toLocaleString()}</strong>.
          </div>

          {/* Savings curve chart */}
          {annualSavings > 0 && (
            <div style={{marginTop:12}}>
              <div style={{fontSize:11,color:"#8a7030",marginBottom:6}}>Cumulative savings over {years} years</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>
                {Array.from({length:Math.min(years,25)},(_,i)=>{
                  const yr = i+1;
                  const cum = geomSum(annualSavings, escRate, yr);
                  const pct = cum/total25Savings;
                  return (
                    <div key={yr} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:"100%",height:`${Math.max(2,pct*70)}px`,background:"#D4A017",borderRadius:"1px 1px 0 0",opacity:0.7}} />
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#8a7030",marginTop:3}}>
                <span>Year 1: ${annualSavings.toLocaleString()}</span>
                <span>Year {years}: ${total25Savings.toLocaleString()} total</span>
              </div>
            </div>
          )}

          {/* Offset bar */}
          {annualUsage > 0 && (
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#8a7030",marginBottom:5}}>
                <span>Annual usage offset</span>
                <span style={{color:"#FFD700",fontWeight:700}}>{offsetPct}% offset</span>
              </div>
              <div style={{height:20,background:"#0f0e00",borderRadius:4,overflow:"hidden",border:"1px solid #4a3800"}}>
                <div style={{height:"100%",width:`${offsetPct}%`,background:"#D4A017",transition:"width 0.4s",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:4}}>
                  {offsetPct>15 && <span style={{fontSize:9,color:"#111",fontWeight:700}}>{annualSolar.toLocaleString()} kWh</span>}
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#8a7030",marginTop:3}}>
                <span>0 kWh</span>
                <span>{annualUsage.toLocaleString()} kWh total usage</span>
              </div>
            </div>
          )}
        </div>

        <div style={{...ycard,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#D4A017",fontWeight:600,marginBottom:4}}>
            Ready to go further?
          </div>
          <div style={{fontSize:12,color:"#8a7030",marginBottom:12}}>
            Add batteries to provide resilience — keep your home powered when the grid goes down.
          </div>
          <button style={{...btnY,width:"100%"}} onClick={()=>setStep(2)}>
            → Add Batteries for Resilience
          </button>
        </div>

        <button style={btnG} onClick={()=>setStep(0)}>← Back</button>
      </div>
    );
  };

  // ── PAGE 2: Off-Grid Resilience ───────────────────────────────────────────
  const renderStep2 = () => {
    // Backup hours per month
    const backupHours = MONTHS.map((m,i) => {
      if (!monthlyKwh[m] || totalBatteryKwh===0 || demandPct===0) return null;
      const dailyKwh = monthlyKwh[m] / DAYS_IN_MONTH[i];
      const hourlyKwh = dailyKwh / 24;
      const demandedKwh = hourlyKwh * (demandPct/100);
      if (demandedKwh<=0) return null;
      return Math.round((totalBatteryKwh * BATTERY_EFFICIENCY / demandedKwh) * 10) / 10;
    });
    const maxHours = Math.max(...backupHours.filter(h=>h!==null), 1);

    return (
      <div style={{display:"grid",gap:"1.25rem"}}>
        {/* Header */}
        <div style={{...card,textAlign:"center",background:"#0d1a1a",borderColor:"#1a4040"}}>
          <div style={{fontSize:11,color:"#68D391",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>
            Off-Grid
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#9AE6B4"}}>Your Energy Resilience</div>
        </div>

        {/* Panel breaker UI */}
        <div style={card}>
          <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Electrical panel loads</div>
          <div style={{fontSize:12,color:"#718096",marginBottom:12}}>
            {breakers.length > 0
              ? `From your electrical panel, which loads will you run during an emergency? Click a load to deselect it.`
              : "Upload your panel photo to see your circuits."}
          </div>

          {breakers.length === 0 && (
            <div>
              {panelFile ? (
                <button style={{...btnP,width:"100%"}} onClick={()=>handleParsePanel(panelFile)} disabled={parsingPanel}>
                  {parsingPanel ? "Reading your panel…" : "→ Read Panel Photo"}
                </button>
              ) : (
                <div>
                  <div style={{fontSize:12,color:"#4a5568",marginBottom:8}}>No panel photo yet — upload one:</div>
                  <input type="file" accept="image/*"
                    onChange={e=>{ setPanelFile(e.target.files[0]); handleParsePanel(e.target.files[0]); }}
                    style={{fontSize:12,color:"#718096"}} />
                </div>
              )}
              {parseError && <div style={{marginTop:8,color:"#FC8181",fontSize:12}}>⚠️ {parseError}</div>}
            </div>
          )}

          {breakers.length > 0 && (
            <div>
              {/* Panel graphic — two-column breaker schedule */}
              <div style={{background:"#0f1623",borderRadius:10,padding:"1rem",border:"1px solid #2d3748"}}>
                <div style={{fontSize:10,color:"#4a5568",textAlign:"center",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                  Electrical Panel · {breakers.length} circuits
                </div>
                {/* Main breaker bar */}
                <div style={{background:"#1a2535",borderRadius:6,padding:"6px 10px",textAlign:"center",fontSize:11,color:"#718096",marginBottom:8,border:"1px solid #2d3748"}}>
                  Main Breaker
                </div>
                {/* Two-column grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                  {breakers.map((b) => {
                    const selected = !deselectedIds.has(b.id);
                    return (
                      <div key={b.id}
                        onClick={() => {
                          const next = new Set(deselectedIds);
                          if (selected) next.add(b.id); else next.delete(b.id);
                          setDeselectedIds(next);
                        }}
                        style={{
                          display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"6px 8px",borderRadius:5,cursor:"pointer",
                          background:selected?"rgba(72,187,120,0.12)":"rgba(100,100,100,0.08)",
                          border:`1px solid ${selected?"#2D6A4F":"#333"}`,
                          transition:"all 0.15s",
                          userSelect:"none",
                        }}>
                        <div>
                          {b.name === "Unknown" ? (
                            <input
                              style={{background:"transparent",border:"none",color:selected?"#9AE6B4":"#555",fontSize:11,outline:"none",width:"100%"}}
                              defaultValue=""
                              placeholder="Unknown"
                              onClick={e=>e.stopPropagation()}
                              onBlur={e=>{
                                const n=e.target.value.trim()||"Unknown";
                                setBreakers(p=>p.map(x=>x.id===b.id?{...x,name:n}:x));
                              }}
                            />
                          ) : (
                            <div style={{fontSize:11,color:selected?"#9AE6B4":"#555"}}>{b.name}</div>
                          )}
                          <div style={{fontSize:9,color:selected?"#4a9070":"#444"}}>{b.amps}A</div>
                        </div>
                        <div style={{width:10,height:18,borderRadius:2,background:selected?"#2D6A4F":"#333",flexShrink:0}} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Demand result */}
              <div style={{...card,background:"#0f1623",borderColor:"#2D6A4F",marginTop:12,textAlign:"center"}}>
                <div style={{fontSize:13,color:"#a0aec0",marginBottom:4}}>From your selections, during an emergency you'll run at</div>
                <div style={{fontSize:36,fontWeight:800,color:"#9AE6B4"}}>{demandPct}% demand</div>
                <div style={{fontSize:11,color:"#4a5568",marginTop:4}}>
                  {breakers.length - deselectedIds.size} of {breakers.length} circuits selected
                </div>
              </div>

              <button style={{...btnG,fontSize:11,marginTop:8}} onClick={()=>{setBreakers([]);setDeselectedIds(new Set());}}>
                ↺ Re-parse panel
              </button>
            </div>
          )}
        </div>

        {/* Battery selector */}
        <div style={card}>
          <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Choose your batteries</div>
          <div style={{fontSize:12,color:"#718096",marginBottom:14}}>
            Select a brand and quantity. Once a brand is selected, the other brand is greyed out.
          </div>

          <div style={{display:"grid",gap:10}}>
            {BATTERIES.map(b => {
              const qty     = batterySelections[b.id] || 0;
              const locked  = selectedBrand && selectedBrand !== b.brand;
              const needsBase = b.requiresBase && !(batterySelections.pw3 > 0);
              const disabled = locked || (b.requiresBase && needsBase && qty===0);
              return (
                <div key={b.id} style={{
                  display:"grid", gridTemplateColumns:"90px 1fr auto",
                  gap:12, alignItems:"center",
                  background: locked ? "#0d0f14" : qty>0 ? "rgba(45,106,79,0.1)" : "#161b27",
                  borderRadius:10, padding:"10px 14px",
                  border:`1px solid ${locked?"#1a1a1a":qty>0?"#2D6A4F":"#2d3748"}`,
                  opacity: locked ? 0.4 : 1, transition:"all 0.2s",
                }}>
                  <img src={b.img} alt={b.name} style={{width:80,height:80,objectFit:"contain",borderRadius:6,background:"#000"}} />
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:locked?"#444":"#e2e8f0"}}>{b.name}</div>
                    <div style={{fontSize:11,color:locked?"#333":"#718096",marginTop:2}}>{b.brand}</div>
                    <div style={{fontSize:11,color:locked?"#333":"#68D391",marginTop:3}}>
                      {b.powerKw > 0 ? `${b.powerKw} kW power  ·  ` : ""}{b.energyKwh} kWh storage
                    </div>
                    {b.note && <div style={{fontSize:10,color:"#F6AD55",marginTop:2}}>{b.note}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <button disabled={locked}
                      onClick={()=>toggleBattery(b.id, 1)}
                      style={{width:28,height:28,borderRadius:6,border:"1px solid #2d3748",background:"#0f1623",color:"#9AE6B4",cursor:locked?"not-allowed":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <div style={{fontSize:15,fontWeight:700,color:qty>0?"#9AE6B4":"#718096",minWidth:20,textAlign:"center"}}>{qty}</div>
                    <button disabled={locked||qty===0}
                      onClick={()=>toggleBattery(b.id,-1)}
                      style={{width:28,height:28,borderRadius:6,border:"1px solid #2d3748",background:"#0f1623",color:"#FC8181",cursor:(locked||qty===0)?"not-allowed":"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Battery totals */}
          {totalBatteryKwh > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#68D391"}}>{Math.round(totalBatteryKw*10)/10} kW</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>power output</div>
              </div>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#9AE6B4"}}>{Math.round(totalBatteryKwh*10)/10} kWh</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>energy storage</div>
              </div>
            </div>
          )}
        </div>

        {/* Backup hours graph */}
        {totalBatteryKwh > 0 && demandPct > 0 && Object.keys(monthlyKwh).length > 0 && (
          <div style={card}>
            <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Battery backup duration by month</div>
            <div style={{fontSize:11,color:"#718096",marginBottom:12}}>
              {Math.round(totalBatteryKwh*10)/10} kWh · {demandPct}% demand
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:5,height:140}}>
              {MONTHS.map((m,i) => {
                const h = backupHours[i];
                const pct = h ? Math.min(1, h/maxHours) : 0;
                const color = h>=72?"#68D391":h>=24?"#F6AD55":"#FC8181";
                return (
                  <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    {h!==null && <div style={{fontSize:8,color,fontWeight:600}}>{h}h</div>}
                    <div style={{width:"100%",borderRadius:"2px 2px 0 0",height:`${Math.max(4,pct*110)}px`,background:h!==null?color:"#1e2535",opacity:h!==null?0.85:0.3,transition:"height 0.4s"}} />
                    <div style={{fontSize:8,color:"#718096"}}>{m}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
              {[{c:"#68D391",l:"72+ hrs"},{c:"#F6AD55",l:"24–72 hrs"},{c:"#FC8181",l:"< 24 hrs"}].map(x=>(
                <div key={x.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
                  <div style={{width:8,height:8,borderRadius:1,background:x.c}} />{x.l}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button style={btnG} onClick={()=>setStep(1)}>← Back</button>
          <button style={{...btnP,flex:1}} onClick={()=>setStep(3)}>→ See Your Design →</button>
        </div>
      </div>
    );
  };

  // ── PAGE 3: Your Design + Lead Form ──────────────────────────────────────
  const renderStep3 = () => {
    const worstMonth = MONTHS.reduce((w,m,i)=>{
      if (!monthlyKwh[m]||totalBatteryKwh===0||demandPct===0) return w;
      const h = Math.round((totalBatteryKwh*BATTERY_EFFICIENCY)/((monthlyKwh[m]/DAYS_IN_MONTH[i]/24)*(demandPct/100))*10)/10;
      if (!w||h<w.h) return {m,h};
      return w;
    },null);

    const handleSubmit = () => {
      if (!leadName||!leadEmail||!leadZip) return;
      // In production this would POST to an API endpoint
      setLeadSent(true);
    };

    return (
      <div style={{display:"grid",gap:"1.25rem"}}>
        {/* Summary */}
        <div style={{background:"linear-gradient(135deg,#0d1a10,#0d1117)",border:"1px solid #2D6A4F",borderRadius:12,padding:"1.5rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#9AE6B4",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>
            Your Home Energy System
          </div>
          <div style={{fontSize:24,fontWeight:800,color:"#e2e8f0"}}>
            {systemKw} kW Solar + {Math.round(totalBatteryKwh*10)/10} kWh Storage
          </div>
          <div style={{fontSize:12,color:"#718096",marginTop:4}}>{geoData?.formattedAddress}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {icon:"⚡",label:"Annual solar production",  val:`${annualSolar.toLocaleString()} kWh`,      sub:`${offsetPct}% of usage`},
            {icon:"💰",label:`${years}-year utility savings`, val:`$${total25Savings.toLocaleString()}`,   sub:`at ${escRate}% annual escalation`},
            {icon:"🔋",label:"Battery storage",           val:`${Math.round(totalBatteryKwh*10)/10} kWh`, sub:`${Math.round(totalBatteryKw*10)/10} kW output`},
            worstMonth
              ? {icon:"🛡️",label:`Worst-month backup (${worstMonth.m})`, val:`${worstMonth.h}h`,           sub:`at ${demandPct}% demand`}
              : {icon:"🛡️",label:"Resilience",              val:"Configure loads",                         sub:"in the previous step"},
          ].map(s=>(
            <div key={s.label} style={{...card,textAlign:"center"}}>
              <div style={{fontSize:20}}>{s.icon}</div>
              <div style={{fontSize:18,fontWeight:700,color:"#68D391",margin:"4px 0 2px"}}>{s.val}</div>
              <div style={{fontSize:9,color:"#718096",textTransform:"uppercase",letterSpacing:"0.04em"}}>{s.label}</div>
              <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Lead form */}
        <div style={{...card,borderColor:"#2D6A4F"}}>
          <div style={{fontSize:15,fontWeight:600,color:"#9AE6B4",marginBottom:6}}>Send your design to a local installer</div>
          <div style={{fontSize:12,color:"#718096",marginBottom:16,lineHeight:1.6}}>
            Send your design to a local solar installer to confirm design, site equipment locations, and price installation.
          </div>

          {leadSent ? (
            <div style={{textAlign:"center",padding:"1.5rem",background:"rgba(72,187,120,0.1)",borderRadius:10}}>
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <div style={{fontSize:16,fontWeight:600,color:"#9AE6B4"}}>Design sent!</div>
              <div style={{fontSize:12,color:"#718096",marginTop:4}}>
                A local installer will be in touch with you at {leadEmail}.
              </div>
            </div>
          ) : (
            <div style={{display:"grid",gap:"1rem"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
                <div>
                  <label style={lbl}>Full name *</label>
                  <input style={inp} placeholder="Jane Smith" value={leadName} onChange={e=>setLeadName(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Email *</label>
                  <input style={inp} type="email" placeholder="jane@email.com" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inp} type="tel" placeholder="(503) 555-0100" value={leadPhone} onChange={e=>setLeadPhone(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Zip code *</label>
                  <input style={inp} placeholder="97201" value={leadZip} onChange={e=>setLeadZip(e.target.value)} />
                </div>
              </div>
              <button style={{...btnP,width:"100%",padding:"14px",fontSize:15,background:"#2D6A4F",opacity:(!leadName||!leadEmail||!leadZip)?0.5:1}}
                onClick={handleSubmit} disabled={!leadName||!leadEmail||!leadZip}>
                → Send My Design to an Installer
              </button>
              <div style={{fontSize:10,color:"#2d3748",textAlign:"center"}}>
                Your design and contact info will be shared with vetted local installers only.
              </div>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button style={btnG} onClick={()=>setStep(2)}>← Adjust battery design</button>
          <button style={{...btnG,flex:1}} onClick={()=>{
            setStep(0);setSolarData(null);setGeoData(null);setMapsApiKey(null);
            setBreakers([]);setDeselectedIds(new Set());setMonthlyKwh({});setRatePerKwh(null);
            setBatterySelections({});setSelectedBrand(null);setLeadSent(false);
          }}>↺ Start over</button>
        </div>

        <div style={{fontSize:10,color:"#1e2535",textAlign:"center"}}>
          Production estimates: Google Solar API · Savings projections are estimates only
        </div>
      </div>
    );
  };

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",...dark,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"2rem 1rem"}}>
      <div style={{width:"100%",maxWidth:680,marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#2D6A4F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>⚡</div>
          <div>
            <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em"}}>GridReady</div>
            <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.08em",textTransform:"uppercase"}}>Solar + Battery Microgrid Designer</div>
          </div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:680,background:"#161b27",borderRadius:16,padding:"1.75rem",border:"1px solid #1e2535"}}>
        <StepBar current={step} />
        {step===0 && renderStep0()}
        {step===1 && renderStep1()}
        {step===2 && renderStep2()}
        {step===3 && renderStep3()}
      </div>
      <div style={{marginTop:"1.5rem",fontSize:10,color:"#1e2535",maxWidth:600,textAlign:"center"}}>
        GridReady · Solar + Battery Microgrid Designer · Production estimates use Google Solar API
      </div>
    </div>
  );
}
