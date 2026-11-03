"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type GraphNode = { id: string; label: string; typ: string; status: string; beschreibung?: string | null };
type GraphEdge = { id: string; von: string; nach: string; typ: string; limit?: number | null; waehrung?: string | null; aktionen?: string[]; delegierbar?: boolean | null; gueltig_bis?: string | null; beschreibung?: string | null };
type EventItem = { id: string; zeitpunkt: string; agent: string; aktion: string; entscheidung: string; grund: string; betrag?: string | null };
type ApiState = "pruefung" | "verbunden" | "getrennt";
type RuntimeInput = Partial<{organization_id:string;agent_id:string;acting_for_id:string;resource_id:string;action:string;amount:string;currency:string;purpose:string;runtime_identity:string;tool:string;permission:string;data_scope:string;approval_present:boolean;approval_fresh:boolean}>;
type AssessmentCase = {id:string;title:string;category:string;expected:"ALLOW"|"DENY";input:RuntimeInput};
type AssessmentResult = AssessmentCase & {actual:"ALLOW"|"DENY"|"ERROR";matched:boolean;reason:string;decision_id?:string;checks:PolicyCheck[]};
type AssessmentProfile = "lite" | "continuous";
type PolicyCheck = { control: string; result: "pass" | "fail" | "not_applicable"; detail: string };
type AuthorizationEvaluation = {
  decision_id: string;
  correlation_id: string;
  entscheidung: "ALLOW" | "DENY";
  grund: string;
  effektives_limit: number | string | null;
  delegationspfad: string[];
  policy_version: string;
  checks: PolicyCheck[];
  approval_required: boolean;
  trust: { claim_level: string; runtime_execution_observed: boolean; note: string };
};

const API_ORG = "org-alpenbank";
const AGENT = "agent-payment-01";
const CFO = "person-cfo-anna";
const ACCOUNT = "konto-corporate-1001";
const API_BASE = "/api/backend";

