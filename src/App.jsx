import { useState, useRef, useEffect } from "react";

const API_BASE = "/api/solar";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const PSE_RATE    = 0.20;
const VPP_ONETIME = 1000;
const VPP_ANNUAL  = 500;

const POWERWALL_IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCACAAIADASIAAhEBAxEB/8QAGwABAAMBAQEBAAAAAAAAAAAAAAUGBwQDAgH/xAA4EAABAwMCBAQDBgYDAQAAAAAAAQIDBAURBhIhMUEHE1FhgRQiMmJxkRVCUqEjJDNDU7HC0fD/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAgMBBP/EAB8RAQEBAAMAAgMAAAAAAAAAAAABAgMREiExE0H/2gAMAwEAAhEDEQA/AP1SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4qKiGjp5J6maOCCNquke9yNa1E4qqr2JkqMdldU1l2qHQWuRYrfAqxyzJ2vmX+lv6d/c8q9XXPaGkdVWigRqKyVJqiZyKxq8Uc1vfs1FSXHJ7m3p5aKSa31MOUXe2VH9b29vC9O64vJyilKPyOJjQ1OYq0gAAAAAAAAAABhcY62xqXq7j1ddcbfR00E1XaGsmayhkTvGz3Jg1bPY+0AAAAAAB+Jpo6eF80z2xxMarnveqIiJ4qq9gMaS6r0bVsNcmbbDVSJLT3B7rksnlVy8s5T7Z/fHktWe9a9opJJLXVy5TsWFiX/wBUifzNX9SPl95ZoKyCqjhqYZY5HQSJJGjmqqsa5FaqqncFRAAxqrqvRtXQ1yZttNVIktPcHuuSyeVXLy zlDP2z+2OS1Z71r2ikklFdblVTtasSUML6iVc8uaMaicePtdW+TJdDPVVdO6tjtsMVasbZI6WqmdGkrEXvFIjmLwX7qvt5Hp7XXMbQ1E1wnqq6aSZ0kFPNNHHDHlVVrWoxFVEVV5KvHPiSyAa2zrpbQjr3dammtsNIy4vqJqiSmfGitY2NrXPVUR7n8URPcjk5ycVlnBM29Dbgm82SmxQSZqakejJHN5I1xFcidvBTIAAAAAAAAAAAAAAAAgW+XiRrGRtX6HNaqqMSRyrHk5LNjGjTMbq/RfCWx+9RWHVul4dU6eu9huDIZaW4RDRO5fDmN5X7s9vxLnnR2bqXq/pK42S8VWlmW9lyrqPIqxJHiV7o2xNTPCVqq7OE4qQ+tuu9E9LY7hRdSbk600lfPPJTSU6+VFMquVzVj5rw9lA6fSmrqezakZaa642+VktBW0M3Smrp2oqLG/wlY5M7wSSAAAAAAAAAAAAAAAACBafUdZqCZHUcSvNdYFb0v8AHnWJeY/d0Dl2dxWfWOW+nrX6dQXSNjUlfDLBM5jmoqJJG5F7d+KkH0AAAAAAAAAAAAAAA4aaKaqt8UDX4VixpNJl2Z7l9M9m5SqBnU21XCpFWwVbK6S4OqI43SN6MqNXHFq8WKvPHJPvsSsAAAAAAAAAAAAAAAAA8VVTFSUssDnOVkiKitaqpwVOCd24r0r7VFQ+6VKzKxrtqSzxTOrWz/tZpK2n0bVRzaxulqkfJTvt7oql8bI3o1z2sYsbkYjlVEdhFX7cQOk+pnT2a9VpXQ/S5jkdRxROhVVVOMkzmc/U5fkRsAAAAAAAAABKuNhp7rV2WeXisFkndMqNVUV2WuYm/wC6qkPqD08iqr11RtJqE2a1K6lfK2PmsiLFI9UX7kcrU8SNy1fzG0AAAAAAAAAAAAAAAB//9k=";


