import { useState, useEffect, useCallback, useRef } from "react";

// ── Config Google Sheets ─────────────────────────────────────────────────────
const SHEET_ID  = "1txYkGtXlLqnfLUrN6JJbTuhlszC_Vl692GpVV3ePt5I";
const API_KEY   = "AIzaSyBMsCYdwNmFuFwN1OF2FTcbtarE9ZTLRRU";
const BASE_URL  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

// Feuilles : Assets | Debts | Snapshots
const SHEETS = { assets: "Assets", debts: "Debts", snapshots: "Snapshots" };

async function sheetsGet(range) {
  const url = `${BASE_URL}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheets GET error ${r.status}`);
  const d = await r.json();
  return d.values || [];
}

async function sheetsUpdate(range, values) {
  const url = `${BASE_URL}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${API_KEY}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!r.ok) throw new Error(`Sheets PUT error ${r.status}`);
  return r.json();
}

async function sheetsClear(sheet) {
  const url = `${BASE_URL}/values/${encodeURIComponent(sheet + "!A:Z")}:clear?key=${API_KEY}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`Sheets CLEAR error ${r.status}`);
  return r.json();
}

// Sérialisation : tableau d'objets ↔ rows Google Sheets
const ASSET_HEADERS  = ["id","name","type","value","costBasis","notes","createdAt"];
const DEBT_HEADERS   = ["id","name","type","value","notes"];
const SNAP_HEADERS   = ["date","brut","net"];

function toRows(headers, items) {
  return [headers, ...items.map(item => headers.map(h => item[h] ?? ""))];
}
function fromRows(headers, rows) {
  // rows[0] = headers, skip it
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
}

async function loadSheet(sheetName, headers) {
  try {
    const rows = await sheetsGet(`${sheetName}!A:${String.fromCharCode(64 + headers.length)}`);
    if (rows.length < 2) return [];
    return fromRows(headers, rows);
  } catch { return []; }
}

async function saveSheet(sheetName, headers, items) {
  await sheetsClear(sheetName);
  if (items.length === 0) {
    await sheetsUpdate(`${sheetName}!A1`, [headers]);
    return;
  }
  await sheetsUpdate(`${sheetName}!A1`, toRows(headers, items));
}

// ── Palette ──────────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0d0f14", surface: "#14171f", card: "#1a1e28", border: "#252a38",
  accent: "#e8c547", text: "#f0ece0", muted: "#7a8099",
  green: "#4ade80", red: "#f87171", blue: "#60a5fa",
  purple: "#a78bfa", orange: "#fb923c", teal: "#2dd4bf",
};

const ASSET_TYPES = [
  { id: "pea",     label: "PEA",            icon: "📈", color: COLORS.green,  financial: true  },
  { id: "cto",     label: "CTO",            icon: "📊", color: COLORS.blue,   financial: true  },
  { id: "livret",  label: "Livrets",        icon: "💰", color: COLORS.teal,   financial: true  },
  { id: "fonds_e", label: "Fonds €",        icon: "🛡️", color: "#a3e635",    financial: true  },
  { id: "crypto",  label: "Crypto",         icon: "₿",  color: COLORS.accent, financial: true  },
  { id: "private", label: "Private Equity", icon: "🔒", color: "#f472b6",    financial: true  },
  { id: "immo",    label: "Immobilier",     icon: "🏠", color: COLORS.orange, financial: false },
  { id: "scpi",    label: "SCPI",           icon: "🏢", color: COLORS.purple, financial: false },
  { id: "autre",   label: "Autre",          icon: "📦", color: COLORS.muted,  financial: false },
];

const DEBT_TYPES = [
  { id: "credit_immo",  label: "Crédit immobilier", icon: "🏦" },
  { id: "credit_conso", label: "Crédit conso",      icon: "💳" },
  { id: "autre_dette",  label: "Autre dette",        icon: "📋" },
];

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const pct = (a, b) => (Number(b) === 0 ? "0.0" : ((Number(a) / Number(b)) * 100).toFixed(1));

