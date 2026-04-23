import { useState, useRef } from "react";

const API_BASE = "/api/solar";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const PSE_RATE    = 0.20;
const VPP_ONETIME = 1000;
const VPP_ANNUAL  = 500;

const BATTERIES = [
  { id:"pw3",  brand:"Tesla",    name:"Powerwall 3",      powerKw:11.5, energyKwh:13.5, acLimitKw:7.6, dcLimitKw:20,   requiresPw3:false, note:null },
  { id:"pwdc", brand:"Tesla",    name:"DC Expansion Pack", powerKw:0,    energyKwh:13.5, acLimitKw:0,   dcLimitKw:0,    requiresPw3:true,  note:"Requires at least 1 Powerwall 3" },
  { id:"fp2",  brand:"Franklin", name:"aPower 2",          powerKw:10,   energyKwh:15,   acLimitKw:8,   dcLimitKw:null, requiresPw3:false, note:null },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function callParsePanel(file) {
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(API_BASE, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ action:"parsePanel", imageBase64, mediaType:file.type }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error||"Panel parsing failed");
  return data;
}

// Parse utility bill OR solar production file (image or Excel/CSV)
async function callParseEnergyFile(file, hint) {
  // hint: "usage" | "solar" | "both"
  const isImage = file.type.startsWith("image/") || file.type==="application/pdf";
  if (isImage) {
    const imageBase64 = await fileToBase64(file);
    const r = await fetch(API_BASE, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"parseEnergyDoc", imageBase64, mediaType:file.type, hint }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||"Parsing failed");
    return data;
  } else {
    // Excel/CSV — send raw base64 bytes
    const raw = await fileToBase64(file);
    const r = await fetch(API_BASE, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"parseEnergyDoc", fileBase64:raw, mediaType:file.type, hint }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||"Parsing failed");
    return data;
  }
}

function totalKwh(sel) { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.energyKwh),0); }
function totalKw(sel)  { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.powerKw),0); }
function totalUnits(sel){ return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)),0); }
const fmtH = h => h>=48 ? `${Math.round(h/24)}d` : `${Math.round(h)}h`;

// ── Step bar ──────────────────────────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ["Home Setup","Electrical Loads","Battery Design","Proposal"];
  return (
    <div style={{display:"flex",alignItems:"center",marginBottom:"1.75rem"}}>
      {steps.map((label,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:0}}>
          <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
            background:i<current?"#2D6A4F":i===current?"#40916C":"transparent",
            border:i<=current?"2px solid #40916C":"2px solid #333",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:600,color:i<=current?"#fff":"#555",transition:"all 0.3s"}}>
            {i<current?"✓":i+1}</div>
          <div style={{fontSize:10,marginLeft:5,whiteSpace:"nowrap",
            color:i===current?"#9AE6B4":i<current?"#68D391":"#444",
            marginRight:i<steps.length-1?4:0}}>{label}</div>
          {i<steps.length-1&&<div style={{flex:1,height:1,margin:"0 4px",background:i<current?"#2D6A4F":"#222"}}/>}
        </div>
      ))}
    </div>
  );
}

// ── Upload + parse widget ─────────────────────────────────────────────────────
function EnergyFileUpload({ label, hint, onParsed, accentColor="#40916C" }) {
  const [parsing, setParsing]   = useState(false);
  const [err, setErr]           = useState("");
  const [fileName, setFileName] = useState("");

  const handle = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setParsing(true); setErr("");
    try {
      const result = await callParseEnergyFile(file, hint);
      onParsed(result);
    } catch(e) { setErr(e.message); }
    finally { setParsing(false); }
  };

  return (
    <div style={{background:"#0f1623",border:`1px dashed ${accentColor}44`,borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:11,color:"#718096",marginBottom:6}}>📎 {label}</div>
      <div style={{fontSize:10,color:"#4a5568",marginBottom:8}}>
        Accepts: utility bill photo, Excel export, CSV, screenshot of graph
      </div>
      <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv"
        style={{fontSize:11,color:"#718096"}}
        onChange={e=>handle(e.target.files[0])} />
      {parsing && <div style={{marginTop:6,fontSize:11,color:"#F6AD55"}}>🔍 Reading file…</div>}
      {!parsing && fileName && !err && <div style={{marginTop:6,fontSize:11,color:"#68D391"}}>✓ {fileName} — parsed successfully</div>}
      {err && <div style={{marginTop:6,fontSize:11,color:"#FC8181"}}>⚠️ {err}</div>}
    </div>
  );
}

