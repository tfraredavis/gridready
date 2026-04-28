import { useState } from "react";

const API_BASE = "/api/solar";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const VPP_ONETIME = 1000;
const VPP_ANNUAL  = 500;

// ── Battery catalog ────────────────────────────────────────────────────────────
// acLimitKw: per-unit AC coupling limit (null = infinite)
// dcLimitKw: per-unit DC coupling limit (null = N/A)
// contCurrentA: continuous output current (amps)
// peakCurrentA: peak output current (amps)
// requiresPw3: true = needs at least 1 Powerwall 3 in the selection
const BATTERIES = [
  { id:"pw3",   brand:"Tesla",    name:"Powerwall 3",       powerKw:11.5, energyKwh:13.5, acLimitKw:7.6,  dcLimitKw:20,   contCurrentA:null, peakCurrentA:null, requiresPw3:false, note:null },
  { id:"pwdc",  brand:"Tesla",    name:"DC Expansion Pack",  powerKw:0,    energyKwh:13.5, acLimitKw:0,    dcLimitKw:0,    contCurrentA:null, peakCurrentA:null, requiresPw3:true,  note:"Requires ≥1 Powerwall 3" },
  { id:"fp2",   brand:"Franklin", name:"aPower 2",           powerKw:10,   energyKwh:15,   acLimitKw:8,    dcLimitKw:null, contCurrentA:null, peakCurrentA:null, requiresPw3:false, note:null },
  { id:"iq5p",  brand:"Enphase",  name:"IQ Battery 5P",      powerKw:3.84, energyKwh:5,    acLimitKw:null, dcLimitKw:null, contCurrentA:16.7, peakCurrentA:33.4, requiresPw3:false, note:null },
  { id:"iq10c", brand:"Enphase",  name:"IQ Battery 10C",     powerKw:7.08, energyKwh:10,   acLimitKw:null, dcLimitKw:null, contCurrentA:29.5, peakCurrentA:56,   requiresPw3:false, note:null },
];
const BRANDS = ["Tesla","Franklin","Enphase"];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
}
async function callParsePanel(file) {
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(API_BASE,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"parsePanel",imageBase64,mediaType:file.type})});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error||"Panel parsing failed");
  return data;
}
async function callParseEnergyFile(file, hint) {
  const isImage = file.type.startsWith("image/")||file.type==="application/pdf";
  const key = isImage ? "imageBase64" : "fileBase64";
  const raw  = await fileToBase64(file);
  const r = await fetch(API_BASE,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"parseEnergyDoc",[key]:raw,mediaType:file.type,hint})});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error||"Parsing failed");
  return data;
}

// Battery totals across selection {id: qty}
function totalKwh(sel)  { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.energyKwh),0); }
function totalKw(sel)   { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.powerKw),0); }
function totalUnits(sel){ return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)),0); }
// Total peak current (amps) — sum of per-unit peakCurrentA × qty; null if any unit lacks spec
function totalPeakA(sel) {
  let sum = 0;
  for (const b of BATTERIES) {
    const qty = sel[b.id]||0;
    if (!qty) continue;
    if (b.peakCurrentA===null) return null; // Tesla — no per-amp spec published
    sum += b.peakCurrentA * qty;
  }
  return sum;
}
// Total AC coupling limit (kW) per selection; null means infinite
function totalAcLimitKw(sel) {
  let sum = 0;
  for (const b of BATTERIES) {
    const qty = sel[b.id]||0;
    if (!qty) continue;
    if (b.acLimitKw===null) return null; // infinite (Enphase)
    sum += b.acLimitKw * qty;
  }
  return sum;
}

const fmtH = h => h>=48 ? `${Math.round(h/24)}d` : `${Math.round(h)}h`;

// ── StepBar ───────────────────────────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ["Enter Data","Design & Loads","Proposal"];
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