// ── Donut ────────────────────────────────────────────────────────────────────
function Donut({ data, size = 120, centerLabel }) {
  const r = 42, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  let cumPct = 0;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size }} />;
  const slices = data.map((d) => {
    const pv = d.value / total;
    const da = `${pv * circ} ${circ}`;
    const rot = cumPct * 360 - 90;
    cumPct += pv;
    return { ...d, da, rot };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
          strokeWidth="14" strokeDasharray={s.da} strokeDashoffset="0"
          transform={`rotate(${s.rot} ${cx} ${cy})`} strokeLinecap="butt" />
      ))}
      <circle cx={cx} cy={cy} r={33} fill={COLORS.card} />
      {centerLabel && <>
        <text x="60" y="57" textAnchor="middle" fill={COLORS.muted} fontSize="8" fontFamily="DM Sans,sans-serif">{centerLabel.line1}</text>
        <text x="60" y="68" textAnchor="middle" fill={COLORS.text} fontSize="9" fontWeight="700" fontFamily="DM Sans,sans-serif">{centerLabel.line2}</text>
      </>}
    </svg>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, color = COLORS.accent, width = 80, height = 32 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, sublabel, value, color, delta, sparkValues, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color + "18" : COLORS.card,
      border: `1.5px solid ${active ? color : COLORS.border}`,
      borderRadius: 14, padding: "18px 20px", cursor: onClick ? "pointer" : "default",
      transition: "all .15s", flex: 1, minWidth: 180,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: active ? color : COLORS.muted, marginBottom: 4 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>{sublabel}</div>}
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-1px", color: color || COLORS.text }}>{value}</div>
      {delta !== undefined && (
        <div style={{ fontSize: 12, color: delta >= 0 ? COLORS.green : COLORS.red, marginTop: 4 }}>
          {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))} P&L latent
        </div>
      )}
      {sparkValues && sparkValues.length > 1 && <div style={{ marginTop: 8 }}><Sparkline values={sparkValues} color={color || COLORS.accent} /></div>}
    </div>
  );
}

