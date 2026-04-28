import { useState, useRef } from "react";

const API_BASE = "/api/solar";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const VPP_ONETIME = 1000;
const VPP_ANNUAL  = 500;

const BATTERIES = [
  { id:"pw3",   brand:"Tesla",    name:"Powerwall 3",      powerKw:11.5, energyKwh:13.5, acLimitKw:7.6,  dcLimitKw:20,   peakCurrentA:null, requiresPw3:false },
  { id:"pwdc",  brand:"Tesla",    name:"DC Expansion Pack", powerKw:0,    energyKwh:13.5, acLimitKw:0,    dcLimitKw:0,    peakCurrentA:null, requiresPw3:true  },
  { id:"fp2",   brand:"Franklin", name:"aPower 2",          powerKw:10,   energyKwh:15,   acLimitKw:8,    dcLimitKw:null, peakCurrentA:null, requiresPw3:false },
  { id:"iq5p",  brand:"Enphase",  name:"IQ Battery 5P",    powerKw:3.84, energyKwh:5,    acLimitKw:null, dcLimitKw:null, peakCurrentA:33.4, requiresPw3:false },
  { id:"iq10c", brand:"Enphase",  name:"IQ Battery 10C",   powerKw:7.08, energyKwh:10,   acLimitKw:null, dcLimitKw:null, peakCurrentA:56,   requiresPw3:false },
];
const BRANDS = ["Tesla","Franklin","Enphase"];

// ── helpers ──────────────────────────────────────────────────────────────────
function fileToBase64(f){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);}); }
async function callParsePanel(file){
  const d=await fileToBase64(file);
  const r=await fetch(API_BASE,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"parsePanel",imageBase64:d,mediaType:file.type})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||"Failed"); return j;
}
async function callParseEnergyFile(file,hint){
  const isImg=file.type.startsWith("image/")||file.type==="application/pdf";
  const d=await fileToBase64(file);
  const r=await fetch(API_BASE,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"parseEnergyDoc",[isImg?"imageBase64":"fileBase64"]:d,mediaType:file.type,hint})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||"Failed"); return j;
}
function totalKwh(s){return BATTERIES.reduce((t,b)=>t+(s[b.id]||0)*b.energyKwh,0);}
function totalKw(s) {return BATTERIES.reduce((t,b)=>t+(s[b.id]||0)*b.powerKw,0);}
function totalUnits(s){return BATTERIES.reduce((t,b)=>t+(s[b.id]||0),0);}
function totalPeakA(s){let t=0;for(const b of BATTERIES){const q=s[b.id]||0;if(!q)continue;if(b.peakCurrentA===null)return null;t+=b.peakCurrentA*q;}return t;}
function totalAcLimit(s){let t=0;for(const b of BATTERIES){const q=s[b.id]||0;if(!q)continue;if(b.acLimitKw===null)return null;t+=b.acLimitKw*q;}return t;}
const fmtH=h=>h>=48?`${Math.round(h/24)}d`:`${Math.round(h)}h`;
const sum=obj=>Object.values(obj).reduce((t,v)=>t+(parseFloat(v)||0),0);

// ── EnergyFileUpload ──────────────────────────────────────────────────────────
function EnergyFileUpload({label,hint,onParsed,accentColor="#40916C"}){
  const [parsing,setParsing]=useState(false);
  const [err,setErr]=useState("");
  const [ok,setOk]=useState("");
  const handle=async f=>{
    if(!f)return; setParsing(true);setErr("");setOk("");
    try{const r=await callParseEnergyFile(f,hint);onParsed(r);setOk(f.name);}
    catch(e){setErr(e.message);}finally{setParsing(false);}
  };
  return(
    <div style={{background:"#0f1623",border:`1px dashed ${accentColor}55`,borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:11,color:"#718096",marginBottom:4}}>📎 {label}</div>
      <div style={{fontSize:10,color:"#4a5568",marginBottom:6}}>Photo, PDF, Excel, CSV, or screenshot of chart</div>
      <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" style={{fontSize:11,color:"#718096"}} onChange={e=>handle(e.target.files[0])}/>
      {parsing&&<div style={{marginTop:5,fontSize:11,color:"#F6AD55"}}>🔍 Reading…</div>}
      {ok&&!parsing&&<div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {ok}</div>}
      {err&&<div style={{marginTop:5,fontSize:11,color:"#FC8181"}}>⚠️ {err}</div>}
    </div>
  );
}