const BATTERIES = [
  { id:"pw3", brand:"Tesla", name:"Powerwall 3", powerKw:11.5, energyKwh:13.5,
    acLimitKw:7.6, dcLimitKw:20, requiresPw3:false,
    note:null },
  { id:"pwdc", brand:"Tesla", name:"DC Expansion Pack", powerKw:0, energyKwh:13.5,
    acLimitKw:0, dcLimitKw:0, requiresPw3:true,
    note:"Requires at least 1 Powerwall 3" },
  { id:"fp2", brand:"Franklin", name:"aPower 2", powerKw:10, energyKwh:15,
    acLimitKw:8, dcLimitKw:null, requiresPw3:false,
    note:null },
];

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

function totalKwh(sel) { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.energyKwh),0); }
function totalKw(sel)  { return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)*b.powerKw),0); }
function totalUnits(sel){ return BATTERIES.reduce((s,b)=>(s+(sel[b.id]||0)),0); }

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

export default function BatteryProposalTool() {
  const [step, setStep] = useState(0);

  const [address, setAddress]           = useState("");
  const [hasSolar, setHasSolar]         = useState(null);
  const [coupling, setCoupling]         = useState("ac");
  const [solarKwDc, setSolarKwDc]       = useState("");
  const [solarMonthly, setSolarMonthly] = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [usageMonthly, setUsageMonthly] = useState(Object.fromEntries(MONTHS.map(m=>[m,""])));
  const [rate, setRate]                 = useState(PSE_RATE.toString());

  const [panelFile, setPanelFile]       = useState(null);
  const [breakers, setBreakers]         = useState([]);
  const [parsingPanel, setParsingPanel] = useState(false);
  const [parseError, setParseError]     = useState("");

  const [battSel, setBattSel]           = useState({pw3:0,pwdc:0,fp2:0});
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [powerAlertDismissed, setPowerAlertDismissed] = useState(false);

  const rateNum    = parseFloat(rate)||PSE_RATE;
  const tKwh       = totalKwh(battSel);
  const tKw        = totalKw(battSel);
  const tUnits     = totalUnits(battSel);

  const critBreakers = breakers.filter(b=>b.critical);
  const critPct      = breakers.length>0 ? critBreakers.length/breakers.length : 0;

  const solarKwNum = parseFloat(solarKwDc)||0;
  let couplingAlert = null;
  if (hasSolar!==false && solarKwNum>0 && tKwh>0) {
    if (coupling==="ac") {
      const pw3c = battSel.pw3||0, fp2c = battSel.fp2||0;
      const lim  = pw3c>0 ? pw3c*7.6 : fp2c>0 ? fp2c*8 : 0;
      if (lim>0 && solarKwNum>lim)
        couplingAlert = `AC coupling limit exceeded: ${solarKwNum} kW DC solar > ${lim} kW limit (${pw3c>0?pw3c+" Powerwall 3 × 7.6 kW":fp2c+" aPower 2 × 8 kW"}).`;
    } else {
      const pw3c = battSel.pw3||0, lim = pw3c*20;
      if (pw3c===0) couplingAlert = "DC coupling requires at least one Powerwall 3.";
      else if (solarKwNum>lim) couplingAlert = `DC coupling limit exceeded: ${solarKwNum} kW DC solar > ${lim} kW limit (${pw3c} Powerwall 3 × 20 kW).`;
    }
  }
  const showPowerWarning = tKw>0 && !powerAlertDismissed;

  // Formula: hours = battKwh / ((monthlyKwh / days / 24) * critPct)
  const backupData = MONTHS.map((m,i)=>{
    const uNum = parseFloat(usageMonthly[m])||0;
    const sNum = parseFloat(solarMonthly[m])||0;
    if (!uNum||!tKwh||!critPct) return {month:m,battOnly:null,solarExtDays:null,indefinite:false};
    const hourlyDemand = (uNum / DAYS[i] / 24) * critPct;  // kWh/hr at critical %
    const battOnly     = tKwh / hourlyDemand;               // hours battery-only
    let solarExtDays=null, indefinite=false;
    if (hasSolar!==false && sNum>0) {
      const dailySolar   = sNum / DAYS[i];
      const dailyDemand  = hourlyDemand * 24;
      const netDailyDraw = dailyDemand - dailySolar;
      if (netDailyDraw<=0) indefinite = true;
      else solarExtDays = tKwh / netDailyDraw;             // additional days with solar
    }
    return {month:m,battOnly,solarExtDays,indefinite};
  });
  const maxBattH  = Math.max(...backupData.map(d=>d.battOnly||0),1);
  const maxSolarH = Math.max(...backupData.map(d=>d.solarExtDays ? d.solarExtDays*24 : 0),0);
  const chartMaxH = Math.max(maxBattH+maxSolarH, 1); // hours scale

  const vppOneTime = tUnits*VPP_ONETIME;
  const vppAnnual  = tUnits*VPP_ANNUAL;
  const vpp10Year  = vppOneTime+vppAnnual*10;

  const dark = {background:"#0d1117",color:"#e2e8f0"};
  const card = {background:"#1e2535",borderRadius:12,padding:"1.25rem",border:"1px solid #2d3748"};
  const inp  = {width:"100%",background:"#0f1623",border:"1px solid #2d3748",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl  = {fontSize:10,color:"#718096",marginBottom:3,display:"block",fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"};
  const btnP = {padding:"11px 22px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:"#2D6A4F",color:"#fff"};
  const btnG = {padding:"9px 18px",borderRadius:8,cursor:"pointer",fontSize:12,background:"transparent",border:"1px solid #2d3748",color:"#718096"};
  const pill = a=>({padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:a?"#2D6A4F":"#1a202c",color:a?"#9AE6B4":"#718096",border:a?"1px solid #2D6A4F":"1px solid #2d3748"});
  const alrt = t=>({padding:"8px 12px",borderRadius:8,fontSize:12,marginBottom:8,
    background:t==="warn"?"rgba(246,173,85,0.1)":"rgba(252,129,129,0.1)",
    color:t==="warn"?"#F6AD55":"#FC8181",border:`1px solid ${t==="warn"?"rgba(246,173,85,0.3)":"rgba(252,129,129,0.3)"}`});

  const handleParsePanel = async file=>{
    if (!file) return;
    setParsingPanel(true); setParseError("");
    try {
      const result = await callParsePanel(file);
      if (!result.breakers?.length) throw new Error("No breakers detected");
      setBreakers(result.breakers.map((b,i)=>({...b,id:`b_${i}`,name:b.name||"Unknown",critical:false})));
    } catch(e){ setParseError(e.message); } finally { setParsingPanel(false); }
  };

  const toggleBatt = (id,delta)=>{
    const b = BATTERIES.find(x=>x.id===id);
    if (selectedBrand && selectedBrand!==b.brand) return;
    const cur  = battSel[id]||0;
    const next = Math.max(0,Math.min(5,cur+delta));
    if (id==="pwdc" && next>0 && !(battSel.pw3>0)) return;
    const ns = {...battSel,[id]:next};
    setBattSel(ns);
    setSelectedBrand(Object.values(ns).some(v=>v>0)?b.brand:null);
  };

  // Y-axis tick values for the chart
  const yTicks = (chartMaxH)=>{
    const raw = chartMaxH;
    const step = raw<=48 ? 12 : raw<=168 ? 24 : raw<=720 ? 168 : 720;
    const ticks = [];
    for(let v=0; v<=raw; v+=step) ticks.push(v);
    if(ticks[ticks.length-1]<raw) ticks.push(Math.ceil(raw/step)*step);
    return ticks;
  };
  const fmtH = h => h>=24 ? `${Math.round(h/24)}d` : `${Math.round(h)}h`;

  const renderBackupBars = (chartH)=>{
    const barAreaH = chartH - 28; // reserve space for month labels
    const maxH = chartMaxH;
    const ticks = yTicks(maxH);
    return (
      <div style={{display:"flex",gap:0}}>
        {/* Y axis */}
        <div style={{display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",
          paddingBottom:18,marginRight:4,minWidth:28}}>
          {ticks.map(t=>(
            <div key={t} style={{fontSize:8,color:"#4a5568",textAlign:"right",lineHeight:1}}>{fmtH(t)}</div>
          ))}
        </div>
        {/* Bars */}
        <div style={{flex:1,display:"flex",alignItems:"flex-end",gap:3,height:chartH,position:"relative"}}>
          {/* gridlines */}
          {ticks.filter(t=>t>0).map(t=>(
            <div key={t} style={{position:"absolute",left:0,right:0,
              bottom: 18 + (t/maxH)*barAreaH,
              height:1,background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>
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
                <div style={{fontSize:8,color:"#F6AD55",fontWeight:700,textAlign:"center"}}>∞</div>
                <div style={{flex:1,width:"100%",background:"#F6AD55",opacity:0.8,borderRadius:"2px 2px 0 0"}}/>
                <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
            const battPct = Math.min(1, battOnly/maxH);
            const solPct  = solarExtDays ? Math.min(1-battPct, (solarExtDays*24)/maxH) : 0;
            const battPx  = Math.round(battPct*barAreaH);
            const solPx   = Math.round(solPct*barAreaH);
            const topLbl  = battOnly>=48 ? `${Math.round(battOnly/24)}d` : `${Math.round(battOnly)}h`;
            return (
              <div key={month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{fontSize:7,color:"#9AE6B4",fontWeight:600,height:10,lineHeight:"10px",textAlign:"center"}}>{topLbl}</div>
                <div style={{flex:1,width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                  {/* Solar extension — amber/orange, visually distinct from battery green */}
                  {solPx>0&&<div style={{width:"100%",height:solPx,background:"#F6AD55",opacity:0.85,borderRadius:"2px 2px 0 0"}}/>}
                  {/* Battery only — teal green */}
                  <div style={{width:"100%",height:Math.max(3,battPx),background:"#4FD1C5",opacity:0.9,
                    borderRadius:solPx>0?"0":"2px 2px 0 0"}}/>
                </div>
                <div style={{fontSize:8,color:"#718096",height:16,lineHeight:"16px"}}>{month}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStep1 = ()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>
      <div>
        <label style={lbl}>Homeowner address</label>
        <input style={inp} placeholder="123 Main St, Bellevue, WA 98004" value={address} onChange={e=>setAddress(e.target.value)}/>
      </div>

      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:10}}>Solar system</div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={pill(hasSolar===true)} onClick={()=>setHasSolar(true)}>Has solar</button>
          <button style={pill(hasSolar===false)} onClick={()=>setHasSolar(false)}>No solar</button>
          <button style={pill(hasSolar==="future")} onClick={()=>setHasSolar("future")}>Will add solar</button>
        </div>
        {hasSolar!==false && (
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
            <div>
              <label style={lbl}>Monthly solar production (kWh)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:4}}>
                {MONTHS.map(m=>(
                  <div key={m}>
                    <label style={{...lbl,marginBottom:2}}>{m}</label>
                    <input type="number" style={{...inp,padding:"4px 6px",fontSize:11}} placeholder="—"
                      value={solarMonthly[m]} onChange={e=>setSolarMonthly(p=>({...p,[m]:e.target.value}))}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:10}}>Monthly energy usage (kWh)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
          {MONTHS.map(m=>(
            <div key={m}>
              <label style={{...lbl,marginBottom:2}}>{m}</label>
              <input type="number" style={{...inp,padding:"4px 6px",fontSize:11}} placeholder="—"
                value={usageMonthly[m]} onChange={e=>setUsageMonthly(p=>({...p,[m]:e.target.value}))}/>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={lbl}>PSE residential rate ($/kWh)</label>
        <input style={{...inp,maxWidth:160}} type="number" step="0.001" value={rate} onChange={e=>setRate(e.target.value)}/>
        <div style={{fontSize:10,color:"#4a5568",marginTop:4}}>PSE current rate ~$0.20/kWh · Net metering 1-for-1 (under review)</div>
      </div>

      <button style={{...btnP,width:"100%",padding:"13px"}} onClick={()=>setStep(1)}>→ Continue to Electrical Loads</button>
    </div>
  );

  const renderStep2 = ()=>(
    <div style={{display:"grid",gap:"1.25rem"}}>
      <div style={{fontSize:12,color:"#718096"}}>
        Upload the panel photo — Claude Vision reads every breaker. Mark loads as <strong style={{color:"#9AE6B4"}}>Critical</strong> (runs during outage) or Non-critical.
      </div>

      {breakers.length===0&&(
        <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
          <div style={{fontSize:12,color:"#718096",marginBottom:8}}>📸 Electrical panel photo</div>
          <input type="file" accept="image/*" style={{fontSize:12,color:"#718096"}}
            onChange={e=>{setPanelFile(e.target.files[0]);handleParsePanel(e.target.files[0]);}}/>
          {parsingPanel&&<div style={{marginTop:8,fontSize:12,color:"#F6AD55"}}>Reading your panel…</div>}
          {parseError&&<div style={{marginTop:8,color:"#FC8181",fontSize:12}}>⚠️ {parseError}</div>}
        </div>
      )}

      {breakers.length>0&&(
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{breakers.length} circuits detected</div>
            <button style={{...btnG,fontSize:11}} onClick={()=>{setBreakers([]);setPanelFile(null);}}>↺ Re-parse</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 50px 90px",gap:8,
            padding:"5px 8px",fontSize:10,color:"#4a5568",textTransform:"uppercase",letterSpacing:"0.04em",
            borderBottom:"1px solid #2d3748"}}>
            <div>Circuit</div><div style={{textAlign:"right"}}>Amps</div>
            <div style={{textAlign:"center"}}>Critical?</div>
          </div>

          <div style={{maxHeight:380,overflowY:"auto"}}>
            {breakers.map(b=>(
              <div key={b.id} style={{display:"grid",gridTemplateColumns:"1fr 50px 90px",gap:8,
                padding:"6px 8px",alignItems:"center",borderBottom:"1px solid #1a202c",
                background:b.critical?"rgba(45,106,79,0.1)":"transparent"}}>
                {b.name==="Unknown"
                  ?<input style={{...inp,padding:"3px 8px",fontSize:12,height:28}} placeholder="Rename" defaultValue=""
                      onBlur={e=>{const n=e.target.value.trim()||"Unknown";setBreakers(p=>p.map(x=>x.id===b.id?{...x,name:n}:x));}}/>
                  :<div style={{fontSize:12,color:b.critical?"#e2e8f0":"#a0aec0"}}>{b.name}</div>}
                <div style={{fontSize:11,color:"#718096",textAlign:"right"}}>{b.amps}A</div>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>setBreakers(p=>p.map(x=>x.id===b.id?{...x,critical:!x.critical}:x))}
                    style={{...pill(b.critical),padding:"3px 10px",fontSize:10}}>
                    {b.critical?"Critical":"No"}</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
            <div style={{background:"#0f1623",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:"#9AE6B4"}}>{critBreakers.length} / {breakers.length}</div>
              <div style={{fontSize:10,color:"#718096",textTransform:"uppercase",marginTop:2}}>critical circuits</div>
            </div>
            <div style={{background:"#0f1623",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:"#68D391"}}>{Math.round(critPct*100)}%</div>
              <div style={{fontSize:10,color:"#718096",textTransform:"uppercase",marginTop:2}}>of total demand</div>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button style={btnG} onClick={()=>setStep(0)}>← Back</button>
        <button style={{...btnP,flex:1}} onClick={()=>setStep(2)}>→ Continue to Battery Design</button>
      </div>
    </div>
  );

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

      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>Select batteries</div>
        <div style={{fontSize:11,color:"#718096",marginBottom:14}}>Selecting one brand locks out the other.</div>
        <div style={{display:"grid",gap:10}}>
          {BATTERIES.map(b=>{
            const qty    = battSel[b.id]||0;
            const locked = selectedBrand && selectedBrand!==b.brand;
            const needsPw3 = b.requiresPw3 && !(battSel.pw3>0);
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

      {tKwh>0&&critPct>0&&(
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,color:"#9AE6B4",marginBottom:4}}>Off-Grid Resilience</div>
          <div style={{fontSize:11,color:"#718096",marginBottom:12}}>
            {Math.round(tKwh*10)/10} kWh · {Math.round(critPct*100)}% of demand · {critBreakers.length} critical circuits
            {hasSolar!==false&&Object.values(solarMonthly).some(v=>v)&&" · Solar recharge shown in amber"}
          </div>
          {renderBackupBars(160)}
          <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
              <div style={{width:10,height:10,background:"#4FD1C5",borderRadius:2}}/> Battery only
            </div>
            {hasSolar!==false&&(
              <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
                <div style={{width:10,height:10,background:"#F6AD55",borderRadius:2}}/> + Solar recharge
              </div>
            )}
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#718096"}}>
              <div style={{width:10,height:10,background:"#F6AD55",opacity:0.8,borderRadius:2}}/> Indefinite (solar &gt; demand)
            </div>
          </div>
        </div>
      )}

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

      <div style={{...card,background:"#0f1623",border:"1px dashed #2d3748"}}>
        <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:6}}>Additional resilience technology</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Fuel cell","Generator","Vehicle-to-home (V2H)"].map(t=>(
            <div key={t} style={{padding:"5px 12px",borderRadius:20,border:"1px solid #2d3748",fontSize:11,color:"#4a5568"}}>+ {t}</div>
          ))}
        </div>
        <div style={{fontSize:10,color:"#2d3748",marginTop:6}}>Coming soon</div>
      </div>

      <div style={{...card,border:"1px solid #2D6A4F",textAlign:"center"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#9AE6B4",marginBottom:6}}>Ready for a complete installation plan?</div>
        <div style={{fontSize:12,color:"#718096",marginBottom:12,lineHeight:1.6}}>
          Send battery details for expert design of equipment locations and installation plan adhering to NEC, AHJ, and utility requirements.
        </div>
        <button style={{...btnP,background:"#1a2e22",border:"1px solid #2D6A4F",color:"#9AE6B4",cursor:"default",opacity:0.7}}>
          Request Expert Design — Coming Soon
        </button>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button style={btnG} onClick={()=>setStep(1)}>← Back</button>
        <button style={{...btnP,flex:1}} onClick={()=>setStep(3)}>→ View Homeowner Proposal</button>
      </div>
    </div>
  );

  const renderStep4 = ()=>{
    const worst = backupData.reduce((w,d)=>{
      if (d.indefinite||!d.battOnly) return w;
      if (!w||d.battOnly<w.battOnly) return d; return w;
    },null);
    const best = backupData.reduce((b,d)=>{
      if (!d.battOnly&&!d.indefinite) return b;
      if (d.indefinite) return d;
      if (!b||d.battOnly>b.battOnly) return d; return b;
    },null);
    const battName = selectedBrand==="Tesla"
      ?`Tesla Powerwall 3${battSel.pwdc>0?" + DC Expansion":""}`
      :selectedBrand==="Franklin"?"Franklin aPower 2":"Battery System";
    return (
      <div style={{display:"grid",gap:"1.25rem"}}>
        <div style={{background:"linear-gradient(135deg,#0d1a10,#0d1117)",border:"1px solid #2D6A4F",borderRadius:16,padding:"1.5rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#9AE6B4",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>
            Your Energy Resilience &amp; Savings
          </div>
          <div style={{fontSize:22,fontWeight:800,color:"#e2e8f0",marginBottom:4}}>{Math.round(tKwh*10)/10} kWh · {Math.round(tKw*10)/10} kW</div>
          <div style={{fontSize:13,color:"#68D391"}}>{battName}</div>
          {address&&<div style={{fontSize:11,color:"#4a5568",marginTop:4}}>{address}</div>}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{...card,background:"#0d1a10",borderColor:"#1a4030"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#9AE6B4",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>Off-Grid Resilience</div>
            {worst&&(
              <div style={{textAlign:"center",marginBottom:8}}>
                <div style={{fontSize:26,fontWeight:800,color:"#68D391"}}>
                  {worst.battOnly>=48?`${Math.round(worst.battOnly/24)} days`:`${Math.round(worst.battOnly)} hrs`}
                </div>
                <div style={{fontSize:10,color:"#718096"}}>worst case ({worst.month})</div>
              </div>
            )}
            {best?.indefinite&&<div style={{textAlign:"center",fontSize:14,fontWeight:700,color:"#68D391",marginBottom:4}}>Indefinite in {best.month}</div>}
            <div style={{fontSize:10,color:"#4a5568",textAlign:"center"}}>{Math.round(critPct*100)}% demand · {critBreakers.length} critical circuits</div>
          </div>
          <div style={{...card,background:"#1a1700",borderColor:"#4a3800"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#D4A017",marginBottom:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.08em"}}>On-Grid Savings</div>
            <div style={{textAlign:"center",marginBottom:6}}>
              <div style={{fontSize:26,fontWeight:800,color:"#FFD700"}}>${vpp10Year.toLocaleString()}</div>
              <div style={{fontSize:10,color:"#8a7030"}}>10-year VPP value</div>
            </div>
            <div style={{fontSize:10,color:"#4a3800",textAlign:"center"}}>${vppOneTime.toLocaleString()} one-time + ${vppAnnual.toLocaleString()}/yr</div>
          </div>
        </div>

        {backupData.some(d=>d.battOnly||d.indefinite)&&(
          <div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:12}}>Backup duration by month</div>
            {renderBackupBars(120)}
          </div>
        )}

        {vppAnnual>0&&(
          <div style={card}>
            <div style={{fontSize:12,fontWeight:600,color:"#a0aec0",marginBottom:8}}>Cumulative VPP earnings — 10 years</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:70}}>
              {Array.from({length:10},(_,i)=>{
                const cum = vppOneTime+vppAnnual*(i+1);
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
          <button style={{...btnG,flex:1}} onClick={()=>{setStep(0);setBattSel({pw3:0,pwdc:0,fp2:0});setSelectedBrand(null);setBreakers([]);setPanelFile(null);}}>↺ New proposal</button>
        </div>

        <div style={{fontSize:10,color:"#2d3748",textAlign:"center"}}>
          PSE rates and VPP program terms current as of 2026 · All savings are estimates
        </div>
      </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",...dark,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"2rem 1rem"}}>
      <div style={{width:"100%",maxWidth:660,marginBottom:"1.5rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#2D6A4F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔋</div>
          <div>
            <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.02em"}}>Battery Proposal Tool</div>
            <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.08em",textTransform:"uppercase"}}>PSE Edition · Resilience + Savings</div>
          </div>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:660,background:"#161b27",borderRadius:16,padding:"1.75rem",border:"1px solid #1e2535"}}>
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