// ── EnergyFileUpload (outside main to avoid remount) ──────────────────────────
function EnergyFileUpload({ label, hint, onParsed, accentColor }) {
  const [parsing,setParsing]   = useState(false);
  const [err,setErr]           = useState("");
  const [fileName,setFileName] = useState("");
  const handle = async file=>{
    if (!file) return;
    setFileName(file.name); setParsing(true); setErr("");
    try { const r=await callParseEnergyFile(file,hint); onParsed(r); }
    catch(e){ setErr(e.message); } finally { setParsing(false); }
  };
  return (
    <div style={{background:"#0f1623",border:`1px dashed ${accentColor||"#40916C"}44`,borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:11,color:"#718096",marginBottom:4}}>📎 {label}</div>
      <div style={{fontSize:10,color:"#4a5568",marginBottom:6}}>Accepts: utility bill photo, Excel, CSV, screenshot of graph</div>
      <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" style={{fontSize:11,color:"#718096"}}
        onChange={e=>handle(e.target.files[0])}/>
      {parsing&&<div style={{marginTop:5,fontSize:11,color:"#F6AD55"}}>🔍 Reading…</div>}
      {!parsing&&fileName&&!err&&<div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {fileName}</div>}
      {err&&<div style={{marginTop:5,fontSize:11,color:"#FC8181"}}>⚠️ {err}</div>}
    </div>
  );
}

// ── MonthGrid (outside main to avoid remount) ─────────────────────────────────
function MonthGrid({ values, onChange, accentColor }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:6}}>
      {MONTHS.map(m=>(
        <div key={m}>
          <label style={{fontSize:10,color:accentColor||"#718096",marginBottom:2,display:"block",fontWeight:500,textTransform:"uppercase"}}>{m}</label>
          <input type="number"
            style={{width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:6,color:"#e2e8f0",padding:"4px 6px",fontSize:11,outline:"none",boxSizing:"border-box"}}
            placeholder="—" value={values[m]}
            onChange={e=>onChange(p=>({...p,[m]:e.target.value}))}/>
        </div>
      ))}
    </div>
  );
}