// ── EnergyTable — side-by-side consumption + solar per month ─────────────────
function EnergyTable({usageMonthly,setUsageMonthly,solarMonthly,setSolarMonthly,hasSolar}){
  const ninp={background:"#0f1623",border:"1px solid #2d3748",borderRadius:6,color:"#e2e8f0",padding:"4px 6px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",textAlign:"right"};
  const totalU=sum(usageMonthly), totalS=sum(solarMonthly);
  return(
    <div style={{marginTop:8}}>
      <div style={{display:"grid",gridTemplateColumns:hasSolar!==false?"1fr 80px 80px":"1fr 80px",gap:4,marginBottom:4}}>
        <div style={{fontSize:10,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.04em"}}>Month</div>
        <div style={{fontSize:10,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"right"}}>Usage kWh</div>
        {hasSolar!==false&&<div style={{fontSize:10,color:"#D4A017",textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"right"}}>Solar kWh</div>}
      </div>
      {MONTHS.map(m=>(
        <div key={m} style={{display:"grid",gridTemplateColumns:hasSolar!==false?"1fr 80px 80px":"1fr 80px",gap:4,marginBottom:3}}>
          <div style={{fontSize:12,color:"#718096",display:"flex",alignItems:"center"}}>{m}</div>
          <input type="number" style={ninp} placeholder="—" value={usageMonthly[m]}
            onChange={e=>setUsageMonthly(p=>({...p,[m]:e.target.value}))}/>
          {hasSolar!==false&&<input type="number" style={{...ninp,borderColor:"#4a3800"}} placeholder="—" value={solarMonthly[m]}
            onChange={e=>setSolarMonthly(p=>({...p,[m]:e.target.value}))}/>}
        </div>
      ))}
      {/* Totals row */}
      <div style={{display:"grid",gridTemplateColumns:hasSolar!==false?"1fr 80px 80px":"1fr 80px",gap:4,marginTop:6,paddingTop:6,borderTop:"1px solid #2d3748"}}>
        <div style={{fontSize:11,fontWeight:600,color:"#a0aec0"}}>Annual total</div>
        <div style={{fontSize:11,fontWeight:700,color:"#9AE6B4",textAlign:"right"}}>{totalU>0?Math.round(totalU).toLocaleString():"-"}</div>
        {hasSolar!==false&&<div style={{fontSize:11,fontWeight:700,color:"#D4A017",textAlign:"right"}}>{totalS>0?Math.round(totalS).toLocaleString():"-"}</div>}
      </div>
    </div>
  );
}

// ── Solar vs Consumption bar chart ────────────────────────────────────────────
function EnergyChart({usageMonthly,solarMonthly,hasSolar}){
  const maxVal=Math.max(...MONTHS.map(m=>Math.max(parseFloat(usageMonthly[m])||0,parseFloat(solarMonthly[m])||0)),1);
  const hasAnyUsage=MONTHS.some(m=>parseFloat(usageMonthly[m])>0);
  const hasAnySolar=hasSolar!==false&&MONTHS.some(m=>parseFloat(solarMonthly[m])>0);
  if(!hasAnyUsage) return null;
  return(
    <div style={{marginTop:14}}>
      <div style={{fontSize:11,fontWeight:600,color:"#a0aec0",marginBottom:8}}>Monthly energy overview</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height:100}}>
        {MONTHS.map(m=>{
          const u=parseFloat(usageMonthly[m])||0;
          const s=parseFloat(solarMonthly[m])||0;
          const uPct=u/maxVal; const sPct=s/maxVal;
          return(
            <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:"100%",display:"flex",flexDirection:"row",alignItems:"flex-end",gap:1,height:85,justifyContent:"center"}}>
                {u>0&&<div style={{flex:1,height:`${Math.max(3,uPct*85)}px`,background:"#4FD1C5",borderRadius:"2px 2px 0 0",opacity:0.85}}/>}
                {hasAnySolar&&s>0&&<div style={{flex:1,height:`${Math.max(3,sPct*85)}px`,background:"#F6AD55",borderRadius:"2px 2px 0 0",opacity:0.85}}/>}
                {u===0&&<div style={{flex:1,height:3,background:"#1e2535",borderRadius:"2px 2px 0 0"}}/>}
              </div>
              <div style={{fontSize:8,color:"#4a5568"}}>{m}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:14,marginTop:6,justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#4FD1C5",borderRadius:1}}/> Consumption</div>
        {hasAnySolar&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#F6AD55",borderRadius:1}}/> Solar production</div>}
      </div>
    </div>
  );
}

// ── PanelGraphic ──────────────────────────────────────────────────────────────
// Breakers have: position (slot #, odd=left col, even=right col), poles (1 or 2), amps, name, critical, id
function PanelGraphic({breakers,onToggle,onRename,mainAmps}){
  // Sort by position; build slot map
  const sorted=[...breakers].sort((a,b)=>(a.position||0)-(b.position||0));
  // Assign slots: odd positions → left column, even → right column
  // For 2-pole breakers: occupy their slot and the next slot on same side, shown taller
  const left=[], right=[];
  const placed=new Set();
  for(const b of sorted){
    if(placed.has(b.id)) continue;
    const pos=b.position||0;
    const isLeft=pos===0||(pos%2===1); // odd=left, even=right, 0=left fallback
    if(isLeft) left.push(b); else right.push(b);
    placed.add(b.id);
  }
  // If no positions returned, fall back to alternating
  const hasPos=breakers.some(b=>b.position>0);
  const leftCol=hasPos?left:breakers.filter((_,i)=>i%2===0);
  const rightCol=hasPos?right:breakers.filter((_,i)=>i%2===1);
  const maxRows=Math.max(leftCol.length,rightCol.length);

  const Slot=({b,side})=>{
    if(!b) return <div style={{height:36}}/>;
    const on=b.critical;
    const h=b.poles===2?78:36; // 2-pole = double height
    return(
      <div onClick={()=>onToggle(b.id)} style={{
        display:"flex",alignItems:"center",gap:5,padding:"4px 7px",borderRadius:5,cursor:"pointer",
        height:h,background:on?"rgba(72,187,120,0.15)":"rgba(60,60,70,0.4)",
        border:`1px solid ${on?"#2D6A4F":"#2a2a3a"}`,transition:"all 0.15s",userSelect:"none",
        flexDirection:side==="right"?"row-reverse":"row",
      }}>
        <div style={{width:13,height:h-8,borderRadius:3,flexShrink:0,background:on?"#2D6A4F":"#1a1a2a",border:`1px solid ${on?"#40916C":"#333"}`,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:on?"2px":"auto",bottom:on?"auto":"2px",left:2,right:2,height:10,background:on?"#9AE6B4":"#444",borderRadius:2,transition:"all 0.15s"}}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          {b.name==="Unknown"
            ?<input style={{background:"transparent",border:"none",color:on?"#9AE6B4":"#718096",fontSize:10,outline:"none",width:"100%"}}
                placeholder="Rename…" defaultValue="" onClick={e=>e.stopPropagation()}
                onBlur={e=>{const n=e.target.value.trim()||"Unknown";onRename(b.id,n);}}/>
            :<div style={{fontSize:10,color:on?"#9AE6B4":"#718096",textAlign:side==="right"?"right":"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>}
          <div style={{fontSize:9,color:on?"#4a9070":"#444",textAlign:side==="right"?"right":"left"}}>
            {b.poles===2?"2-pole · ":""}{b.amps}A
          </div>
        </div>
      </div>
    );
  };

  return(
    <div style={{background:"#0d1117",borderRadius:10,border:"2px solid #2d3748",padding:"10px",fontFamily:"monospace"}}>
      {/* Main breaker */}
      <div style={{background:"#1a2535",borderRadius:6,padding:"5px 10px",marginBottom:8,textAlign:"center",border:"1px solid #2d3748",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <div style={{flex:1,height:16,background:"#2d3748",borderRadius:3,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
        <div style={{fontSize:11,color:"#a0aec0",fontWeight:600,whiteSpace:"nowrap"}}>{mainAmps||200}A Main</div>
        <div style={{flex:1,height:16,background:"#2d3748",borderRadius:3,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:"3px 6px",background:"#40916C",borderRadius:2,opacity:0.8}}/>
        </div>
      </div>
      <div style={{height:3,background:"#1a2535",borderRadius:2,marginBottom:6,border:"1px solid #2d3748"}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
        {Array.from({length:maxRows},(_,i)=>(
          [<Slot key={`L${i}`} b={leftCol[i]||null} side="left"/>,
           <Slot key={`R${i}`} b={rightCol[i]||null} side="right"/>]
        )).flat()}
      </div>
      <div style={{display:"flex",gap:14,marginTop:8,justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}><div style={{width:8,height:8,background:"#2D6A4F",borderRadius:1}}/> Critical (on)</div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#718096"}}><div style={{width:8,height:8,background:"#1a1a2a",border:"1px solid #333",borderRadius:1}}/> Non-critical (off)</div>
      </div>
    </div>
  );
}

// ── StepBar ───────────────────────────────────────────────────────────────────
function StepBar({current}){
  const steps=["Enter Data","Design & Loads","Proposal"];
  return(
    <div style={{display:"flex",alignItems:"center",marginBottom:"1.75rem"}}>
      {steps.map((label,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:0}}>
          <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
            background:i<current?"#2D6A4F":i===current?"#40916C":"transparent",
            border:i<=current?"2px solid #40916C":"2px solid #333",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:600,color:i<=current?"#fff":"#555"}}>
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

// ── mergeBreakers ────────────────────────────────────────────────────────────
// Called immediately after Claude returns raw breaker data.
// Strategy:
//   1. Claude is now instructed to return 2-pole breakers as ONE entry.
//      If it does, poles===2 and there is no duplicate — we keep it as-is.
//   2. As a safety net: if Claude returns TWO entries for the same 2-pole
//      breaker (same name, same column side, both poles===2), we merge them
//      into the one with the lower slot number and count amps only once.
//   3. If a 2-pole breaker has no partner at all (Claude got it right the
//      first time), it passes through unchanged.
// After merging, breakers are sorted by position so PanelGraphic renders
// them in the correct physical order.
function mergeBreakers(raw) {
  const used = new Set();
  const out  = [];

  // Sort by position first so lower slot always wins when collapsing
  const sorted = [...raw].sort((a, b) => (a.position||0) - (b.position||0));

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const b = sorted[i];

    if (b.poles === 2) {
      // Look for a duplicate: same name, same column side (odd/even), also poles===2
      const sideA = (b.position || 1) % 2; // 1=left-col, 0=right-col
      const dupeIdx = sorted.findIndex((other, j) =>
        j > i &&
        !used.has(j) &&
        other.poles === 2 &&
        (other.position || 0) % 2 === sideA &&
        other.name.trim().toLowerCase() === b.name.trim().toLowerCase()
      );
      if (dupeIdx !== -1) {
        // Collapse: keep lower position (b), discard dupeIdx
        used.add(dupeIdx);
      }
      // Whether or not a dupe was found, keep b (with poles:2) as one circuit
      used.add(i);
      out.push({ ...b });
    } else {
      used.add(i);
      out.push({ ...b });
    }
  }

  return out.sort((a, b) => (a.position||0) - (b.position||0));
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function BatteryProposalTool(){
  const [step,setStep]=useState(0);

  // Page 1
  const [hasSolar,setHasSolar]=useState(null);
  const [coupling,setCoupling]=useState("ac");
  const [solarKwDc,setSolarKwDc]=useState("");
  const [solarMonthly,setSolarMonthly]=useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [usageMonthly,setUsageMonthly]=useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [showTable,setShowTable]=useState(false);
  const [panelFile,setPanelFile]=useState(null);
  const [panelFileName,setPanelFileName]=useState("");

  // Page 2
  const [breakers,setBreakers]=useState([]);
  const [mainAmps,setMainAmps]=useState(200);
  const [parsingPanel,setParsingPanel]=useState(false);
  const [parseError,setParseError]=useState("");
  const [selectedBrand,setSelectedBrand]=useState("");
  const [battSel,setBattSel]=useState({});
  const [acWarnOff,setAcWarnOff]=useState(false);
  const [ampWarnOff,setAmpWarnOff]=useState(false);

  // Page 3
  const [systemPrice,setSystemPrice]=useState("");
  const proposalRef=useRef(null);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const tKwh=totalKwh(battSel), tKw=totalKw(battSel), tUnits=totalUnits(battSel);
  const vppOneTime=tUnits*VPP_ONETIME, vppAnnual=tUnits*VPP_ANNUAL, vpp10Year=vppOneTime+vppAnnual*10;

  const critBreakers=breakers.filter(b=>b.critical);
  const allCritical=breakers.length>0&&critBreakers.length===breakers.length;
  // breakers are already merged (one entry per circuit) — no dedup needed
  const totalBreakerA=breakers.reduce((s,b)=>s+b.amps,0);
  const critBreakerA=critBreakers.reduce((s,b)=>s+b.amps,0);
  const demandPct=totalBreakerA>0?Math.round(critBreakerA/totalBreakerA*100):0;
  const maxOutputA=critBreakerA>0?Math.round(critBreakerA/1.25*10)/10:0;
  const critPct=breakers.length>0?critBreakers.length/breakers.length:0;

  const solarKwNum=parseFloat(solarKwDc)||0;
  const acLimit=totalAcLimit(battSel);
  const showAcWarn=!acWarnOff&&hasSolar!==false&&solarKwNum>0&&acLimit!==null&&acLimit<solarKwNum&&tKwh>0;
  const peakA=totalPeakA(battSel);
  const showAmpWarn=!ampWarnOff&&peakA!==null&&peakA>0&&peakA<maxOutputA&&maxOutputA>0;
  // DC expansion without pw3
  const showDcWarn=(battSel.pwdc||0)>0&&!(battSel.pw3>0);

  // Backup chart data
  // Chart max = max of finite values only; infinite bars drawn at chart max height
  const backupData=MONTHS.map((m,i)=>{
    const uNum=parseFloat(usageMonthly[m])||0;
    const sNum=parseFloat(solarMonthly[m])||0;
    if(!uNum||!tKwh||!critPct) return {month:m,battOnly:null,solarExtDays:null,indefinite:false};
    const hourlyDemand=(uNum/DAYS[i]/24)*critPct;
    const battOnly=tKwh/hourlyDemand;
    let solarExtDays=null,indefinite=false;
    if(hasSolar!==false&&sNum>0){
      const net=(hourlyDemand*24)-(sNum/DAYS[i]);
      if(net<=0){
        indefinite=true;
      } else {
        solarExtDays=tKwh/net;
        // If combined backup (battery + solar recharge) exceeds 30 days,
        // treat as indefinite so the Y-axis stays readable for other months
        if(battOnly+(solarExtDays*24) > 720) indefinite=true;
      }
    }
    return {month:m,battOnly,solarExtDays:indefinite?null:solarExtDays,indefinite};
  });
  // chartMaxH based on finite values only
  const finiteMaxH=Math.max(...backupData.map(d=>{
    if(d.indefinite||!d.battOnly) return 0;
    return d.battOnly+(d.solarExtDays?d.solarExtDays*24:0);
  }),1);
  const chartMaxH=finiteMaxH;

  // ── Styles ────────────────────────────────────────────────────────────────────
  const card={background:"#1e2535",borderRadius:12,padding:"1.25rem",border:"1px solid #2d3748"};
  const inp={width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl={fontSize:10,color:"#718096",marginBottom:3,display:"block",fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"};
  const btnP={padding:"11px 22px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"#2D6A4F",color:"#fff"};
  const btnG={padding:"9px 18px",borderRadius:8,cursor:"pointer",fontSize:12,background:"transparent",border:"1px solid #2d3748",color:"#718096"};
  const btnS={padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:11,background:"transparent",border:"1px solid #2d3748",color:"#4a5568"};
  const pill=a=>({padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:a?"#2D6A4F":"#1a202c",color:a?"#9AE6B4":"#718096",border:a?"1px solid #2D6A4F":"1px solid #2d3748"});
  const alrt={display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:8,background:"rgba(246,173,85,0.1)",color:"#F6AD55",border:"1px solid rgba(246,173,85,0.3)"};
  const errAlrt={display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:8,background:"rgba(252,129,129,0.1)",color:"#FC8181",border:"1px solid rgba(252,129,129,0.3)"};

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleEnergyParsed=r=>{
    if(r.monthlyUsageKwh){const n={...usageMonthly};Object.entries(r.monthlyUsageKwh).forEach(([m,v])=>{if(MONTHS.includes(m))n[m]=String(v);});setUsageMonthly(n);setShowTable(true);}
    if(r.monthlySolarKwh){const n={...solarMonthly};Object.entries(r.monthlySolarKwh).forEach(([m,v])=>{if(MONTHS.includes(m))n[m]=String(v);});setSolarMonthly(n);setShowTable(true);}
  };

  const handleParsePanel=async file=>{
    if(!file)return; setParsingPanel(true);setParseError("");
    try{
      const r=await callParsePanel(file);
      if(!r.breakers?.length)throw new Error("No breakers detected");
      if(r.mainAmps)setMainAmps(r.mainAmps);
      // Assign ids and defaults, then merge 2-pole pairs into single circuits
      const raw=r.breakers.map((b,i)=>({
        ...b,
        id:`b_${i}`,
        name:b.name||"Unknown",
        critical:false,
        position:b.position||i+1,
        poles:b.poles||1,
      }));
      setBreakers(mergeBreakers(raw));
    }catch(e){setParseError(e.message);}finally{setParsingPanel(false);}
  };

  const setBattQty=(id,delta)=>{
    const b=BATTERIES.find(x=>x.id===id);
    if(selectedBrand&&selectedBrand!==b.brand)return;
    const next=Math.max(0,Math.min(5,(battSel[id]||0)+delta));
    const ns={...battSel,[id]:next};
    setBattSel(ns);setAcWarnOff(false);setAmpWarnOff(false);
  };

  const changeBrand=brand=>{setSelectedBrand(brand);setBattSel({});setAcWarnOff(false);setAmpWarnOff(false);};

  const selectAllLoads=()=>setBreakers(p=>p.map(b=>({...b,critical:true})));

  // ── Chart ─────────────────────────────────────────────────────────────────────
  const yTicks=maxH=>{
    const step=maxH<=48?12:maxH<=168?24:maxH<=720?168:720;
    const t=[];for(let v=0;v<=maxH;v+=step)t.push(v);
    if(t[t.length-1]<maxH)t.push(Math.ceil(maxH/step)*step);
    return t;
  };

  const renderBackupBars=chartH=>{
    const barAreaH=chartH-28,maxH=chartMaxH,ticks=yTicks(maxH);
    return(
      <div style={{display:"flex",gap:0}}>
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",paddingBottom:18,marginRight:4,minWidth:30}}>
          {ticks.map(t=><div key={t} style={{fontSize:8,color:"#4a5568",textAlign:"right",lineHeight:1,whiteSpace:"nowrap"}}>{t===0?"0":fmtH(t)}</div>)}
        </div>
        <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:3,height:chartH,position:"relative"}}>
          {ticks.filter(t=>t>0).map(t=><div key={t} style={{position:"absolute",left:0,right:0,bottom:18+(t/maxH)*barAreaH,height:1,background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>)}
          {backupData.map(({month,battOnly,solarExtDays,indefinite})=>{
            // Empty month
            if(!battOnly&&!indefinite) return(
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{flex:1,width:"100%",background:"#1e2535",borderRadius:"2px 2px 0 0",minHeight:3}}/>
                <div style={{fontSize:8,color:"#4a5568",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            // Indefinite — draw at full chart height, label ∞
            if(indefinite){
              const battPx=Math.max(3,Math.round((battOnly/maxH)*barAreaH));
              const solPx=barAreaH-battPx; // fill to top
              return(
                <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{fontSize:7,color:"#F6AD55",fontWeight:700,textAlign:"center",height:10,lineHeight:"10px"}}>∞</div>
                  <div style={{flex:1,width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                    {solPx>0&&<div style={{width:"100%",height:solPx,background:"#F6AD55",opacity:0.85,borderRadius:"2px 2px 0 0",position:"relative"}}>
                      {solPx>14&&<div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",fontSize:7,color:"#7a5500",fontWeight:700}}>∞</div>}
                    </div>}
                    <div style={{width:"100%",height:Math.max(3,battPx),background:"#4FD1C5",opacity:0.9,borderRadius:solPx>0?"0":"2px 2px 0 0",position:"relative"}}>
                      {battPx>14&&<div style={{position:"absolute",top:2,left:0,right:0,textAlign:"center",fontSize:7,color:"#1a4a45",fontWeight:700}}>{fmtH(battOnly)}</div>}
                    </div>
                  </div>
                  <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
                </div>
              );
            }
            // Normal finite bar
            const battPct=Math.min(1,battOnly/maxH);
            const solPct=solarExtDays?Math.min(1-battPct,(solarExtDays*24)/maxH):0;
            const battPx=Math.max(3,Math.round(battPct*barAreaH));
            const solPx=Math.round(solPct*barAreaH);
            const totalH=battOnly+(solarExtDays?solarExtDays*24:0);
            return(
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                {solPx>0&&<div style={{fontSize:7,color:"#F6AD55",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>{fmtH(totalH)}</div>}
                {solPx===0&&<div style={{fontSize:7,color:"#4FD1C5",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>{fmtH(battOnly)}</div>}
                <div style={{flex:1,width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
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

  // ── Download proposal ─────────────────────────────────────────────────────────
  const downloadProposal=()=>{
    const el=proposalRef.current;
    if(!el)return;
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Battery System Proposal</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e2e8f0;margin:0;padding:2rem;}
  *{box-sizing:border-box;}
  ${Array.from(document.styleSheets).map(s=>{try{return Array.from(s.cssRules).map(r=>r.cssText).join('');}catch{return '';}}).join('')}
</style></head><body>${el.innerHTML}</body></html>`;
    const blob=new Blob([html],{type:"text/html"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="battery-proposal.html"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Expert Design ─────────────────────────────────────────────────────────────
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
      <textarea placeholder="Customer goals and notes…" style={{...inp,height:60,resize:"vertical",fontSize:12,marginBottom:10}}/>
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

      {/* Energy data */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Energy data</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:10}}>
          Upload a utility bill, "Download My Data" CSV from your utility portal, solar monitoring CSV (Enphase/SolarEdge/Tesla), or a screenshot. Or enter values manually below.
        </div>
        <div style={{display:"grid",gap:8}}>
          <EnergyFileUpload label="Upload utility bill or usage data" hint="usage" accentColor="#40916C" onParsed={handleEnergyParsed}/>
          {hasSolar!==false&&<EnergyFileUpload label="Upload solar production data" hint="solar" accentColor="#D4A017" onParsed={handleEnergyParsed}/>}
        </div>
        <div style={{marginTop:10}}>
          <button style={btnS} onClick={()=>setShowTable(v=>!v)}>{showTable?"▲ Hide":"▼ Enter"} monthly values manually</button>
        </div>
        {showTable&&<EnergyTable usageMonthly={usageMonthly} setUsageMonthly={setUsageMonthly} solarMonthly={solarMonthly} setSolarMonthly={setSolarMonthly} hasSolar={hasSolar}/>}
        <EnergyChart usageMonthly={usageMonthly} solarMonthly={solarMonthly} hasSolar={hasSolar}/>
      </div>

      {/* Solar */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:8}}>Solar system</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={pill(hasSolar===true)}  onClick={()=>setHasSolar(true)}>Yes</button>
          <button style={pill(hasSolar===false)} onClick={()=>setHasSolar(false)}>No</button>
        </div>
        {hasSolar!==false&&(
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
        )}
      </div>

      {/* Panel upload */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Electrical panel</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:10}}>Upload a photo — Claude reads every breaker automatically.</div>
        <div style={{background:"#0f1623",border:"1px dashed #2d3748",borderRadius:8,padding:"10px 12px"}}>
          <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
            onChange={e=>{const f=e.target.files[0];if(f){setPanelFile(f);setPanelFileName(f.name);}}}/>
          {panelFileName&&<div style={{marginTop:5,fontSize:11,color:"#68D391"}}>✓ {panelFileName} — will be parsed on next page</div>}
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
  const brandBatteries=BATTERIES.filter(b=>b.brand===selectedBrand);

  const renderPage2=()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>

      {/* Panel */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>Electrical panel</div>
            {mainAmps>0&&<span style={{fontSize:11,color:"#a0aec0",background:"#0f1623",border:"1px solid #2d3748",borderRadius:6,padding:"2px 8px"}}>{mainAmps}A Main</span>}
          </div>
          <button style={{...btnG,fontSize:11}} onClick={()=>{setBreakers([]);setPanelFile(null);setPanelFileName("");}}>↺ Re-parse</button>
        </div>

        {parsingPanel&&<div style={{fontSize:12,color:"#F6AD55",marginBottom:8}}>Reading your panel…</div>}
        {parseError&&<div style={{fontSize:12,color:"#FC8181",marginBottom:8}}>⚠️ {parseError}</div>}

        {breakers.length===0&&!parsingPanel&&(
          <div style={{background:"#0f1623",border:"1px dashed #2d3748",borderRadius:8,padding:"12px"}}>
            <div style={{fontSize:12,color:"#718096",marginBottom:8}}>Upload panel photo here if not done on previous page:</div>
            <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
              onChange={e=>{const f=e.target.files[0];if(f){setPanelFile(f);setPanelFileName(f.name);handleParsePanel(f);}}}/>
          </div>
        )}

        {breakers.length>0&&(
          <>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
              <div style={{fontSize:11,color:"#718096"}}>Click a breaker to mark it critical. Click again to deselect.</div>
              <button style={{...pill(allCritical),padding:"4px 10px",fontSize:10}} onClick={selectAllLoads}>
                {allCritical?"✓ Whole-home backup":"Whole-home backup"}
              </button>
            </div>
            <PanelGraphic
              breakers={breakers} mainAmps={mainAmps}
              onToggle={id=>setBreakers(p=>p.map(x=>x.id===id?{...x,critical:!x.critical}:x))}
              onRename={(id,name)=>setBreakers(p=>p.map(x=>x.id===id?{...x,name}:x))}
            />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#68D391"}}>{demandPct}%</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>% demand</div>
                <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{critBreakerA}A / {totalBreakerA}A total</div>
              </div>
              <div style={{background:"#0f1623",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,color:"#F6AD55"}}>{maxOutputA}A</div>
                <div style={{fontSize:10,color:"#718096",marginTop:2,textTransform:"uppercase"}}>max output</div>
                <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{critBreakerA}A ÷ 1.25 NEC</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Battery selection */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:10}}>Battery selection</div>
        {showDcWarn&&<div style={errAlrt}><span>⚠️ DC Expansion Pack requires at least 1 Powerwall 3.</span></div>}
        {showAcWarn&&<div style={alrt}><span>⚠️ Solar system size exceeds battery's AC coupling limit ({solarKwNum} kW DC &gt; {acLimit} kW).</span><button onClick={()=>setAcWarnOff(true)} style={{background:"none",border:"none",color:"#F6AD55",cursor:"pointer",fontSize:16,padding:"0 0 0 8px"}}>✕</button></div>}
        {showAmpWarn&&<div style={alrt}><span>⚠️ Battery output may be less than critical load draw ({peakA}A peak vs {maxOutputA}A required).</span><button onClick={()=>setAmpWarnOff(true)} style={{background:"none",border:"none",color:"#F6AD55",cursor:"pointer",fontSize:16,padding:"0 0 0 8px"}}>✕</button></div>}

        <div style={{marginBottom:12}}>
          <label style={lbl}>Brand</label>
          <select value={selectedBrand} onChange={e=>changeBrand(e.target.value)} style={{...inp,cursor:"pointer"}}>
            <option value="">— Select brand —</option>
            {BRANDS.map(br=><option key={br} value={br}>{br}</option>)}
          </select>
        </div>

        {selectedBrand&&(
          <div style={{display:"grid",gap:8}}>
            {brandBatteries.map(b=>{
              const qty=battSel[b.id]||0;
              const needsPw3=b.requiresPw3&&!(battSel.pw3>0);
              return(
                <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  background:qty>0?"rgba(45,106,79,0.1)":"#161b27",borderRadius:8,padding:"8px 12px",
                  border:`1px solid ${qty>0?"#2D6A4F":"#2d3748"}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{b.name}</div>
                    <div style={{fontSize:11,color:"#68D391",marginTop:2}}>{b.powerKw} kW · {b.energyKwh} kWh</div>
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

      {/* Off-grid chart */}
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
  // PAGE 3 — Proposal
  // ════════════════════════════════════════════════════════════════════════════
  const renderPage3=()=>{
    const totalH=d=>d.indefinite?Infinity:(d.battOnly||0)+(d.solarExtDays?d.solarExtDays*24:0);
    const worst=backupData.reduce((w,d)=>{if(d.indefinite||!d.battOnly)return w;return(!w||d.battOnly<w.battOnly)?d:w;},null);
    const best=backupData.reduce((b,d)=>{if(!d.battOnly&&!d.indefinite)return b;return(!b||totalH(d)>totalH(b))?d:b;},null);
    const battName=selectedBrand==="Tesla"?`Tesla Powerwall 3${battSel.pwdc>0?" + DC Expansion":""}`
      :selectedBrand==="Franklin"?"Franklin aPower 2"
      :selectedBrand==="Enphase"?`Enphase ${BATTERIES.filter(b=>(battSel[b.id]||0)>0).map(b=>b.name).join(" + ")}`
      :"Battery System";
    const priceNum=parseFloat(systemPrice.replace(/[^0-9.]/g,""));
    const annualUsage=sum(usageMonthly);

    return(
      <div>
        {/* Price input — above proposal, not printed */}
        <div style={{...card,marginBottom:12,border:"1px solid #4a3800",background:"#1a1700"}}>
          <div style={{fontSize:12,fontWeight:600,color:"#D4A017",marginBottom:6}}>System price (installer only — shown on proposal)</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{color:"#718096",fontSize:14}}>$</span>
            <input style={{...inp,maxWidth:200}} type="text" placeholder="e.g. 18,500"
              value={systemPrice} onChange={e=>setSystemPrice(e.target.value)}/>
          </div>
        </div>

        {/* Download button */}
        <button onClick={downloadProposal}
          style={{...btnP,width:"100%",marginBottom:16,background:"#1a3a2a",border:"1px solid #2D6A4F",color:"#9AE6B4",fontSize:13}}>
          ⬇ Download Proposal (HTML)
        </button>

        {/* ── PROPOSAL CONTENT (captured for download) ── */}
        <div ref={proposalRef} style={{display:"grid",gap:"1.25rem"}}>

          {/* Hero */}
          <div style={{background:"linear-gradient(135deg,#0d1a10,#0d1117)",border:"1px solid #2D6A4F",borderRadius:16,padding:"1.5rem",textAlign:"center"}}>
            <div style={{fontSize:11,color:"#9AE6B4",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Your Energy Resilience &amp; Savings</div>
            <div style={{fontSize:22,fontWeight:800,color:"#e2e8f0",marginBottom:4}}>{Math.round(tKwh*10)/10} kWh · {Math.round(tKw*10)/10} kW</div>
            <div style={{fontSize:13,color:"#68D391"}}>{battName}</div>
          </div>

          {/* Backup chart — off-grid resilience */}
          {backupData.some(d=>d.battOnly||d.indefinite)&&<div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#9AE6B4",marginBottom:4}}>Off-Grid Resilience</div>
            <div style={{fontSize:11,color:"#718096",marginBottom:12}}>Battery backup duration by month</div>
            {renderBackupBars(160)}
            <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#4FD1C5",borderRadius:2}}/> Battery only</div>
              {hasSolar!==false&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}><div style={{width:10,height:10,background:"#F6AD55",borderRadius:2}}/> + Solar recharge</div>}
            </div>
          </div>}

          {/* On-grid savings: summary + VPP chart combined */}
          {vppAnnual>0&&<div style={{...card,background:"#1a1700",borderColor:"#4a3800"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#D4A017",marginBottom:12}}>On-Grid Savings — PSE Virtual Power Plant</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <div style={{background:"#0f0e00",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#FFD700"}}>${vpp10Year.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#8a7030",marginTop:2,textTransform:"uppercase"}}>10-year total</div>
              </div>
              <div style={{background:"#0f0e00",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"#FFD700"}}>${vppAnnual.toLocaleString()}<span style={{fontSize:12,fontWeight:400}}>/yr</span></div>
                <div style={{fontSize:10,color:"#8a7030",marginTop:2,textTransform:"uppercase"}}>annual recurring</div>
              </div>
            </div>
            <div style={{fontSize:10,color:"#4a3800",marginBottom:10,textAlign:"center"}}>${vppOneTime.toLocaleString()} one-time incentive + up to ${vppAnnual.toLocaleString()}/battery/yr</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:70}}>
              {Array.from({length:10},(_,i)=>{const cum=vppOneTime+vppAnnual*(i+1);return(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{width:"100%",height:`${Math.max(4,(cum/vpp10Year)*60)}px`,background:"#D4A017",borderRadius:"2px 2px 0 0",opacity:0.8}}/>
                  <div style={{fontSize:8,color:"#8a7030"}}>Y{i+1}</div>
                </div>
              );})}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#8a7030",marginTop:4}}>
              <span>Year 1: ${(vppOneTime+vppAnnual).toLocaleString()}</span><span>Year 10: ${vpp10Year.toLocaleString()}</span>
            </div>
          </div>}

          {/* System details + critical loads */}
          <div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:10}}>System details</div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1a202c",fontSize:13,fontWeight:600}}>
              <span style={{color:"#718096"}}>Energy storage</span>
              <span style={{color:"#9AE6B4"}}>{Math.round(tKwh*10)/10} kWh</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1a202c",fontSize:13,fontWeight:600}}>
              <span style={{color:"#718096"}}>Power output</span>
              <span style={{color:"#68D391"}}>{Math.round(tKw*10)/10} kW</span>
            </div>


            {/* % demand + critical loads */}
            {breakers.length>0&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #1a202c"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8}}>
                <span style={{color:"#718096"}}>% demand during outage</span>
                <span style={{color:"#68D391",fontWeight:600}}>{demandPct}%</span>
              </div>
              <div style={{fontSize:11,color:"#718096",marginBottom:5}}>Critical loads:</div>
              {allCritical
                ?<div style={{fontSize:12,color:"#9AE6B4",fontStyle:"italic"}}>Whole-home backup — all circuits selected</div>
                :<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {critBreakers.map(b=><span key={b.id} style={{background:"rgba(45,106,79,0.2)",border:"1px solid #2D6A4F",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#9AE6B4"}}>{b.name} ({b.amps}A)</span>)}
                  {critBreakers.length===0&&<span style={{fontSize:11,color:"#4a5568",fontStyle:"italic"}}>No critical loads selected</span>}
                </div>}
            </div>}
          </div>

          {/* System price — shown just above expert design */}
          {priceNum>0&&<div style={{...card,border:"1px solid #4a3800",background:"#1a1700"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#D4A017"}}>System investment</div>
                <div style={{fontSize:11,color:"#8a7030",marginTop:2}}>Total installed price</div>
              </div>
              <div style={{fontSize:26,fontWeight:800,color:"#FFD700"}}>${priceNum.toLocaleString()}</div>
            </div>
          </div>}

          {/* Expert design */}
          <ExpertDesign/>
        </div>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button style={btnG} onClick={()=>setStep(1)}>← Adjust design</button>
          <button style={{...btnG,flex:1}} onClick={()=>{setStep(0);setBattSel({});setSelectedBrand("");setBreakers([]);setPanelFile(null);setPanelFileName("");setSystemPrice("");}}>↺ New proposal</button>
        </div>
        <div style={{fontSize:10,color:"#2d3748",textAlign:"center",marginTop:8}}>PSE rates and VPP program terms current as of 2026 · All savings are estimates</div>
      </div>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────────
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
      <div style={{marginTop:"1.5rem",fontSize:10,color:"#1e2535",maxWidth:600,textAlign:"center"}}>For installer use · PSE rate data current as of 2026 · Not a substitute for a professional site assessment</div>
    </div>
  );
}