const assessmentCases = (profile: AssessmentProfile): AssessmentCase[] => {
 const c=(n:number,title:string,category:string,expected:"ALLOW"|"DENY",input:RuntimeInput={}):AssessmentCase=>({id:String(n).padStart(2,"0"),title,category,expected,input});
 const lite:AssessmentCase[]=[
 c(1,"Legitime Lieferantenzahlung","POSITIVE CONTROL","ALLOW"),
 c(2,"Betrag oberhalb Delegationslimit","PARAMETER","DENY",{amount:"15000"}),
 c(3,"Limit + CHF 1","PARAMETER","DENY",{amount:"10001"}),
 c(4,"Exaktes Limit ohne Approval","APPROVAL","DENY",{amount:"10000"}),
 c(5,"Approval-Schwelle ohne Freigabe","APPROVAL","DENY",{amount:"7500"}),
 c(6,"Knapp unter Approval-Schwelle","PARAMETER","ALLOW",{amount:"7499.99"}),
 c(7,"Kleinstbetrag","PARAMETER","ALLOW",{amount:"0.01"}),
 c(8,"Falsche Währung EUR","PARAMETER","DENY",{currency:"EUR"}),
 c(9,"Falsche Währung USD","PARAMETER","DENY",{currency:"USD"}),
 c(10,"Unbekannter Runtime-Aussteller","IDENTITY","DENY",{runtime_identity:"untrusted-runtime"}),
 c(11,"Unbekannte Agentenidentität","IDENTITY","DENY",{agent_id:"agent-unknown"}),
 c(12,"Unbekannter Auftraggeber","IDENTITY","DENY",{acting_for_id:"person-unknown"}),
 c(13,"Unbekannter Mandant","TENANT","DENY",{organization_id:"org-other-bank"}),
 c(14,"Unbekannte Kontoressource","RESOURCE SCOPE","DENY",{resource_id:"konto-unknown",data_scope:"konto-unknown"}),
 c(15,"Scope zeigt auf anderes Konto","RESOURCE SCOPE","DENY",{data_scope:"konto-corporate-1002"}),
 c(16,"Globaler Wildcard-Scope","RESOURCE SCOPE","DENY",{data_scope:"*"}),
 c(17,"Scope all","RESOURCE SCOPE","DENY",{data_scope:"all"}),
 c(18,"Scope any","RESOURCE SCOPE","DENY",{data_scope:"any"}),
 c(19,"Falsches Tool","TOOL BINDING","DENY",{tool:"payment.execute"}),
 c(20,"Falsche Permission","PERMISSION","DENY",{permission:"beneficiary.update"}),
 c(21,"Tool und Permission abweichend","COMPOSITION 01","DENY",{tool:"payment.execute",permission:"payment.read"}),
 c(22,"Zweck Kontenauflistung","PURPOSE","DENY",{purpose:"account_enumeration"}),
 c(23,"Zweck Lieferanten-Onboarding","PURPOSE","DENY",{purpose:"vendor_onboarding"}),
 c(24,"Begünstigtenänderung","BUSINESS ACTION","DENY",{action:"beneficiary.update",tool:"beneficiary.update",permission:"beneficiary.update"}),
 c(25,"Zahlungsfreigabe statt Erstellung","BUSINESS ACTION","DENY",{action:"payment.approve",tool:"payment.approve",permission:"payment.approve"}),
 c(26,"Leseaktion ausserhalb dieses Contracts","BUSINESS ACTION","DENY",{action:"payment.read",tool:"payment.read",permission:"payment.read"}),
 c(27,"Approval fehlt vollständig","APPROVAL","DENY",{amount:"8000",approval_present:false,approval_fresh:true}),
 c(28,"Approval nicht frisch","APPROVAL","DENY",{amount:"8000",approval_present:true,approval_fresh:false}),
 c(29,"Frischer Demo-Approval","POSITIVE CONTROL","ALLOW",{amount:"8000",approval_present:true,approval_fresh:true}),
 c(30,"Exaktes Delegationslimit mit Demo-Approval","PARAMETER","ALLOW",{amount:"10000",approval_present:true,approval_fresh:true}),
 c(31,"Limit + 0.01 trotz Approval","PARAMETER","DENY",{amount:"10000.01",approval_present:true,approval_fresh:true}),
 c(32,"Ursprungsvollmacht-Limit trotz Delegation","AUTHORITY DELTA","DENY",{amount:"25000",approval_present:true,approval_fresh:true}),
 c(33,"Niedriger Betrag mit optionalem Approval","PARAMETER","ALLOW",{amount:"5000",approval_present:true,approval_fresh:false}),
 c(34,"Permission payment.read statt create","PERMISSION","DENY",{permission:"payment.read"}),
 c(35,"MCP-Tool-Name weicht vom Contract ab","MCP SURFACE","DENY",{tool:"mcp.payment.create"}),
 c(36,"MCP-Wildcard-Permission","MCP SURFACE","DENY",{permission:"mcp:*"}),
 c(37,"Falscher Ressourcen-Identifier","RESOURCE SCOPE","DENY",{data_scope:"account:1002"}),
 c(38,"Mandantenweiter Scope","RESOURCE SCOPE","DENY",{data_scope:"org-alpenbank/*"}),
 c(39,"Identitäts- und Scope-Kombination","COMPOSITION 02","DENY",{runtime_identity:"untrusted-runtime",data_scope:"*"}),
 c(40,"Zweck- und Permission-Kombination","COMPOSITION 03","DENY",{purpose:"account_enumeration",permission:"beneficiary.update"})
 ];
 if(profile==="lite")return lite;
 return [...lite,
 c(41,"CHF 7'499.98 ohne Approval","PARAMETER","ALLOW",{amount:"7499.98"}),
 c(42,"CHF 7'500.01 ohne Approval","APPROVAL","DENY",{amount:"7500.01"}),
 c(43,"CHF 7'500.01 mit frischem Approval","APPROVAL","ALLOW",{amount:"7500.01",approval_present:true,approval_fresh:true}),
 c(44,"CHF 9'999.99 mit frischem Approval","PARAMETER","ALLOW",{amount:"9999.99",approval_present:true,approval_fresh:true}),
 c(45,"CHF 10'000.00 mit frischem Approval","PARAMETER","ALLOW",{amount:"10000",approval_present:true,approval_fresh:true}),
 c(46,"CHF 10'000.01 trotz Approval","PARAMETER","DENY",{amount:"10000.01",approval_present:true,approval_fresh:true}),
 c(47,"CHF 100'000 mit Approval","AUTHORITY DELTA","DENY",{amount:"100000",approval_present:true,approval_fresh:true}),
 c(48,"CHF 100'000.01 mit Approval","AUTHORITY DELTA","DENY",{amount:"100000.01",approval_present:true,approval_fresh:true}),
 c(49,"Approval-State 00 bei Schwelle","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:false,approval_fresh:false}),
 c(50,"Approval-State 01 bei Schwelle","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:false,approval_fresh:true}),
 c(51,"Approval-State 10 bei Schwelle","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:true,approval_fresh:false}),
 c(52,"Approval-State 11 bei Schwelle","APPROVAL MATRIX","ALLOW",{amount:"7500",approval_present:true,approval_fresh:true}),
 c(53,"Optionaler Approval unter Schwelle","APPROVAL MATRIX","ALLOW",{amount:"7499.99",approval_present:true,approval_fresh:false}),
 c(54,"Fresh ohne vorhandenen Approval","APPROVAL MATRIX","DENY",{amount:"8000",approval_present:false,approval_fresh:true}),
 c(55,"Vorhanden und frisch bei CHF 8'000","APPROVAL MATRIX","ALLOW",{amount:"8000",approval_present:true,approval_fresh:true}),
 c(56,"Vorhanden aber nicht frisch bei CHF 8'000","APPROVAL MATRIX","DENY",{amount:"8000",approval_present:true,approval_fresh:false}),
 c(57,"Zweck + Scope gleichzeitig manipuliert","COMPOSITION 04","DENY",{purpose:"account_enumeration",data_scope:"*"}),
 c(58,"Identität + Tool gleichzeitig manipuliert","COMPOSITION 05","DENY",{runtime_identity:"untrusted-runtime",tool:"payment.execute"}),
 c(59,"Approval + Permission gleichzeitig manipuliert","COMPOSITION 06","DENY",{amount:"8000",approval_present:false,approval_fresh:false,permission:"beneficiary.update"}),
 c(60,"Unbekannter Auftraggeber mit gültigem Betrag","AUTHORITY CHAIN","DENY",{acting_for_id:"person-finance-unknown"}),
 c(61,"Fremde Ressource und fremder Scope","RESOURCE BOUNDARY","DENY",{resource_id:"resource-foreign",data_scope:"resource-foreign"}),
 c(62,"Mandantenwechsel bei gültigem Kontext","TENANT ISOLATION","DENY",{organization_id:"org-foreign"}),
 c(63,"Wiederholte identische PDP-Anfrage","REPLAY OBSERVATION","ALLOW",{}),
 c(64,"Action-Tool-Permission-Tripel manipuliert","COMPOSITION 07","DENY",{action:"beneficiary.update",tool:"payment.create",permission:"beneficiary.update"}),
 c(65,"Purpose + Scope + Permission verkettet","COMPOSITION 08","DENY",{purpose:"account_enumeration",data_scope:"*",permission:"beneficiary.update"}),
 c(66,"Identity + Amount + Approval verkettet","COMPOSITION 09","DENY",{runtime_identity:"untrusted-runtime",amount:"15000",approval_present:true,approval_fresh:true}),
 c(67,"Action + Tool + Scope verkettet","COMPOSITION 10","DENY",{action:"beneficiary.update",tool:"payment.create",permission:"beneficiary.update",data_scope:"*"})
 ];
};

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(Number(value));

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "bad" | "warn" | "neutral" }) {
  return <span className={`badge badge-${tone}`}><i />{children}</span>;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    graph: "M5 6h4v4H5z M15 3h4v4h-4z M15 17h4v4h-4z M9 8l6-3 M9 9l6 9",
    shield: "M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z M8 12l2.5 2.5L16 9",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    check: "M5 12l4 4L19 6",
    file: "M6 2h8l4 4v16H6z M14 2v5h5 M9 12h6 M9 16h6",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19 13.5l2 1.5-2 3-2.5-1-2 1v2h-4v-2l-2-1-2.5 1-2-3 2-1.5v-3L2 9l2-3 2.5 1 2-1V4h4v2l2 1 2.5-1 2 3-2 1.5z",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    lock: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.grid} /></svg>;
}

export default function Home() {
  const [section, setSection] = useState("partner");
  const [apiState, setApiState] = useState<ApiState>("pruefung");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [payments, setPayments] = useState(0);
  const [effectiveLimit, setEffectiveLimit] = useState<number | null>(null);
  const [auditIntegrity, setAuditIntegrity] = useState<boolean | null>(null);
  const [storageMode, setStorageMode] = useState("Nicht geprüft");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEvaluation, setAuthEvaluation] = useState<AuthorizationEvaluation | null>(null);
  const [assessmentProfile,setAssessmentProfile]=useState<AssessmentProfile>("lite");
  const [assessmentBusy,setAssessmentBusy]=useState(false);
  const [assessmentProgress,setAssessmentProgress]=useState(0);
  const [assessmentResults,setAssessmentResults]=useState<AssessmentResult[]>([]);
  const [assessmentTimestamp,setAssessmentTimestamp]=useState<string|null>(null);
  const [authInput, setAuthInput] = useState({
    amount: "5000",
    purpose: "supplier_payment",
    runtime_identity: "shewiun-demo-issuer",
    tool: "payment.create",
    permission: "payment.create",
    data_scope: ACCOUNT,
    approval_present: false,
    approval_fresh: false,
  });

  async function loadData() {
    try {
      const [health, graph, audit, paymentRows, integrity, authority] = await Promise.all([
        fetch(`${API_BASE}/health`, { cache: "no-store" }),
        fetch(`${API_BASE}/v1/autoritaetsgraph?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/v1/sicherheitsereignisse?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/v1/sandbox/zahlungen?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/v1/audit/integritaet?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/v1/agenten/${AGENT}/effektive-berechtigungen?organization_id=${API_ORG}&acting_for_id=${CFO}&resource_id=${ACCOUNT}`, { cache: "no-store" }),
      ]);
      if (!health.ok || !graph.ok || !audit.ok || !paymentRows.ok || !integrity.ok || !authority.ok) throw new Error("Backend nicht erreichbar");
      const healthData = await health.json();
      setStorageMode(healthData.speicher === "postgresql" ? "PostgreSQL · dauerhaft" : "SQLite-Demo · flüchtig");
      const graphData = await graph.json();
      setNodes(graphData.knoten || []);
      setEdges(graphData.verbindungen || []);
      setEvents(await audit.json());
      setPayments((await paymentRows.json()).length);
      setAuditIntegrity(Boolean((await integrity.json()).gueltig));
      const authorityData = await authority.json();
      setEffectiveLimit(authorityData.effektives_limit === null ? null : Number(authorityData.effektives_limit));
      setApiState("verbunden");
    } catch {
      setApiState("getrennt");
      setAuditIntegrity(null);
    }
  }

  useEffect(() => { loadData(); const timer = setInterval(loadData, 12000); return () => clearInterval(timer); }, []);

  async function runPayment(amount: number) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/v1/sandbox/zahlungen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: API_ORG, agent_id: AGENT, acting_for_id: CFO,
          account_id: ACCOUNT, beneficiary: "Lieferant Beispiel AG", amount: amount.toFixed(2), currency: "CHF" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ ok: false, text: `Abgelehnt: ${payload?.detail?.code || "AUTORISIERUNG_VERWEIGERT"} · Keine Zahlung angelegt.` });
      } else {
        setResult({ ok: true, text: `Zahlung ${payload.payment_id} erstellt · ${money(amount)} · Entscheidung ${payload.authorization_decision_id.slice(0, 8)}` });
      }
      await loadData();
    } catch {
      setResult({ ok: false, text: "Backend nicht erreichbar. Starte zuerst die lokale Demo-Umgebung." });
    } finally { setBusy(false); }
  }


  async function runAuthorizationEvaluation() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE}/v1/autorisierung/evaluieren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: API_ORG, agent_id: AGENT, acting_for_id: CFO,
          resource_id: ACCOUNT, action: "payment.create", currency: "CHF",
          ...authInput,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || payload?.code || "Autorisierungsprüfung fehlgeschlagen.");
      setAuthEvaluation(payload);
      await loadData();
    } catch (error) {
      setAuthEvaluation(null);
      setAuthError(error instanceof Error ? error.message : "Autorisierungsprüfung fehlgeschlagen.");
    } finally {
      setAuthBusy(false);
    }
  }

  function setAuthorizationPreset(preset: string) {
    const base = {
      amount: "5000", purpose: "supplier_payment", runtime_identity: "shewiun-demo-issuer",
      tool: "payment.create", permission: "payment.create", data_scope: ACCOUNT,
      approval_present: false, approval_fresh: false,
    };
    const presets: Record<string, typeof base> = {
      standard: base,
      broad_scope: { ...base, data_scope: "*" },
      permission_mismatch: { ...base, permission: "beneficiary.update" },
      identity_mismatch: { ...base, runtime_identity: "unknown-runtime" },
      purpose_mismatch: { ...base, purpose: "account_enumeration" },
      approval_missing: { ...base, amount: "8000" },
      approval_stale: { ...base, amount: "8000", approval_present: true },
      approval_fresh: { ...base, amount: "8000", approval_present: true, approval_fresh: true },
    };
    setAuthInput(presets[preset] || base);
    setAuthEvaluation(null);
    setAuthError(null);
  }

  async function runSecurityAssessment(profile:AssessmentProfile=assessmentProfile) {
    if(apiState!=="verbunden")return;
    setAssessmentBusy(true);setAssessmentProgress(0);setAssessmentResults([]);setAssessmentTimestamp(null);
    const cases=assessmentCases(profile),collected:AssessmentResult[]=[];
    const base:RuntimeInput={organization_id:API_ORG,agent_id:AGENT,acting_for_id:CFO,resource_id:ACCOUNT,action:"payment.create",amount:"5000",currency:"CHF",purpose:"supplier_payment",runtime_identity:"shewiun-demo-issuer",tool:"payment.create",permission:"payment.create",data_scope:ACCOUNT,approval_present:false,approval_fresh:false};
    try {
      for(let i=0;i<cases.length;i++){
        const test=cases[i];
        try {
          const response=await fetch(API_BASE+"/v1/autorisierung/evaluieren",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...base,...test.input})});
          const payload=await response.json();
          const actual=response.ok&&(payload.entscheidung==="ALLOW"||payload.entscheidung==="DENY")?payload.entscheidung:"ERROR";
          collected.push({...test,actual,matched:actual===test.expected,reason:payload.grund||payload.detail||"Keine Policy-Antwort",decision_id:payload.decision_id,checks:Array.isArray(payload.checks)?payload.checks:[]});
        } catch {collected.push({...test,actual:"ERROR",matched:false,reason:"Backend oder Netzwerk nicht erreichbar.",checks:[]});}
        setAssessmentResults([...collected]);setAssessmentProgress(i+1);
      }
      setAssessmentTimestamp(new Date().toISOString());await loadData();
    } finally {setAssessmentBusy(false);}
  }
  function exportAssessmentReport(){
    if(!assessmentResults.length)return;
    const report={product:"SHEWIUN",report_type:"M2.7 Authorization Assessment",profile:assessmentProfile,generated_at:assessmentTimestamp,claim_level:"policy-evaluation",runtime_execution_observed:false,summary:{total:assessmentResults.length,matched:assessmentResults.filter(x=>x.matched).length,deviations:assessmentResults.filter(x=>!x.matched).length,unexpected_allows:assessmentResults.filter(x=>x.expected==="DENY"&&x.actual==="ALLOW").length},results:assessmentResults,limitations:["Demo-Inputs sind keine kryptografisch attestierte Runtime-Identität.","Approval-Flags sind keine signierten, einmalig verwendbaren Approval-Capabilities.","Replay-Test beobachtet wiederholte PDP-Entscheidungen; er beweist keine Replay-Abwehr.","Keine externe Agenten-Runtime oder produktive Business-API wurde ausgeführt."]};
    const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="shewiun-assessment-"+assessmentProfile+"-"+new Date().toISOString().slice(0,10)+".json";link.click();URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => ({
    people: nodes.filter(n => n.typ === "MENSCH").length,
    agents: nodes.filter(n => n.typ === "KI_AGENT").length,
    resources: nodes.filter(n => n.typ === "RESSOURCE").length,
    denied: events.filter(e => e.entscheidung === "DENY").length,
  }), [nodes, events]);
  const agentDelegation = edges.find(edge => edge.typ === "DELEGATION" && edge.nach === AGENT);
  const originGrant = edges.find(edge => edge.typ === "VOLLMACHT" && edge.von === CFO);
  const effectiveActions = agentDelegation?.aktionen || [];
  const retainedByPrincipal = (originGrant?.aktionen || []).filter(action => !effectiveActions.includes(action));

  const nav = [
    { id: "partner", label: "S-PRO Partner Demo", icon: "shield", group: "PLATTFORM" },
    { id: "uebersicht", label: "Übersicht", icon: "grid", group: "PLATTFORM" },
    { id: "graph", label: "Autoritätsgraph", icon: "graph", group: "AUTORITÄT" },
    { id: "berechtigungen", label: "Berechtigungen", icon: "shield", group: "AUTORITÄT" },
    { id: "autorisierung", label: "Autorisierung", icon: "activity", group: "DURCHSETZUNG" },
    { id: "laufzeit", label: "Laufzeitkontrolle", icon: "activity", group: "DURCHSETZUNG" },
    { id: "freigaben", label: "Freigaben", icon: "check", group: "DURCHSETZUNG" },
    { id: "nachweise", label: "Sicherheitsnachweise", icon: "file", group: "GOVERNANCE" },
    { id: "assessment", label: "Security Assessment", icon: "shield", group: "SECURITY TESTING" },
    { id: "findings", label: "Findings & Retest", icon: "file", group: "SECURITY TESTING" },
    { id: "integrationen", label: "Integrationen", icon: "grid", group: "PLATTFORM" },
    { id: "workspace", label: "Workspace & SSO", icon: "lock", group: "WORKSPACE" },
    { id: "programme", label: "Programme", icon: "activity", group: "GOVERNANCE" },
    { id: "system", label: "System", icon: "settings", group: "VERWALTUNG" },
  ];
  const grouped = ["PLATTFORM", "AUTORITÄT", "DURCHSETZUNG", "SECURITY TESTING", "GOVERNANCE", "WORKSPACE", "VERWALTUNG"];

  function title() { return nav.find(n => n.id === section)?.label || "Übersicht"; }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div><div className="brand-name">SHEWIUN</div><div className="brand-sub">AI AGENT AUTHORIZATION SECURITY</div></div>
        </div>
        <div className="tenant-switch"><span className="tenant-icon">A</span><div><small>MANDANT</small><strong>Alpenbank Demo AG</strong></div><span className="chevron">⌄</span></div>
        <nav>
          {grouped.map(group => <div className="nav-group" key={group}>
            <div className="nav-caption">{group}</div>
            {nav.filter(item => item.group === group).map(item => <button key={item.id} onClick={() => setSection(item.id)} className={section === item.id ? "nav-item active" : "nav-item"}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.id === "laufzeit" && events.length > 0 && <b className="nav-count">{events.length}</b>}
            </button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom"><div className="environment"><span className="env-dot" />TESTUMGEBUNG</div><div className="sidebar-version">SHEWIUN SECURITY WORKSPACE · DEMO 0.3</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">SHEWIUN <span>/</span> {title().toUpperCase()}</div>
          <div className="topbar-right"><Badge tone={apiState === "verbunden" ? "good" : apiState === "getrennt" ? "bad" : "warn"}>{apiState === "verbunden" ? "API VERBUNDEN" : apiState === "getrennt" ? "BACKEND GETRENNT" : "VERBINDUNG WIRD GEPRÜFT"}</Badge><div className="user-chip"><span>SM</span><div><strong>Systemadministration</strong><small>Demo-Zugriff</small></div></div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">AI AGENT AUTHORIZATION SECURITY · CONTROLLED DEMO</div><h1>{title()}</h1><p>Geschäftliche Autorität modellieren, Agentenaktionen testen und nachvollziehbare Security-Evidence erzeugen.</p></div>
            <div className="heading-actions"><button className="button button-secondary" onClick={loadData}><span>↻</span> Aktualisieren</button><button className="button button-primary" onClick={() => setSection("graph")}>Autoritätsgraph öffnen <Icon name="arrow" /></button></div>
          </div>

          {section === "partner" && <div className="partner-page">
            <header className="sp-header">
              <div className="sp-brand">SHEWIUN <span>Partnergespräch · S-PRO</span></div>
              <nav aria-label="Demo Navigation">
                <a href="#sp-value">Zusammenarbeit</a>
                <a href="#sp-cases">Anwendungsfälle</a>
                <a href="#sp-live">Live-Beispiel</a>
                <a href="#sp-pilot">Pilot</a>
              </nav>
            </header>

            <section className="sp-hero">
              <div className="sp-hero-main">
                <div className="sp-kicker">S-PRO × SHEWIUN · BANKING & FINTECH</div>
                <h2>Sie bauen die Agenten.<br/><span>Wir prüfen, was sie auslösen dürfen.</span></h2>
                <p>S-PRO entwickelt KI-Agenten und integriert sie in die Systeme von Banken und Fintechs. SHEWIUN kann diese Projekte um eine zusätzliche Prüfung ergänzen: Darf dieser Agent genau diese Geschäftsaktion mit dieser Identität, für diesen Kunden und unter diesen Bedingungen ausführen?</p>
                <div className="sp-hero-actions">
                  <a className="sp-button sp-button-primary" href="#sp-live">Live-Beispiel ansehen</a>
                  <a className="sp-button sp-button-secondary" href="#sp-pilot">Pilotansatz besprechen</a>
                </div>
                <div className="sp-caption">Demonstrator mit synthetischen Daten · keine produktive Kundenanbindung</div>
              </div>
              <aside className="sp-hero-summary">
                <div className="sp-summary-title">Mögliche Aufgabenteilung</div>
                <div className="sp-summary-row"><span> S-PRO </span><div><strong>Entwickeln & integrieren</strong><small>Agenten · Daten · Workflows · Kundensysteme</small></div></div>
                <div className="sp-summary-row"><span> SHEWIUN </span><div><strong>Autorisierung prüfen</strong><small>Geschäftsrechte · Grenzen · Tests · Nachweise</small></div></div>
                <div className="sp-summary-row"><span> KUNDE </span><div><strong>Kontrolle behalten</strong><small>Policies · Freigaben · Systemverantwortung</small></div></div>
              </aside>
            </section>

            <section className="sp-value-section" id="sp-value">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">WARUM DAS ZUSAMMENPASST</div><h3>Keine zweite Agentenplattform. Eine zusätzliche Kontrollebene.</h3></div>
                <p>S-PRO behält die Verantwortung für Agentenentwicklung und Kundenintegration. SHEWIUN konzentriert sich auf eine andere Frage: Welche geschäftliche Befugnis hat der Agent tatsächlich?</p>
              </div>
              <div className="sp-two-columns">
                <article>
                  <div className="sp-column-label">WAS S-PRO BEREITS LIEFERT</div>
                  <h4>Agenten, die in Finanzprozesse eingebettet sind</h4>
                  <p>Nach den veröffentlichten S-PRO-Angeboten umfasst das unter anderem KYC und Onboarding, periodische Kundenprüfungen, AML-Alert-Triage, Kreditdossiers, Kundenservice und Wissenssuche. S-PRO beschreibt ausserdem Evaluierungen, menschliche Freigaben und Audit-Protokollierung als Teil des Ansatzes.</p>
                  <a href="https://s-pro.io/de/blog/agentic-banking-anwendungsfalle" target="_blank" rel="noreferrer">S-PRO: Agentic Banking – Anwendungsfälle ↗</a>
                </article>
                <article className="sp-column-shewiun">
                  <div className="sp-column-label">WAS SHEWIUN ERGÄNZEN KANN</div>
                  <h4>Geschäftsautorität ausdrücklich festlegen und testen</h4>
                  <p>Wir modellieren, wer einem Agenten welche Rechte übertragen darf, auf welche Ressource sie gelten, welche Parameter erlaubt sind und wann eine Freigabe nötig ist. Anschliessend testen wir, ob die definierten Grenzen eingehalten werden.</p>
                  <span className="sp-note">Die Ergänzung ist besonders interessant, wenn mehrere Tools, APIs oder Agenten gemeinsam eine geschäftskritische Aktion ermöglichen.</span>
                </article>
              </div>
              <div className="sp-value-line"><strong>Der praktische Nutzen für S-PRO:</strong> ein zusätzlicher, klar abgrenzbarer Assessment- und Integrationsbaustein für Kundenprojekte – ohne S-PROs bestehende Agenten, Architektur oder Freigabeprozesse zu ersetzen.</div>
            </section>

            <section className="sp-section" id="sp-cases">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">ANWENDUNGSFÄLLE AUS DEM S-PRO-UMFELD</div><h3>Wo SHEWIUN einen konkreten Beitrag leisten kann</h3></div>
                <p>Die Beispiele orientieren sich an S-PROs veröffentlichten Banking-, AML- und Wealth-Management-Anwendungsfällen. Sie sind mögliche gemeinsame Pilotfelder, keine bereits bestehenden Kundenintegrationen.</p>
              </div>
              <div className="sp-case-table-wrap">
                <table className="sp-case-table">
                  <thead><tr><th>Use Case</th><th>Was der Agent vorbereitet</th><th>Geschäftskritische Grenze</th><th>Beitrag von SHEWIUN</th></tr></thead>
                  <tbody>
                    <tr><td><strong>AML-Alert-Triage</strong><small>Bank · Compliance</small></td><td>Alert-Kontext sammeln, Treffer vergleichen, Fallnotiz und Empfehlung erstellen.</td><td>Fall schliessen, eskalieren oder eine Meldung auslösen.</td><td>Prüfen, ob die finale Aktion an Fall, Rolle und menschliche Entscheidung gebunden ist.</td></tr>
                    <tr><td><strong>KYC & Periodic Review</strong><small>Bank · Wealth Manager</small></td><td>Dokumente auswerten, Daten abgleichen, Review-Entwurf vorbereiten.</td><td>KYC-Status ändern, Kundenrisiko neu einstufen oder Onboarding abschliessen.</td><td>Rechte für Lesen, Entwurf und finale Statusänderung getrennt modellieren und testen.</td></tr>
                    <tr><td><strong>Credit Memo</strong><small>Bank · Lending</small></td><td>Unterlagen extrahieren, Kennzahlen berechnen, Kreditmemo entwerfen.</td><td>Kredit genehmigen, Limit setzen oder Konditionen verändern.</td><td>Prüfen, ob eine Analyseberechtigung versehentlich zur Kreditentscheidung führt.</td></tr>
                    <tr><td><strong>Relationship Manager Copilot</strong><small>Private Banking · Asset Management</small></td><td>Call Briefing, Portfolio-Kontext und Research zusammenstellen.</td><td>Order platzieren oder Portfolio- und Kundendaten verändern.</td><td>Mandat, Portfolio, Instrument, Transaktionsparameter und Freigabe zusammen prüfen.</td></tr>
                    <tr><td><strong>Customer Support & Refunds</strong><small>Neobroker · Fintech</small></td><td>Ticket beantworten, Kontostatus erklären, Refund vorbereiten.</td><td>Refund ausführen, Betrag erhöhen oder Empfänger ändern.</td><td>Prüfen, ob eine Freigabe tatsächlich an Kunde, Refund, Betrag und Empfänger gebunden ist.</td></tr>
                    <tr><td><strong>Interne Wissenssuche</strong><small>Bank · Operations</small></td><td>Interne Richtlinien suchen und eine quellenbezogene Antwort erstellen.</td><td>Geschützte Informationen ausserhalb der Nutzerrolle offenlegen oder eine Policy-Änderung auslösen.</td><td>Ressourcen- und Daten-Scope zusammen mit der tatsächlichen Nutzer- und Agentenidentität prüfen.</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="sp-source-links">
                <span>Weiterführende S-PRO-Beispiele:</span>
                <a href="https://s-pro.io/ai-agents-aml-transaction-monitoring-bank/" target="_blank" rel="noreferrer">AML & Transaction Monitoring ↗</a>
                <a href="https://s-pro.io/ai-for-wealth-and-asset-managers/" target="_blank" rel="noreferrer">Wealth & Asset Management ↗</a>
              </div>
            </section>

            <section className="sp-section sp-live-section" id="sp-live">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">LIVE IN DIESEM DEMO</div><h3>Ein Agent erhält nur einen Teil der CFO-Vollmacht</h3></div>
                <p>Das Beispiel zeigt eine echte serverseitige Policy-Auswertung in der Shewiun-Demo-API. Es wird kein Geld überwiesen.</p>
              </div>
              <div className="sp-live-layout">
                <div className="sp-authority-card">
                  <div className="sp-live-label">BEISPIEL · ALPENBANK DEMO AG</div>
                  <h4>Von der Vollmacht zur Agentenbefugnis</h4>
                  <div className="sp-authority-step"><span>Ursprüngliche Vollmacht</span><strong>CHF 100.000</strong><small>Anna Müller · CFO</small></div>
                  <div className="sp-authority-arrow">↓ Delegation eines begrenzten Teilrechts</div>
                  <div className="sp-authority-step sp-authority-effective"><span>Agentenlimit</span><strong>CHF 10.000</strong><small>Zahlungsagent 01 · Konto •••• 1001</small></div>
                  <ul><li>Erlaubt: <code>payment.create</code></li><li>Nicht delegiert: <code>payment.approve</code></li><li>Zusätzliche Freigabe: ab CHF 7.500 laut Demo-Policy</li></ul>
                </div>
                <div className="sp-live-test">
                  <div className="sp-live-label">JETZT SELBST TESTEN · SANDBOX</div>
                  <h4>Welche Zahlung darf der Agent anlegen?</h4>
                  <p>Der Betrag wird gegen die delegierte Befugnis und die Demo-Policy geprüft. Bei einer Verweigerung darf kein Sandbox-Zahlungsdatensatz entstehen.</p>
                  <div className="sp-test-row"><div><span className="sp-allow-tag">ALLOW erwartet</span><strong>CHF 5.000</strong><small>Innerhalb des delegierten Limits und unterhalb der zusätzlichen Freigabeschwelle.</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-primary" onClick={() => runPayment(5000)}>Testen</button></div>
                  <div className="sp-test-row"><div><span className="sp-deny-tag">DENY erwartet</span><strong>CHF 15.000</strong><small>Überschreitet das delegierte Agentenlimit von CHF 10.000.</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-danger" onClick={() => runPayment(15000)}>Testen</button></div>
                  {result && <div className={result.ok ? "result-box result-good" : "result-box result-bad"}><span>{result.ok ? "✓" : "!"}</span><div><strong>{result.ok ? "Aktion erlaubt" : "Aktion verweigert"}</strong><p>{result.text}</p></div></div>}
                  <div className="sp-api-note">Backend-Status: {apiState === "verbunden" ? "verbunden" : apiState === "getrennt" ? "nicht erreichbar" : "wird geprüft"}. Die Tests schreiben ausschliesslich in die Demo-Sandbox.</div>
                </div>
              </div>
            </section>

            <section className="sp-section" id="sp-difference">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">DIE DIFFERENZIERUNG</div><h3>Berechtigung ist nicht dasselbe wie Geschäftsautorität</h3></div>
                <p>Ein Agent kann technisch auf mehrere Tools zugreifen. Entscheidend ist, welche Wirkung diese Tools zusammen ermöglichen.</p>
              </div>
              <div className="sp-difference-grid">
                <article><div className="sp-column-label">TECHNISCHER ZUGRIFF</div><h4>Was kann aufgerufen werden?</h4><p>Ein Agent besitzt eine gültige Identität, eine Rolle und Berechtigungen für einzelne Tools oder APIs.</p><ul><li>customer.read</li><li>beneficiary.update</li><li>payment.create</li></ul></article>
                <article className="sp-difference-emphasis"><div className="sp-column-label">SHEWIUN · BUSINESS AUTHORITY</div><h4>Was darf dadurch tatsächlich passieren?</h4><p>Wir verknüpfen Identität, Auftraggeber, Delegation, Kunde/Konto, Geschäftszweck, Parameter, Limit und Freigabe zu einer überprüfbaren Regel.</p><ul><li>Wer handelt – und in wessen Auftrag?</li><li>Für welchen Kunden und welches Konto?</li><li>Welche Aktion und welcher Betrag?</li><li>Welche Freigabe muss vorliegen?</li></ul></article>
              </div>
              <div className="sp-process">
                <div><span>1</span><strong>Agent fordert Aktion an</strong><small>z. B. Zahlung anlegen</small></div><b>→</b>
                <div><span>2</span><strong>Contract wird geprüft</strong><small>Identität · Scope · Zweck · Limits</small></div><b>→</b>
                <div><span>3</span><strong>Entscheidung</strong><small>ALLOW oder DENY</small></div><b>→</b>
                <div><span>4</span><strong>API setzt Grenze durch</strong><small>Nur nach gültigem ALLOW</small></div><b>→</b>
                <div><span>5</span><strong>Nachweis bleibt erhalten</strong><small>Decision ID · Policy · Ergebnis</small></div>
              </div>
            </section>

            <section className="sp-section">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">SHEWIUN & AGENTPROOF</div><h3>Was heute vorhanden ist – und was gemeinsam integriert würde</h3></div>
                <p>Wir trennen bewusst zwischen dem, was dieser Demonstrator bereits zeigt, und Funktionen aus AgentProof bzw. einer späteren Kundenintegration.</p>
              </div>
              <div className="sp-capability-table">
                <div><strong>Business Authority Graph</strong><p>Modelliert Organisation, menschliche Vollmacht, Agenten-Delegation, Ressourcen, Aktionen und Limits.</p><span className="sp-status sp-status-live">Im Demo-Backend vorhanden</span></div>
                <div><strong>Authorization Contract & Policy Decision</strong><p>Prüft Identität, Mandant, Auftraggeber, Tool/Permission, Geschäftszweck, Ressourcenumfang, Parameter und Freigabezustand.</p><span className="sp-status sp-status-live">Im Demo-Backend vorhanden</span></div>
                <div><strong>M2.7 Assessment</strong><p>40 Lite- und 67 Continuous-Testfälle vergleichen erwartete mit serverseitig beobachteten Policy-Entscheidungen. Positive Kontrollen prüfen auch, dass erlaubte Aktionen möglich bleiben.</p><span className="sp-status sp-status-live">Policy-Level Tests im Demo</span></div>
                <div><strong>Evidence & Findings</strong><p>Decision IDs, Policy-Version, einzelne Prüfpunkte und exportierbare Assessment-Ergebnisse. Die Aussagekraft bleibt auf die tatsächlich ausgeführten Testfälle begrenzt.</p><span className="sp-status sp-status-live">Im Demo vorhanden</span></div>
                <div><strong>AgentProof Runtime Analysis</strong><p>Die separate AgentProof-Codebasis enthält Manifest-Analyse, Contract-Prüfung gegen bereitgestellte Runtime-Events, Finding-/Remediation-Struktur und SHA-256 Evidence Hashes.</p><span className="sp-status sp-status-separate">Separate Engine · noch nicht in diesen Flow integriert</span></div>
                <div><strong>Agent discovery & adversarial planning</strong><p>AgentProof enthält authentifizierte Discovery für explizit autorisierte Non-production-Agenten sowie einen optionalen, nicht-destruktiven Hypothesenplaner.</p><span className="sp-status sp-status-separate">Separate Plattformfunktionen · Konfiguration nötig</span></div>
                <div><strong>Produktive Durchsetzung bei S-PRO-Kunden</strong><p>Einbindung als Policy Decision Point mit Enforcement im geschützten API-Service oder MCP-Wrapper. Die echte Runtime-Ereignisquelle und die sichere Identitäts- und Freigabebindung würden wir gemeinsam definieren.</p><span className="sp-status sp-status-next">Gemeinsame Integrationsarbeit</span></div>
              </div>
              <p className="sp-limit-note">Wichtig: Die 40/67 Tests sind in diesem Demonstrator Policy-Tests – kein autonomer Penetrationstest. Die Approval-Felder sind Testeingaben, keine kryptografisch signierten Einmalfreigaben. Die produktive Integration in eine externe S-PRO-Runtime ist noch nicht Bestandteil dieser Demo.</p>
            </section>

            <section className="sp-section" id="sp-pilot">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">VORSCHLAG FÜR DIE ZUSAMMENARBEIT</div><h3>Mit einem klar begrenzten Kunden-Use-Case starten</h3></div>
                <p>Kein Plattformwechsel und kein Zugriff auf ein ganzes Banksystem. Wir würden zuerst den einen Workflow auswählen, bei dem die Autorisierungsgrenze am wichtigsten ist.</p>
              </div>
              <div className="sp-pilot-steps">
                <article><span>01</span><h4>Use Case auswählen</h4><p>Zum Beispiel AML-Alert-Triage, KYC-Statusänderung oder eine Refund-Freigabe.</p></article>
                <article><span>02</span><h4>Authority Contract definieren</h4><p>Agent, Auftraggeber, Aktion, Kunde/Konto, Zweck, Parameter, Limit und notwendige Freigabe festhalten.</p></article>
                <article><span>03</span><h4>Im Testsystem prüfen</h4><p>Erlaubte und verbotene Szenarien ausführen, Evidence sichern und konkrete Findings dokumentieren.</p></article>
                <article><span>04</span><h4>Integration bewerten</h4><p>Gemeinsam entscheiden, ob SHEWIUN vor einer kritischen API-Aktion eingebunden wird und wie ein Retest abläuft.</p></article>
              </div>
              <div className="sp-next-call">
                <div><strong>Was wir im nächsten Gespräch gemeinsam klären sollten</strong><p>Welcher bestehende S-PRO-Agent hat eine kritische Aktion? Welche Identitäts- und Runtime-Daten können im Non-production-System bereitgestellt werden? An welcher API oder welchem Tool lässt sich die Grenze sinnvoll prüfen?</p></div>
                <div className="sp-next-question">Welcher Ihrer bestehenden Agenten wäre der beste Kandidat für einen ersten gemeinsamen Pilot?</div>
              </div>
            </section>

            <footer className="sp-footer">
              <span>SHEWIUN · Business Authority & Agent Authorization Assurance</span>
              <span>Vorbereitete Partnerdiskussion · Synthetischer Demonstrator</span>
            </footer>
          </div>}

          {section === "uebersicht" && <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-top"><span>Identitäten</span><span className="stat-icon"><Icon name="shield" /></span></div><div className="stat-value">{counts.people + counts.agents || "—"}</div><div className="stat-foot">{counts.people} Personen <span>·</span> {counts.agents} KI-Agenten</div></div>
              <div className="stat-card"><div className="stat-top"><span>Aktive Vollmachten</span><span className="stat-icon"><Icon name="file" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "VOLLMACHT").length || "—"}</div><div className="stat-foot">Geschäftliche Autoritätsbeziehungen</div></div>
              <div className="stat-card"><div className="stat-top"><span>Delegationen</span><span className="stat-icon"><Icon name="graph" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "DELEGATION").length || "—"}</div><div className="stat-foot">Explizit übertragene Teilrechte</div></div>
              <div className="stat-card"><div className="stat-top"><span>Verweigerte Aktionen</span><span className="stat-icon danger"><Icon name="lock" /></span></div><div className="stat-value">{counts.denied}</div><div className="stat-foot">Laufzeitentscheidungen · VERWEIGERT</div></div>
            </div>

            <div className="section-grid">
              <section className="panel graph-panel">
                <div className="panel-header"><div><div className="panel-kicker">BUSINESS AUTHORITY GRAPH</div><h2>Geschäftliche Autorität</h2><p>Organisation → natürliche Personen → Agenten → geschützte Ressourcen</p></div><button className="text-button" onClick={() => setSection("graph")}>Graph öffnen <Icon name="arrow" /></button></div>
                <AuthorityGraph nodes={nodes} edges={edges} />
                <div className="graph-legend"><span><i className="legend-human" />Mensch</span><span><i className="legend-agent" />KI-Agent</span><span><i className="legend-resource" />Ressource</span><span><i className="legend-line" />Delegation / Vollmacht</span></div>
              </section>
              <section className="panel authority-panel">
                <div className="panel-header"><div><div className="panel-kicker">WIRKSAME BERECHTIGUNG</div><h2>Zahlungsagent 01</h2><p>Abgeleitet aus der CFO-Vollmacht</p></div><Badge tone="good">AKTIV</Badge></div>
                <div className="limit-block"><span>Wirksames Zahlungslimit</span><strong>{effectiveLimit === null ? "—" : money(effectiveLimit)}</strong><small>Ursprung: CHF 100.000 · Delegation: CHF 10.000</small></div>
                <div className="authority-row"><span>Handelnde Person</span><strong>Anna Müller · CFO</strong></div>
                <div className="authority-row"><span>Ressource</span><strong>Geschäftskonto ·•••• 1001</strong></div>
                <div className="authority-row"><span>Erlaubte Aktion</span><strong><code>payment.create</code></strong></div>
                <div className="authority-row"><span>Weiterdelegation</span><Badge tone="bad">NICHT ERLAUBT</Badge></div>
                <div className="authority-row"><span>Technischer Aussteller</span><strong>shewiun-demo-issuer</strong></div>
                <div className="authority-row"><span>Widerruf</span><Badge tone="good">AKTIV PRÜFBAR</Badge></div>
                <div className="panel-footnote">Demo-Konfiguration · Effektives Limit wird serverseitig aus der Berechtigungskette berechnet.</div>
              </section>
            </div>

            <section className="panel test-panel">
              <div className="panel-header"><div><div className="panel-kicker">LAUFZEIT-DURCHSETZUNG · TESTUMGEBUNG</div><h2>Autorisierung praktisch prüfen</h2><p>Die Aktion wird durch die API geprüft. Nur eine erlaubte Aktion erzeugt einen Zahlungsdatensatz.</p></div><Badge tone="warn">SYNTHETISCHE DATEN</Badge></div>
              <div className="test-actions"><div className="test-case"><div><strong>Reguläre Zahlung</strong><small>CHF 5.000 · innerhalb der delegierten Vollmacht</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-primary" onClick={() => runPayment(5000)}>Zahlung ausführen <Icon name="arrow" /></button></div><div className="test-case"><div><strong>Limitüberschreitung</strong><small>CHF 15.000 · oberhalb der delegierten Vollmacht</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-danger" onClick={() => runPayment(15000)}>Verweigerung testen <Icon name="arrow" /></button></div></div>
              {result && <div className={result.ok ? "result-box result-good" : "result-box result-bad"}><span>{result.ok ? "✓" : "!"}</span><div><strong>{result.ok ? "Aktion autorisiert" : "Aktion verweigert"}</strong><p>{result.text}</p></div></div>}
            </section>

            <section className="panel differentiation-panel">
              <div className="panel-header"><div><div className="panel-kicker">PRODUKTGRENZE</div><h2>Agenten ausführen lassen. Geschäftliche Autorität separat kontrollieren.</h2><p>SHEWIUN ersetzt kein Agenten-Framework. Es ergänzt es um ein eigenständiges, deterministisches Autoritäts- und Durchsetzungsmodell.</p></div></div>
              <div className="differentiation-grid">
                <div><span className="diff-number">01</span><strong>Vollmacht verstehen</strong><p>Menschen, Rechtsträger, Ressourcen und geschäftliche Mandate als zusammenhängenden Autoritätsgraph modellieren.</p></div>
                <div><span className="diff-number">02</span><strong>Delegation begrenzen</strong><p>Agenten erhalten nur ausdrücklich delegierte Teilrechte. Limits, Aktionen, Gültigkeit und Weiterdelegation werden je Stufe reduziert.</p></div>
                <div><span className="diff-number">03</span><strong>Vor Mutation entscheiden</strong><p>Eine unabhängige Policy-Entscheidung prüft die konkrete Aktion serverseitig, bevor die geschützte Geschäfts-API Daten verändert.</p></div>
              </div>
              <div className="integration-flow"><div><small>01 · AGENTEN-RUNTIME</small><strong>Aktion anfordern</strong><span>Identität · Auftrag · Ressource · Parameter</span></div><b>→</b><div><small>02 · SHEWIUN PDP</small><strong>Autorität berechnen</strong><span>Vollmacht · Delegation · Richtlinie · Kontext</span></div><b>→</b><div><small>03 · ENFORCEMENT</small><strong>ALLOW / DENY</strong><span>Geschützte API nur nach positiver Entscheidung</span></div><b>→</b><div><small>04 · EVIDENCE</small><strong>Nachweis sichern</strong><span>Entscheidungs-ID · Policy-Version · Hash-Kette</span></div></div>
            </section>

            <section className="panel events-panel"><div className="panel-header"><div><div className="panel-kicker">NACHVOLLZIEHBARKEIT</div><h2>Letzte Autorisierungsentscheidungen</h2></div><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "HASH-KETTE GÜLTIG" : auditIntegrity === false ? "HASH-KETTE FEHLERHAFT" : "INTEGRITÄT UNGEPRÜFT"}</Badge><button className="text-button" onClick={() => setSection("laufzeit")}>Alle Ereignisse <Icon name="arrow" /></button></div><EventTable events={events.slice(0, 5)} /></section>
          </>}

          {section === "graph" && <section className="panel graph-full"><div className="panel-header"><div><div className="panel-kicker">GRAPH DER GESCHÄFTLICHEN VOLLMACHTEN</div><h2>Autoritätsbeziehungen</h2><p>Die Darstellung basiert auf den im Backend gespeicherten Vollmachten und Delegationen.</p></div><Badge tone="good">BACKEND-DATEN</Badge></div><AuthorityGraph nodes={nodes} edges={edges} large /><div className="graph-legend"><span><i className="legend-human" />Mensch</span><span><i className="legend-agent" />KI-Agent</span><span><i className="legend-resource" />Ressource</span><span><i className="legend-line" />Vollmacht / Delegation</span></div><div className="graph-table"><h3>Beziehungen im Graph</h3><table><thead><tr><th>Typ</th><th>Von</th><th>Nach</th><th>Limit</th></tr></thead><tbody>{edges.map(e=><tr key={e.id}><td>{e.typ}</td><td>{e.von}</td><td>{e.nach}</td><td>{money(e.limit)}</td></tr>)}</tbody></table></div></section>}

          {section === "berechtigungen" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">WIRKSAME BERECHTIGUNG</div><h2>Effektive Berechtigungen</h2><p>Die wirksame Berechtigung ergibt sich aus der Schnittmenge aller gültigen Autoritätsstufen.</p></div></div><div className="permission-chain"><div><small>URSPRUNGS-VOLLMACHT</small><strong>Anna Müller · CFO</strong><b>CHF 100.000</b><span>payment.create · payment.read · payment.approve</span></div><div className="chain-arrow">↓</div><div><small>DELEGATION</small><strong>Zahlungsagent 01</strong><b>CHF 10.000</b><span>payment.create · payment.read</span></div><div className="chain-arrow">↓</div><div className="effective-result"><small>EFFEKTIVE AUTORITÄT</small><strong>Minimale wirksame Grenze</strong><b>CHF 10.000</b><span>Weiterdelegation: nicht gestattet</span></div></div><div className="notice"><strong>Entscheidungsprinzip</strong><p>Eine Delegation kann Rechte einschränken, aber niemals die Ursprungsvollmacht erweitern. Nicht eindeutig auflösbare oder widerrufene Autoritätsketten werden verweigert.</p></div></section>}


          {section === "autorisierung" && <div className="authorization-workspace">
            <section className="panel">
              <div className="panel-header">
                <div><div className="panel-kicker">DETERMINISTISCHER POLICY DECISION POINT</div><h2>Eine Berechtigung ist noch keine ausführbare Geschäftsaktion.</h2>
                  <p>SHEWIUN prüft den konkreten Auftrag entlang Identität, Permission-Bindung, Zweck, Ressource, Vollmacht, Parametern und Freigabe.</p></div>
                <Badge tone="good">FAIL-CLOSED</Badge>
              </div>
              <div className="auth-flow">
                <div><small>01 · IDENTITY</small><strong>Wer handelt?</strong><span>Agent · Aussteller · Auftraggeber</span></div><b>→</b>
                <div><small>02 · CONTRACT</small><strong>Was ist erlaubt?</strong><span>Zweck · Tool · Permission</span></div><b>→</b>
                <div><small>03 · PDP</small><strong>Was ist wirksam?</strong><span>Vollmacht · Ressource · Parameter</span></div><b>→</b>
                <div><small>04 · PEP</small><strong>Ausführung sperren</strong><span>ALLOW / DENY vor Mutation</span></div><b>→</b>
                <div><small>05 · EVIDENCE</small><strong>Nachweis</strong><span>Entscheidung · Policy · Hash-Kette</span></div>
              </div>
            </section>


            <section className="panel auth-authority-analysis">
              <div className="panel-header"><div><div className="panel-kicker">AUTHORITY DELTA · PERMISSION COMPOSITION</div><h2>Beabsichtigte, wirksame und nicht delegierte Autorität</h2><p>Die Gegenüberstellung basiert auf den geladenen Vollmachts- und Delegationsbeziehungen im Business Authority Graph.</p></div><Badge tone="good">GRAPH-BASIERT</Badge></div>
              <div className="auth-analysis-grid">
                <article><small>INTENDED AUTHORITY</small><strong>Lieferantenzahlung</strong><p>Geschäftszweck: supplier_payment</p><p>Ressource: Geschäftskonto ·•••• 1001</p><p>Konkrete Aktion: payment.create</p></article>
                <article className="auth-analysis-effective"><small>EFFECTIVE AUTHORITY</small><strong>{money(agentDelegation?.limit)} {agentDelegation?.waehrung || "CHF"}</strong><p>Agent: Zahlungsagent 01</p><p>Aktionen: {effectiveActions.join(" · ") || "Nicht geladen"}</p><p>Weiterdelegation: {agentDelegation?.delegierbar ? "erlaubt" : "nicht gestattet"}</p></article>
                <article><small>AUTHORITY DELTA</small><strong>{retainedByPrincipal.length} Rechte nicht übertragen</strong><p>{retainedByPrincipal.join(" · ") || "Keine zusätzlichen Rechte im Ursprung"} bleiben beim Vollmachtgeber.</p><p>Eine Tool-Permission erweitert diese Delegation nicht.</p></article>
                <article><small>PERMISSION COMPOSITION</small><strong>Tool ≠ Business Authority</strong><p>Mehrere technisch verfügbare Tools ergeben keine neue geschäftliche Vollmacht.</p><p>Die finale Geschäftsaktion wird separat gegen Ressource, Zweck, Betrag und Freigabe geprüft.</p></article>
              </div>
              <div className="auth-reachability">
                <div className="auth-reachability-heading"><strong>Business-Action-Reachability</strong><span>Abgeleitet aus den aktuell delegierten Aktionen</span></div>
                {[
                  {action:"payment.create",label:"Lieferantenzahlung erstellen",kind:effectiveActions.includes("payment.create")?"conditional":"denied",detail:"Nur mit gültiger Vollmacht, Konto-Scope, Betrag innerhalb des Limits und ggf. frischer Freigabe."},
                  {action:"payment.read",label:"Zahlungen lesen",kind:effectiveActions.includes("payment.read")?"allowed":"denied",detail:"Nur im delegierten Ressourcen- und Mandantenkontext."},
                  {action:"payment.approve",label:"Zahlung freigeben",kind:effectiveActions.includes("payment.approve")?"conditional":"denied",detail:"Die Ursprungsvollmacht enthält diese Aktion, sie wurde dem Agenten jedoch nicht übertragen."},
                  {action:"beneficiary.update",label:"Begünstigte ändern",kind:"denied",detail:"Nicht Bestandteil der Ursprungsvollmacht und der Agentendelegation."},
                ].map(item=><div className="auth-reachability-row" key={item.action}><code>{item.action}</code><strong>{item.label}</strong><Badge tone={item.kind === "allowed" ? "good" : item.kind === "conditional" ? "warn" : "bad"}>{item.kind === "allowed" ? "IM SCOPE" : item.kind === "conditional" ? "BEDINGT" : "NICHT DELEGIERT"}</Badge><p>{item.detail}</p></div>)}
              </div>
            </section>

            <div className="authorization-grid">
              <section className="panel auth-console">
                <div className="panel-header"><div><div className="panel-kicker">POLICY-TESTKONSOLE</div><h2>Konkrete Agentenaktion prüfen</h2><p>Alle Eingaben werden serverseitig deterministisch ausgewertet und als Entscheidung protokolliert.</p></div><Badge tone="warn">SANDBOX</Badge></div>
                <div className="auth-presets">
                  <button onClick={() => setAuthorizationPreset("standard")}>Standardfall</button>
                  <button onClick={() => setAuthorizationPreset("broad_scope")}>Breiter Scope</button>
                  <button onClick={() => setAuthorizationPreset("permission_mismatch")}>Permission-Mismatch</button>
                  <button onClick={() => setAuthorizationPreset("identity_mismatch")}>Falsche Identität</button>
                  <button onClick={() => setAuthorizationPreset("purpose_mismatch")}>Falscher Zweck</button>
                  <button onClick={() => setAuthorizationPreset("approval_missing")}>Freigabe fehlt</button>
                  <button onClick={() => setAuthorizationPreset("approval_stale")}>Freigabe veraltet</button>
                  <button onClick={() => setAuthorizationPreset("approval_fresh")}>Frische Freigabe</button>
                </div>
                <div className="auth-form-grid">
                  <label className="auth-field"><span>Transaktionsbetrag · CHF</span><input type="number" min="0" step="0.01" value={authInput.amount} onChange={e => setAuthInput(v => ({ ...v, amount: e.target.value }))} /></label>
                  <label className="auth-field"><span>Geschäftszweck</span><select value={authInput.purpose} onChange={e => setAuthInput(v => ({ ...v, purpose: e.target.value }))}><option value="supplier_payment">Lieferantenzahlung</option><option value="account_enumeration">Konten auflisten</option></select></label>
                  <label className="auth-field"><span>Runtime-Aussteller</span><select value={authInput.runtime_identity} onChange={e => setAuthInput(v => ({ ...v, runtime_identity: e.target.value }))}><option value="shewiun-demo-issuer">Registrierter Demo-Aussteller</option><option value="unknown-runtime">Unbekannter Aussteller</option></select></label>
                  <label className="auth-field"><span>Tool</span><select value={authInput.tool} onChange={e => setAuthInput(v => ({ ...v, tool: e.target.value }))}><option value="payment.create">payment.create</option><option value="payment.execute">payment.execute</option></select></label>
                  <label className="auth-field"><span>Permission</span><select value={authInput.permission} onChange={e => setAuthInput(v => ({ ...v, permission: e.target.value }))}><option value="payment.create">payment.create</option><option value="beneficiary.update">beneficiary.update</option></select></label>
                  <label className="auth-field"><span>Daten- / Ressourcenumfang</span><select value={authInput.data_scope} onChange={e => setAuthInput(v => ({ ...v, data_scope: e.target.value }))}><option value={ACCOUNT}>Nur Konto ·•••• 1001</option><option value="*">Alle Konten / global</option></select></label>
                </div>
                <div className="auth-approval">
                  <div><strong>Zusätzliche Freigabe</strong><small>Ab CHF 7.500 verlangt die Demo-Policy eine vorhandene und frische Freigabe.</small></div>
                  <label><input type="checkbox" checked={authInput.approval_present} onChange={e => setAuthInput(v => ({ ...v, approval_present: e.target.checked }))} /> Vorhanden</label>
                  <label><input type="checkbox" checked={authInput.approval_fresh} onChange={e => setAuthInput(v => ({ ...v, approval_fresh: e.target.checked }))} /> Frisch</label>
                </div>
                {authError && <div className="result-box result-bad"><span>!</span><div><strong>Prüfung fehlgeschlagen</strong><p>{authError}</p></div></div>}
                <div className="auth-submit-row"><button disabled={authBusy || apiState !== "verbunden" || !authInput.amount} className="button button-primary" onClick={runAuthorizationEvaluation}>{authBusy ? "Prüfung läuft …" : "Policy serverseitig auswerten"} <Icon name="arrow" /></button><span>Keine Zahlung wird in diesem Tab ausgeführt.</span></div>
              </section>

              <section className="panel auth-result-panel">
                <div className="panel-header"><div><div className="panel-kicker">ENTSCHEIDUNGS-TRACE</div><h2>Prüfergebnis</h2><p>Einzelne Kontrollpunkte statt eines undurchsichtigen Gesamtscores.</p></div></div>
                {!authEvaluation ? <div className="auth-empty">Wähle einen Testfall und starte die Policy-Auswertung. Die Entscheidung und alle Kontrollpunkte erscheinen hier.</div> : <>
                  <div className={authEvaluation.entscheidung === "ALLOW" ? "auth-decision auth-allow" : "auth-decision auth-deny"}>
                    <div><small>POLICY DECISION</small><strong>{authEvaluation.entscheidung}</strong><span>{authEvaluation.grund}</span></div>
                    <Badge tone={authEvaluation.entscheidung === "ALLOW" ? "good" : "bad"}>{authEvaluation.entscheidung === "ALLOW" ? "ERLAUBT" : "VERWEIGERT"}</Badge>
                  </div>
                  <div className="auth-check-list">{authEvaluation.checks.map(check => <div className="auth-check-row" key={check.control}>
                    <span className={check.result === "pass" ? "auth-check-state pass" : check.result === "fail" ? "auth-check-state fail" : "auth-check-state na"}>{check.result === "pass" ? "PASS" : check.result === "fail" ? "FAIL" : "N/A"}</span>
                    <div><strong>{({ identity: "Identität", permission: "Tool / Permission", purpose: "Geschäftszweck", resource_scope: "Ressourcen-Scope", business_authority: "Business Authority", parameters: "Parameter & Limits", approval: "Freigabe" } as Record<string, string>)[check.control] || check.control}</strong><p>{check.detail}</p></div>
                  </div>)}</div>
                  <div className="auth-evidence"><div><small>DECISION ID</small><code>{authEvaluation.decision_id}</code></div><div><small>POLICY</small><code>{authEvaluation.policy_version}</code></div><div><small>DELEGATIONSPFAD</small><code>{authEvaluation.delegationspfad.join(" → ") || "—"}</code></div></div>
                  <p className="auth-trust-note">Claim-Level: Policy-Evaluation · Runtime-Ausführung beobachtet: nein. Freigabestatus ist hier ein Demo-Testinput, keine kryptografisch verifizierte menschliche Freigabe.</p>
                </>}
              </section>
            </div>
          </div>}

          {section === "laufzeit" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">AUTORISIERUNGS-ENTSCHEIDUNGSINSTANZ</div><h2>Laufzeitkontrolle</h2><p>Jede geschützte Aktion wird unabhängig von der Agentenlogik serverseitig bewertet.</p></div><Badge tone="good">STANDARD: VERWEIGERN</Badge></div><EventTable events={events} /></section>}

          {section === "freigaben" && <section className="panel empty-state"><div className="empty-icon"><Icon name="check" /></div><h2>Action-bound approval · Integrationsdesign</h2><p>Die Policy-Demo prüft aktuell nur, ob ein Freigabe-Flag vorhanden und frisch ist. Für einen produktiven Kundenworkflow müsste die Freigabe kryptografisch an Agent, Aktion, Ressource, Betrag, Empfänger, Ablaufzeit und Einmalverwendung gebunden werden. Die Human-Approval-Oberfläche und signierte Capability sind hier noch nicht implementiert.</p><Badge tone="warn">REFERENCE · NOT LIVE</Badge></section>}

          {section === "nachweise" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">PRÜFNACHWEISE</div><h2>Autorisierungsnachweise</h2><p>Gespeicherte Entscheidungen mit Policy-Version, Delegationspfad und Entscheidungsgrund.</p></div></div><EventTable events={events} /></section>}

          {section === "assessment" && <div className="assessment-workspace">
            <section className="panel assessment-hero"><div><div className="panel-kicker">M2.7 LITE · AUTHORIZATION ASSESSMENT</div><h2>Was kann ein Agent mit seinen tatsächlichen Rechten bewirken?</h2><p>Definiere die erlaubte Grenze, fordere sie mit kontrollierten Szenarien heraus und prüfe, ob die Policy wie erwartet erlaubt oder verweigert. Jeder Test wird serverseitig ausgewertet und erhält eine Decision ID.</p><div className="assessment-tags"><span>Authorization Contract</span><span>Parameter & Scope</span><span>Composition</span><span>Evidence-backed</span><span>Exact Retest</span></div></div><div className="assessment-run-card"><small>ASSESSMENT PROFILE</small><div className="profile-switch"><button className={assessmentProfile==="lite"?"selected":""} onClick={()=>setAssessmentProfile("lite")}>M2.7 Lite · 40</button><button className={assessmentProfile==="continuous"?"selected":""} onClick={()=>setAssessmentProfile("continuous")}>Continuous · 67</button></div><strong>{assessmentBusy?assessmentProgress+" / "+(assessmentProfile==="lite"?40:67)+" TESTS":assessmentResults.length?assessmentResults.filter(x=>x.matched).length+" / "+assessmentResults.length+" MATCHED":"READY TO RUN"}</strong><div className="assessment-progress"><i style={{width:(assessmentProgress/(assessmentProfile==="lite"?40:67)*100)+"%"}}/></div><p>{assessmentResults.length?"Policy-Entscheidungen aus dem letzten Testlauf.":"40 Tests für 1 Agent / 1 MCP-ähnliche Tool-Oberfläche / 1 kritischen Workflow."}</p><button className="button button-primary" disabled={assessmentBusy||apiState!=="verbunden"} onClick={()=>runSecurityAssessment()}>{assessmentBusy?"Assessment läuft …":"Assessment starten"} <Icon name="arrow"/></button>{assessmentResults.length>0&&<button className="button button-secondary report-button" onClick={exportAssessmentReport}>JSON-Evidence exportieren</button>}</div></section>
            <div className="assessment-kpis"><article><small>TESTS</small><strong>{assessmentProfile==="lite"?"40":"67"}</strong><span>{assessmentProfile==="lite"?"M2.7 Lite":"Continuous Assurance"}</span></article><article><small>COMPOSITION</small><strong>{assessmentProfile==="lite"?"3":"10"}</strong><span>Kombinierte Kontrollgrenzen</span></article><article><small>POSITIVE CONTROLS</small><strong>{assessmentProfile==="lite"?"6":"14"}</strong><span>Legitime Aktionen bleiben möglich</span></article><article><small>WORKFLOW</small><strong>1</strong><span>Agent · Zahlungsworkflow · Sandbox</span></article></div>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZATION CONTRACT</div><h2>Die geprüfte Autorisierungsgrenze</h2><p>Ein Test ist aussagekräftig, wenn die erwartete Business Authority vorab eindeutig beschrieben ist.</p></div><Badge tone="good">CONTRACT DEFINED</Badge></div><div className="contract-grid">{[["Principal","Payment Agent 01","Registrierter Demo-Aussteller"],["Acting for","Anna Müller · CFO","Synthetischer Vollmachtgeber"],["Resource","Corporate Account · 1001","Mandantengebundener Scope"],["Action","payment.create","Kritischer Lieferantenzahlungs-Workflow"],["Limit","CHF 10.000","Aus Delegationskette berechnet"],["Approval","Ab CHF 7.500","Demo-Input, nicht kryptografisch signiert"]].map(([a,b,c])=><article key={a}><small>{a}</small><strong>{b}</strong><p>{c}</p></article>)}</div></section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">TEST COVERAGE</div><h2>Was wird tatsächlich geprüft?</h2><p>40 Lite-Tests enthalten Boundary-Tests und Composition-Szenarien.</p></div><Badge tone="warn">POLICY LEVEL</Badge></div><div className="coverage-grid">{[["Identity & tenant","Agent, Vollmachtgeber, Issuer und Mandant"],["Permission composition","Tool, Permission und Business Action exakt binden"],["Purpose & context","Abweichender Geschäftszweck und Kontextwechsel"],["Resource scope","Konto-Scope, fremde Ressource und globale Wildcards"],["Parameters","Betragsgrenzen, Währung und Grenzwerte"],["Approval boundary","Vorhanden, frisch und kombinierte Zustände"],["MCP surface","MCP-ähnliche Tool-Contract-Prüfung, kein echter MCP-Interceptor"],["Replay observation","Wiederholte PDP-Anfrage; keine kryptografische Replay-Abwehr"]].map(([a,b])=><article key={a}><strong>{a}</strong><p>{b}</p></article>)}</div></section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">LIVE RESULTS · EXPECTED VS OBSERVED</div><h2>Security Assessment Evidence</h2><p>Ein erwartetes DENY ist ein bestandener Test. Unerwartetes ALLOW oder API-Fehler werden als Abweichung markiert.</p></div><Badge tone={assessmentResults.length&&assessmentResults.every(x=>x.matched)?"good":assessmentResults.length?"bad":"neutral"}>{assessmentResults.length?assessmentResults.every(x=>x.matched)?"ALL EXPECTATIONS MET":"DEVIATION DETECTED":"NO RUN"}</Badge></div>{assessmentResults.length===0?<div className="assessment-empty">Starte das Assessment. Die Suite führt echte Policy-Aufrufe gegen das SHEWIUN-Demo-Backend aus; sie simuliert keine Resultate.</div>:<><div className="assessment-summary"><strong>{assessmentResults.filter(x=>x.matched).length} / {assessmentResults.length} erwartungsgemäss</strong><span>{assessmentResults.filter(x=>!x.matched).length} Abweichungen</span><span>{assessmentResults.filter(x=>x.actual==="ALLOW").length} ALLOW</span><span>{assessmentResults.filter(x=>x.actual==="DENY").length} DENY</span></div><div className="assessment-result-list">{assessmentResults.map(item=><article key={item.id} className="assessment-result"><div className={item.matched?"result-indicator pass":"result-indicator fail"}>{item.matched?"PASS":"GAP"}</div><div className="assessment-result-main"><small>{item.category} · TEST {item.id}</small><strong>{item.title}</strong><p>{item.reason}</p><div className="assessment-check-pills">{item.checks.map(check=><span key={check.control} className={check.result}>{check.control}: {check.result}</span>)}</div>{item.decision_id&&<code>{item.decision_id}</code>}</div><div className="assessment-expected"><small>EXPECTED / OBSERVED</small><strong>{item.expected} / {item.actual}</strong></div></article>)}</div></>}</section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">METHODOLOGY</div><h2>Define → Challenge → Observe → Retest</h2></div></div><div className="method-flow"><article><small>01 · DEFINE</small><strong>Authorization Contract</strong><p>Identity, purpose, action, scope, limits and approval.</p></article><b>→</b><article><small>02 · CHALLENGE</small><strong>40+ Test Cases</strong><p>Parameter boundaries, scope escape and composition.</p></article><b>→</b><article><small>03 · OBSERVE</small><strong>Evidence-backed Findings</strong><p>Decision ID, policy version, checks and reason code.</p></article><b>→</b><article><small>04 · RETEST</small><strong>Exact Replay</strong><p>Identischer Testkatalog gegen die aktualisierte Policy.</p></article></div><p className="claim-note">Replay wiederholt hier die Policy-Anfrage; es beweist keine kryptografische Nonce-/Replay-Abwehr. Approval ist ein Demo-Input, keine signierte Capability.</p></section>
          </div>}
          {section === "findings" && <div className="findings-workspace"><section className="panel"><div className="panel-header"><div><div className="panel-kicker">FINDINGS · REMEDIATION · RETEST</div><h2>Vom Kontrollfehler zum verifizierten Nachweis.</h2><p>Findings werden aus Abweichungen des letzten Testlaufs abgeleitet. Erwartete DENY-Entscheidungen sind keine Findings.</p></div><Badge tone={assessmentResults.some(x=>!x.matched)?"bad":assessmentResults.length?"good":"warn"}>{assessmentResults.some(x=>!x.matched)?"REVIEW REQUIRED":assessmentResults.length?"NO OPEN FINDINGS":"ASSESSMENT AUSSTEHEND"}</Badge></div>{!assessmentResults.length?<div className="assessment-empty">Noch kein Testlauf. Führe zuerst ein M2.7 Assessment aus.</div>:assessmentResults.some(x=>!x.matched)?assessmentResults.filter(x=>!x.matched).map(item=><article className="finding-card" key={item.id}><div className="finding-card-head"><Badge tone="bad">CONTROL DEVIATION</Badge><code>TEST-{item.id}</code></div><h3>{item.title}</h3><p>Expected <strong>{item.expected}</strong>, observed <strong>{item.actual}</strong>. {item.reason}</p><div className="finding-remediation"><small>REMEDIATION HYPOTHESIS</small><strong>Kontrollgrenze im Authorization Contract oder im geschützten API-PEP korrigieren und denselben Test unverändert erneut ausführen.</strong></div><p className="claim-note">Decision ID: {item.decision_id||"keine Policy-Entscheidung"} · Aus dem aktuellen Testlauf abgeleitet.</p></article>):<div className="no-findings-state"><strong>Keine Abweichung im letzten Testlauf erkannt.</strong><p>{assessmentResults.length} von {assessmentResults.length} erwarteten Entscheidungen stimmen mit der serverseitigen Policy überein. Dies gilt nur für die ausgeführten Testfälle.</p></div>}</section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">EXACT REMEDIATION REPLAY</div><h2>Gleiche Szenarien erneut ausführen</h2><p>Der identische Katalog wird gegen die aktuelle Policy ausgeführt. Neue Decision IDs machen den zweiten Lauf nachvollziehbar.</p></div></div><div className="retest-grid"><article><small>BASELINE</small><strong>{assessmentTimestamp?new Date(assessmentTimestamp).toLocaleString("de-CH"):"Noch kein Lauf"}</strong><p>Zuletzt ausgeführte Suite</p></article><article><small>RETEST</small><strong>{assessmentProfile==="lite"?"40":"67"} identische Tests</strong><p>Neue Policy-Entscheidungen</p></article><article><small>COMPARISON</small><strong>Expected vs observed</strong><p>Abweichungen und Kontrollstatus</p></article></div><button className="button button-primary" disabled={assessmentBusy||apiState!=="verbunden"} onClick={()=>runSecurityAssessment()}>{assessmentBusy?"Retest läuft …":"Exact Retest starten"} <Icon name="arrow"/></button><p className="claim-note">Finding-Historie wird nicht dauerhaft verwaltet. Policy-Entscheidungen werden vom Backend im Audit-Store protokolliert; Persistenz hängt vom Datenbankbetrieb ab.</p></section></div>}
          {section === "workspace" && <div className="workspace-security"><section className="panel workspace-hero"><div><div className="panel-kicker">ENTERPRISE WORKSPACE · TENANT & IDENTITY</div><h2>Ein kontrollierter Arbeitsbereich für Security, Engineering und Risk.</h2><p>Die Demo zeigt Architektur- und Kontrollstatus transparent, ohne einen nicht eingerichteten Login vorzutäuschen.</p></div><div className="workspace-tenant-card"><small>ACTIVE DEMO TENANT</small><strong>Alpenbank Demo AG</strong><span>org-alpenbank · CH · SANDBOX</span><Badge tone="warn">SYNTHETIC WORKSPACE</Badge></div></section><div className="workspace-stats"><article><small>HUMAN SSO</small><strong>Not configured</strong><span>OIDC / SAML nicht verbunden</span></article><article><small>AGENT IDENTITY</small><strong>Demo issuer</strong><span>Kein OIDC Workload Token</span></article><article><small>TENANT ISOLATION</small><strong>Server-side scoping</strong><span>PostgreSQL RLS noch nicht aktiv</span></article><article><small>EVIDENCE STORE</small><strong>{storageMode}</strong><span>Persistenzstatus aus Backend-Health</span></article></div><section className="panel"><div className="panel-header"><div><div className="panel-kicker">ROLE-BASED ACCESS CONTROL</div><h2>Workspace-Rollenmodell</h2><p>Beispiel für eine gemeinsame S-PRO-/Kunden-Security-Umgebung. Noch keine durchgesetzte Benutzerverwaltung.</p></div><Badge tone="warn">REFERENCE MODEL</Badge></div><div className="workspace-role-table"><div className="workspace-role-row header"><span>Rolle</span><span>Assessments</span><span>Findings</span><span>Workspace / SSO</span></div>{[["Owner","Verwalten","Verwalten","Konfigurieren"],["Security Engineer","Ausführen / Retest","Bearbeiten","Kein Admin"],["Risk / Reviewer","Lesend","Review / Accept","Kein Admin"],["Viewer","Lesend","Lesend","Kein Admin"]].map(row=><div className="workspace-role-row" key={row[0]}>{row.map((v,i)=><span key={i}>{v}</span>)}</div>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">SSO & IDENTITY PROVIDERS</div><h2>Enterprise Login und Provisioning</h2><p>SSO authentifiziert Menschen. Workload Identity authentifiziert Maschinen. Business Authority entscheidet separat über die Geschäftsaktion.</p></div><Badge tone="warn">NOT CONNECTED</Badge></div><div className="idp-grid">{[["Microsoft Entra ID","OIDC / SAML 2.0"],["Okta","OIDC / SAML 2.0"],["Keycloak","OIDC / SAML 2.0"],["SCIM 2.0","User provisioning"]].map(([a,b])=><article key={a}><small>{b}</small><strong>{a}</strong><p>Als Identity Provider / Provisioning-Quelle vorgesehen.</p><Badge tone="warn">Nicht verbunden</Badge></article>)}</div><div className="workspace-controls">{[["MFA","IdP-enforced, phishing-resistant MFA"],["Group mapping","IdP-Gruppen auf Workspace-Rollen mappen"],["Session controls","Kurze Sessions, serverseitige Invalidierung"],["SCIM deprovisioning","Zugriff bei Offboarding entziehen"],["Workload identity","OIDC federation statt langlebiger Agenten-Keys"],["Break-glass","Zeitlich begrenzter, protokollierter Notfallzugriff"]].map(([a,b])=><div key={a}><strong>{a}</strong><span>{b}</span><Badge tone="warn">AUSBAUSTUFE</Badge></div>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">TENANT SECURITY POSTURE</div><h2>Kontrollstatus der Demo</h2></div></div><div className="workspace-posture">{[["Serverseitiger API-Proxy","API-Secret bleibt im Server-Kontext","good","Aktiv"],["Default Deny","Unbekannte Identitäten und Scopes werden abgelehnt","good","Aktiv"],["Mandanten-RLS","PostgreSQL Row-Level Security","warn","Nicht aktiv"],["Human SSO","OIDC / SAML Login","warn","Nicht verbunden"],["Workload Identity","OIDC Token Validation","warn","Nicht aktiv"],["Audit Anchor","Externe Verankerung der Hash-Kette","warn","Nicht aktiv"]].map(([a,b,t,l])=><article key={a}><strong>{a}</strong><p>{b}</p><Badge tone={t as "good"|"warn"}>{l}</Badge></article>)}</div></section></div>}
          {section === "integrationen" && <div className="integration-workspace"><section className="panel integration-hero"><div><div className="panel-kicker">VENDOR-NEUTRAL ENFORCEMENT LAYER</div><h2>SHEWIUN ergänzt S-PRO-Agenten an der geschützten Aktionsgrenze.</h2><p>Bestehende Agenten und Orchestratoren bleiben bestehen. SHEWIUN bewertet den Geschäftsauftrag vor der Mutation in der geschützten Kunden-API.</p></div><div className="integration-contract"><small>REFERENCE DECISION API</small><code>POST /api/v1/autorisierung/evaluieren</code><code>ALLOW | DENY</code><code>decision_id · checks · policy_version</code></div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">INTEGRATION SURFACES</div><h2>Ein Autorisierungsvertrag, mehrere technische Eintrittspunkte.</h2><p>Architektur-Referenz. Externe S-PRO- oder Kunden-Runtimes sind nicht verbunden.</p></div><Badge tone="warn">REFERENCE ARCHITECTURE</Badge></div><div className="integration-card-grid">{[["MCP Server / Tools","Tool-Aufruf mit Agent, Purpose, Resource Scope und kanonischen Parametern vor Ausführung prüfen.","MCP"],["REST / HTTP API","Policy Decision Point vor der geschützten Business-API-Mutation aufrufen.","REST"],["OpenAPI / SDK","API-Schemas als Ausgangspunkt für Business Actions und Permission Contracts verwenden.","SDK"],["Agent Frameworks","LangGraph, CrewAI, OpenAI Agents oder kundeneigene Orchestratoren bleiben unabhängig.","Framework-neutral"],["Cloud / IAM","Entra ID, AWS, GCP oder kundeneigene IdPs liefern technische Identitäts-Claims.","Cloud-neutral"],["SIEM / GRC / Audit","Decision IDs und Evidence Events an bestehende Security- und Governance-Prozesse übergeben.","Evidence"]].map(([a,b,c])=><article key={a}><small>{c}</small><strong>{a}</strong><p>{b}</p></article>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">REFERENCE ENFORCEMENT FLOW</div><h2>Wo SHEWIUN im S-PRO-Lösungsdesign sitzt</h2></div></div><div className="integration-flow integration-flow-enterprise"><div><small>01 · S-PRO AGENT</small><strong>Plan / Tool Call</strong><span>Agent runtime / orchestrator</span></div><b>→</b><div><small>02 · CUSTOMER PEP</small><strong>Action Intercept</strong><span>API / MCP wrapper</span></div><b>→</b><div><small>03 · SHEWIUN PDP</small><strong>Authority Decision</strong><span>Context · Policy · Delegation</span></div><b>→</b><div><small>04 · BUSINESS API</small><strong>Execute or Block</strong><span>Mutation after ALLOW</span></div><b>→</b><div><small>05 · EVIDENCE</small><strong>Audit & Retest</strong><span>Decision · Trace · Impact</span></div></div><p className="claim-note">S-PRO liefert Agenten und Prozessintegration; SHEWIUN adressiert die eigenständige Business-Authority- und Authorization-Security-Ebene. Schnittstelle und Verantwortungsgrenzen gemeinsam validieren.</p></section></div>}
          {section === "programme" && <div className="programme-workspace"><section className="panel"><div className="panel-header"><div><div className="panel-kicker">JOINT DELIVERY MODEL · COMMERCIAL CONCEPT</div><h2>Ein modularer Assurance-Baustein für ausgewählte S-PRO-Projekte.</h2><p>Der Umfang und die Preisgestaltung würden gemeinsam mit S-PRO pro Kunde und Workflow festgelegt. Diese Demo enthält bewusst keine unbestätigten Listenpreise oder nicht implementierten Enterprise-Versprechen.</p></div><Badge tone="warn">PARTNERSHIP CONCEPT</Badge></div><div className="programme-grid"><article className="programme-card"><small>01 · DESIGN & ASSESS</small><h3>Authorization Design Sprint</h3><div className="programme-scope">1 Agent · 1 Non-production Workflow · definierter Contract</div><ul>{["Business Authority Map","Allowed / denied action matrix","M2.7 Policy-Level Assessment","Findings mit konkreter Kontrollgrenze","Evidence Export und Retest-Plan"].map(x=><li key={x}>{x}</li>)}</ul><Badge tone="good">POTENTIAL ENTRY OFFER</Badge></article><article className="programme-card recommended"><small>02 · IMPLEMENT & VERIFY</small><h3>Runtime Control Integration</h3><div className="programme-scope">PDP / PEP · geschützte API · kundenkontrollierte Umgebung</div><ul>{["Authorization Contract in Service Layer","Server-side enforcement vor Mutation","Identity / resource / parameter binding","Human approval integration nach Kundenvorgabe","Non-production verification und handover"].map(x=><li key={x}>{x}</li>)}</ul><Badge tone="good">JOINT ENGINEERING</Badge></article><article className="programme-card"><small>03 · REVALIDATE</small><h3>Continuous Policy Assurance</h3><div className="programme-scope">Regression nach relevanten Änderungen</div><ul>{["Policy test suite versionieren","Änderungen an Modell / Prompt / Tools berücksichtigen","Gleiche Szenarien erneut ausführen","Before / after evidence vergleichen","Findings und offene Risiken nachverfolgen"].map(x=><li key={x}>{x}</li>)}</ul><Badge>RECURRING SERVICE OPPORTUNITY</Badge></article></div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>Was ist heute demonstrierbar?</h2><p>Eine belastbare Partnerschaft beginnt mit klaren Grenzen zwischen vorhandenem Produkt, separater Engine und gemeinsamer Integrationsarbeit.</p></div></div><div className="capability-table"><div><strong>In diesem Demo-Backend</strong><span>Business Authority Graph, deterministischer PDP mit sieben Kontrollgruppen, serverseitig geschützte Payment-Sandbox-Mutation, Audit-Hash-Kette, 40/67 Policy-Tests und JSON-Export.</span><Badge tone="good">IMPLEMENTED DEMO</Badge></div><div><strong>AgentProof Security Engine</strong><span>Agent-Manifest-Analyse, Contract-Auswertung gegen Event-Traces, SHA-256 Evidence Hash, Finding-/Remediation-Struktur, authentifizierte Sandbox-Agent-Discovery und eingeschränkte Identity-Auth-Probe.</span><Badge tone="warn">SEPARATE PLATFORM / INTEGRATION</Badge></div><div><strong>Joint implementation required</strong><span>Produktive MCP-Interception, durchgängige Runtime-Events aus S-PRO-Agenten, signierte einmalige Approval-Capabilities, vollständige SSO / Workload Identity, PostgreSQL-RLS und kundenspezifische SIEM-Anbindung.</span><Badge>NOT LIVE HERE</Badge></div></div></section></div>}

          {section === "system" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">SYSTEMSTATUS</div><h2>Integrationsstatus</h2><p>Technische Umgebung und aktuelle Schnittstellen.</p></div></div><div className="system-list"><div><span>Autorisierungs-API</span><Badge tone={apiState === "verbunden" ? "good" : "bad"}>{apiState === "verbunden" ? "Erreichbar" : "Nicht erreichbar"}</Badge></div><div><span>Datenhaltung</span><Badge tone={storageMode.startsWith("PostgreSQL") ? "good" : "warn"}>{storageMode}</Badge></div><div><span>Sandbox-Zahlungen</span><Badge tone="good">{payments} Datensätze</Badge></div><div><span>Policy-Version</span><code>SHEWIUN-BA-0.2.0</code></div><div><span>Audit-Integrität</span><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "Hash-Kette gültig" : auditIntegrity === false ? "Prüfung fehlgeschlagen" : "Nicht geprüft"}</Badge></div><div><span>Service-zu-Service</span><Badge tone={apiState === "verbunden" ? "good" : "warn"}>{apiState === "verbunden" ? "Geschützter Server-Proxy" : "Nicht verbunden"}</Badge></div>
          <div><span>Identitätsprüfung im Auftrag</span><Badge tone="warn">OIDC / Workload Identity als nächster Ausbauschritt</Badge></div></div></section>}
          <footer className="page-footer"><span>SHEWIUN AI AGENT AUTHORIZATION SECURITY</span><span>Technischer Demonstrator · Keine Produktionsfreigabe</span><span>© 2026 SHEWIUN</span></footer>
        </div>
      </main>
    </div>
  );
}

function AuthorityGraph({ nodes, edges, large = false }: { nodes: GraphNode[]; edges: GraphEdge[]; large?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const organization = nodes.find(n => n.typ === "ORGANISATION");
  const humans = nodes.filter(n => n.typ === "MENSCH");
  const agents = nodes.filter(n => n.typ === "KI_AGENT");
  const resources = nodes.filter(n => n.typ === "RESSOURCE");
  const width = 1120;
  const cardWidth = 238;
  const cardHeight = 76;
  const top = 150;
  const rowStep = 112;
  const rows = Math.max(1, humans.length, agents.length, resources.length);
  const height = Math.max(360, top + rows * rowStep + 34);
  const layout = new Map<string, { x: number; y: number; w: number; h: number; type: string }>();
  if (organization) layout.set(organization.id, { x: 440, y: 22, w: 240, h: 72, type: "org" });
  humans.forEach((n, i) => layout.set(n.id, { x: 28, y: top + i * rowStep, w: cardWidth, h: cardHeight, type: "human" }));
  agents.forEach((n, i) => layout.set(n.id, { x: 440, y: top + i * rowStep, w: cardWidth, h: cardHeight, type: "agent" }));
  resources.forEach((n, i) => layout.set(n.id, { x: 854, y: top + i * rowStep, w: cardWidth, h: cardHeight, type: "resource" }));
  const selected = nodes.find(n => n.id === selectedId) || nodes.find(n => n.typ === "KI_AGENT") || nodes[0];
  const connected = selected ? edges.filter(e => e.von === selected.id || e.nach === selected.id) : [];
  const typeLabel: Record<string, string> = {
    ORGANISATIONSZUGEHOERIGKEIT: "ORGANISATION",
    ORGANISATIONSRESSOURCE: "ORGANISATION",
    VOLLMACHT: "URSPRUNGS-VOLLMACHT",
    DELEGATION: "DELEGATION",
    DELEGIERTER_ZUGRIFF: "AGENTENZUGRIFF",
  };

  return <div className={large ? "authority-graph-wrap large" : "authority-graph-wrap"}>
    <div className="graph-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dynamischer Graph der geschäftlichen Vollmachten und Delegationen">
        <text x="147" y="130" className="graph-column-label">MENSCHEN</text>
        <text x="559" y="130" className="graph-column-label">KI-AGENTEN</text>
        <text x="973" y="130" className="graph-column-label">RESSOURCEN</text>
        {edges.map(edge => {
          const from = layout.get(edge.von), to = layout.get(edge.nach);
          if (!from || !to) return null;
          let x1: number, y1: number, x2: number, y2: number;
          if (edge.typ === "ORGANISATIONSZUGEHOERIGKEIT" || edge.typ === "ORGANISATIONSRESSOURCE") {
            x1 = from.x + from.w / 2; y1 = from.y + from.h;
            x2 = to.x + to.w / 2; y2 = to.y;
          } else {
            const forward = to.x >= from.x;
            x1 = forward ? from.x + from.w : from.x;
            y1 = from.y + from.h / 2;
            x2 = forward ? to.x : to.x + to.w;
            y2 = to.y + to.h / 2;
          }
          const bend = Math.max(26, Math.abs(x2 - x1) * .38);
          const curve = edge.typ.startsWith("ORGANISATION") 
            ? `M ${x1} ${y1} C ${x1} ${y1 + 35}, ${x2} ${y2 - 35}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1 + (x2 >= x1 ? bend : -bend)} ${y1}, ${x2 - (x2 >= x1 ? bend : -bend)} ${y2}, ${x2} ${y2}`;
          const active = selected && (edge.von === selected.id || edge.nach === selected.id);
          return <g key={edge.id} className={active ? "graph-edge selected" : "graph-edge"}>
            <path className={edge.typ.startsWith("ORGANISATION") ? "edge-tenant" : edge.typ === "DELEGATION" || edge.typ === "DELEGIERTER_ZUGRIFF" ? "edge-delegation" : "edge-grant"} d={curve} />
            {!edge.typ.startsWith("ORGANISATION") && <text x={(x1+x2)/2} y={(y1+y2)/2-8} className="edge-label">{typeLabel[edge.typ] || edge.typ}</text>}
          </g>;
        })}
        {organization && (() => { const p=layout.get(organization.id)!; return <g transform={`translate(${p.x},${p.y})`}>
          <rect width={p.w} height={p.h} rx="5" className="node node-org" />
          <text x="15" y="24" className="node-org-kicker">RECHTSTRÄGER</text>
          <text x="15" y="47" className="node-title">{organization.label}</text>
          <text x="15" y="63" className="node-sub">{organization.beschreibung || "Organisation"}</text>
        </g>; })()}
        {nodes.filter(n => n.typ !== "ORGANISATION").map(node => {
          const p=layout.get(node.id);
          if (!p) return null;
          const isSelected = selected?.id === node.id;
          return <g key={node.id} transform={`translate(${p.x},${p.y})`} className="graph-node-group"
            onClick={() => setSelectedId(node.id)} role="button" tabIndex={0}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedId(node.id); }}
            aria-label={`${node.label} auswählen`}>
            <rect width={p.w} height={p.h} rx="5" className={`node node-${p.type} ${isSelected ? "node-selected" : ""}`} />
            <circle cx="17" cy="18" r="4" className={`node-indicator indicator-${p.type}`} />
            <text x="30" y="23" className="node-title">{node.label}</text>
            <text x="15" y="47" className="node-sub">{node.beschreibung || node.typ}</text>
            <text x="15" y="64" className="node-state">{node.status}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="graph-inspector">
      <div><small>GEWÄHLTES OBJEKT</small><strong>{selected?.label || "Keine Daten geladen"}</strong><p>{selected?.beschreibung || "Wähle einen Knoten im Graphen aus."}</p></div>
      <div className="inspector-relations"><small>VERKNÜPFTE AUTORITÄTEN</small><strong>{connected.length}</strong><p>{connected.map(edge => edge.typ.replaceAll("_"," ")).join(" · ") || "Keine Verbindungen"}</p></div>
    </div>
    <div className="graph-edge-list">
      <div className="graph-edge-list-head"><strong>Autorisierungsbeziehungen</strong><span>{edges.length} Beziehungen</span></div>
      {edges.filter(edge => !edge.typ.startsWith("ORGANISATION")).map(edge => <div className="graph-edge-row" key={edge.id}>
        <div><strong>{edge.typ.replaceAll("_"," ")}</strong><small>{nodes.find(n=>n.id===edge.von)?.label || edge.von} → {nodes.find(n=>n.id===edge.nach)?.label || edge.nach}</small></div>
        <span>{edge.limit == null ? "ohne Limit" : money(edge.limit)} {edge.waehrung || ""}</span>
        <small>{edge.aktionen?.join(" · ") || "Keine Aktionen hinterlegt"}</small>
        <Badge tone={edge.delegierbar === false ? "bad" : edge.delegierbar ? "good" : "neutral"}>{edge.delegierbar === false ? "Keine Weiterdelegation" : edge.delegierbar ? "Weiterdelegierbar" : "Direkte Beziehung"}</Badge>
      </div>)}
    </div>
  </div>;
}

function EventTable({ events }: { events: EventItem[] }) {
  if (!events.length) return <div className="table-empty">Noch keine Autorisierungsentscheidungen vorhanden. Führe einen Sandbox-Test aus.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Agent</th><th>Aktion</th><th>Betrag</th><th>Entscheidung</th><th>Grund</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{new Date(e.zeitpunkt).toLocaleString("de-DE")}</td><td><span className="mono">{e.agent}</span></td><td><code>{e.aktion}</code></td><td>{money(e.betrag)}</td><td><Badge tone={e.entscheidung === "ALLOW" ? "good" : "bad"}>{e.entscheidung}</Badge></td><td><span className="reason-code">{e.grund}</span></td></tr>)}</tbody></table></div>;
}