// ── PanelGraphic (outside main to avoid remount) ──────────────────────────────
function PanelGraphic({ breakers, onToggle, onRename, mainAmps }) {
  const pairs=[];
  for(let i=0;i<breakers.length;i+=2) pairs.push([breakers[i],breakers[i+1]||null]);
  const Slot=({b,side})=>{
    if(!b) return <div style={{height:38}}/>;
    const on=b.critical;
    return (
      <div onClick={()=>onToggle(b.id)} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 7px",borderRadius:5,cursor:"pointer",
        background:on?"rgba(72,187,120,0.15)":"rgba(60,60,70,0.4)",
        border:`1px solid ${on?"#2D6A4F":"#2a2a3a"}`,transition:"all 0.15s",userSelect:"none",
        flexDirection:side==="right"?"row-reverse":"row",
      }}>
        <div style={{width:14,height:26,borderRadius:3,flexShrink:0,background:on?"#2D6A4F":"#1a1a2a",border:`1px solid ${on?"#40916C":"#333"}`,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:on?"2px":"auto",bottom:on?"auto":"2px",left:2,right:2,height:10,background:on?"#9AE6B4":"#444",borderRadius:2,transition:"all 0.15s"}}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          {b.name==="Unknown"
            ?<input style={{background:"transparent",border:"none",color:on?"#9AE6B4":"#718096",fontSize:10,outline:"none",width:"100%",cursor:"text"}}
                placeholder="Rename…" defaultValue="" onClick={e=>e.stopPropagation()}
                onBlur={e=>{const n=e.target.value.trim()||"Unknown";onRename(b.id,n);}}/>
            :<div style={{fontSize:10,color:on?"#9AE6B4":"#718096",textAlign:side==="right"?"right":"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>}
          <div style={{fontSize:9,color:on?"#4a9070":"#444",textAlign:side==="right"?"right":"left"}}>{b.amps}A</div>
        </div>
      </div>
    );
  };
  return (
    <div style={{background:"#0d1117",borderRadius:10,border:"2px solid #2d3748",padding:"10px",fontFamily:"monospace"}}>
      {/* Main breaker */}
      <div style={{background:"#1a2535",borderRadius:6,padding:"6px 10px",marginBottom:8,textAlign:"center",border:"1px solid #2d3748",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <div style={{flex:1,height:18,background:"#2d3748",borderRadius:3,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
        <div style={{fontSize:11,color:"#a0aec0",fontWeight:600,whiteSpace:"nowrap"}}>{mainAmps||200}A Main</div>
        <div style={{flex:1,height:18,background:"#2d3748",borderRadius:3,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
      </div>
      <div style={{height:3,background:"#1a2535",borderRadius:2,marginBottom:6,border:"1px solid #2d3748"}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
        {pairs.map(([left,right],i)=>(
          <>{/* eslint-disable-next-line react/jsx-key */}
            <Slot key={`L${i}`} b={left}  side="left"/>
            <Slot key={`R${i}`} b={right} side="right"/>
          </>
        ))}
      </div>
      <div style={{display:"flex",gap:14,marginTop:8,justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}><div style={{width:8,height:8,background:"#2D6A4F",borderRadius:1}}/> Critical (on)</div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}><div style={{width:8,height:8,background:"#1a1a2a",border:"1px solid #333",borderRadius:1}}/> Non-critical (off)</div>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function BatteryProposalTool() {
  const [step, setStep] = useState(0);

  // Page 1 state
  const [hasSolar, setHasSolar]           = useState(null);
  const [coupling, setCoupling]           = useState("ac");
  const [solarKwDc, setSolarKwDc]         = useState("");
  const [solarMonthly, setSolarMonthly]   = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [usageMonthly, setUsageMonthly]   = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [showSolarGrid, setShowSolarGrid] = useState(false);
  const [showUsageGrid, setShowUsageGrid] = useState(false);
  // Panel upload on page 1
  const [panelFile, setPanelFile]         = useState(null);
  const [panelFileName, setPanelFileName] = useState("");

  // Page 2 state
  const [breakers, setBreakers]             = useState([]);
  const [mainAmps, setMainAmps]             = useState(200);
  const [parsingPanel, setParsingPanel]     = useState(false);
  const [parseError, setParseError]         = useState("");
  // Battery selection
  const [selectedBrand, setSelectedBrand]   = useState("");   // "", "Tesla", "Franklin", "Enphase"
  const [battSel, setBattSel]               = useState({});   // {id: qty}
  const [acWarnDismissed, setAcWarnDismissed]     = useState(false);
  const [ampWarnDismissed, setAmpWarnDismissed]   = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const tKwh   = totalKwh(battSel);
  const tKw    = totalKw(battSel);
  const tUnits = totalUnits(battSel);
  const vppOneTime = tUnits*VPP_ONETIME;
  const vppAnnual  = tUnits*VPP_ANNUAL;
  const vpp10Year  = vppOneTime+vppAnnual*10;

  const critBreakers   = breakers.filter(b=>b.critical);
  const totalBreakerA  = breakers.reduce((s,b)=>s+b.amps,0);
  const critBreakerA   = critBreakers.reduce((s,b)=>s+b.amps,0);
  const demandPct      = totalBreakerA>0 ? Math.round(critBreakerA/totalBreakerA*100) : 0;
  const maxOutputA     = critBreakerA>0  ? Math.round(critBreakerA/1.25*10)/10 : 0;
  // critPct for backup hours (count-based)
  const critPct        = breakers.length>0 ? critBreakers.length/breakers.length : 0;

  const solarKwNum = parseFloat(solarKwDc)||0;
  const acLimit    = totalAcLimitKw(battSel);  // null=infinite
  const showAcWarn = !acWarnDismissed && hasSolar!==false && solarKwNum>0 && acLimit!==null && acLimit<solarKwNum && tKwh>0;
  const peakA      = totalPeakA(battSel);
  const showAmpWarn= !ampWarnDismissed && peakA!==null && peakA>0 && peakA<maxOutputA && maxOutputA>0;

  // Backup hours
  const backupData = MONTHS.map((m,i)=>{
    const uNum=parseFloat(usageMonthly[m])||0;
    const sNum=parseFloat(solarMonthly[m])||0;
    if (!uNum||!tKwh||!critPct) return {month:m,battOnly:null,solarExtDays:null,indefinite:false};
    const hourlyDemand=(uNum/DAYS[i]/24)*critPct;
    const battOnly=tKwh/hourlyDemand;
    let solarExtDays=null,indefinite=false;
    if (hasSolar!==false&&sNum>0){
      const net=(hourlyDemand*24)-(sNum/DAYS[i]);
      if(net<=0) indefinite=true; else solarExtDays=tKwh/net;
    }
    return {month:m,battOnly,solarExtDays,indefinite};
  });
  const maxBattH  = Math.max(...backupData.map(d=>d.battOnly||0),1);
  const maxSolarH = Math.max(...backupData.map(d=>d.solarExtDays?d.solarExtDays*24:0),0);
  const chartMaxH = Math.max(maxBattH+maxSolarH,1);

  // ── Styles ────────────────────────────────────────────────────────────────
  const card = {background:"#1e2535",borderRadius:12,padding:"1.25rem",border:"1px solid #2d3748"};
  const inp  = {width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl  = {fontSize:10,color:"#718096",marginBottom:3,display:"block",fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"};
  const btnP = {padding:"11px 22px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"#2D6A4F",color:"#fff"};
  const btnG = {padding:"9px 18px",borderRadius:8,cursor:"pointer",fontSize:12,background:"transparent",border:"1px solid #2d3748",color:"#718096"};
  const btnS = {padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,background:"transparent",border:"1px solid #2d3748",color:"#4a5568"};
  const pill = a=>({padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:a?"#2D6A4F":"#1a202c",color:a?"#9AE6B4":"#718096",border:a?"1px solid #2D6A4F":"1px solid #2d3748"});
  const alrt = {display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:8,background:"rgba(246,173,85,0.1)",color:"#F6AD55",border:"1px solid rgba(246,173,85,0.3)"};

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEnergyParsed = r=>{
    if(r.monthlyUsageKwh){ const n={...usageMonthly}; Object.entries(r.monthlyUsageKwh).forEach(([m,v])=>{if(MONTHS.includes(m))n[m]=String(v);}); setUsageMonthly(n); setShowUsageGrid(true); }
    if(r.monthlySolarKwh){ const n={...solarMonthly}; Object.entries(r.monthlySolarKwh).forEach(([m,v])=>{if(MONTHS.includes(m))n[m]=String(v);}); setSolarMonthly(n); setShowSolarGrid(true); }
  };

  const handleParsePanel = async file=>{
    if(!file) return;
    setParsingPanel(true); setParseError("");
    try{
      const result=await callParsePanel(file);
      if(!result.breakers?.length) throw new Error("No breakers detected");
      if(result.mainAmps) setMainAmps(result.mainAmps);
      setBreakers(result.breakers.map((b,i)=>({...b,id:`b_${i}`,name:b.name||"Unknown",critical:false})));
    }catch(e){setParseError(e.message);}finally{setParsingPanel(false);}
  };

  const setBattQty=(id,delta)=>{
    const b=BATTERIES.find(x=>x.id===id);
    if(selectedBrand&&selectedBrand!==b.brand) return;
    const cur=battSel[id]||0;
    const next=Math.max(0,Math.min(5,cur+delta));
    if(id==="pwdc"&&next>0&&!(battSel.pw3>0)) return;
    const ns={...battSel,[id]:next};
    setBattSel(ns);
    setAcWarnDismissed(false); setAmpWarnDismissed(false);
  };

  const changeBrand=brand=>{
    setSelectedBrand(brand);
    setBattSel({});
    setAcWarnDismissed(false); setAmpWarnDismissed(false);
  };

  // ── Chart ─────────────────────────────────────────────────────────────────
  const yTicks=maxH=>{
    const step=maxH<=48?12:maxH<=168?24:maxH<=720?168:720;
    const t=[];
    for(let v=0;v<=maxH;v+=step) t.push(v);
    if(t[t.length-1]<maxH) t.push(Math.ceil(maxH/step)*step);
    return t;
  };

  const renderBackupBars=(chartH)=>{
    const barAreaH=chartH-28,maxH=chartMaxH,ticks=yTicks(maxH);
    return(
      <div style={{display:"flex",gap:0}}>
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",paddingBottom:18,marginRight:4,minWidth:30}}>
          {ticks.map(t=><div key={t} style={{fontSize:8,color:"#4a5568",textAlign:"right",lineHeight:1,whiteSpace:"nowrap"}}>{t===0?"0":fmtH(t)}</div>)}
        </div>
        <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:3,height:chartH,position:"relative"}}>
          {ticks.filter(t=>t>0).map(t=><div key={t} style={{position:"absolute",left:0,right:0,bottom:18+(t/maxH)*barAreaH,height:1,background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>)}
          {backupData.map(({month,battOnly,solarExtDays,indefinite})=>{
            if(!battOnly&&!indefinite) return(
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{flex:1,width:"100%",background:"#1e2535",borderRadius:"2px 2px 0 0",minHeight:3}}/>
                <div style={{fontSize:8,color:"#4a5568",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            if(indefinite) return(
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{fontSize:7,color:"#F6AD55",fontWeight:700,textAlign:"center",lineHeight:1}}>∞</div>
                <div style={{flex:1,width:"100%",background:"#F6AD55",opacity:0.8,borderRadius:"2px 2px 0 0"}}/>
                <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            const battPct=Math.min(1,battOnly/maxH);
            const solPct=solarExtDays?Math.min(1-battPct,(solarExtDays*24)/maxH):0;
            const battPx=Math.max(3,Math.round(battPct*barAreaH));
            const solPx=Math.round(solPct*barAreaH);
            const totalH=battOnly+(solarExtDays?solarExtDays*24:0);
            return(
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                {solPx>0&&<div style={{fontSize:7,color:"#F6AD55",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>{fmtH(totalH)}</div>}
                {solPx===0&&<div style={{fontSize:7,color:"#4FD1C5",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>{fmtH(battOnly)}</div>}
                <div style={{flex:1,width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",position:"relative"}}>
                  {solPx>0&&<div style={{width:"100%",height:solPx,background:"#F6AD55",opacity:0.85,borderRadius:"2px 2px 0 0",position:"relative"}}>
                    {solPx>14&&<div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",fontSize:7,color:"#7a5500",fontWeight:700}}>+{fmtH(solarExtDays*24)}</div>}
                  </div>}
                  <div style={{width:"100%",height:battPx,background:"#4FD1C5",opacity:0.9,borderRadius:solPx>0?"0":"2px 2px 0 0",position:"relative"}}>
                    {battPx>14&&<div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",fontSize:7,color:"#1a4a45",fontWeight:700}}>{fmtH(battOnly)}</div>}
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

  // ── Expert Design section (reused on page 2 → page 3) ────────────────────
  const ExpertDesign=()=>(
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
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Enter Data
  // ════════════════════════════════════════════════════════════════════════════
  const renderPage1=()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>

      {/* Usage */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Monthly energy usage</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:10}}>Upload a utility bill, screenshot, or Excel/CSV export — or enter values manually.</div>
        <EnergyFileUpload label="Upload utility bill or usage data" hint="usage" accentColor="#40916C" onParsed={handleEnergyParsed}/>
        <div style={{marginTop:8}}>
          <button style={btnS} onClick={()=>setShowUsageGrid(v=>!v)}>{showUsageGrid?"▲ Hide":"▼ Edit"} monthly values</button>
        </div>
        {showUsageGrid&&<MonthGrid values={usageMonthly} onChange={setUsageMonthly}/>}
      </div>

      {/* Solar */}
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
                <input style={inp} type="number" step="0.1" placeholder="10.0" value={solarKwDc} onChange={e=>setSolarKwDc(e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Coupling</label>
                <div style={{display:"flex",gap:6,marginTop:3}}>
                  <button style={pill(coupling==="ac")} onClick={()=>setCoupling("ac")}>AC</button>
                  <button style={pill(coupling==="dc")} onClick={()=>setCoupling("dc")}>DC</button>
                </div>
              </div>
            </div>
            <EnergyFileUpload label="Upload solar production data" hint="solar" accentColor="#D4A017" onParsed={handleEnergyParsed}/>
            <button style={btnS} onClick={()=>setShowSolarGrid(v=>!v)}>{showSolarGrid?"▲ Hide":"▼ Edit"} monthly values</button>
            {showSolarGrid&&<MonthGrid values={solarMonthly} onChange={setSolarMonthly} accentColor="#D4A017"/>}
          </div>
        )}
      </div>

      {/* Panel upload */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Electrical panel</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:10}}>Upload a photo of the electrical panel. Claude will read every circuit breaker automatically.</div>
        <div style={{background:"#0f1623",border:"1px dashed #2d3748",borderRadius:8,padding:"10px 12px"}}>
          <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
            onChange={e=>{
              const f=e.target.files[0];
              if(f){ setPanelFile(f); setPanelFileName(f.name); }
            }}/>
          {panelFileName&&<div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {panelFileName} — will be read on next page</div>}
        </div>
      </div>

      <button style={{...btnP,width:"100%",padding:"13px"}} onClick={()=>{setStep(1);if(panelFile)handleParsePanel(panelFile);}}>
        → Continue to Design &amp; Loads
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Design & Loads
  // ════════════════════════════════════════════════════════════════════════════
  const brandBatteries = BATTERIES.filter(b=>b.brand===selectedBrand);

  const renderPage2=()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>

      {/* Panel graphic */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>Electrical panel</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <label style={{...lbl,marginBottom:0}}>Main</label>
              <input type="number" style={{...inp,width:56,padding:"3px 6px",fontSize:11}}
                value={mainAmps} onChange={e=>setMainAmps(parseInt(e.target.value)||200)}/>
              <span style={{fontSize:10,color:"#718096"}}>A</span>
            </div>
            <button style={{...btnG,fontSize:11}} onClick={()=>{setBreakers([]);setPanelFile(null);setPanelFileName("");}}>↺ Re-parse</button>
          </div>
        </div>

        {parsingPanel&&<div style={{fontSize:12,color:"#F6AD55",marginBottom:8}}>Reading your panel…</div>}
        {parseError&&<div style={{fontSize:12,color:"#FC8181",marginBottom:8}}>⚠️ {parseError}</div>}

        {breakers.length===0&&!parsingPanel&&(
          <div style={{background:"#0f1623",border:"1px dashed #2d3748",borderRadius:8,padding:"12px"}}>
            <div style={{fontSize:12,color:"#718096",marginBottom:8}}>No panel data yet — upload a photo on the previous page, or upload here:</div>
            <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
              onChange={e=>{const f=e.target.files[0];if(f){setPanelFile(f);setPanelFileName(f.name);handleParsePanel(f);}}}/>
          </div>
        )}

        {breakers.length>0&&(
          <>
            <div style={{fontSize:11,color:"#718096",marginBottom:10}}>Click a breaker to mark it <strong style={{color:"#9AE6B4"}}>critical</strong> (will run during an outage). Click again to deselect.</div>
            <PanelGraphic
              breakers={breakers} mainAmps={mainAmps}
              onToggle={id=>setBreakers(p=>p.map(x=>x.id===id?{...x,critical:!x.critical}:x))}
              onRename={(id,name)=>setBreakers(p=>p.map(x=>x.id===id?{...x,name}:x))}
            />
            {/* Demand stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#68D391"}}>{demandPct}%</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>% demand</div>
                <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{critBreakerA}A critical / {totalBreakerA}A total</div>
              </div>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#F6AD55"}}>{maxOutputA}A</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>max output</div>
                <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{critBreakerA}A ÷ 1.25 NEC factor</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Battery selection */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:10}}>Battery selection</div>

        {/* Alerts */}
        {showAcWarn&&(
          <div style={alrt}>
            <span>⚠️ Solar system size exceeds battery's AC coupling limit ({solarKwNum} kW DC &gt; {acLimit} kW limit).</span>
            <button onClick={()=>setAcWarnDismissed(true)} style={{background:"none",border:"none",color:"#F6AD55",cursor:"pointer",fontSize:16,padding:"0 0 0 8px",lineHeight:1}}>✕</button>
          </div>
        )}
        {showAmpWarn&&(
          <div style={alrt}>
            <span>⚠️ Battery output may be less than critical load draw ({peakA}A peak vs {maxOutputA}A required).</span>
            <button onClick={()=>setAmpWarnDismissed(true)} style={{background:"none",border:"none",color:"#F6AD55",cursor:"pointer",fontSize:16,padding:"0 0 0 8px",lineHeight:1}}>✕</button>
          </div>
        )}

        {/* Brand dropdown */}
        <div style={{marginBottom:12}}>
          <label style={lbl}>Brand</label>
          <select
            value={selectedBrand}
            onChange={e=>changeBrand(e.target.value)}
            style={{...inp,cursor:"pointer"}}>
            <option value="">— Select brand —</option>
            {BRANDS.map(br=><option key={br} value={br}>{br}</option>)}
          </select>
        </div>

        {/* Model rows */}
        {selectedBrand&&(
          <div style={{display:"grid",gap:8}}>
            {brandBatteries.map(b=>{
              const qty=battSel[b.id]||0;
              const needsPw3=b.requiresPw3&&!(battSel.pw3>0);
              return(
                <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  background:qty>0?"rgba(45,106,79,0.1)":"#161b27",borderRadius:8,
                  padding:"8px 12px",border:`1px solid ${qty>0?"#2D6A4F":"#2d3748"}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{b.name}</div>
                    <div style={{fontSize:11,color:"#68D391",marginTop:2}}>{b.powerKw} kW · {b.energyKwh} kWh</div>
                    {b.note&&<div style={{fontSize:10,color:"#F6AD55",marginTop:1}}>{b.note}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button disabled={needsPw3} onClick={()=>setBattQty(b.id,1)}
                      style={{width:26,height:26,borderRadius:5,border:"1px solid #2d3748",background:"#0f1623",color:"#9AE6B4",cursor:needsPw3?"not-allowed":"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <div style={{fontSize:14,fontWeight:700,color:qty>0?"#9AE6B4":"#718096",minWidth:18,textAlign:"center"}}>{qty}</div>
                    <button disabled={qty===0} onClick={()=>setBattQty(b.id,-1)}
                      style={{width:26,height:26,borderRadius:5,border:"1px solid #2d3748",background:"#0f1623",color:"#FC8181",cursor:qty===0?"not-allowed":"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Totals */}
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

      {/* Off-grid resilience chart */}
      {tKwh>0&&critPct>0&&(
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,color:"#9AE6B4",marginBottom:4}}>Off-Grid Resilience</div>
          <div style={{fontSize:11,color:"#718096",marginBottom:12}}>
            {Math.round(tKwh*10)/10} kWh · {demandPct}% demand
            {hasSolar!==false&&Object.values(solarMonthly).some(v=>v)&&" · amber = solar recharge"}
          </div>
          {renderBackupBars(180)}
          <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#4FD1C5",borderRadius:2}}/> Battery only</div>
            {hasSolar!==false&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#F6AD55",borderRadius:2}}/> + Solar recharge</div>}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button style={btnG} onClick={()=>setStep(0)}>← Back</button>
        <button style={{...btnP,flex:1}} onClick={()=>setStep(2)}>→ View Homeowner Proposal</button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Homeowner Proposal
  // ════════════════════════════════════════════════════════════════════════════
  const renderPage3=()=>{
    const totalH=d=>d.indefinite?Infinity:(d.battOnly||0)+(d.solarExtDays?d.solarExtDays*24:0);
    const worst=backupData.reduce((w,d)=>{if(d.indefinite||!d.battOnly)return w;return(!w||d.battOnly<w.battOnly)?d:w;},null);
    const best=backupData.reduce((b,d)=>{if(!d.battOnly&&!d.indefinite)return b;return(!b||totalH(d)>totalH(b))?d:b;},null);
    const battName=selectedBrand==="Tesla"?`Tesla Powerwall 3${battSel.pwdc>0?" + DC Expansion":""}`
      :selectedBrand==="Franklin"?"Franklin aPower 2"
      :selectedBrand==="Enphase"?`Enphase ${brandBatteries.filter(b=>(battSel[b.id]||0)>0).map(b=>b.name).join(" + ")}`
      :"Battery System";

    return(
      <div style={{display:"grid",gap:"1.25rem"}}>
        {/* Hero */}
        <div style={{background:"linear-gradient(135deg,#0d1a10,#0d1117)",border:"1px solid #2D6A4F",borderRadius:16,padding:"1.5rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#9AE6B4",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Your Energy Resilience &amp; Savings</div>
          <div style={{fontSize:22,fontWeight:800,color:"#e2e8f0",marginBottom:4}}>{Math.round(tKwh*10)/10} kWh · {Math.round(tKw*10)/10} kW</div>
          <div style={{fontSize:13,color:"#68D391"}}>{battName}</div>
        </div>

        {/* Two panels */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{...card,background:"#0d1a10",borderColor:"#1a4030"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#9AE6B4",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>Off-Grid Resilience</div>
            {worst&&(
              <div style={{textAlign:"center",marginBottom:8}}>
                <div style={{fontSize:10,color:"#4a5568",textTransform:"uppercase",marginBottom:2}}>Worst case ({worst.month})</div>
                <div style={{fontSize:24,fontWeight:800,color:"#4FD1C5"}}>{worst.battOnly>=48?`${Math.round(worst.battOnly/24)}d`:`${Math.round(worst.battOnly)}h`}</div>
              </div>
            )}
            {best&&!best.indefinite&&(
              <div style={{textAlign:"center",marginBottom:6}}>
                <div style={{fontSize:10,color:"#4a5568",textTransform:"uppercase",marginBottom:2}}>Best case ({best.month})</div>
                <div style={{fontSize:24,fontWeight:800,color:"#68D391"}}>
                  {(()=>{const t=totalH(best);return t>=48?`${Math.round(t/24)}d`:`${Math.round(t)}h`;})()}
                </div>
                {best.solarExtDays&&<div style={{fontSize:9,color:"#4a5568"}}>{fmtH(best.battOnly)} batt + {fmtH(best.solarExtDays*24)} solar</div>}
              </div>
            )}
            {best?.indefinite&&(
              <div style={{textAlign:"center",marginBottom:6}}>
                <div style={{fontSize:10,color:"#4a5568",textTransform:"uppercase",marginBottom:2}}>Best case ({best.month})</div>
                <div style={{fontSize:20,fontWeight:800,color:"#68D391"}}>Indefinite ∞</div>
                <div style={{fontSize:9,color:"#4a5568"}}>solar covers full demand</div>
              </div>
            )}
            <div style={{fontSize:10,color:"#4a5568",textAlign:"center",marginTop:4}}>{demandPct}% demand</div>
          </div>
          <div style={{...card,background:"#1a1700",borderColor:"#4a3800"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#D4A017",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>On-Grid Savings</div>
            <div style={{textAlign:"center",marginBottom:6}}>
              <div style={{fontSize:24,fontWeight:800,color:"#FFD700"}}>${vpp10Year.toLocaleString()}</div>
              <div style={{fontSize:10,color:"#8a7030"}}>10-year VPP value</div>
            </div>
            <div style={{fontSize:10,color:"#4a3800",textAlign:"center"}}>${vppOneTime.toLocaleString()} one-time + ${vppAnnual.toLocaleString()}/yr</div>
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
                return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{width:"100%",height:`${Math.max(4,(cum/vpp10Year)*60)}px`,background:"#D4A017",borderRadius:"2px 2px 0 0",opacity:0.8}}/>
                  <div style={{fontSize:8,color:"#8a7030"}}>Y{i+1}</div>
                </div>);
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

        {/* Expert design — at bottom of proposal */}
        <ExpertDesign/>

        <div style={{display:"flex",gap:10}}>
          <button style={btnG} onClick={()=>setStep(1)}>← Adjust design</button>
          <button style={{...btnG,flex:1}} onClick={()=>{setStep(0);setBattSel({});setSelectedBrand("");setBreakers([]);setPanelFile(null);setPanelFileName("");}}>↺ New proposal</button>
        </div>
        <div style={{fontSize:10,color:"#2d3748",textAlign:"center"}}>PSE rates and VPP program terms current as of 2026 · All savings are estimates</div>
      </div>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:"#0d1117",color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"2rem 1rem"}}>
      <div style={{width:"100%",maxWidth:680,marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#2D6A4F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔋</div>
          <div>
            <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.02em"}}>Battery Proposal Tool</div>
            <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.08em",textTransform:"uppercase"}}>PSE Edition · Resilience + Savings</div>
          </div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:680,background:"#161b27",borderRadius:16,padding:"1.75rem",border:"1px solid #1e2535"}}>
        <StepBar current={step}/>
        {step===0&&renderPage1()}
        {step===1&&renderPage2()}
        {step===2&&renderPage3()}
      </div>
      <div style={{marginTop:"1.5rem",fontSize:10,color:"#1e2535",maxWidth:600,textAlign:"center"}}>
        For installer use · PSE rate data current as of 2026 · Not a substitute for a professional site assessment
      </div>
    </div>
  );
}