// ── Panel graphic ─────────────────────────────────────────────────────────────
function PanelGraphic({ breakers, onToggle, onRename, mainAmps }) {
  // Pair breakers into left/right columns as in a real panel
  const pairs = [];
  for (let i=0; i<breakers.length; i+=2) {
    pairs.push([breakers[i], breakers[i+1]||null]);
  }

  const BreakerSlot = ({ b, side }) => {
    if (!b) return <div style={{height:38}}/>;
    const on = b.critical;
    return (
      <div onClick={()=>onToggle(b.id)}
        style={{
          display:"flex", alignItems:"center", gap:6,
          padding:"5px 7px", borderRadius:5, cursor:"pointer",
          background: on?"rgba(72,187,120,0.15)":"rgba(60,60,70,0.4)",
          border:`1px solid ${on?"#2D6A4F":"#2a2a3a"}`,
          transition:"all 0.15s", userSelect:"none",
          flexDirection: side==="right" ? "row-reverse" : "row",
        }}>
        {/* Breaker toggle graphic */}
        <div style={{
          width:14, height:26, borderRadius:3, flexShrink:0,
          background: on?"#2D6A4F":"#1a1a2a",
          border:`1px solid ${on?"#40916C":"#333"}`,
          position:"relative", overflow:"hidden",
        }}>
          {/* Rocker position indicator */}
          <div style={{
            position:"absolute",
            top: on?"2px":"auto",
            bottom: on?"auto":"2px",
            left:2, right:2, height:10,
            background: on?"#9AE6B4":"#444",
            borderRadius:2, transition:"all 0.15s",
          }}/>
        </div>
        {/* Label */}
        <div style={{flex:1, minWidth:0}}>
          {b.name==="Unknown"
            ? <input
                style={{background:"transparent",border:"none",color:on?"#9AE6B4":"#718096",
                  fontSize:10,outline:"none",width:"100%",cursor:"text"}}
                placeholder="Rename…"
                defaultValue=""
                onClick={e=>e.stopPropagation()}
                onBlur={e=>{const n=e.target.value.trim()||"Unknown"; onRename(b.id,n);}}
              />
            : <div style={{fontSize:10,color:on?"#9AE6B4":"#718096",
                textAlign:side==="right"?"right":"left",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {b.name}
              </div>
          }
          <div style={{fontSize:9,color:on?"#4a9070":"#444",
            textAlign:side==="right"?"right":"left"}}>{b.amps}A</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background:"#0d1117", borderRadius:10,
      border:"2px solid #2d3748", padding:"10px",
      fontFamily:"monospace",
    }}>
      {/* Main breaker */}
      <div style={{
        background:"#1a2535", borderRadius:6, padding:"6px 10px",
        marginBottom:10, textAlign:"center",
        border:"1px solid #2d3748", display:"flex",
        alignItems:"center", justifyContent:"center", gap:8,
      }}>
        {/* Main breaker visual — wide bar spanning full width */}
        <div style={{flex:1, height:18, background:"#2d3748", borderRadius:3,
          position:"relative", overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
        <div style={{fontSize:11,color:"#a0aec0",fontWeight:600,whiteSpace:"nowrap"}}>
          {mainAmps||200}A Main
        </div>
        <div style={{flex:1, height:18, background:"#2d3748", borderRadius:3,
          position:"relative", overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
      </div>

      {/* Neutral bar divider */}
      <div style={{height:3,background:"#1a2535",borderRadius:2,marginBottom:6,
        border:"1px solid #2d3748"}}/>

      {/* Two-column breaker grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
        {pairs.map(([left,right],i)=>(
          <>
            <BreakerSlot key={`L${i}`} b={left}  side="left"  />
            <BreakerSlot key={`R${i}`} b={right} side="right" />
          </>
        ))}
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:14,marginTop:8,justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}>
          <div style={{width:8,height:8,background:"#2D6A4F",borderRadius:1}}/> Critical (on)
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}>
          <div style={{width:8,height:8,background:"#1a1a2a",border:"1px solid #333",borderRadius:1}}/> Non-critical (off)
        </div>
      </div>
    </div>
  );
}

// ── Monthly grid — defined outside main component so it never remounts on re-render ──
function MonthGrid({ values, onChange, accentColor }) {
  const lbl = {fontSize:10,color:accentColor||"#718096",marginBottom:2,display:"block",fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"};
  const inp = {width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"4px 6px",fontSize:11,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:6}}>
      {MONTHS.map(m=>(
        <div key={m}>
          <label style={lbl}>{m}</label>
          <input type="number" style={inp}
            placeholder="—" value={values[m]}
            onChange={e=>onChange(p=>({...p,[m]:e.target.value}))}/>
        </div>
      ))}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function BatteryProposalTool() {
  const [step, setStep] = useState(0);

  // Step 1
  const [address, setAddress]           = useState("");
  const [hasSolar, setHasSolar]         = useState(null);
  const [coupling, setCoupling]         = useState("ac");
  const [solarKwDc, setSolarKwDc]       = useState("");
  const [solarMonthly, setSolarMonthly] = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [usageMonthly, setUsageMonthly] = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [rate, setRate]                 = useState(PSE_RATE.toString());
  const [parsingSolar, setParsingSolar] = useState(false);
  const [parsingUsage, setParsingUsage] = useState(false);
  const [showSolarGrid, setShowSolarGrid]   = useState(false);
  const [showUsageGrid, setShowUsageGrid]   = useState(false);

  // Step 2
  const [panelFile, setPanelFile]         = useState(null);
  const [breakers, setBreakers]           = useState([]);
  const [mainAmps, setMainAmps]           = useState(200);
  const [parsingPanel, setParsingPanel]   = useState(false);
  const [parseError, setParseError]       = useState("");

  // Step 3
  const [battSel, setBattSel]             = useState({pw3:0,pwdc:0,fp2:0});
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [powerAlertDismissed, setPowerAlertDismissed] = useState(false);

  // ── derived ─────────────────────────────────────────────────────────────────
  const tKwh   = totalKwh(battSel);
  const tKw    = totalKw(battSel);
  const tUnits = totalUnits(battSel);

  const critBreakers = breakers.filter(b=>b.critical);
  const critPct      = breakers.length>0 ? critBreakers.length/breakers.length : 0;

  const solarKwNum = parseFloat(solarKwDc)||0;
  let couplingAlert = null;
  if (hasSolar!==false && solarKwNum>0 && tKwh>0) {
    if (coupling==="ac") {
      const pw3c=battSel.pw3||0, fp2c=battSel.fp2||0;
      const lim = pw3c>0 ? pw3c*7.6 : fp2c>0 ? fp2c*8 : 0;
      if (lim>0 && solarKwNum>lim)
        couplingAlert=`AC coupling limit exceeded: ${solarKwNum} kW DC > ${lim} kW limit (${pw3c>0?pw3c+" Powerwall 3 × 7.6 kW":fp2c+" aPower 2 × 8 kW"}).`;
    } else {
      const pw3c=battSel.pw3||0, lim=pw3c*20;
      if (!pw3c) couplingAlert="DC coupling requires at least one Powerwall 3.";
      else if (solarKwNum>lim) couplingAlert=`DC coupling limit exceeded: ${solarKwNum} kW DC > ${lim} kW limit (${pw3c} Powerwall 3 × 20 kW).`;
    }
  }
  const showPowerWarning = tKw>0 && !powerAlertDismissed;

  // Backup formula: hours = battKwh / ((monthlyKwh/days/24) * critPct)
  const backupData = MONTHS.map((m,i)=>{
    const uNum = parseFloat(usageMonthly[m])||0;
    const sNum = parseFloat(solarMonthly[m])||0;
    if (!uNum||!tKwh||!critPct) return {month:m,battOnly:null,solarExtDays:null,indefinite:false};
    const hourlyDemand = (uNum/DAYS[i]/24)*critPct;
    const battOnly     = tKwh/hourlyDemand;
    let solarExtDays=null, indefinite=false;
    if (hasSolar!==false && sNum>0) {
      const netDailyDraw = (hourlyDemand*24) - (sNum/DAYS[i]);
      if (netDailyDraw<=0) indefinite=true;
      else solarExtDays = tKwh/netDailyDraw;
    }
    return {month:m,battOnly,solarExtDays,indefinite};
  });
  const maxBattH  = Math.max(...backupData.map(d=>d.battOnly||0),1);
  const maxSolarH = Math.max(...backupData.map(d=>d.solarExtDays?d.solarExtDays*24:0),0);
  const chartMaxH = Math.max(maxBattH+maxSolarH,1);

  const vppOneTime = tUnits*VPP_ONETIME;
  const vppAnnual  = tUnits*VPP_ANNUAL;
  const vpp10Year  = vppOneTime+vppAnnual*10;

  // ── styles ───────────────────────────────────────────────────────────────────
  const dark = {background:"#0d1117",color:"#e2e8f0"};
  const card = {background:"#1e2535",borderRadius:12,padding:"1.25rem",border:"1px solid #2d3748"};
  const inp  = {width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl  = {fontSize:10,color:"#718096",marginBottom:3,display:"block",fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"};
  const btnP = {padding:"11px 22px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"#2D6A4F",color:"#fff"};
  const btnG = {padding:"9px 18px",borderRadius:8,cursor:"pointer",fontSize:12,background:"transparent",border:"1px solid #2d3748",color:"#718096"};
  const btnS = {padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:11,background:"transparent",border:"1px solid #2d3748",color:"#4a5568"};
  const pill = a=>({padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:a?"#2D6A4F":"#1a202c",color:a?"#9AE6B4":"#718096",border:a?"1px solid #2D6A4F":"1px solid #2d3748"});
  const alrt = t=>({padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:8,
    background:t==="warn"?"rgba(246,173,85,0.1)":"rgba(252,129,129,0.1)",
    color:t==="warn"?"#F6AD55":"#FC8181",border:`1px solid ${t==="warn"?"rgba(246,173,85,0.3)":"rgba(252,129,129,0.3)"}`});

  // ── handlers ─────────────────────────────────────────────────────────────────
  const handleParsePanel = async file=>{
    if (!file) return;
    setParsingPanel(true); setParseError("");
    try {
      const result = await callParsePanel(file);
      if (!result.breakers?.length) throw new Error("No breakers detected");
      if (result.mainAmps) setMainAmps(result.mainAmps);
      setBreakers(result.breakers.map((b,i)=>({...b,id:`b_${i}`,name:b.name||"Unknown",critical:false})));
    } catch(e){ setParseError(e.message); } finally { setParsingPanel(false); }
  };

  const handleEnergyParsed = (result) => {
    // result may contain: monthlyUsageKwh, monthlySolarKwh, ratePerKwh
    if (result.monthlyUsageKwh) {
      const next = {...usageMonthly};
      Object.entries(result.monthlyUsageKwh).forEach(([m,v])=>{ if (MONTHS.includes(m)) next[m]=String(v); });
      setUsageMonthly(next);
    }
    if (result.monthlySolarKwh) {
      const next = {...solarMonthly};
      Object.entries(result.monthlySolarKwh).forEach(([m,v])=>{ if (MONTHS.includes(m)) next[m]=String(v); });
      setSolarMonthly(next);
    }
    if (result.ratePerKwh) setRate(String(result.ratePerKwh));
  };

  const toggleBatt = (id,delta)=>{
    const b=BATTERIES.find(x=>x.id===id);
    if (selectedBrand && selectedBrand!==b.brand) return;
    const next=Math.max(0,Math.min(5,(battSel[id]||0)+delta));
    if (id==="pwdc" && next>0 && !(battSel.pw3>0)) return;
    const ns={...battSel,[id]:next};
    setBattSel(ns);
    setSelectedBrand(Object.values(ns).some(v=>v>0)?b.brand:null);
  };

  // ── chart ────────────────────────────────────────────────────────────────────
  const yTicks = maxH=>{
    const step = maxH<=48?12:maxH<=168?24:maxH<=720?168:720;
    const ticks=[];
    for(let v=0;v<=maxH;v+=step) ticks.push(v);
    if(ticks[ticks.length-1]<maxH) ticks.push(Math.ceil(maxH/step)*step);
    return ticks;
  };

  const renderBackupBars = (chartH)=>{
    const barAreaH = chartH-28;
    const maxH = chartMaxH;
    const ticks = yTicks(maxH);
    return (
      <div style={{display:"flex",gap:0}}>
        {/* Y-axis — hours */}
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",
          paddingBottom:18,marginRight:4,minWidth:30}}>
          {ticks.map(t=>(
            <div key={t} style={{fontSize:8,color:"#4a5568",textAlign:"right",lineHeight:1,whiteSpace:"nowrap"}}>
              {t===0?"0":fmtH(t)}
            </div>
          ))}
        </div>
        {/* Bar area */}
        <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:3,height:chartH,position:"relative"}}>
          {ticks.filter(t=>t>0).map(t=>(
            <div key={t} style={{position:"absolute",left:0,right:0,
              bottom:18+(t/maxH)*barAreaH,height:1,
              background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>
          ))}
          {backupData.map(({month,battOnly,solarExtDays,indefinite})=>{
            if (!battOnly&&!indefinite) return (
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{flex:1,width:"100%",background:"#1e2535",borderRadius:"2px 2px 0 0",minHeight:3}}/>
                <div style={{fontSize:8,color:"#4a5568",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            if (indefinite) return (
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{fontSize:7,color:"#F6AD55",fontWeight:700,textAlign:"center",lineHeight:1}}>∞</div>
                <div style={{flex:1,width:"100%",background:"#F6AD55",opacity:0.8,borderRadius:"2px 2px 0 0"}}/>
                <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            const battPct = Math.min(1,battOnly/maxH);
            const solPct  = solarExtDays?Math.min(1-battPct,(solarExtDays*24)/maxH):0;
            const battPx  = Math.max(3,Math.round(battPct*barAreaH));
            const solPx   = Math.round(solPct*barAreaH);
            const totalH  = battOnly + (solarExtDays?solarExtDays*24:0);
            return (
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                {/* Total label on top (solar+battery) */}
                {solPx>0&&(
                  <div style={{fontSize:7,color:"#F6AD55",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>
                    {fmtH(totalH)}
                  </div>
                )}
                {solPx===0&&(
                  <div style={{fontSize:7,color:"#4FD1C5",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>
                    {fmtH(battOnly)}
                  </div>
                )}
                <div style={{flex:1,width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",position:"relative"}}>
                  {/* Solar bar — amber, on top */}
                  {solPx>0&&(
                    <div style={{width:"100%",height:solPx,background:"#F6AD55",opacity:0.85,
                      borderRadius:"2px 2px 0 0",position:"relative"}}>
                      {/* Hours label inside solar bar if tall enough */}
                      {solPx>14&&(
                        <div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",
                          fontSize:7,color:"#7a5500",fontWeight:700,lineHeight:1}}>
                          +{fmtH(solarExtDays*24)}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Battery bar — teal, on bottom */}
                  <div style={{width:"100%",height:battPx,background:"#4FD1C5",opacity:0.9,
                    borderRadius:solPx>0?"0":"2px 2px 0 0",position:"relative"}}>
                    {/* Hours label inside battery bar if tall enough */}
                    {battPx>14&&(
                      <div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",
                        fontSize:7,color:"#1a4a45",fontWeight:700,lineHeight:1}}>
                        {fmtH(battOnly)}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── STEP 1 ────────────────────────────────────────────────────────────────────
  const renderStep1 = ()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>
      <div>
        <label style={lbl}>Homeowner address</label>
        <input style={inp} placeholder="123 Main St, Bellevue, WA 98004"
          value={address} onChange={e=>setAddress(e.target.value)}/>
      </div>

      {/* ── Usage section ── */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Monthly energy usage</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:10}}>
          Upload a utility bill, screenshot of the usage graph, or an Excel/CSV export. Or enter values manually.
        </div>
        <EnergyFileUpload
          label="Upload utility bill or usage data"
          hint="usage"
          accentColor="#40916C"
          onParsed={result=>{
            handleEnergyParsed(result);
            setShowUsageGrid(true);
          }}
        />
        <div style={{marginTop:8}}>
          <button style={btnS} onClick={()=>setShowUsageGrid(v=>!v)}>
            {showUsageGrid?"▲ Hide":"▼ Edit"} monthly values
          </button>
        </div>
        {showUsageGrid&&<MonthGrid values={usageMonthly} onChange={setUsageMonthly}/>}

        <div style={{marginTop:12}}>
          <label style={lbl}>PSE residential rate ($/kWh)</label>
          <input style={{...inp,maxWidth:160}} type="number" step="0.001"
            value={rate} onChange={e=>setRate(e.target.value)}/>
          <div style={{fontSize:10,color:"#4a5568",marginTop:3}}>Pre-filled at PSE current rate ~$0.20/kWh · Net metering 1-for-1 (under review)</div>
        </div>
      </div>

      {/* ── Solar section ── */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:8}}>Solar system</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={pill(hasSolar===true)}     onClick={()=>setHasSolar(true)}>Has solar</button>
          <button style={pill(hasSolar===false)}    onClick={()=>setHasSolar(false)}>No solar</button>
          <button style={pill(hasSolar==="future")} onClick={()=>setHasSolar("future")}>Will add solar</button>
        </div>

        {hasSolar!==false&&(
          <div style={{display:"grid",gap:"1rem"}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:120}}>
                <label style={lbl}>System size (kW DC)</label>
                <input style={inp} type="number" step="0.1" placeholder="10.0"
                  value={solarKwDc} onChange={e=>setSolarKwDc(e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Coupling</label>
                <div style={{display:"flex",gap:6,marginTop:3}}>
                  <button style={pill(coupling==="ac")} onClick={()=>setCoupling("ac")}>AC</button>
                  <button style={pill(coupling==="dc")} onClick={()=>setCoupling("dc")}>DC</button>
                </div>
              </div>
            </div>

            <div style={{fontSize:11,color:"#718096",marginBottom:4}}>
              Upload a solar production report, monitoring screenshot, or CSV. Or enter monthly values manually.
            </div>
            <EnergyFileUpload
              label="Upload solar production data"
              hint="solar"
              accentColor="#D4A017"
              onParsed={result=>{
                handleEnergyParsed(result);
                setShowSolarGrid(true);
              }}
            />
            <button style={btnS} onClick={()=>setShowSolarGrid(v=>!v)}>
              {showSolarGrid?"▲ Hide":"▼ Edit"} monthly values
            </button>
            {showSolarGrid&&<MonthGrid values={solarMonthly} onChange={setSolarMonthly} accentColor="#D4A017"/>}
          </div>
        )}
      </div>

      <button style={{...btnP,width:"100%",padding:"13px"}} onClick={()=>setStep(1)}>
        → Continue to Electrical Loads
      </button>
    </div>
  );

  // ── STEP 2 ────────────────────────────────────────────────────────────────────
  const renderStep2 = ()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>
      <div style={{fontSize:12,color:"#718096"}}>
        Upload the panel photo — Claude Vision reads every breaker. Then click each circuit to mark it <strong style={{color:"#9AE6B4"}}>Critical</strong> (will run during an outage).
      </div>

      {/* Upload */}
      {breakers.length===0&&(
        <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
          <div style={{fontSize:12,color:"#718096",marginBottom:8}}>📸 Electrical panel photo</div>
          <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
            onChange={e=>{setPanelFile(e.target.files[0]);handleParsePanel(e.target.files[0]);}}/>
          {parsingPanel&&<div style={{marginTop:8,fontSize:12,color:"#F6AD55"}}>Reading your panel…</div>}
          {parseError&&<div style={{marginTop:8,color:"#FC8181",fontSize:12}}>⚠️ {parseError}</div>}
        </div>
      )}

      {/* Panel graphic + controls */}
      {breakers.length>0&&(
        <div style={{display:"grid",gap:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>
              {breakers.length} circuits · {critBreakers.length} critical ({Math.round(critPct*100)}% demand)
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div>
                <label style={{...lbl,display:"inline",marginRight:6}}>Main:</label>
                <input type="number" style={{...inp,width:64,padding:"3px 6px",fontSize:11,display:"inline"}}
                  value={mainAmps} onChange={e=>setMainAmps(parseInt(e.target.value)||200)}/>
                <span style={{fontSize:10,color:"#718096",marginLeft:3}}>A</span>
              </div>
              <button style={{...btnG,fontSize:11}} onClick={()=>{setBreakers([]);setPanelFile(null);}}>↺ Re-parse</button>
            </div>
          </div>

          <PanelGraphic
            breakers={breakers}
            mainAmps={mainAmps}
            onToggle={id=>setBreakers(p=>p.map(x=>x.id===id?{...x,critical:!x.critical}:x))}
            onRename={(id,name)=>setBreakers(p=>p.map(x=>x.id===id?{...x,name}:x))}
          />

          <div style={{background:"#0f1623",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:700,color:"#68D391"}}>{Math.round(critPct*100)}%</div>
            <div style={{fontSize:10,color:"#718096",textTransform:"uppercase",marginTop:2}}>of total demand selected as critical</div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button style={btnG} onClick={()=>setStep(0)}>← Back</button>
        <button style={{...btnP,flex:1}} onClick={()=>setStep(2)}>→ Continue to Battery Design</button>
      </div>
    </div>
  );

  // ── STEP 3 ────────────────────────────────────────────────────────────────────
  const renderStep3 = ()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>
      {showPowerWarning&&(
        <div style={{...alrt("warn"),display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <span>⚠️ Battery power may be less than critical load demand.</span>
          <button onClick={()=>setPowerAlertDismissed(true)}
            style={{background:"none",border:"none",color:"#F6AD55",cursor:"pointer",fontSize:16,padding:"0 0 0 8px",lineHeight:1}}>✕</button>
        </div>
      )}
      {couplingAlert&&<div style={alrt("warn")}>⚠️ {couplingAlert}</div>}

      {/* Battery selector */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Select batteries</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:14}}>Selecting one brand locks out the other.</div>
        <div style={{display:"grid",gap:10}}>
          {BATTERIES.map(b=>{
            const qty=battSel[b.id]||0;
            const locked=selectedBrand&&selectedBrand!==b.brand;
            const needsPw3=b.requiresPw3&&!(battSel.pw3>0);
            return (
              <div key={b.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center",
                background:locked?"#0d0f14":qty>0?"rgba(45,106,79,0.1)":"#161b27",
                borderRadius:10,padding:"10px 14px",
                border:`1px solid ${locked?"#1a1a1a":qty>0?"#2D6A4F":"#2d3748"}`,
                opacity:locked?0.4:1,transition:"all 0.2s"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:locked?"#444":"#e2e8f0"}}>{b.name}</div>
                  <div style={{fontSize:11,color:locked?"#333":"#718096",marginTop:2}}>{b.brand}</div>
                  <div style={{fontSize:11,color:locked?"#333":"#68D391",marginTop:3}}>
                    {b.powerKw>0?b.powerKw+" kW  ·  ":"0 kW  ·  "}{b.energyKwh} kWh</div>
                  {b.note&&<div style={{fontSize:10,color:"#F6AD55",marginTop:2}}>{b.note}</div>}
                  {b.acLimitKw>0&&<div style={{fontSize:9,color:"#4a5568",marginTop:1}}>
                    AC: {b.acLimitKw} kW/unit{b.dcLimitKw?" · DC: "+b.dcLimitKw+" kW/unit":""}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <button disabled={locked||needsPw3} onClick={()=>toggleBatt(b.id,1)}
                    style={{width:28,height:28,borderRadius:6,border:"1px solid #2d3748",background:"#0f1623",
                      color:"#9AE6B4",cursor:(locked||needsPw3)?"not-allowed":"pointer",fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  <div style={{fontSize:15,fontWeight:700,color:qty>0?"#9AE6B4":"#718096",minWidth:20,textAlign:"center"}}>{qty}</div>
                  <button disabled={locked||qty===0} onClick={()=>toggleBatt(b.id,-1)}
                    style={{width:28,height:28,borderRadius:6,border:"1px solid #2d3748",background:"#0f1623",
                      color:"#FC8181",cursor:(locked||qty===0)?"not-allowed":"pointer",fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                </div>
              </div>
            );
          })}
        </div>
        {tKwh>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
            <div style={{background:"#0f1623",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:"#68D391"}}>{Math.round(tKw*10)/10} kW</div>
              <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>power output</div>
            </div>
            <div style={{background:"#0f1623",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:"#9AE6B4"}}>{Math.round(tKwh*10)/10} kWh</div>
              <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>energy storage</div>
            </div>
          </div>
        )}
      </div>

      {/* Resilience */}
      {tKwh>0&&critPct>0&&(
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,color:"#9AE6B4",marginBottom:4}}>Off-Grid Resilience</div>
          <div style={{fontSize:11,color:"#718096",marginBottom:12}}>
            {Math.round(tKwh*10)/10} kWh · {Math.round(critPct*100)}% demand
            {hasSolar!==false&&Object.values(solarMonthly).some(v=>v)&&" · amber = solar recharge extension"}
          </div>
          {renderBackupBars(180)}
          <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
              <div style={{width:10,height:10,background:"#4FD1C5",borderRadius:2}}/> Battery only (hours shown inside bar)
            </div>
            {hasSolar!==false&&(
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
                <div style={{width:10,height:10,background:"#F6AD55",borderRadius:2}}/> + Solar recharge
              </div>
            )}
          </div>
        </div>
      )}

      {/* VPP Savings */}
      {tUnits>0&&(
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,color:"#D4A017",marginBottom:4}}>On-Grid Savings — PSE VPP</div>
          <div style={{background:"#1a1700",border:"1px solid #4a3800",borderRadius:10,padding:"1rem",marginTop:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div style={{background:"#0f0e00",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#FFD700"}}>${vppOneTime.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#8a7030",marginTop:2,textTransform:"uppercase"}}>one-time incentive</div>
                <div style={{fontSize:9,color:"#4a3800",marginTop:1}}>${VPP_ONETIME.toLocaleString()}/battery × {tUnits}</div>
              </div>
              <div style={{background:"#0f0e00",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#FFD700"}}>${vppAnnual.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#8a7030",marginTop:2,textTransform:"uppercase"}}>annual recurring</div>
                <div style={{fontSize:9,color:"#4a3800",marginTop:1}}>up to ${VPP_ANNUAL.toLocaleString()}/battery/yr</div>
              </div>
            </div>
            <div style={{background:"#0f0e00",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:700,color:"#D4A017"}}>${vpp10Year.toLocaleString()}</div>
              <div style={{fontSize:10,color:"#8a7030",marginTop:2,textTransform:"uppercase"}}>10-year total value</div>
            </div>
            <div style={{fontSize:10,color:"#4a3800",marginTop:8,textAlign:"center"}}>PSE OnCall demand response · Enroll at installation</div>
          </div>
        </div>
      )}

      {/* Additional resilience */}
      <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:6}}>Additional resilience technology</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Fuel cell","Generator","Vehicle-to-home (V2H)","SPAN Panel"].map(t=>(
            <div key={t} style={{padding:"5px 12px",borderRadius:20,border:"1px solid #2d3748",fontSize:11,color:"#4a5568"}}>+ {t}</div>
          ))}
        </div>
        <div style={{fontSize:10,color:"#2d3748",marginTop:6}}>Coming soon</div>
      </div>

      {/* Expert design CTA */}
      <div style={{...card,border:"1px solid #2D6A4F"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#9AE6B4",marginBottom:6}}>Ready for a complete installation plan?</div>
        <div style={{fontSize:12,color:"#718096",marginBottom:12,lineHeight:1.6}}>
          Upload site photos and customer goals for expert design of equipment locations and installation plan adhering to NEC, AHJ, and utility requirements.
        </div>
        <div style={{...card,background:"#0f1623",border:"1px dashed #2D6A4F",marginBottom:10}}>
          <input type="file" accept="image/*" multiple style={{fontSize:11,color:"#718096"}}/>
          <div style={{fontSize:10,color:"#4a5568",marginTop:5}}>Site photos (multiple allowed)</div>
        </div>
        <textarea placeholder="Customer goals and notes…"
          style={{...inp,height:60,resize:"vertical",fontSize:12,marginBottom:10}}/>
        <button style={{...btnP,width:"100%",background:"#1a2e22",border:"1px solid #2D6A4F",color:"#9AE6B4",cursor:"default",opacity:0.7}}>
          Request Expert Design — Coming Soon
        </button>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button style={btnG} onClick={()=>setStep(1)}>← Back</button>
        <button style={{...btnP,flex:1}} onClick={()=>setStep(3)}>→ View Homeowner Proposal</button>
      </div>
    </div>
  );

  // ── STEP 4 (Proposal) ─────────────────────────────────────────────────────────
  const renderStep4 = ()=>{
    const worst = backupData.reduce((w,d)=>{
      if (d.indefinite||!d.battOnly) return w;
      return (!w||d.battOnly<w.battOnly)?d:w;
    },null);
    const best = backupData.reduce((b,d)=>{
      if (!d.battOnly&&!d.indefinite) return b;
      if (d.indefinite) return d;
      return (!b||d.battOnly>b.battOnly)?d:b;
    },null);
    const battName = selectedBrand==="Tesla"
      ?`Tesla Powerwall 3${battSel.pwdc>0?" + DC Expansion":""}`
      :selectedBrand==="Franklin"?"Franklin aPower 2":"Battery System";

    return (
      <div style={{display:"grid",gap:"1.25rem"}}>
        {/* Hero */}
        <div style={{background:"linear-gradient(135deg,#0d1a10,#0d1117)",border:"1px solid #2D6A4F",borderRadius:16,padding:"1.5rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#9AE6B4",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>
            Your Energy Resilience &amp; Savings
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#e2e8f0",marginBottom:4}}>
            {Math.round(tKwh*10)/10} kWh · {Math.round(tKw*10)/10} kW
          </div>
          <div style={{fontSize:13,color:"#68D391"}}>{battName}</div>
          {address&&<div style={{fontSize:11,color:"#4a5568",marginTop:4}}>{address}</div>}
        </div>

        {/* Side-by-side summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{...card,background:"#0d1a10",borderColor:"#1a4030"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#9AE6B4",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>Off-Grid Resilience</div>
            {worst&&(
              <div style={{textAlign:"center",marginBottom:6}}>
                <div style={{fontSize:11,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Worst case ({worst.month})</div>
                <div style={{fontSize:24,fontWeight:800,color:"#4FD1C5"}}>
                  {worst.battOnly>=48?`${Math.round(worst.battOnly/24)}d`:`${Math.round(worst.battOnly)}h`}
                </div>
              </div>
            )}
            {best&&!best.indefinite&&(
              <div style={{textAlign:"center",marginBottom:6}}>
                <div style={{fontSize:11,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Best case ({best.month})</div>
                <div style={{fontSize:24,fontWeight:800,color:"#68D391"}}>
                  {best.battOnly>=48?`${Math.round(best.battOnly/24)}d`:`${Math.round(best.battOnly)}h`}
                </div>
              </div>
            )}
            {best?.indefinite&&(
              <div style={{textAlign:"center",marginBottom:6}}>
                <div style={{fontSize:11,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Best case ({best.month})</div>
                <div style={{fontSize:22,fontWeight:800,color:"#68D391"}}>Indefinite ∞</div>
                <div style={{fontSize:10,color:"#4a5568"}}>solar covers full demand</div>
              </div>
            )}
            <div style={{fontSize:10,color:"#4a5568",textAlign:"center",marginTop:4}}>
              {Math.round(critPct*100)}% demand
            </div>
          </div>
          <div style={{...card,background:"#1a1700",borderColor:"#4a3800"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#D4A017",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>On-Grid Savings</div>
            <div style={{textAlign:"center",marginBottom:6}}>
              <div style={{fontSize:24,fontWeight:800,color:"#FFD700"}}>${vpp10Year.toLocaleString()}</div>
              <div style={{fontSize:10,color:"#8a7030"}}>10-year VPP value</div>
            </div>
            <div style={{fontSize:10,color:"#4a3800",textAlign:"center"}}>
              ${vppOneTime.toLocaleString()} one-time + ${vppAnnual.toLocaleString()}/yr
            </div>
          </div>
        </div>

        {/* Backup chart */}
        {backupData.some(d=>d.battOnly||d.indefinite)&&(
          <div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:12}}>Backup duration by month (hours)</div>
            {renderBackupBars(140)}
          </div>
        )}

        {/* VPP earnings chart */}
        {vppAnnual>0&&(
          <div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:8}}>Cumulative VPP earnings — 10 years</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:70}}>
              {Array.from({length:10},(_,i)=>{
                const cum=vppOneTime+vppAnnual*(i+1);
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",height:`${Math.max(4,(cum/vpp10Year)*60)}px`,background:"#D4A017",borderRadius:"2px 2px 0 0",opacity:0.8}}/>
                    <div style={{fontSize:8,color:"#8a7030"}}>Y{i+1}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#8a7030",marginTop:4}}>
              <span>Year 1: ${(vppOneTime+vppAnnual).toLocaleString()}</span>
              <span>Year 10: ${vpp10Year.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* System details */}
        <div style={card}>
          <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:10}}>System details</div>
          {BATTERIES.filter(b=>(battSel[b.id]||0)>0).map(b=>(
            <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #1a202c",fontSize:12}}>
              <span style={{color:"#718096"}}>{b.name}</span>
              <span style={{color:"#e2e8f0"}}>{battSel[b.id]} unit{battSel[b.id]!==1?"s":""} · {battSel[b.id]*b.energyKwh} kWh · {battSel[b.id]*b.powerKw} kW</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:13,fontWeight:600}}>
            <span style={{color:"#718096"}}>Total</span>
            <span style={{color:"#F6AD55"}}>{Math.round(tKwh*10)/10} kWh · {Math.round(tKw*10)/10} kW</span>
          </div>
          {hasSolar!==false&&solarKwDc&&(
            <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:"1px solid #1a202c",fontSize:12}}>
              <span style={{color:"#718096"}}>Solar ({coupling.toUpperCase()}-coupled)</span>
              <span style={{color:"#e2e8f0"}}>{solarKwDc} kW DC</span>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button style={btnG} onClick={()=>setStep(2)}>← Adjust design</button>
          <button style={{...btnG,flex:1}} onClick={()=>{
            setStep(0);setBattSel({pw3:0,pwdc:0,fp2:0});setSelectedBrand(null);
            setBreakers([]);setPanelFile(null);
          }}>↺ New proposal</button>
        </div>
        <div style={{fontSize:10,color:"#2d3748",textAlign:"center"}}>
          PSE rates and VPP program terms current as of 2026 · All savings are estimates
        </div>
      </div>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",...dark,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
      display:"flex",flexDirection:"column",alignItems:"center",padding:"2rem 1rem"}}>
      <div style={{width:"100%",maxWidth:680,marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#2D6A4F",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔋</div>
          <div>
            <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.02em"}}>Battery Proposal Tool</div>
            <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.08em",textTransform:"uppercase"}}>PSE Edition · Resilience + Savings</div>
          </div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:680,background:"#161b27",borderRadius:16,padding:"1.75rem",border:"1px solid #1e2535"}}>
        <StepBar current={step}/>
        {step===0&&renderStep1()}
        {step===1&&renderStep2()}
        {step===2&&renderStep3()}
        {step===3&&renderStep4()}
      </div>
      <div style={{marginTop:"1.5rem",fontSize:10,color:"#1e2535",maxWidth:600,textAlign:"center"}}>
        For installer use · PSE rate data current as of 2026 · Not a substitute for a professional site assessment
      </div>
    </div>
  );
}