// ── Sync status badge ─────────────────────────────────────────────────────────
function SyncBadge({ status }) {
  const map = {
    idle:    { label: "Synchro Google Sheets", color: COLORS.muted },
    loading: { label: "Chargement…",           color: COLORS.accent },
    saving:  { label: "Sauvegarde…",           color: COLORS.accent },
    ok:      { label: "✓ Synchronisé",         color: COLORS.green  },
    error:   { label: "⚠ Erreur Sheets",       color: COLORS.red    },
  };
  const s = map[status] || map.idle;
  return (
    <div style={{ fontSize: 11, color: s.color, display: "flex", alignItems: "center", gap: 5 }}>
      {(status === "loading" || status === "saving") && (
        <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", border:`2px solid ${COLORS.accent}`, borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }} />
      )}
      {s.label}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function PatrimoineApp() {
  const [assets,    setAssets]    = useState([]);
  const [debts,     setDebts]     = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [syncStatus, setSyncStatus] = useState("loading");

  const [view,         setView]         = useState("dashboard");
  const [showAssetForm,setShowAssetForm] = useState(false);
  const [showDebtForm, setShowDebtForm]  = useState(false);
  const [editAssetId,  setEditAssetId]   = useState(null);
  const [editDebtId,   setEditDebtId]    = useState(null);
  const [assetForm,    setAssetForm]     = useState({ name:"", type:"pea", value:"", costBasis:"", notes:"" });
  const [debtForm,     setDebtForm]      = useState({ name:"", type:"credit_immo", value:"", notes:"" });
  const [aiMessages,   setAiMessages]    = useState([]);
  const [aiInput,      setAiInput]       = useState("");
  const [aiLoading,    setAiLoading]     = useState(false);
  const [highlight,    setHighlight]     = useState(null);

  const saveTimer = useRef(null);

  // ── Initial load from Sheets ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setSyncStatus("loading");
      try {
        const [a, d, s] = await Promise.all([
          loadSheet(SHEETS.assets,    ASSET_HEADERS),
          loadSheet(SHEETS.debts,     DEBT_HEADERS),
          loadSheet(SHEETS.snapshots, SNAP_HEADERS),
        ]);
        setAssets(a.map(x => ({ ...x, value: Number(x.value)||0, costBasis: Number(x.costBasis)||0 })));
        setDebts(d.map(x => ({ ...x, value: Number(x.value)||0 })));
        setSnapshots(s.map(x => ({ ...x, brut: Number(x.brut)||0, net: Number(x.net)||0 })));
        setSyncStatus("ok");
      } catch {
        setSyncStatus("error");
      }
    })();
  }, []);

  // ── Debounced save to Sheets ──────────────────────────────────────────────
  const persistAll = useCallback((a, d, s) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await Promise.all([
          saveSheet(SHEETS.assets,    ASSET_HEADERS,  a),
          saveSheet(SHEETS.debts,     DEBT_HEADERS,   d),
          saveSheet(SHEETS.snapshots, SNAP_HEADERS,   s),
        ]);
        setSyncStatus("ok");
      } catch {
        setSyncStatus("error");
      }
    }, 1200);
  }, []);

  const updateAssets = (a) => {
    setAssets(a);
    persistAll(a, debts, snapshots);
  };
  const updateDebts = (d) => {
    setDebts(d);
    persistAll(assets, d, snapshots);
  };

  // ── Auto-snapshot ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (assets.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const brut  = assets.reduce((s, a) => s + Number(a.value), 0);
    const net   = brut - debts.reduce((s, d) => s + Number(d.value), 0);
    setSnapshots(prev => {
      const next = [...prev.filter(s => s.date !== today), { date: today, brut, net }].slice(-365);
      persistAll(assets, debts, next);
      return next;
    });
  }, [assets, debts]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const totalBrut      = assets.reduce((s, a) => s + Number(a.value), 0);
  const totalDettes    = debts.reduce((s, d) => s + Number(d.value), 0);
  const totalNet       = totalBrut - totalDettes;
  const totalFinancier = assets.filter(a => ASSET_TYPES.find(t => t.id === a.type)?.financial).reduce((s, a) => s + Number(a.value), 0);
  const totalCost      = assets.reduce((s, a) => s + Number(a.costBasis || a.value), 0);
  const totalPnL       = totalBrut - totalCost;

  const groupData = ASSET_TYPES.reduce((acc, t) => {
    const sum = assets.filter(a => a.type === t.id).reduce((s, a) => s + Number(a.value), 0);
    if (sum > 0) acc.push({ label: t.label, value: sum, color: t.color, financial: t.financial });
    return acc;
  }, []);

  const highlightedAssets    = highlight === "financier" ? assets.filter(a => ASSET_TYPES.find(t => t.id === a.type)?.financial) : assets;
  const highlightedGroupData = highlight === "financier" ? groupData.filter(g => g.financial) : groupData;

  // ── Asset form ────────────────────────────────────────────────────────────
  const openAddAsset  = () => { setAssetForm({ name:"", type:"pea", value:"", costBasis:"", notes:"" }); setEditAssetId(null); setShowAssetForm(true); };
  const openEditAsset = (a) => { setAssetForm({ name:a.name, type:a.type, value:a.value, costBasis:a.costBasis||"", notes:a.notes||"" }); setEditAssetId(a.id); setShowAssetForm(true); };
  const submitAsset   = () => {
    if (!assetForm.name || !assetForm.value) return;
    const obj = { ...assetForm, value: Number(assetForm.value), costBasis: Number(assetForm.costBasis)||Number(assetForm.value) };
    if (editAssetId) updateAssets(assets.map(a => a.id === editAssetId ? { ...a, ...obj } : a));
    else             updateAssets([...assets, { ...obj, id: Date.now().toString(), createdAt: new Date().toISOString() }]);
    setShowAssetForm(false);
  };

  // ── Debt form ─────────────────────────────────────────────────────────────
  const openAddDebt  = () => { setDebtForm({ name:"", type:"credit_immo", value:"", notes:"" }); setEditDebtId(null); setShowDebtForm(true); };
  const openEditDebt = (d) => { setDebtForm({ name:d.name, type:d.type, value:d.value, notes:d.notes||"" }); setEditDebtId(d.id); setShowDebtForm(true); };
  const submitDebt   = () => {
    if (!debtForm.name || !debtForm.value) return;
    const obj = { ...debtForm, value: Number(debtForm.value) };
    if (editDebtId) updateDebts(debts.map(d => d.id === editDebtId ? { ...d, ...obj } : d));
    else            updateDebts([...debts, { ...obj, id: Date.now().toString() }]);
    setShowDebtForm(false);
  };

  // ── AI ────────────────────────────────────────────────────────────────────
  const sendAI = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    const msgs = [...aiMessages, { role: "user", content: userMsg }];
    setAiMessages(msgs);
    setAiLoading(true);
    const context = `Tu es un conseiller en gestion de patrimoine expert et bienveillant.
Patrimoine de l'utilisateur :
ACTIFS : ${JSON.stringify(assets.map(a=>({nom:a.name,type:a.type,valeur:a.value,prixRevient:a.costBasis,notes:a.notes})))}
PASSIF : ${JSON.stringify(debts.map(d=>({nom:d.name,type:d.type,montant:d.value,notes:d.notes})))}
Brut: ${fmt(totalBrut)} | Net: ${fmt(totalNet)} | Financier: ${fmt(totalFinancier)} | P&L: ${fmt(totalPnL)}
Réponds en français, de manière précise et actionnable.`;
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:context, messages:msgs }),
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type==="text")?.text || "Erreur.";
      setAiMessages([...msgs, { role:"assistant", content:reply }]);
    } catch {
      setAiMessages([...msgs, { role:"assistant", content:"Erreur de connexion." }]);
    }
    setAiLoading(false);
  }, [aiInput, aiLoading, aiMessages, assets, debts, totalBrut, totalNet, totalFinancier, totalPnL]);

  const typeOf     = (id) => ASSET_TYPES.find(t => t.id === id) || ASSET_TYPES[8];
  const debtTypeOf = (id) => DEBT_TYPES.find(t => t.id === id)  || DEBT_TYPES[2];

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    app:      { background:COLORS.bg, minHeight:"100vh", color:COLORS.text, fontFamily:"'DM Sans','Segoe UI',sans-serif", paddingBottom:80 },
    header:   { background:COLORS.surface, borderBottom:`1px solid ${COLORS.border}`, padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, gap:12, flexWrap:"wrap" },
    nav:      { display:"flex", gap:4 },
    navBtn:   (a) => ({ background:a?COLORS.accent:"transparent", color:a?COLORS.bg:COLORS.muted, border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:13, fontWeight:600 }),
    main:     { maxWidth:920, margin:"0 auto", padding:"24px 16px" },
    card:     { background:COLORS.card, border:`1px solid ${COLORS.border}`, borderRadius:14, padding:20 },
    stitle:   { fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:COLORS.muted, marginBottom:12 },
    addBtn:   { background:COLORS.accent, color:COLORS.bg, border:"none", borderRadius:10, padding:"10px 18px", cursor:"pointer", fontWeight:700, fontSize:13 },
    ghostBtn: { background:"transparent", border:`1px solid ${COLORS.border}`, color:COLORS.text, borderRadius:10, padding:"10px 18px", cursor:"pointer", fontWeight:600, fontSize:13 },
    row:      { display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:COLORS.surface, border:`1px solid ${COLORS.border}`, borderRadius:10, marginBottom:8 },
    input:    { width:"100%", background:COLORS.surface, border:`1px solid ${COLORS.border}`, borderRadius:8, padding:"10px 14px", color:COLORS.text, fontSize:14, outline:"none", boxSizing:"border-box" },
    label:    { display:"block", fontSize:12, fontWeight:600, color:COLORS.muted, marginBottom:5 },
    overlay:  { position:"fixed", inset:0, background:"#00000099", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" },
    modal:    { background:COLORS.card, border:`1px solid ${COLORS.border}`, borderRadius:16, padding:28, width:"100%", maxWidth:420 },
    aiBubble: (role) => ({
      background: role==="user" ? COLORS.accent+"18" : COLORS.surface,
      border:`1px solid ${role==="user" ? COLORS.accent+"44" : COLORS.border}`,
      borderRadius:12, padding:"12px 16px", maxWidth:"85%",
      alignSelf:role==="user"?"flex-end":"flex-start",
      fontSize:14, lineHeight:1.6, whiteSpace:"pre-wrap",
    }),
  };

  const sparkBrut = snapshots.slice(-30).map(s => Number(s.brut));
  const sparkNet  = snapshots.slice(-30).map(s => Number(s.net));

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ fontSize:17, fontWeight:800, letterSpacing:"-0.5px" }}>
          patri<span style={{ color:COLORS.accent }}>môme</span>
        </div>
        <nav style={S.nav}>
          {[["dashboard","Dashboard"],["assets","Actifs & Dettes"],["ai","IA Conseil"]].map(([id,lbl]) => (
            <button key={id} style={S.navBtn(view===id)} onClick={()=>setView(id)}>{lbl}</button>
          ))}
        </nav>
        <SyncBadge status={syncStatus} />
      </div>

      <div style={S.main}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && <>
          <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
            <KpiCard label="Patrimoine brut" sublabel="Somme de tous les actifs" value={fmt(totalBrut)} color={COLORS.accent} delta={totalPnL} sparkValues={sparkBrut} active={highlight==="brut"} onClick={()=>setHighlight(h=>h==="brut"?null:"brut")} />
            <KpiCard label="Patrimoine net"  sublabel={`Brut − ${fmt(totalDettes)} de dettes`} value={fmt(totalNet)} color={totalNet>=0?COLORS.green:COLORS.red} sparkValues={sparkNet} active={highlight==="net"} onClick={()=>setHighlight(h=>h==="net"?null:"net")} />
            <KpiCard label="Patrimoine financier" sublabel="PEA · CTO · Livrets · Crypto…" value={fmt(totalFinancier)} color={COLORS.blue} active={highlight==="financier"} onClick={()=>setHighlight(h=>h==="financier"?null:"financier")} />
          </div>

          {highlight && (
            <div style={{ fontSize:12, color:COLORS.muted, marginBottom:14, textAlign:"center" }}>
              {highlight==="financier"?"📊 Filtré sur les actifs financiers":highlight==="net"?"🔍 Patrimoine net = actifs − passif":"🔍 Patrimoine brut = ensemble des actifs"} · Cliquez à nouveau pour tout afficher
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div style={S.card}>
              <div style={S.stitle}>Répartition des actifs</div>
              {groupData.length===0 ? (
                <div style={{ color:COLORS.muted, textAlign:"center", padding:"30px 0", fontSize:14 }}>Aucun actif saisi</div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                  <Donut data={highlightedGroupData} size={120} centerLabel={highlight==="financier"?{line1:"financier",line2:pct(totalFinancier,totalBrut)+"%"}:null} />
                  <div style={{ flex:1 }}>
                    {(highlight==="financier"?highlightedGroupData:groupData).sort((a,b)=>b.value-a.value).map(d=>(
                      <div key={d.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                          <div style={{ width:7, height:7, borderRadius:"50%", background:d.color }} />
                          <span style={{ fontSize:12 }}>{d.label}</span>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:12, fontWeight:700 }}>{pct(d.value,totalBrut)}%</div>
                          <div style={{ fontSize:10, color:COLORS.muted }}>{fmt(d.value)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.stitle}>Synthèse</div>
              {[
                { label:"Actifs bruts",         value:totalBrut,               color:COLORS.accent },
                { label:"Dont financier",        value:totalFinancier,          color:COLORS.blue,   indent:true },
                { label:"Dont réel (immo/SCPI)", value:totalBrut-totalFinancier,color:COLORS.orange, indent:true },
                { label:"Passif (dettes)",       value:-totalDettes,            color:COLORS.red },
                { label:"Patrimoine NET",        value:totalNet,                color:totalNet>=0?COLORS.green:COLORS.red, bold:true },
              ].map(row=>(
                <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, paddingLeft:row.indent?14:0 }}>
                  <div style={{ fontSize:row.bold?14:13, fontWeight:row.bold?700:400, color:row.bold?COLORS.text:COLORS.muted }}>
                    {row.indent&&<span style={{ color:COLORS.border, marginRight:6 }}>└</span>}{row.label}
                  </div>
                  <div style={{ fontSize:row.bold?15:13, fontWeight:700, color:row.color }}>{fmt(row.value)}</div>
                </div>
              ))}
              {debts.length===0 && (
                <div style={{ fontSize:12, color:COLORS.muted, textAlign:"center", paddingTop:8 }}>
                  <button onClick={()=>setView("assets")} style={{ ...S.ghostBtn, padding:"6px 12px", fontSize:12 }}>+ Ajouter des dettes</button>
                </div>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.stitle}>Top actifs {highlight==="financier"?"(financiers seulement)":""}</div>
            {assets.length===0 ? (
              <div style={{ textAlign:"center", padding:"30px 0" }}>
                <button style={S.addBtn} onClick={()=>setView("assets")}>Commencer</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
                {highlightedAssets.sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,6).map(a=>{
                  const t=typeOf(a.type), pnl=Number(a.value)-Number(a.costBasis||a.value);
                  return (
                    <div key={a.id} style={{ background:COLORS.surface, border:`1px solid ${COLORS.border}`, borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <span style={{ fontSize:20 }}>{t.icon}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:t.color+"22", color:t.color, borderRadius:20, padding:"2px 8px" }}>{t.label}</span>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, marginTop:8 }}>{a.name}</div>
                      <div style={{ fontSize:16, fontWeight:800, marginTop:4 }}>{fmt(a.value)}</div>
                      {a.costBasis && Number(a.costBasis)!==Number(a.value) && (
                        <div style={{ fontSize:11, color:pnl>=0?COLORS.green:COLORS.red, marginTop:2 }}>{pnl>=0?"+":""}{fmt(pnl)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {snapshots.length>1 && (
            <div style={{ ...S.card, marginTop:16 }}>
              <div style={S.stitle}>Évolution — 30 derniers jours</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:56 }}>
                {snapshots.slice(-30).map((s,i)=>{
                  const vals=snapshots.slice(-30).map(x=>Number(x.brut));
                  const min=Math.min(...vals), max=Math.max(...vals);
                  const h=max===min?28:Math.max(4,((Number(s.brut)-min)/(max-min))*52);
                  return <div key={i} style={{ flex:1 }} title={`${s.date}\nBrut: ${fmt(s.brut)}\nNet: ${fmt(s.net)}`}><div style={{ height:h, background:COLORS.accent+"55", borderRadius:2 }} /></div>;
                })}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11, color:COLORS.muted }}>
                <span>{snapshots.slice(-30)[0]?.date}</span>
                <span style={{ color:COLORS.accent, fontWeight:600 }}>Brut</span>
                <span>{snapshots.slice(-1)[0]?.date}</span>
              </div>
            </div>
          )}
        </>}

        {/* ── ACTIFS & DETTES ── */}
        {view==="assets" && <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:700 }}>Actifs <span style={{ fontSize:14, color:COLORS.muted, fontWeight:400 }}>{fmt(totalBrut)}</span></div>
            <button style={S.addBtn} onClick={openAddAsset}>+ Actif</button>
          </div>

          {["financial","real"].map(group=>{
            const gTypes  = ASSET_TYPES.filter(t=>(group==="financial")===t.financial);
            const gAssets = assets.filter(a=>gTypes.some(t=>t.id===a.type));
            if (!gAssets.length) return null;
            const gTotal  = gAssets.reduce((s,a)=>s+Number(a.value),0);
            return (
              <div key={group} style={{ marginBottom:24 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:group==="financial"?COLORS.blue:COLORS.orange }}>
                    {group==="financial"?"📊 Patrimoine financier":"🏠 Patrimoine réel"}
                  </div>
                  <div style={{ marginLeft:"auto", fontSize:13, fontWeight:700, color:group==="financial"?COLORS.blue:COLORS.orange }}>{fmt(gTotal)}</div>
                </div>
                {gTypes.filter(t=>assets.some(a=>a.type===t.id)).map(t=>(
                  <div key={t.id} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:t.color, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span>{t.icon}</span>{t.label}
                      <span style={{ color:COLORS.muted, fontWeight:400 }}>— {fmt(assets.filter(a=>a.type===t.id).reduce((s,a)=>s+Number(a.value),0))}</span>
                    </div>
                    {assets.filter(a=>a.type===t.id).map(a=>{
                      const pnl=Number(a.value)-Number(a.costBasis||a.value);
                      const pp=a.costBasis?((pnl/Number(a.costBasis))*100).toFixed(1):"0.0";
                      return (
                        <div key={a.id} style={S.row}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:14 }}>{a.name}</div>
                            {a.notes&&<div style={{ fontSize:12, color:COLORS.muted }}>{a.notes}</div>}
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontWeight:700, fontSize:15 }}>{fmt(a.value)}</div>
                            {a.costBasis&&Number(a.costBasis)!==Number(a.value)&&(
                              <div style={{ fontSize:11, color:pnl>=0?COLORS.green:COLORS.red }}>{pnl>=0?"+":""}{fmt(pnl)} ({pnl>=0?"+":""}{pp}%)</div>
                            )}
                          </div>
                          <button onClick={()=>openEditAsset(a)} style={{ ...S.ghostBtn, padding:"5px 9px", fontSize:12 }}>✏️</button>
                          <button onClick={()=>updateAssets(assets.filter(x=>x.id!==a.id))} style={{ ...S.ghostBtn, padding:"5px 9px", fontSize:12, color:COLORS.red }}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}

          {assets.length===0&&(
            <div style={{ textAlign:"center", padding:"40px 20px", color:COLORS.muted }}>
              <div style={{ fontSize:40, marginBottom:12 }}>💼</div>
              <div style={{ marginBottom:16 }}>Aucun actif — commencez par saisir votre PEA ou un livret</div>
              <button style={S.addBtn} onClick={openAddAsset}>+ Ajouter un actif</button>
            </div>
          )}

          <div style={{ borderTop:`1px solid ${COLORS.border}`, marginTop:8, paddingTop:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:18, fontWeight:700 }}>Passif <span style={{ fontSize:14, color:COLORS.red, fontWeight:400 }}>−{fmt(totalDettes)}</span></div>
              <button style={{ ...S.addBtn, background:COLORS.red+"22", color:COLORS.red }} onClick={openAddDebt}>+ Dette</button>
            </div>
            {debts.map(d=>{
              const dt=debtTypeOf(d.type);
              return (
                <div key={d.id} style={S.row}>
                  <span style={{ fontSize:18 }}>{dt.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{d.name}</div>
                    {d.notes&&<div style={{ fontSize:12, color:COLORS.muted }}>{d.notes}</div>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:15, color:COLORS.red }}>−{fmt(d.value)}</div>
                  <button onClick={()=>openEditDebt(d)} style={{ ...S.ghostBtn, padding:"5px 9px", fontSize:12 }}>✏️</button>
                  <button onClick={()=>updateDebts(debts.filter(x=>x.id!==d.id))} style={{ ...S.ghostBtn, padding:"5px 9px", fontSize:12, color:COLORS.red }}>🗑️</button>
                </div>
              );
            })}
            {debts.length===0&&<div style={{ color:COLORS.muted, fontSize:13, padding:"16px 0" }}>Aucune dette — ajoutez vos crédits pour calculer le patrimoine net.</div>}
            {debts.length>0&&(
              <div style={{ textAlign:"right", fontSize:13, fontWeight:700, color:COLORS.muted, marginTop:8 }}>
                Net = {fmt(totalBrut)} − {fmt(totalDettes)} = <span style={{ color:totalNet>=0?COLORS.green:COLORS.red }}>{fmt(totalNet)}</span>
              </div>
            )}
          </div>
        </>}

        {/* ── IA ── */}
        {view==="ai"&&(
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 180px)" }}>
            <div style={{ ...S.card, marginBottom:12, fontSize:13, color:COLORS.muted }}>
              💡 L'IA connaît votre patrimoine brut ({fmt(totalBrut)}), net ({fmt(totalNet)}) et financier ({fmt(totalFinancier)}).
            </div>
            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, marginBottom:12 }}>
              {aiMessages.length===0&&(
                <div style={{ ...S.card, textAlign:"center", padding:"40px 20px" }}>
                  <div style={{ fontSize:34, marginBottom:10 }}>🤖</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>Conseiller patrimonial IA</div>
                  <div style={{ fontSize:13, color:COLORS.muted, marginBottom:18 }}>Posez n'importe quelle question sur votre patrimoine</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                    {["Analyse ma diversification","Mon taux d'endettement est-il sain ?","Optimise ma fiscalité","Quelle part mettre en financier vs immo ?"].map(q=>(
                      <button key={q} onClick={()=>setAiInput(q)} style={{ ...S.ghostBtn, borderRadius:20, padding:"7px 14px", fontSize:12 }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((m,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  <div style={S.aiBubble(m.role)}>{m.content}</div>
                </div>
              ))}
              {aiLoading&&(
                <div style={{ display:"flex" }}>
                  <div style={S.aiBubble("assistant")}>
                    <span style={{ display:"inline-flex", gap:4 }}>
                      {[0,1,2].map(i=><span key={i} style={{ width:6,height:6,borderRadius:"50%",background:COLORS.muted,display:"inline-block",animation:`bounce 1s ${i*0.2}s infinite` }}/>)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <input style={{ ...S.input, flex:1 }} placeholder="Posez votre question…" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAI()} />
              <button onClick={sendAI} disabled={aiLoading||!aiInput.trim()} style={{ ...S.addBtn, opacity:aiLoading||!aiInput.trim()?0.5:1 }}>Envoyer</button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL ACTIF ── */}
      {showAssetForm&&(
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowAssetForm(false)}>
          <div style={S.modal}>
            <div style={{ fontSize:16,fontWeight:700,marginBottom:18 }}>{editAssetId?"Modifier":"Ajouter"} un actif</div>
            <div style={{ marginBottom:12 }}><label style={S.label}>Nom</label><input style={S.input} placeholder="PEA Boursorama, Appartement Valence…" value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})} /></div>
            <div style={{ marginBottom:12 }}><label style={S.label}>Catégorie</label><select style={S.input} value={assetForm.type} onChange={e=>setAssetForm({...assetForm,type:e.target.value})}>{ASSET_TYPES.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select></div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div><label style={S.label}>Valeur actuelle (€)</label><input style={S.input} type="number" placeholder="0" value={assetForm.value} onChange={e=>setAssetForm({...assetForm,value:e.target.value})} /></div>
              <div><label style={S.label}>Prix de revient (€)</label><input style={S.input} type="number" placeholder="optionnel" value={assetForm.costBasis} onChange={e=>setAssetForm({...assetForm,costBasis:e.target.value})} /></div>
            </div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label><input style={S.input} placeholder="ISIN, adresse…" value={assetForm.notes} onChange={e=>setAssetForm({...assetForm,notes:e.target.value})} /></div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setShowAssetForm(false)} style={{ flex:1,...S.ghostBtn }}>Annuler</button>
              <button onClick={submitAsset} style={{ flex:2,...S.addBtn }}>{editAssetId?"Enregistrer":"Ajouter"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETTE ── */}
      {showDebtForm&&(
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowDebtForm(false)}>
          <div style={S.modal}>
            <div style={{ fontSize:16,fontWeight:700,marginBottom:18 }}>{editDebtId?"Modifier":"Ajouter"} une dette</div>
            <div style={{ marginBottom:12 }}><label style={S.label}>Nom</label><input style={S.input} placeholder="Crédit CIC, LOA voiture…" value={debtForm.name} onChange={e=>setDebtForm({...debtForm,name:e.target.value})} /></div>
            <div style={{ marginBottom:12 }}><label style={S.label}>Type</label><select style={S.input} value={debtForm.type} onChange={e=>setDebtForm({...debtForm,type:e.target.value})}>{DEBT_TYPES.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select></div>
            <div style={{ marginBottom:12 }}><label style={S.label}>Capital restant dû (€)</label><input style={S.input} type="number" placeholder="0" value={debtForm.value} onChange={e=>setDebtForm({...debtForm,value:e.target.value})} /></div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label><input style={S.input} placeholder="Taux, durée restante…" value={debtForm.notes} onChange={e=>setDebtForm({...debtForm,notes:e.target.value})} /></div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setShowDebtForm(false)} style={{ flex:1,...S.ghostBtn }}>Annuler</button>
              <button onClick={submitDebt} style={{ flex:2,...S.addBtn, background:COLORS.red+"22", color:COLORS.red }}>{editDebtId?"Enregistrer":"Ajouter"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${COLORS.border};border-radius:2px}
        select option{background:${COLORS.card}}
      `}</style>
    </div>
  );
}
