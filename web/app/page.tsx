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
 c(1,"Legitimate supplier payment","POSITIVE CONTROL","ALLOW"),
 c(2,"Amount exceeds delegated limit","PARAMETER","DENY",{amount:"15000"}),
 c(3,"Limit + CHF 1","PARAMETER","DENY",{amount:"10001"}),
 c(4,"Exaktes Limit ohne Approval","APPROVAL","DENY",{amount:"10000"}),
 c(5,"Approval threshold without approval","APPROVAL","DENY",{amount:"7500"}),
 c(6,"Knapp unter Approval-Schwelle","PARAMETER","ALLOW",{amount:"7499.99"}),
 c(7,"Minimum amount","PARAMETER","ALLOW",{amount:"0.01"}),
 c(8,"Falsche Währung EUR","PARAMETER","DENY",{currency:"EUR"}),
 c(9,"Falsche Währung USD","PARAMETER","DENY",{currency:"USD"}),
 c(10,"Unknown runtime issuer","IDENTITY","DENY",{runtime_identity:"untrusted-runtime"}),
 c(11,"Unknown agent identity","IDENTITY","DENY",{agent_id:"agent-unknown"}),
 c(12,"Unknown acting principal","IDENTITY","DENY",{acting_for_id:"person-unknown"}),
 c(13,"Unknown tenant","TENANT","DENY",{organization_id:"org-other-bank"}),
 c(14,"Unknown account resource","RESOURCE SCOPE","DENY",{resource_id:"konto-unknown",data_scope:"konto-unknown"}),
 c(15,"Scope points to another account","RESOURCE SCOPE","DENY",{data_scope:"konto-corporate-1002"}),
 c(16,"Globaler Wildcard-Scope","RESOURCE SCOPE","DENY",{data_scope:"*"}),
 c(17,"Scope all","RESOURCE SCOPE","DENY",{data_scope:"all"}),
 c(18,"Scope any","RESOURCE SCOPE","DENY",{data_scope:"any"}),
 c(19,"Falsches Tool","TOOL BINDING","DENY",{tool:"payment.execute"}),
 c(20,"Falsche Permission","PERMISSION","DENY",{permission:"beneficiary.update"}),
 c(21,"Tool and permission mismatch","COMPOSITION 01","DENY",{tool:"payment.execute",permission:"payment.read"}),
 c(22,"Account enumeration purpose","PURPOSE","DENY",{purpose:"account_enumeration"}),
 c(23,"Zweck Lieferanten-Onboarding","PURPOSE","DENY",{purpose:"vendor_onboarding"}),
 c(24,"Beneficiary change","BUSINESS ACTION","DENY",{action:"beneficiary.update",tool:"beneficiary.update",permission:"beneficiary.update"}),
 c(25,"Payment approval instead of creation","BUSINESS ACTION","DENY",{action:"payment.approve",tool:"payment.approve",permission:"payment.approve"}),
 c(26,"Read action outside this contract","BUSINESS ACTION","DENY",{action:"payment.read",tool:"payment.read",permission:"payment.read"}),
 c(27,"Approval fehlt vollständig","APPROVAL","DENY",{amount:"8000",approval_present:false,approval_fresh:true}),
 c(28,"Approval is stale","APPROVAL","DENY",{amount:"8000",approval_present:true,approval_fresh:false}),
 c(29,"Fresh demo approval","POSITIVE CONTROL","ALLOW",{amount:"8000",approval_present:true,approval_fresh:true}),
 c(30,"Exact delegated limit with demo approval","PARAMETER","ALLOW",{amount:"10000",approval_present:true,approval_fresh:true}),
 c(31,"Limit + 0.01 despite approval","PARAMETER","DENY",{amount:"10000.01",approval_present:true,approval_fresh:true}),
 c(32,"Original mandate limit despite delegation","AUTHORITY DELTA","DENY",{amount:"25000",approval_present:true,approval_fresh:true}),
 c(33,"Low amount with optional approval","PARAMETER","ALLOW",{amount:"5000",approval_present:true,approval_fresh:false}),
 c(34,"Permission payment.read statt create","PERMISSION","DENY",{permission:"payment.read"}),
 c(35,"MCP-Tool-Name weicht vom Contract ab","MCP SURFACE","DENY",{tool:"mcp.payment.create"}),
 c(36,"MCP-Wildcard-Permission","MCP SURFACE","DENY",{permission:"mcp:*"}),
 c(37,"Incorrect resource identifier","RESOURCE SCOPE","DENY",{data_scope:"account:1002"}),
 c(38,"Tenant-wide scope","RESOURCE SCOPE","DENY",{data_scope:"org-alpenbank/*"}),
 c(39,"Identity and scope combination","COMPOSITION 02","DENY",{runtime_identity:"untrusted-runtime",data_scope:"*"}),
 c(40,"Purpose and permission combination","COMPOSITION 03","DENY",{purpose:"account_enumeration",permission:"beneficiary.update"})
 ];
 if(profile==="lite")return lite;
 return [...lite,
 c(41,"CHF 7,499.98 without approval","PARAMETER","ALLOW",{amount:"7499.98"}),
 c(42,"CHF 7,500.01 without approval","APPROVAL","DENY",{amount:"7500.01"}),
 c(43,"CHF 7,500.01 with fresh approval","APPROVAL","ALLOW",{amount:"7500.01",approval_present:true,approval_fresh:true}),
 c(44,"CHF 9,999.99 with fresh approval","PARAMETER","ALLOW",{amount:"9999.99",approval_present:true,approval_fresh:true}),
 c(45,"CHF 10,000.00 with fresh approval","PARAMETER","ALLOW",{amount:"10000",approval_present:true,approval_fresh:true}),
 c(46,"CHF 10,000.01 despite approval","PARAMETER","DENY",{amount:"10000.01",approval_present:true,approval_fresh:true}),
 c(47,"CHF 100,000 with approval","AUTHORITY DELTA","DENY",{amount:"100000",approval_present:true,approval_fresh:true}),
 c(48,"CHF 100,000.01 with approval","AUTHORITY DELTA","DENY",{amount:"100000.01",approval_present:true,approval_fresh:true}),
 c(49,"Approval state 00 at threshold","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:false,approval_fresh:false}),
 c(50,"Approval state 01 at threshold","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:false,approval_fresh:true}),
 c(51,"Approval state 10 at threshold","APPROVAL MATRIX","DENY",{amount:"7500",approval_present:true,approval_fresh:false}),
 c(52,"Approval state 11 at threshold","APPROVAL MATRIX","ALLOW",{amount:"7500",approval_present:true,approval_fresh:true}),
 c(53,"Optional approval below threshold","APPROVAL MATRIX","ALLOW",{amount:"7499.99",approval_present:true,approval_fresh:false}),
 c(54,"Fresh flag without an approval","APPROVAL MATRIX","DENY",{amount:"8000",approval_present:false,approval_fresh:true}),
 c(55,"Present and fresh at CHF 8,000","APPROVAL MATRIX","ALLOW",{amount:"8000",approval_present:true,approval_fresh:true}),
 c(56,"Present but stale at CHF 8,000","APPROVAL MATRIX","DENY",{amount:"8000",approval_present:true,approval_fresh:false}),
 c(57,"Purpose and scope manipulated together","COMPOSITION 04","DENY",{purpose:"account_enumeration",data_scope:"*"}),
 c(58,"Identity and tool manipulated together","COMPOSITION 05","DENY",{runtime_identity:"untrusted-runtime",tool:"payment.execute"}),
 c(59,"Approval and permission manipulated together","COMPOSITION 06","DENY",{amount:"8000",approval_present:false,approval_fresh:false,permission:"beneficiary.update"}),
 c(60,"Unknown principal with otherwise valid amount","AUTHORITY CHAIN","DENY",{acting_for_id:"person-finance-unknown"}),
 c(61,"Foreign resource and foreign scope","RESOURCE BOUNDARY","DENY",{resource_id:"resource-foreign",data_scope:"resource-foreign"}),
 c(62,"Tenant switch in otherwise valid context","TENANT ISOLATION","DENY",{organization_id:"org-foreign"}),
 c(63,"Repeated identical PDP request","REPLAY OBSERVATION","ALLOW",{}),
 c(64,"Action-tool-permission tuple manipulated","COMPOSITION 07","DENY",{action:"beneficiary.update",tool:"payment.create",permission:"beneficiary.update"}),
 c(65,"Purpose, scope and permission composition","COMPOSITION 08","DENY",{purpose:"account_enumeration",data_scope:"*",permission:"beneficiary.update"}),
 c(66,"Identity, amount and approval composition","COMPOSITION 09","DENY",{runtime_identity:"untrusted-runtime",amount:"15000",approval_present:true,approval_fresh:true}),
 c(67,"Action, tool and scope composition","COMPOSITION 10","DENY",{action:"beneficiary.update",tool:"payment.create",permission:"beneficiary.update",data_scope:"*"})
 ];
};

const money = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("en-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(Number(value));

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
  const [storageMode, setStorageMode] = useState("Not checked");
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
      if (!health.ok || !graph.ok || !audit.ok || !paymentRows.ok || !integrity.ok || !authority.ok) throw new Error("Backend unavailable");
      const healthData = await health.json();
      setStorageMode(healthData.speicher === "postgresql" ? "PostgreSQL · persistent" : "SQLite demo · ephemeral");
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
        setResult({ ok: false, text: `Denied: ${payload?.detail?.code || "AUTHORIZATION_DENIED"} · No sandbox payment record was created.` });
      } else {
        setResult({ ok: true, text: `Sandbox payment ${payload.payment_id} created · ${money(amount)} · decision ${payload.authorization_decision_id.slice(0, 8)}` });
      }
      await loadData();
    } catch {
      setResult({ ok: false, text: "Backend unavailable. Check the demo API connection." });
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
      if (!response.ok) throw new Error(payload?.detail || payload?.code || "Authorization evaluation failed.");
      setAuthEvaluation(payload);
      await loadData();
    } catch (error) {
      setAuthEvaluation(null);
      setAuthError(error instanceof Error ? error.message : "Authorization evaluation failed.");
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
          collected.push({...test,actual,matched:actual===test.expected,reason:payload.grund||payload.detail||"No policy response",decision_id:payload.decision_id,checks:Array.isArray(payload.checks)?payload.checks:[]});
        } catch {collected.push({...test,actual:"ERROR",matched:false,reason:"Backend or network unavailable.",checks:[]});}
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
    { id: "partner", label: "S-PRO Partner Demo", icon: "shield", group: "PLATFORM" },
    { id: "uebersicht", label: "Overview", icon: "grid", group: "PLATFORM" },
    { id: "graph", label: "Authority Graph", icon: "graph", group: "AUTHORITY" },
    { id: "berechtigungen", label: "Permissions", icon: "shield", group: "AUTHORITY" },
    { id: "autorisierung", label: "Authorization", icon: "activity", group: "ENFORCEMENT" },
    { id: "laufzeit", label: "Runtime Control", icon: "activity", group: "ENFORCEMENT" },
    { id: "freigaben", label: "Approvals", icon: "check", group: "ENFORCEMENT" },
    { id: "nachweise", label: "Security Evidence", icon: "file", group: "GOVERNANCE" },
    { id: "assessment", label: "Security Assessment", icon: "shield", group: "SECURITY TESTING" },
    { id: "findings", label: "Findings & Retest", icon: "file", group: "SECURITY TESTING" },
    { id: "integrationen", label: "Integrations", icon: "grid", group: "PLATFORM" },
    { id: "workspace", label: "Workspace & SSO", icon: "lock", group: "WORKSPACE" },
    { id: "programme", label: "Programme", icon: "activity", group: "GOVERNANCE" },
    { id: "system", label: "System", icon: "settings", group: "ADMINISTRATION" },
  ];
  const grouped = ["PLATFORM", "AUTHORITY", "ENFORCEMENT", "SECURITY TESTING", "GOVERNANCE", "WORKSPACE", "ADMINISTRATION"];

  function title() { return nav.find(n => n.id === section)?.label || "Overview"; }

  return (
    <div className={section === "partner" ? "shell shell-partner" : "shell"}>
      <aside className="sidebar">
        <div className="brand">
          <div><div className="brand-name">SHEWIUN</div><div className="brand-sub">AI AGENT AUTHORIZATION SECURITY</div></div>
        </div>
        <div className="tenant-switch"><span className="tenant-icon">A</span><div><small>TENANT</small><strong>Alpenbank Demo AG</strong></div><span className="chevron">⌄</span></div>
        <nav>
          {grouped.map(group => <div className="nav-group" key={group}>
            <div className="nav-caption">{group}</div>
            {nav.filter(item => item.group === group).map(item => <button key={item.id} onClick={() => setSection(item.id)} className={section === item.id ? "nav-item active" : "nav-item"}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.id === "laufzeit" && events.length > 0 && <b className="nav-count">{events.length}</b>}
            </button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom"><div className="environment"><span className="env-dot" />TEST ENVIRONMENT</div><div className="sidebar-version">SHEWIUN SECURITY WORKSPACE · DEMO 0.3</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">SHEWIUN <span>/</span> {title().toUpperCase()}</div>
          <div className="topbar-right"><Badge tone={apiState === "verbunden" ? "good" : apiState === "getrennt" ? "bad" : "warn"}>{apiState === "verbunden" ? "API CONNECTED" : apiState === "getrennt" ? "BACKEND DISCONNECTED" : "CHECKING CONNECTION"}</Badge><div className="user-chip"><span>SM</span><div><strong>System administrator</strong><small>Demo access</small></div></div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">AI AGENT AUTHORIZATION SECURITY · CONTROLLED DEMO</div><h1>{title()}</h1><p>Model business authority, test agent actions and produce traceable security evidence.</p></div>
            <div className="heading-actions"><button className="button button-secondary" onClick={loadData}><span>↻</span> Refresh</button><button className="button button-primary" onClick={() => setSection("graph")}>Open authority graph <Icon name="arrow" /></button></div>
          </div>

          {section === "partner" && <div className="partner-page">
            <header className="sp-header">
              <div className="sp-brand">SHEWIUN <span>Partner briefing · S-PRO</span></div>
              <nav aria-label="Partner demo navigation">
                <a href="#sp-value">Positioning</a>
                <a href="#sp-cases">Banking use cases</a>
                <a href="#sp-live">Live demo</a>
                <a href="#sp-architecture">Architecture</a>
                <a href="#sp-threats">CISO view</a>
                <a href="#sp-agentproof">AgentProof</a>
                <a href="#sp-pilot">Pilot</a>
              </nav>
            </header>

            <section className="sp-hero">
              <div className="sp-hero-main">
                <div className="sp-kicker">S-PRO × SHEWIUN · BANKING & FINANCIAL SERVICES</div>
                <h2>Business authority for AI agents.<br/><span>Enforced at the action boundary.</span></h2>
                <p>S-PRO builds and integrates AI agents into regulated banking workflows. SHEWIUN is designed as a complementary authorization-assurance layer: before a consequential tool or API call is executed, verify that the specific agent is acting for the right principal, on the right resource, for the right purpose and within the delegated limits.</p>
                <div className="sp-hero-actions">
                  <a className="sp-button sp-button-primary" href="#sp-live">Run the live sandbox demo</a>
                  <a className="sp-button sp-button-secondary" href="#sp-pilot">Review a joint pilot</a>
                </div>
                <div className="sp-caption">Controlled demonstrator · synthetic identities and data · no real funds or customer systems</div>
              </div>
              <aside className="sp-hero-summary">
                <div className="sp-summary-title">Proposed responsibility split</div>
                <div className="sp-summary-row"><span>S-PRO</span><div><strong>Build and integrate</strong><small>Agent runtime · models · data · workflows · customer systems</small></div></div>
                <div className="sp-summary-row"><span>SHEWIUN</span><div><strong>Model and test business authority</strong><small>Delegation · action scope · policy decisions · security evidence</small></div></div>
                <div className="sp-summary-row"><span>BANK</span><div><strong>Own policy and risk decisions</strong><small>Business rules · approvers · identity sources · operational accountability</small></div></div>
              </aside>
            </section>

            <section className="sp-value-section" id="sp-value">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">WHY THIS FITS S-PRO</div><h3>Not another agent platform. A focused control at the point of action.</h3></div>
                <p>S-PRO already delivers agent engineering, workflow integration, evaluations, human oversight and auditability. SHEWIUN does not claim to replace those capabilities. The proposed addition is a machine-checkable model of delegated business authority across an agent’s concrete actions.</p>
              </div>
              <div className="sp-two-columns">
                <article>
                  <div className="sp-column-label">WHAT S-PRO ALREADY BUILDS</div>
                  <h4>Agents embedded in financial processes</h4>
                  <p>S-PRO’s published work covers KYC and onboarding, periodic reviews, adverse-media and sanctions screening, AML alert triage, credit assessment, relationship-manager copilots and customer support. Its approach already includes evaluation before go-live, human sign-off for consequential decisions and traceable source and action logs.</p>
                  <a href="https://s-pro.io/" target="_blank" rel="noreferrer">S-PRO financial-services portfolio ↗</a>
                </article>
                <article className="sp-column-shewiun">
                  <div className="sp-column-label">WHERE SHEWIUN CAN ADD A LAYER</div>
                  <h4>Make delegated business authority explicit</h4>
                  <p>Define who delegated which capability to which agent, for which principal, customer, account, action, purpose and parameter range. Evaluate the resulting Authorization Contract before the protected business API performs a mutation.</p>
                  <span className="sp-note">This is most useful when individually legitimate tools can be combined into a broader business action that was never explicitly delegated.</span>
                </article>
              </div>
              <div className="sp-value-line"><strong>Potential S-PRO value:</strong> a reusable assessment and integration component for selected customer projects. S-PRO retains ownership of agent architecture, model selection, data and workflow engineering, customer integration and its existing human-approval process.</div>
            </section>

            <section className="sp-section" id="sp-cases">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">BANKING WORKFLOWS</div><h3>Where the business-authority boundary becomes material</h3></div>
                <p>These are proposed pilot scenarios based on S-PRO’s published financial-services use cases. They are not existing S-PRO integrations with SHEWIUN.</p>
              </div>
              <div className="sp-case-table-wrap">
                <table className="sp-case-table">
                  <thead><tr><th>Use case</th><th>Agent may prepare</th><th>Protected business action</th><th>Potential SHEWIUN check</th></tr></thead>
                  <tbody>
                    <tr><td><strong>AML alert triage</strong><small>Bank · Financial crime</small></td><td>Collect transaction context, compare alerts, draft a case narrative and recommend a disposition.</td><td>Close or escalate a case, change its status or trigger a regulatory-report workflow.</td><td>Bind any write action to the case ID, analyst role, permitted disposition and explicit approval state. The analyst remains the decision-maker.</td></tr>
                    <tr><td><strong>KYC & periodic review</strong><small>Bank · Wealth management</small></td><td>Extract documents, reconcile client data and prepare a review recommendation.</td><td>Change KYC status, alter a risk classification or complete onboarding.</td><td>Separate read, draft and final-status permissions; bind the final action to the client, record, role and approval.</td></tr>
                    <tr><td><strong>Credit assessment</strong><small>Bank · Lending</small></td><td>Extract financial data, calculate ratios and draft a credit memo.</td><td>Approve a facility, change a credit limit or amend lending terms.</td><td>Prevent analysis access from silently becoming approval authority; bind any allowed write to facility, amount, role and sign-off.</td></tr>
                    <tr><td><strong>Relationship-manager copilot</strong><small>Private banking · Asset management</small></td><td>Prepare call briefings, portfolio context and research.</td><td>Place an order or change a portfolio, mandate or client record.</td><td>Check principal, portfolio, instrument, transaction parameters, mandate and required approval as one decision.</td></tr>
                    <tr><td><strong>Customer support & refunds</strong><small>Neobroker · Fintech</small></td><td>Draft a response, explain an account status and prepare a refund request.</td><td>Execute a refund, increase the amount or change the beneficiary.</td><td>Bind approval to the exact customer, refund ID, amount, destination and action; reject parameter substitution.</td></tr>
                    <tr><td><strong>Internal knowledge assistant</strong><small>Bank · Operations</small></td><td>Retrieve policies and draft a source-linked answer.</td><td>Disclose restricted information or write back a change to a governed record or policy.</td><td>Check the user and agent identity against document-level scope and distinguish read access from write authority.</td></tr>
                    <tr><td><strong>Untrusted documents & indirect injection</strong><small>KYC · AML · RM copilot</small></td><td>Read external PDFs, emails, registry extracts and free-text case notes.</td><td>Untrusted content attempts to redirect tools, expand data scope or trigger an unauthorized action.</td><td>Check the downstream tool call against the Authorization Contract. Prompt and content-injection defenses remain a separate S-PRO/customer control.</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="sp-source-links">
                <span>Relevant S-PRO references:</span>
                <a href="https://s-pro.io/" target="_blank" rel="noreferrer">Financial-services portfolio ↗</a>
                <a href="https://s-pro.io/ai-agents-aml-transaction-monitoring-bank/" target="_blank" rel="noreferrer">AML & transaction monitoring ↗</a>
                <a href="https://s-pro.io/ai-for-wealth-and-asset-managers/" target="_blank" rel="noreferrer">Wealth management ↗</a>
                <a href="https://s-pro.io/ai-agent-production-gates-bank" target="_blank" rel="noreferrer">S-PRO’s six production gates ↗</a>
                <a href="https://s-pro.io/ai-proof-of-concept-to-production-bank" target="_blank" rel="noreferrer">Pilot-to-production approach ↗</a>
              </div>
            </section>

            <section className="sp-section sp-live-section" id="sp-live">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">INTERACTIVE SANDBOX · LIVE BACKEND CHECK</div><h3>A payment agent receives only part of the CFO’s authority</h3></div>
                <p>This demo sends the request to the SHEWIUN backend, which evaluates the policy before the sandbox payment API creates a demo record. No money moves.</p>
              </div>
              <div className="sp-live-layout">
                <div className="sp-authority-card">
                  <div className="sp-live-label">SYNTHETIC BANK · ALPENBANK DEMO AG</div>
                  <h4>Delegation chain</h4>
                  <div className="sp-authority-step"><span>Original CFO authority</span><strong>CHF 100,000</strong><small>Anna Müller · CFO · synthetic identity</small></div>
                  <div className="sp-authority-arrow">↓ Limited delegation</div>
                  <div className="sp-authority-step sp-authority-effective"><span>Agent delegation limit</span><strong>CHF 10,000</strong><small>Payment Agent 01 · account •••• 1001</small></div>
                  <ul><li>Granted action: <code>payment.create</code></li><li>Not delegated: <code>payment.approve</code></li><li>Additional demo approval threshold: CHF 7,500</li></ul>
                </div>
                <div className="sp-live-test">
                  <div className="sp-live-label">TRY IT · NON-PRODUCTION SANDBOX</div>
                  <h4>Should this agent be allowed to create the payment?</h4>
                  <p>The backend evaluates the delegated limit and the demo policy. A denied request must not create a sandbox payment record.</p>
                  <div className="sp-test-row"><div><span className="sp-allow-tag">EXPECTED: ALLOW</span><strong>CHF 5,000</strong><small>Within the agent’s delegated limit and below the additional approval threshold.</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-primary" onClick={() => runPayment(5000)}>Run test</button></div>
                  <div className="sp-test-row"><div><span className="sp-deny-tag">EXPECTED: DENY</span><strong>CHF 15,000</strong><small>Exceeds the agent’s delegated CHF 10,000 limit.</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-danger" onClick={() => runPayment(15000)}>Run test</button></div>
                  {result && <div className={result.ok ? "result-box result-good" : "result-box result-bad"}><span>{result.ok ? "✓" : "!"}</span><div><strong>{result.ok ? "Action allowed" : "Action denied"}</strong><p>{result.text}</p></div></div>}
                  <div className="sp-api-note">Backend status: {apiState === "verbunden" ? "connected" : apiState === "getrennt" ? "unavailable" : "checking"}. Test requests affect synthetic sandbox data only.</div>
                </div>
              </div>
            </section>

            <section className="sp-section" id="sp-difference">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">THE DIFFERENTIATION</div><h3>Technical permission is not the same as business authority</h3></div>
                <p>A role or API scope answers whether a tool can be called. It does not necessarily answer whether the resulting business action is authorized in this customer, account and delegation context.</p>
              </div>
              <div className="sp-difference-grid">
                <article><div className="sp-column-label">TECHNICAL ACCESS · IAM / TOOL PERMISSIONS</div><h4>What can the workload call?</h4><p>Identity and access systems define which APIs or tools the agent can technically invoke.</p><ul><li><code>customer.read</code></li><li><code>beneficiary.update</code></li><li><code>payment.create</code></li></ul></article>
                <article className="sp-difference-emphasis"><div className="sp-column-label">SHEWIUN · BUSINESS AUTHORITY</div><h4>What is this agent allowed to make happen?</h4><p>Evaluate the complete action context against an explicit, delegated business mandate.</p><ul><li>Which agent is acting, and on whose behalf?</li><li>Which customer, account or business object?</li><li>Which action, purpose and exact parameters?</li><li>Which limit and action-bound approval apply?</li></ul></article>
              </div>
              <div className="sp-process">
                <div><span>1</span><strong>Agent requests an action</strong><small>Tool call + trusted runtime context</small></div><b>→</b>
                <div><span>2</span><strong>Authorization Contract evaluated</strong><small>Identity · delegation · scope · purpose · limits</small></div><b>→</b>
                <div><span>3</span><strong>Policy decision returned</strong><small>Explicit ALLOW or DENY</small></div><b>→</b>
                <div><span>4</span><strong>PEP enforces the decision</strong><small>Protected API executes only after ALLOW</small></div><b>→</b>
                <div><span>5</span><strong>Evidence is correlated</strong><small>Decision ID · policy version · event trace</small></div>
              </div>
            </section>

            <section className="sp-section sp-technical-section" id="sp-architecture">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">PROPOSED TECHNICAL REFERENCE ARCHITECTURE</div><h3>A deterministic policy check before a protected side effect</h3></div>
                <p>The integration point is the server-side tool or API boundary, not a prompt instruction and not another agent. This is a target architecture for a joint non-production pilot; it is not yet connected to an S-PRO runtime.</p>
              </div>
              <div className="sp-architecture-status"><span>REFERENCE DESIGN</span><strong>Proposed integration · not part of the current live payment flow</strong></div>
              <div className="sp-architecture-flow">
                <article><span className="sp-arch-index">01 · S-PRO / CUSTOMER</span><h4>Agent runtime</h4><p>Model, orchestration, planning and tool selection remain in the existing S-PRO/customer architecture.</p><code>tool_call</code></article>
                <b aria-hidden="true">→</b>
                <article><span className="sp-arch-index">02 · POLICY ENFORCEMENT POINT</span><h4>API / MCP adapter</h4><p>Captures the trusted workload identity and typed request. No business mutation is allowed before the decision.</p><code>PEP · enforcement</code></article>
                <b aria-hidden="true">→</b>
                <article className="sp-arch-highlight"><span className="sp-arch-index">03 · SHEWIUN</span><h4>Authority engine</h4><p>Evaluates principal, tenant, delegation, resource, action, purpose, parameters, limits and approval state.</p><code>PDP · ALLOW / DENY</code></article>
                <b aria-hidden="true">→</b>
                <article><span className="sp-arch-index">04 · PROTECTED SYSTEM</span><h4>Business API</h4><p>The adapter executes only after a valid decision. The customer API remains the final enforcement boundary.</p><code>side effect</code></article>
                <b aria-hidden="true">→</b>
                <article><span className="sp-arch-index">05 · SECURITY OPERATIONS</span><h4>Evidence event</h4><p>Correlate decision ID, request ID, policy version, evaluated attributes and observed API outcome.</p><code>audit · SIEM · OTel</code></article>
              </div>
              <div className="sp-architecture-caption"><strong>PDP vs. PEP:</strong> the Policy Decision Point evaluates the contract. The Policy Enforcement Point prevents the protected API call from proceeding without the required decision. A dashboard warning without enforcement at the mutation boundary is not a security control. <strong>Prompt-injection boundary:</strong> SHEWIUN does not detect or neutralize malicious documents or determine whether model reasoning is safe. It evaluates the resulting action. S-PRO/customer prompt, model, retrieval and data controls remain essential.</div>
              <div className="sp-contract-layout">
                <article className="sp-code-card">
                  <div className="sp-code-head"><div><span>TYPED AUTHORIZATION REQUEST</span><strong>Illustrative request contract</strong></div><small>Synthetic IDs · demo field names</small></div>
                  <pre><code>{'{\\n  "organization_id": "org-alpenbank",\\n  "agent_id": "agent-payment-01",\\n  "acting_for_id": "person-cfo-anna",\\n  "resource_id": "konto-corporate-1001",\\n  "action": "payment.create",\\n  "tool": "payment.create",\\n  "permission": "payment.create",\\n  "purpose": "supplier_payment",\\n  "amount": "5000.00",\\n  "currency": "CHF",\\n  "runtime_identity": "shewiun-demo-issuer",\\n  "data_scope": "konto-corporate-1001"\\n}'}</code></pre>
                  <p>In a customer pilot, identity, delegation, approval and resource attributes must come from trusted runtime, IAM and business systems—not from an LLM’s self-reported text. The current demo uses synthetic values.</p>
                </article>
                <div className="sp-contract-side">
                  <div className="sp-contract-output"><span>POLICY DECISION RESPONSE</span><strong>Structured decision envelope</strong>
                    <div><code>decision</code><b>ALLOW / DENY</b></div>
                    <div><code>decision_id</code><b>Unique decision reference</b></div>
                    <div><code>correlation_id</code><b>Runtime request linkage</b></div>
                    <div><code>policy_version</code><b>Versioned policy</b></div>
                    <div><code>checks[]</code><b>Individual control results</b></div>
                    <div><code>approval_required</code><b>Approval condition</b></div>
                  </div>
                  <div className="sp-contract-warning"><strong>Production prerequisites:</strong> customer-controlled workload identity, authoritative delegation source, signed and action-bound approvals, durable replay protection, high availability, fail-closed behavior and a protected enforcement point. These are integration requirements—not claims about the current demo.</div>
                </div>
              </div>
            </section>

            <section className="sp-section sp-boundary-section" id="sp-boundary">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">CLEAR OWNERSHIP BOUNDARIES</div><h3>What stays with S-PRO—and what SHEWIUN adds</h3></div>
                <p>The goal is not to duplicate IAM, orchestration, a workflow engine or an approval UI. It is to provide a focused business-authority contract and evidence layer that fits the existing architecture.</p>
              </div>
              <div className="sp-boundary-table">
                <div className="sp-boundary-head"><span>Control domain</span><span>S-PRO / customer owns</span><span>Potential SHEWIUN contribution</span></div>
                <div><strong>Human & workload identity</strong><span>IdP, SSO, service identity, authentication and technical roles remain authoritative.</span><span>Bind validated identity claims to the principal, delegation chain and business mandate.</span></div>
                <div><strong>Agent & workflow</strong><span>Models, prompts, orchestration, retrieval, tool design and workflow engineering remain in the existing solution.</span><span>Evaluate the authority of a concrete tool call, not the quality of the model response.</span></div>
                <div><strong>Human approval</strong><span>Existing approval UX, named approver and business accountability remain with the customer/S-PRO solution.</span><span>Validate that required approval state is present for the exact action, amount, resource and beneficiary.</span></div>
                <div><strong>Business policy & delegation</strong><span>Business owners define and approve customer policies and underlying mandates.</span><span>Represent delegated authority as a versioned, machine-evaluable contract.</span></div>
                <div><strong>Evaluation & security testing</strong><span>S-PRO evaluates agent quality, model behavior, data sources and end-to-end workflow behavior.</span><span>Add policy regression tests for allowed, denied and permission-composition scenarios.</span></div>
                <div><strong>Audit & security operations</strong><span>The bank’s audit repository, SIEM, GRC and retention controls remain the systems of record.</span><span>Provide correlated decision context, policy version and structured evidence for forwarding.</span></div>
              </div>
              <div className="sp-no-claim"><strong>No false differentiation:</strong> S-PRO already offers evaluations, human approval, audit trails and governance controls. SHEWIUN does not claim those as unique capabilities. The proposed addition is an explicit, reusable model of delegated business authority—and its evaluation at the point where a specific agent action is about to occur.</div>
            </section>

            <section className="sp-section" id="sp-threats">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">CISO VIEW · THREAT-TO-CONTROL MAPPING</div><h3>What is in scope—and what still needs defense in depth</h3></div>
                <p>Mapped to relevant OWASP Top 10 for Agentic Applications risk families. This is a scope map for discussion, not a claim of OWASP conformance or full mitigation coverage.</p>
              </div>
              <div className="sp-threat-table-wrap">
                <table className="sp-threat-table">
                  <thead><tr><th>Threat family</th><th>Example banking failure</th><th>Potential SHEWIUN control</th><th>Current evidence / boundary</th></tr></thead>
                  <tbody>
                    <tr><td><strong>ASI02 · Tool misuse</strong><small>Tool Security</small></td><td>A legitimate tool is called with a forbidden action, beneficiary or amount.</td><td>Exact tool/permission binding, action scope, parameter limits and decision before the protected API mutation.</td><td><span className="sp-status sp-status-live">DEMO CONTROL</span> Live synthetic payment policy path; no S-PRO tools connected.</td></tr>
                    <tr><td><strong>ASI03 · Identity & privilege abuse</strong><small>Access Control</small></td><td>An agent uses a broad service identity or acts outside the principal’s delegated authority.</td><td>Authority graph and delegation chain; AgentProof manifest delta and authenticated non-production identity/runtime evidence.</td><td><span className="sp-status sp-status-separate">PARTIAL / SEPARATE</span> Payment demo identities are synthetic. AgentProof runtime connector is a separate codebase.</td></tr>
                    <tr><td><strong>ASI09 · Human-agent trust exploitation</strong><small>Human Factors</small></td><td>A stale, vague or mis-bound approval is reused for a changed payment or client record.</td><td>Bind approval to the specific action and parameters; reject missing or stale approval state.</td><td><span className="sp-status sp-status-next">INTEGRATION REQUIRED</span> Demo uses boolean test inputs, not signed one-time approval tokens.</td></tr>
                    <tr><td><strong>ASI01 / ASI06 · Goal hijack & context poisoning</strong><small>Instruction / data integrity</small></td><td>Instructions embedded in a PDF or case note attempt to redirect the agent or expand its data scope.</td><td>Check the downstream action against the contract; AgentProof can plan non-destructive hypotheses for controlled untrusted-content scenarios.</td><td><span className="sp-status sp-status-separate">LIMITED SCOPE</span> SHEWIUN does not sanitize prompts, detect poisoned memory or prove the model resisted injection.</td></tr>
                    <tr><td><strong>ASI04 / ASI05 / ASI07</strong><small>Supply chain · execution · inter-agent trust</small></td><td>A compromised connector, unsafe code path or spoofed agent-to-agent message crosses a trust boundary.</td><td>Potential integration points: signed tool inventory, isolated execution, workload identity and authenticated inter-agent trust.</td><td><span className="sp-status sp-status-next">NOT IMPLEMENTED HERE</span> Requires S-PRO/customer platform controls and a jointly designed extension.</td></tr>
                    <tr><td><strong>ASI08 / ASI10</strong><small>Cascading failures · rogue agents</small></td><td>A retry loop or abnormal agent behavior amplifies impact across systems.</td><td>Potential integration points: budgets, rate limits, circuit breakers, kill switch, quarantine and monitored workflow limits.</td><td><span className="sp-status sp-status-next">NOT IMPLEMENTED HERE</span> Must be owned by the runtime/orchestration and operational-control layers.</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="sp-no-claim"><strong>CISO principle:</strong> authorization is one layer in a defense-in-depth design. A valid ALLOW does not establish that the agent’s intent, model reasoning, source data or business outcome is safe. Separate controls are still required for prompt injection, data loss prevention, code execution, supply chain, monitoring and incident response.</div>
            </section>

            <section className="sp-section" id="sp-gates">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">ALIGNMENT WITH S-PRO’S PRODUCTION GATES</div><h3>Map evidence to the questions a bank will ask before go-live</h3></div>
                <p>S-PRO’s six-gate model is its own delivery framework, not a regulator-issued checklist. SHEWIUN can contribute evidence to selected gates; it cannot satisfy the whole production-readiness process.</p>
              </div>
              <div className="sp-gate-grid">
                <article><span>GATE 01</span><strong>Agent inventory & risk tier</strong><p>Agent manifest, tool surface, permissions, intended authority and action reachability.</p><small>AgentProof configuration analysis · potential findings, not runtime proof.</small></article>
                <article><span>GATE 02</span><strong>Data flows & residency</strong><p>Data sources, processors, locations, access paths and retention remain customer/S-PRO governance.</p><small>Not a current SHEWIUN control.</small></article>
                <article><span>GATE 03</span><strong>Evaluation, testing & retest</strong><p>Expected ALLOW/DENY outcomes, positive controls, policy regression and evidence-backed runtime scenarios.</p><small>M2.7 policy tests in demo; AgentProof trace evaluation is separate.</small></article>
                <article><span>GATE 04</span><strong>Human oversight & stop</strong><p>Named approver, action-bound approval, fail-closed path, revocation and operational stop mechanisms.</p><small>Approval flags are demo inputs; signed approvals and kill-switch integration are not live.</small></article>
                <article><span>GATE 05</span><strong>Reconstructable logs</strong><p>Correlate identity, request, policy version, decision, API outcome and evidence reference.</p><small>Demo audit trail and AgentProof evidence components; external SIEM integration is future work.</small></article>
                <article><span>GATE 06</span><strong>Vendor portability & exit</strong><p>Model/provider choice, data export, fallback, contract portability and exit plan.</p><small>Business Authority is designed around provider-neutral decisions; no customer exit process is implemented here.</small></article>
              </div>
            </section>

            <section className="sp-section" id="sp-agentproof">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">THE WIDER SHEWIUN SECURITY TOOLKIT</div><h3>AgentProof extends the assessment story beyond the payment demo</h3></div>
                <p>AgentProof is a separate SHEWIUN codebase. The capabilities below are present in that project, but are not wired into the live Business Authority payment flow. We propose selecting and integrating only the relevant parts for a joint pilot.</p>
              </div>
              <div className="sp-agentproof-grid">
                <article><span>01 · CONFIGURATION ANALYSIS</span><strong>Agent manifest & authority delta</strong><p>Inspect declared tools, permissions, scopes, transaction types and approval gates. Highlight intended-versus-effective authority gaps, reachable business actions and potentially risky permission compositions.</p><small>Configuration-level findings are labelled potential until runtime evidence supports verification.</small></article>
                <article><span>02 · CONTRACT / TRACE EVALUATION</span><strong>Expected policy vs. observed runtime</strong><p>Evaluate supplied runtime events against an Authorization Contract. Correlate requests, decisions and outcomes; identify denied actions that still reached execution or actions without a correlated authorization decision.</p><small>Only the supplied event chain and test scope are assessed.</small></article>
                <article><span>03 · AUTHENTICATED NON-PRODUCTION EVIDENCE</span><strong>Per-agent signed event ingestion</strong><p>Agent-scoped HMAC-SHA256 signatures, timestamp and nonce checks authenticate event submissions from explicitly authorized non-production agents.</p><small>Nonce replay tracking is currently deployment-instance memory, not a distributed durable replay store.</small></article>
                <article><span>04 · EVIDENCE & FINDINGS</span><strong>Traceable security output</strong><p>Structured findings include severity, claim level, expected and observed behavior, business impact, remediation and blast-radius context. Runtime assessments produce a SHA-256 evidence hash.</p><small>A hash is an integrity reference, not an externally signed or immutable ledger.</small></article>
                <article><span>05 · AGENT IDENTITY VERIFICATION</span><strong>Authenticated discovery & metadata</strong><p>AgentProof includes a verified identity endpoint flow for non-production targets, with an agent identity document and capability, permission, data-scope and approval metadata.</p><small>Production identity federation and customer IdP integration still require engineering and security review.</small></article>
                <article><span>06 · NON-DESTRUCTIVE RED-TEAM PLANNING</span><strong>Attack hypotheses, not exploit claims</strong><p>A bounded planner can prepare hypotheses for tool abuse, permission escalation, scope escape, approval bypass, data exfiltration and indirect injection. An optional MiniMax M2.7 component generates structured test hypotheses and guardrails.</p><small>Planning is not proof of exploitation. Production attack planning is blocked; this component does not autonomously execute destructive tests.</small></article>
              </div>
              <div className="sp-limit-note">Integration boundary: AgentProof runtime ingestion and trace evaluation are not currently connected to the synthetic payment sandbox shown above. The current AgentProof retest route is configuration-only; it does not execute the same attack against a customer runtime. A joint pilot would need a customer-authorized connector, event schema, trust model and evidence-retention design.</div>
            </section>

            <section className="sp-section" id="sp-cfa">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">BROADER SHEWIUN PLATFORM</div><h3>Business Authority fits into a wider governed-agent direction</h3></div>
                <p>SHEWIUN CFA is a separate provider-agnostic workspace concept for coordinating agents, knowledge and team-style discussions. It is not currently integrated with this S-PRO demonstrator.</p>
              </div>
              <div className="sp-cfa-grid">
                <article><strong>CFA Council</strong><p>Multi-role agent discussions with a synthesis step. Live model responses require a configured OpenAI-compatible provider; otherwise the Council is clearly labelled demo mode.</p></article>
                <article><strong>CFA Brain</strong><p>Knowledge entries retain type, source and confidence. The current retrieval implementation is keyword-based rather than a production semantic knowledge layer.</p></article>
                <article><strong>CFA Control & Security</strong><p>Policy reference outcomes, a persisted human-approval queue and SHA-256 hash-linked audit events with integrity verification.</p></article>
                <article><strong>Durable Council runtime</strong><p>Persisted jobs, per-step checkpoints, bounded retries, cancellation and restart recovery in a single-process SQLite MVP. PostgreSQL and lease-based workers are required before horizontal production scaling.</p></article>
              </div>
            </section>

            <section className="sp-section" id="sp-pilot">
              <div className="sp-section-heading">
                <div><div className="sp-kicker">PROPOSED JOINT PILOT</div><h3>One agent. One non-production workflow. A measurable control question.</h3></div>
                <p>Start with a workflow where the agent can prepare information but a specific write action changes a client file, payment record or compliance case. No production credentials or real transactions in the first phase.</p>
              </div>
              <div className="sp-pilot-steps">
                <article><span>01</span><h4>Scope the workflow</h4><p>Select one agent, one protected API action, the business owner, approved test environment and explicit permission-to-test boundaries.</p></article>
                <article><span>02</span><h4>Define the authority contract</h4><p>Agree principal, agent identity, delegation source, tenant, customer/resource, purpose, action, parameters, limits and approval conditions.</p></article>
                <article><span>03</span><h4>Run controlled scenarios</h4><p>Use 5–20 high-value cases covering positive controls, wrong identity, wrong tenant, wrong resource, parameter changes, missing approval and permission composition.</p></article>
                <article><span>04</span><h4>Validate enforcement & evidence</h4><p>Connect a PEP in the non-production API path, correlate runtime events, review findings and repeat the same cases after remediation.</p></article>
              </div>
              <div className="sp-pilot-deliverables">
                <div><span>PILOT OUTPUT</span><strong>What S-PRO and the bank receive</strong></div>
                <ul><li>Agreed action inventory and authority matrix</li><li>Versioned Authorization Contract</li><li>Reproducible ALLOW/DENY tests with positive controls</li><li>Findings with evidence, business impact and remediation</li><li>Integration design for identity, approval, PEP and audit handoff</li></ul>
              </div>
              <div className="sp-acceptance">
                <strong>Proposed acceptance criteria — to be agreed with S-PRO and the bank</strong>
                <div><span>01</span> Legitimate reference actions remain allowed (no over-blocking).</div>
                <div><span>02</span> Invalid principal, agent, tenant, resource, purpose, action or parameters produce the expected denial.</div>
                <div><span>03</span> A denied request creates no protected side effect in the test system.</div>
                <div><span>04</span> The decision can be reconstructed from correlation ID, decision ID, policy version and API outcome.</div>
                <div><span>05</span> Unknown or unavailable policy state fails closed; timeout, retry and rollback behavior are documented.</div>
              </div>
              <div className="sp-next-call">
                <div><strong>Questions for the technical discovery session</strong><p>Which existing S-PRO agent performs a write-capable tool call? Where is the last server-side API boundary before mutation? Which workload identity and approval source can be provided in a non-production environment?</p></div>
                <div className="sp-next-question">Which one existing agent would be the strongest candidate for a first joint authorization-assurance pilot?</div>
              </div>
            </section>

            <footer className="sp-footer">
              <span>SHEWIUN · Business Authority & Agent Authorization Assurance</span>
              <span>Partner discussion · Synthetic non-production demonstrator</span>
            </footer>
          </div>}{section === "uebersicht" && <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-top"><span>Identities</span><span className="stat-icon"><Icon name="shield" /></span></div><div className="stat-value">{counts.people + counts.agents || "—"}</div><div className="stat-foot">{counts.people} people <span>·</span> {counts.agents} AI agents</div></div>
              <div className="stat-card"><div className="stat-top"><span>Active mandates</span><span className="stat-icon"><Icon name="file" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "VOLLMACHT").length || "—"}</div><div className="stat-foot">Business authority relationships</div></div>
              <div className="stat-card"><div className="stat-top"><span>Delegations</span><span className="stat-icon"><Icon name="graph" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "DELEGATION").length || "—"}</div><div className="stat-foot">Explicitly delegated sub-rights</div></div>
              <div className="stat-card"><div className="stat-top"><span>Denied actions</span><span className="stat-icon danger"><Icon name="lock" /></span></div><div className="stat-value">{counts.denied}</div><div className="stat-foot">Runtime decisions · DENIED</div></div>
            </div>

            <div className="section-grid">
              <section className="panel graph-panel">
                <div className="panel-header"><div><div className="panel-kicker">BUSINESS AUTHORITY GRAPH</div><h2>Business authority</h2><p>Organization → people → agents → protected resources</p></div><button className="text-button" onClick={() => setSection("graph")} >Open graph <Icon name="arrow" /></button></div>
                <AuthorityGraph nodes={nodes} edges={edges} />
                <div className="graph-legend"><span><i className="legend-human" />Human</span><span><i className="legend-agent" />AI agent</span><span><i className="legend-resource" />Resource</span><span><i className="legend-line" />Delegation / mandate</span></div>
              </section>
              <section className="panel authority-panel">
                <div className="panel-header"><div><div className="panel-kicker">EFFECTIVE AUTHORITY</div><h2>Payment Agent 01</h2><p>Derived from the CFO mandate</p></div><Badge tone="good">ACTIVE</Badge></div>
                <div className="limit-block"><span>Effective payment limit</span><strong>{effectiveLimit === null ? "—" : money(effectiveLimit)}</strong><small>Original mandate: CHF 100,000 · delegated limit: CHF 10,000</small></div>
                <div className="authority-row"><span>Acting principal</span><strong>Anna Müller · CFO</strong></div>
                <div className="authority-row"><span>Resource</span><strong>Corporate account ·•••• 1001</strong></div>
                <div className="authority-row"><span>Allowed action</span><strong><code>payment.create</code></strong></div>
                <div className="authority-row"><span>Further delegation</span><Badge tone="bad">NOT ALLOWED</Badge></div>
                <div className="authority-row"><span>Runtime issuer</span><strong>shewiun-demo-issuer</strong></div>
                <div className="authority-row"><span>Revocation</span><Badge tone="good">REVOCATION CHECK AVAILABLE</Badge></div>
                <div className="panel-footnote">Demo configuration · effective limit is calculated server-side from the authority chain.</div>
              </section>
            </div>

            <section className="panel test-panel">
              <div className="panel-header"><div><div className="panel-kicker">RUNTIME ENFORCEMENT · TEST ENVIRONMENT</div><h2>Test authorization enforcement</h2><p>The API evaluates the action. Only an allowed request creates a sandbox payment record.</p></div><Badge tone="warn">SYNTHETIC DATA</Badge></div>
              <div className="test-actions"><div className="test-case"><div><strong>Valid supplier payment</strong><small>CHF 5.000 · within the delegated mandate</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-primary" onClick={() => runPayment(5000)} >Run payment <Icon name="arrow" /></button></div><div className="test-case"><div><strong>Delegated limit exceeded</strong><small>CHF 15.000 · above the delegated mandate limit</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-danger" onClick={() => runPayment(15000)} >Test denial <Icon name="arrow" /></button></div></div>
              {result && <div className={result.ok ? "result-box result-good" : "result-box result-bad"}><span>{result.ok ? "✓" : "!"}</span><div><strong>{result.ok ? "Action authorized" : "Action denied"}</strong><p>{result.text}</p></div></div>}
            </section>

            <section className="panel differentiation-panel">
              <div className="panel-header"><div><div className="panel-kicker">PRODUCT BOUNDARY</div><h2>Let agents work. Control business authority independently.</h2><p>SHEWIUN is not an agent framework. It adds a separate, deterministic business-authority and enforcement model.</p></div></div>
              <div className="differentiation-grid">
                <div><span className="diff-number">01</span><strong>Model the mandate</strong><p>Represent people, legal entities, resources and business mandates as a connected authority graph.</p></div>
                <div><span className="diff-number">02</span><strong>Constrain delegation</strong><p>Agents receive only explicitly delegated sub-rights. Limits, actions, validity and further-delegation rights are bounded at every step.</p></div>
                <div><span className="diff-number">03</span><strong>Decide before mutation</strong><p>An independent policy decision evaluates the concrete action server-side before the protected business API changes data.</p></div>
              </div>
              <div className="integration-flow"><div><small>01 · AGENT RUNTIME</small><strong>Request action</strong><span>Identity · principal · resource · parameters</span></div><b>→</b><div><small>02 · SHEWIUN PDP</small><strong>Evaluate authority</strong><span>Mandate · delegation · policy · context</span></div><b>→</b><div><small>03 · ENFORCEMENT</small><strong>ALLOW / DENY</strong><span>Protected API only after ALLOW</span></div><b>→</b><div><small>04 · EVIDENCE</small><strong>Create evidence</strong><span>Decision ID · policy version · hash chain</span></div></div>
            </section>

            <section className="panel events-panel"><div className="panel-header"><div><div className="panel-kicker">TRACEABILITY</div><h2>Recent authorization decisions</h2></div><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "HASH CHAIN VALID" : auditIntegrity === false ? "HASH CHAIN INVALID" : "INTEGRITY NOT CHECKED"}</Badge><button className="text-button" onClick={() => setSection("laufzeit")} >All events <Icon name="arrow" /></button></div><EventTable events={events.slice(0, 5)} /></section>
          </>}

          {section === "graph" && <section className="panel graph-full"><div className="panel-header"><div><div className="panel-kicker">BUSINESS AUTHORITY GRAPH</div><h2>Authority relationships</h2><p>This view is based on mandates and delegations stored in the backend.</p></div><Badge tone="good">BACKEND DATA</Badge></div><AuthorityGraph nodes={nodes} edges={edges} large /><div className="graph-legend"><span><i className="legend-human" />Human</span><span><i className="legend-agent" />AI agent</span><span><i className="legend-resource" />Resource</span><span><i className="legend-line" />Vollmacht / Delegation</span></div><div className="graph-table"><h3>Graph relationships</h3><table><thead><tr><th>Typ</th><th>Von</th><th>Nach</th><th>Limit</th></tr></thead><tbody>{edges.map(e=><tr key={e.id}><td>{e.typ}</td><td>{e.von}</td><td>{e.nach}</td><td>{money(e.limit)}</td></tr>)}</tbody></table></div></section>}

          {section === "berechtigungen" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">EFFECTIVE AUTHORITY</div><h2>Effective permissions</h2><p>Effective authority is the intersection of all valid authority levels.</p></div></div><div className="permission-chain"><div><small>ORIGINAL MANDATE</small><strong>Anna Müller · CFO</strong><b>CHF 100.000</b><span>payment.create · payment.read · payment.approve</span></div><div className="chain-arrow">↓</div><div><small>DELEGATION</small><strong>Zahlungsagent 01</strong><b>CHF 10.000</b><span>payment.create · payment.read</span></div><div className="chain-arrow">↓</div><div className="effective-result"><small>EFFECTIVE AUTHORITY</small><strong>Minimum effective boundary</strong><b>CHF 10.000</b><span>Further delegation: not permitted</span></div></div><div className="notice"><strong>Decision principle</strong><p>A delegation may restrict rights but can never expand the original mandate. Ambiguous or revoked authority chains are denied.</p></div></section>}


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
                <article><small>INTENDED AUTHORITY</small><strong>Supplier payment</strong><p>Geschäftszweck: supplier_payment</p><p>Ressource: Corporate account ·•••• 1001</p><p>Konkrete Aktion: payment.create</p></article>
                <article className="auth-analysis-effective"><small>EFFECTIVE AUTHORITY</small><strong>{money(agentDelegation?.limit)} {agentDelegation?.waehrung || "CHF"}</strong><p>Agent: Zahlungsagent 01</p><p>Aktionen: {effectiveActions.join(" · ") || "Nicht geladen"}</p><p>Weiterdelegation: {agentDelegation?.delegierbar ? "erlaubt" : "nicht gestattet"}</p></article>
                <article><small>AUTHORITY DELTA</small><strong>{retainedByPrincipal.length} Rechte nicht übertragen</strong><p>{retainedByPrincipal.join(" · ") || "Keine zusätzlichen Rechte im Ursprung"} bleiben beim Vollmachtgeber.</p><p>Eine Tool-Permission erweitert diese Delegation nicht.</p></article>
                <article><small>PERMISSION COMPOSITION</small><strong>Tool ≠ Business Authority</strong><p>Mehrere technisch verfügbare Tools ergeben keine neue geschäftliche Vollmacht.</p><p>Die finale Geschäftsaktion wird separat gegen Ressource, Zweck, Betrag und Freigabe geprüft.</p></article>
              </div>
              <div className="auth-reachability">
                <div className="auth-reachability-heading"><strong>Business action reachability</strong><span>Derived from currently delegated actions</span></div>
                {[
                  {action:"payment.create",label:"Create supplier payment",kind:effectiveActions.includes("payment.create")?"conditional":"denied",detail:"Requires a valid mandate, account scope, amount within limit and fresh approval where applicable."},
                  {action:"payment.read",label:"Read payments",kind:effectiveActions.includes("payment.read")?"allowed":"denied",detail:"Only within the delegated resource and tenant context."},
                  {action:"payment.approve",label:"Approve payment",kind:effectiveActions.includes("payment.approve")?"conditional":"denied",detail:"The original mandate contains this action, but it was not delegated to the agent."},
                  {action:"beneficiary.update",label:"Change beneficiary",kind:"denied",detail:"Not included in the original mandate or agent delegation."},
                ].map(item=><div className="auth-reachability-row" key={item.action}><code>{item.action}</code><strong>{item.label}</strong><Badge tone={item.kind === "allowed" ? "good" : item.kind === "conditional" ? "warn" : "bad"}>{item.kind === "allowed" ? "IM SCOPE" : item.kind === "conditional" ? "CONDITIONAL" : "NOT DELEGATED"}</Badge><p>{item.detail}</p></div>)}
              </div>
            </section>

            <div className="authorization-grid">
              <section className="panel auth-console">
                <div className="panel-header"><div><div className="panel-kicker">POLICY TEST CONSOLE</div><h2>Evaluate a concrete agent action</h2><p>Inputs are evaluated deterministically on the server and recorded as a policy decision.</p></div><Badge tone="warn">SANDBOX</Badge></div>
                <div className="auth-presets">
                  <button onClick={() => setAuthorizationPreset("standard")}>Standard case</button>
                  <button onClick={() => setAuthorizationPreset("broad_scope")}>Broad scope</button>
                  <button onClick={() => setAuthorizationPreset("permission_mismatch")}>Permission mismatch</button>
                  <button onClick={() => setAuthorizationPreset("identity_mismatch")}>Identity mismatch</button>
                  <button onClick={() => setAuthorizationPreset("purpose_mismatch")}>Purpose mismatch</button>
                  <button onClick={() => setAuthorizationPreset("approval_missing")}>Approval missing</button>
                  <button onClick={() => setAuthorizationPreset("approval_stale")}>Approval stale</button>
                  <button onClick={() => setAuthorizationPreset("approval_fresh")}>Fresh approval</button>
                </div>
                <div className="auth-form-grid">
                  <label className="auth-field"><span>Transaction amount · CHF</span><input type="number" min="0" step="0.01" value={authInput.amount} onChange={e => setAuthInput(v => ({ ...v, amount: e.target.value }))} /></label>
                  <label className="auth-field"><span>Business purpose</span><select value={authInput.purpose} onChange={e => setAuthInput(v => ({ ...v, purpose: e.target.value }))}><option value="supplier_payment">Supplier payment</option><option value="account_enumeration">Enumerate accounts</option></select></label>
                  <label className="auth-field"><span>Runtime issuer</span><select value={authInput.runtime_identity} onChange={e => setAuthInput(v => ({ ...v, runtime_identity: e.target.value }))}><option value="shewiun-demo-issuer">Registered demo issuer</option><option value="unknown-runtime">Unknown issuer</option></select></label>
                  <label className="auth-field"><span>Tool</span><select value={authInput.tool} onChange={e => setAuthInput(v => ({ ...v, tool: e.target.value }))}><option value="payment.create">payment.create</option><option value="payment.execute">payment.execute</option></select></label>
                  <label className="auth-field"><span>Permission</span><select value={authInput.permission} onChange={e => setAuthInput(v => ({ ...v, permission: e.target.value }))}><option value="payment.create">payment.create</option><option value="beneficiary.update">beneficiary.update</option></select></label>
                  <label className="auth-field"><span>Data / resource scope</span><select value={authInput.data_scope} onChange={e => setAuthInput(v => ({ ...v, data_scope: e.target.value }))}><option value={ACCOUNT}>Single account ·•••• 1001</option><option value="*">All accounts / global</option></select></label>
                </div>
                <div className="auth-approval">
                  <div><strong>Additional approval</strong><small>The demo policy requires an existing and fresh approval from CHF 7,500.</small></div>
                  <label><input type="checkbox" checked={authInput.approval_present} onChange={e => setAuthInput(v => ({ ...v, approval_present: e.target.checked }))} /> Vorhanden</label>
                  <label><input type="checkbox" checked={authInput.approval_fresh} onChange={e => setAuthInput(v => ({ ...v, approval_fresh: e.target.checked }))} /> Frisch</label>
                </div>
                {authError && <div className="result-box result-bad"><span>!</span><div><strong>Evaluation failed</strong><p>{authError}</p></div></div>}
                <div className="auth-submit-row"><button disabled={authBusy || apiState !== "verbunden" || !authInput.amount} className="button button-primary" onClick={runAuthorizationEvaluation}>{authBusy ? "Evaluating …" : "Evaluate policy server-side"} <Icon name="arrow" /></button><span>No payment is executed in this tab.</span></div>
              </section>

              <section className="panel auth-result-panel">
                <div className="panel-header"><div><div className="panel-kicker">DECISION TRACE</div><h2>Evaluation result</h2><p>Individual control checks instead of an opaque aggregate score.</p></div></div>
                {!authEvaluation ? <div className="auth-empty">Choose a test case and run the policy evaluation. The decision and individual checks will appear here.</div> : <>
                  <div className={authEvaluation.entscheidung === "ALLOW" ? "auth-decision auth-allow" : "auth-decision auth-deny"}>
                    <div><small>POLICY DECISION</small><strong>{authEvaluation.entscheidung}</strong><span>{authEvaluation.grund}</span></div>
                    <Badge tone={authEvaluation.entscheidung === "ALLOW" ? "good" : "bad"}>{authEvaluation.entscheidung === "ALLOW" ? "ALLOWED" : "DENIED"}</Badge>
                  </div>
                  <div className="auth-check-list">{authEvaluation.checks.map(check => <div className="auth-check-row" key={check.control}>
                    <span className={check.result === "pass" ? "auth-check-state pass" : check.result === "fail" ? "auth-check-state fail" : "auth-check-state na"}>{check.result === "pass" ? "PASS" : check.result === "fail" ? "FAIL" : "N/A"}</span>
                    <div><strong>{({ identity: "Identity", permission: "Tool / permission", purpose: "Business purpose", resource_scope: "Resource scope", business_authority: "Business authority", parameters: "Parameters & limits", approval: "Approval" } as Record<string, string>)[check.control] || check.control}</strong><p>{check.detail}</p></div>
                  </div>)}</div>
                  <div className="auth-evidence"><div><small>DECISION ID</small><code>{authEvaluation.decision_id}</code></div><div><small>POLICY</small><code>{authEvaluation.policy_version}</code></div><div><small>DELEGATION PATH</small><code>{authEvaluation.delegationspfad.join(" → ") || "—"}</code></div></div>
                  <p className="auth-trust-note">Claim level: policy evaluation · runtime execution observed: no. Approval state is a demo test input, not a cryptographically verified human approval.</p>
                </>}
              </section>
            </div>
          </div>}

          {section === "laufzeit" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZATION DECISION LOG</div><h2>Runtime control</h2><p>Each protected action is evaluated server-side, independently of agent logic.</p></div><Badge tone="good">DEFAULT: DENY</Badge></div><EventTable events={events} /></section>}

          {section === "freigaben" && <section className="panel empty-state"><div className="empty-icon"><Icon name="check" /></div><h2>Action-bound approval · integration design</h2><p>The policy demo currently checks only whether an approval flag is present and fresh. A production workflow must cryptographically bind approval to the agent, action, resource, amount, beneficiary, expiry and single use. A human-approval interface and signed approval capability are not implemented here.</p><Badge tone="warn">REFERENCE · NOT LIVE</Badge></section>}

          {section === "nachweise" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">SECURITY EVIDENCE</div><h2>Authorization evidence</h2><p>Stored decisions with policy version, delegation path and decision reason.</p></div></div><EventTable events={events} /></section>}

          {section === "assessment" && <div className="assessment-workspace">
            <section className="panel assessment-hero"><div><div className="panel-kicker">M2.7 LITE · AUTHORIZATION ASSESSMENT</div><h2>What can an agent do with its effective permissions?</h2><p>Define the allowed boundary, challenge it with controlled scenarios and verify that the policy allows or denies as expected. Every test is evaluated server-side and receives a decision ID.</p><div className="assessment-tags"><span>Authorization Contract</span><span>Parameter & Scope</span><span>Composition</span><span>Evidence-backed</span><span>Exact Retest</span></div></div><div className="assessment-run-card"><small>ASSESSMENT PROFILE</small><div className="profile-switch"><button className={assessmentProfile==="lite"?"selected":""} onClick={()=>setAssessmentProfile("lite")}>M2.7 Lite · 40</button><button className={assessmentProfile==="continuous"?"selected":""} onClick={()=>setAssessmentProfile("continuous")}>Continuous · 67</button></div><strong>{assessmentBusy?assessmentProgress+" / "+(assessmentProfile==="lite"?40:67)+" TESTS":assessmentResults.length?assessmentResults.filter(x=>x.matched).length+" / "+assessmentResults.length+" MATCHED":"READY TO RUN"}</strong><div className="assessment-progress"><i style={{width:(assessmentProgress/(assessmentProfile==="lite"?40:67)*100)+"%"}}/></div><p>{assessmentResults.length?"Policy-Entscheidungen aus dem letzten Testlauf.":"40 Tests für 1 Agent / 1 MCP-ähnliche Tool-Oberfläche / 1 kritischen Workflow."}</p><button className="button button-primary" disabled={assessmentBusy||apiState!=="verbunden"} onClick={()=>runSecurityAssessment()}>{assessmentBusy?"Assessment läuft …":"Assessment starten"} <Icon name="arrow"/></button>{assessmentResults.length>0&&<button className="button button-secondary report-button" onClick={exportAssessmentReport}>JSON-Evidence exportieren</button>}</div></section>
            <div className="assessment-kpis"><article><small>TESTS</small><strong>{assessmentProfile==="lite"?"40":"67"}</strong><span>{assessmentProfile==="lite"?"M2.7 Lite":"Continuous Assurance"}</span></article><article><small>COMPOSITION</small><strong>{assessmentProfile==="lite"?"3":"10"}</strong><span>Combined control boundaries</span></article><article><small>POSITIVE CONTROLS</small><strong>{assessmentProfile==="lite"?"6":"14"}</strong><span>Legitimate actions remain possible</span></article><article><small>WORKFLOW</small><strong>1</strong><span>Agent · payment workflow · sandbox</span></article></div>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">AUTHORIZATION CONTRACT</div><h2>The authorization boundary under test</h2><p>A test is meaningful only when the expected business authority is defined in advance.</p></div><Badge tone="good">CONTRACT DEFINED</Badge></div><div className="contract-grid">{[["Principal","Payment Agent 01","Registrierter Demo-Aussteller"],["Acting for","Anna Müller · CFO","Synthetic principal"],["Resource","Corporate Account · 1001","Tenant-scoped resource"],["Action","payment.create","Kritischer Supplier payments-Workflow"],["Limit","CHF 10.000","Aus Delegationskette berechnet"],["Approval","Ab CHF 7.500","Demo input, not cryptographically signed"]].map(([a,b,c])=><article key={a}><small>{a}</small><strong>{b}</strong><p>{c}</p></article>)}</div></section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">TEST COVERAGE</div><h2>What is actually tested?</h2><p>The 40 Lite cases include boundary tests and permission-composition scenarios.</p></div><Badge tone="warn">POLICY LEVEL</Badge></div><div className="coverage-grid">{[["Identity & tenant","Agent, Vollmachtgeber, Issuer und Mandant"],["Permission composition","Tool, Permission und Business Action exakt binden"],["Purpose & context","Purpose deviation and context switching"],["Resource scope","Account scope, foreign resource and global wildcards"],["Parameters","Amount limits, currency and boundary values"],["Approval boundary","Present, fresh and combined states"],["MCP surface","MCP-like tool contract checks; no live MCP interceptor"],["Replay observation","Repeated PDP request; no cryptographic replay defense"]].map(([a,b])=><article key={a}><strong>{a}</strong><p>{b}</p></article>)}</div></section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">LIVE RESULTS · EXPECTED VS OBSERVED</div><h2>Security Assessment Evidence</h2><p>An expected DENY is a passing control test. An unexpected ALLOW or API error is marked as a deviation.</p></div><Badge tone={assessmentResults.length&&assessmentResults.every(x=>x.matched)?"good":assessmentResults.length?"bad":"neutral"}>{assessmentResults.length?assessmentResults.every(x=>x.matched)?"ALL EXPECTATIONS MET":"DEVIATION DETECTED":"NO RUN"}</Badge></div>{assessmentResults.length===0?<div className="assessment-empty">Start the assessment. The suite sends real policy requests to the SHEWIUN demo backend; results are not simulated.</div>:<><div className="assessment-summary"><strong>{assessmentResults.filter(x=>x.matched).length} / {assessmentResults.length} as expected</strong><span>{assessmentResults.filter(x=>!x.matched).length} deviations</span><span>{assessmentResults.filter(x=>x.actual==="ALLOW").length} ALLOW</span><span>{assessmentResults.filter(x=>x.actual==="DENY").length} DENY</span></div><div className="assessment-result-list">{assessmentResults.map(item=><article key={item.id} className="assessment-result"><div className={item.matched?"result-indicator pass":"result-indicator fail"}>{item.matched?"PASS":"GAP"}</div><div className="assessment-result-main"><small>{item.category} · TEST {item.id}</small><strong>{item.title}</strong><p>{item.reason}</p><div className="assessment-check-pills">{item.checks.map(check=><span key={check.control} className={check.result}>{check.control}: {check.result}</span>)}</div>{item.decision_id&&<code>{item.decision_id}</code>}</div><div className="assessment-expected"><small>EXPECTED / OBSERVED</small><strong>{item.expected} / {item.actual}</strong></div></article>)}</div></>}</section>
            <section className="panel"><div className="panel-header"><div><div className="panel-kicker">METHODOLOGY</div><h2>Define → Challenge → Observe → Retest</h2></div></div><div className="method-flow"><article><small>01 · DEFINE</small><strong>Authorization Contract</strong><p>Identity, purpose, action, scope, limits and approval.</p></article><b>→</b><article><small>02 · CHALLENGE</small><strong>40+ Test Cases</strong><p>Parameter boundaries, scope escape and composition.</p></article><b>→</b><article><small>03 · OBSERVE</small><strong>Evidence-backed Findings</strong><p>Decision ID, policy version, checks and reason code.</p></article><b>→</b><article><small>04 · RETEST</small><strong>Exact Replay</strong><p>Same test catalogue against the updated policy.</p></article></div><p className="claim-note">Replay here repeats the policy request; it does not prove cryptographic nonce/replay protection. Approval is a demo input, not a signed capability.</p></section>
          </div>}
          {section === "findings" && <div className="findings-workspace"><section className="panel"><div className="panel-header"><div><div className="panel-kicker">FINDINGS · REMEDIATION · RETEST</div><h2>From control deviation to evidence.</h2><p>Findings werden aus deviations des letzten Testlaufs abgeleitet. Erwartete DENY-Entscheidungen sind keine Findings.</p></div><Badge tone={assessmentResults.some(x=>!x.matched)?"bad":assessmentResults.length?"good":"warn"}>{assessmentResults.some(x=>!x.matched)?"REVIEW REQUIRED":assessmentResults.length?"NO OPEN FINDINGS":"ASSESSMENT PENDING"}</Badge></div>{!assessmentResults.length?<div className="assessment-empty">No test run yet. Start an M2.7 assessment first.</div>:assessmentResults.some(x=>!x.matched)?assessmentResults.filter(x=>!x.matched).map(item=><article className="finding-card" key={item.id}><div className="finding-card-head"><Badge tone="bad">CONTROL DEVIATION</Badge><code>TEST-{item.id}</code></div><h3>{item.title}</h3><p>Expected <strong>{item.expected}</strong>, observed <strong>{item.actual}</strong>. {item.reason}</p><div className="finding-remediation"><small>REMEDIATION HYPOTHESIS</small><strong>Correct the authorization boundary in the contract or protected API PEP, then rerun the exact same test.</strong></div><p className="claim-note">Decision ID: {item.decision_id||"no policy decision"} · Aus dem aktuellen Testlauf abgeleitet.</p></article>):<div className="no-findings-state"><strong>No deviations detected in the latest test run.</strong><p>{assessmentResults.length} of {assessmentResults.length} expected decisions match the server-side policy. This applies only to the test cases executed.</p></div>}</section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">EXACT REMEDIATION REPLAY</div><h2>Replay the same scenarios</h2><p>The identical catalogue is evaluated against the current policy. New decision IDs make the second run traceable.</p></div></div><div className="retest-grid"><article><small>BASELINE</small><strong>{assessmentTimestamp?new Date(assessmentTimestamp).toLocaleString("de-CH"):"No run yet"}</strong><p>Most recent test suite</p></article><article><small>RETEST</small><strong>{assessmentProfile==="lite"?"40":"67"} identische Tests</strong><p>Neue Policy-Entscheidungen</p></article><article><small>COMPARISON</small><strong>Expected vs observed</strong><p>deviations und Kontrollstatus</p></article></div><button className="button button-primary" disabled={assessmentBusy||apiState!=="verbunden"} onClick={()=>runSecurityAssessment()}>{assessmentBusy?"Retest running …":"Start exact retest"} <Icon name="arrow"/></button><p className="claim-note">Finding history is not persisted. Policy decisions are recorded in the backend audit store; persistence depends on the database configuration.</p></section></div>}
          {section === "workspace" && <div className="workspace-security"><section className="panel workspace-hero"><div><div className="panel-kicker">ENTERPRISE WORKSPACE · TENANT & IDENTITY</div><h2>A controlled workspace for security, engineering and risk.</h2><p>The demo shows architecture and control status transparently; no unconfigured login is presented as active.</p></div><div className="workspace-tenant-card"><small>ACTIVE DEMO TENANT</small><strong>Alpenbank Demo AG</strong><span>org-alpenbank · CH · SANDBOX</span><Badge tone="warn">SYNTHETIC WORKSPACE</Badge></div></section><div className="workspace-stats"><article><small>HUMAN SSO</small><strong>Not configured</strong><span>OIDC / SAML nicht verbunden</span></article><article><small>AGENT IDENTITY</small><strong>Demo issuer</strong><span>No OIDC workload token</span></article><article><small>TENANT ISOLATION</small><strong>Server-side scoping</strong><span>PostgreSQL RLS not enabled</span></article><article><small>EVIDENCE STORE</small><strong>{storageMode}</strong><span>Persistence status from backend health</span></article></div><section className="panel"><div className="panel-header"><div><div className="panel-kicker">ROLE-BASED ACCESS CONTROL</div><h2>Workspace role model</h2><p>Illustrative S-PRO/customer security workspace. User administration is not enforced in this demo.</p></div><Badge tone="warn">REFERENCE MODEL</Badge></div><div className="workspace-role-table"><div className="workspace-role-row header"><span>Rolle</span><span>Assessments</span><span>Findings</span><span>Workspace / SSO</span></div>{[["Owner","Manage","Manage","Configure"],["Security Engineer","Run / retest","Edit","No admin access"],["Risk / Reviewer","Read only","Review / Accept","No admin access"],["Viewer","Read only","Read only","No admin access"]].map(row=><div className="workspace-role-row" key={row[0]}>{row.map((v,i)=><span key={i}>{v}</span>)}</div>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">SSO & IDENTITY PROVIDERS</div><h2>Enterprise login and provisioning</h2><p>SSO authenticates people. Workload identity authenticates machines. Business Authority separately evaluates the business action.</p></div><Badge tone="warn">NOT CONNECTED</Badge></div><div className="idp-grid">{[["Microsoft Entra ID","OIDC / SAML 2.0"],["Okta","OIDC / SAML 2.0"],["Keycloak","OIDC / SAML 2.0"],["SCIM 2.0","User provisioning"]].map(([a,b])=><article key={a}><small>{b}</small><strong>{a}</strong><p>Planned identity provider / provisioning source.</p><Badge tone="warn">Not connected</Badge></article>)}</div><div className="workspace-controls">{[["MFA","IdP-enforced, phishing-resistant MFA"],["Group mapping","Map IdP groups to workspace roles"],["Session controls","Short sessions and server-side invalidation"],["SCIM deprovisioning","Revoke access during offboarding"],["Workload identity","OIDC federation instead of long-lived agent keys"],["Break-glass","Time-limited, logged emergency access"]].map(([a,b])=><div key={a}><strong>{a}</strong><span>{b}</span><Badge tone="warn">PLANNED</Badge></div>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">TENANT SECURITY POSTURE</div><h2>Demo control posture</h2></div></div><div className="workspace-posture">{[["Serverseitiger API-Proxy","API secret remains server-side","good","Aktiv"],["Default Deny","Unknown identities and scopes are denied","good","Aktiv"],["Tenant RLS","PostgreSQL Row-Level Security","warn","Not enabled"],["Human SSO","OIDC / SAML Login","warn","Not connected"],["Workload Identity","OIDC Token Validation","warn","Not enabled"],["Audit Anchor","Externe Verankerung der Hash-Kette","warn","Not enabled"]].map(([a,b,t,l])=><article key={a}><strong>{a}</strong><p>{b}</p><Badge tone={t as "good"|"warn"}>{l}</Badge></article>)}</div></section></div>}
          {section === "integrationen" && <div className="integration-workspace"><section className="panel integration-hero"><div><div className="panel-kicker">VENDOR-NEUTRAL ENFORCEMENT LAYER</div><h2>SHEWIUN complements S-PRO agents at the protected action boundary.</h2><p>Existing agents and orchestrators stay in place. SHEWIUN evaluates business authority before a mutation reaches the protected customer API.</p></div><div className="integration-contract"><small>REFERENCE DECISION API</small><code>POST /api/v1/autorisierung/evaluieren</code><code>ALLOW | DENY</code><code>decision_id · checks · policy_version</code></div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">INTEGRATION SURFACES</div><h2>One authorization contract, multiple integration surfaces.</h2><p>Reference architecture. External S-PRO or customer runtimes are not connected.</p></div><Badge tone="warn">REFERENCE ARCHITECTURE</Badge></div><div className="integration-card-grid">{[["MCP Server / Tools","Evaluate the tool call with agent identity, purpose, resource scope and canonical parameters before execution.","MCP"],["REST / HTTP API","Call the Policy Decision Point before the protected business API mutation.","REST"],["OpenAPI / SDK","Use API schemas as the basis for business actions and permission contracts.","SDK"],["Agent Frameworks","LangGraph, CrewAI, OpenAI Agents and customer-built orchestrators remain independent.","Framework-neutral"],["Cloud / IAM","Entra ID, AWS, GCP or customer IdPs provide technical identity claims.","Cloud-neutral"],["SIEM / GRC / Audit","Forward decision IDs and evidence events to existing security and governance processes.","Evidence"]].map(([a,b,c])=><article key={a}><small>{c}</small><strong>{a}</strong><p>{b}</p></article>)}</div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">REFERENCE ENFORCEMENT FLOW</div><h2>Where SHEWIUN fits in the S-PRO solution design</h2></div></div><div className="integration-flow integration-flow-enterprise"><div><small>01 · S-PRO AGENT</small><strong>Plan / Tool Call</strong><span>Agent runtime / orchestrator</span></div><b>→</b><div><small>02 · CUSTOMER PEP</small><strong>Action Intercept</strong><span>API / MCP wrapper</span></div><b>→</b><div><small>03 · SHEWIUN PDP</small><strong>Authority Decision</strong><span>Context · Policy · Delegation</span></div><b>→</b><div><small>04 · BUSINESS API</small><strong>Execute or Block</strong><span>Mutation after ALLOW</span></div><b>→</b><div><small>05 · EVIDENCE</small><strong>Audit & Retest</strong><span>Decision · Trace · Impact</span></div></div><p className="claim-note">S-PRO delivers agent engineering and process integration; SHEWIUN addresses the separate business-authority and authorization-assurance layer. Validate the interface and responsibility boundaries together.</p></section></div>}
          {section === "programme" && <div className="programme-workspace"><section className="panel"><div className="panel-header"><div><div className="panel-kicker">JOINT DELIVERY MODEL · COMMERCIAL CONCEPT</div><h2>A modular assurance component for selected S-PRO projects.</h2><p>Scope and commercial terms would be agreed with S-PRO per customer and workflow. This demo intentionally avoids unvalidated list prices and claims about unimplemented enterprise features.</p></div><Badge tone="warn">PARTNERSHIP CONCEPT</Badge></div><div className="programme-grid"><article className="programme-card"><small>01 · DESIGN & ASSESS</small><h3>Authorization Design Sprint</h3><div className="programme-scope">1 agent · 1 non-production workflow · defined contract</div><ul>{["Business Authority Map","Allowed / denied action matrix","M2.7 Policy-Level Assessment","Findings with a clear control boundary","Evidence export and retest plan"].map(x=><li key={x}>{x}</li>)}</ul><Badge tone="good">POTENTIAL ENTRY OFFER</Badge></article><article className="programme-card recommended"><small>02 · IMPLEMENT & VERIFY</small><h3>Runtime Control Integration</h3><div className="programme-scope">PDP / PEP · protected API · customer-controlled environment</div><ul>{["Authorization Contract in Service Layer","Server-side enforcement before mutation","Identity / resource / parameter binding","Human approval integration based on customer requirements","Non-production verification and handover"].map(x=><li key={x}>{x}</li>)}</ul><Badge tone="good">JOINT ENGINEERING</Badge></article><article className="programme-card"><small>03 · REVALIDATE</small><h3>Continuous Policy Assurance</h3><div className="programme-scope">Regression after relevant changes</div><ul>{["Version the policy test suite","Account for model, prompt and tool changes","Replay the same scenarios","Before / after evidence vergleichen","Track findings and residual risks"].map(x=><li key={x}>{x}</li>)}</ul><Badge>RECURRING SERVICE OPPORTUNITY</Badge></article></div></section><section className="panel"><div className="panel-header"><div><div className="panel-kicker">CAPABILITY BOUNDARY</div><h2>What can be demonstrated today?</h2><p>A credible partnership starts with clear boundaries between the current product, separate engines and joint integration work.</p></div></div><div className="capability-table"><div><strong>In this demo backend</strong><span>Business Authority Graph, deterministischer PDP mit sieben Kontrollgruppen, server-side protected payment sandbox mutation, hash-linked audit trail, 40/67 policy test cases and JSON export.</span><Badge tone="good">IMPLEMENTED DEMO</Badge></div><div><strong>AgentProof Security Engine</strong><span>Agent manifest analysis, contract evaluation against event traces, SHA-256 evidence hash, structured findings and remediation, authenticated sandbox-agent discovery and scoped identity verification.</span><Badge tone="warn">SEPARATE PLATFORM / INTEGRATION</Badge></div><div><strong>Joint implementation required</strong><span>Production MCP interception, end-to-end runtime events from S-PRO agents, signed one-time approval capabilities, full SSO / workload identity, PostgreSQL RLS and customer-specific SIEM integration.</span><Badge>NOT LIVE HERE</Badge></div></div></section></div>}

          {section === "system" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">SYSTEMSTATUS</div><h2>Integration status</h2><p>Technical environment and current interfaces.</p></div></div><div className="system-list"><div><span>Authorization API</span><Badge tone={apiState === "verbunden" ? "good" : "bad"}>{apiState === "verbunden" ? "Reachable" : "Unreachable"}</Badge></div><div><span>Data store</span><Badge tone={storageMode.startsWith("PostgreSQL") ? "good" : "warn"}>{storageMode}</Badge></div><div><span>Sandbox payments</span><Badge tone="good">{payments} records</Badge></div><div><span>Policy-Version</span><code>SHEWIUN-BA-0.2.0</code></div><div><span>Audit integrity</span><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "Hash chain valid" : auditIntegrity === false ? "Verification failed" : "Not checked"}</Badge></div><div><span>Service-to-service</span><Badge tone={apiState === "verbunden" ? "good" : "warn"}>{apiState === "verbunden" ? "Protected server proxy" : "Not connected"}</Badge></div>
          <div><span>Workload identity verification</span><Badge tone="warn">OIDC / workload identity · planned enhancement</Badge></div></div></section>}
          <footer className="page-footer"><span>SHEWIUN AI AGENT AUTHORIZATION SECURITY</span><span>Technical demonstrator · not approved for production use</span><span>© 2026 SHEWIUN</span></footer>
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
    VOLLMACHT: "ORIGINAL MANDATE",
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
  return <div className="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Agent</th><th>Aktion</th><th>Betrag</th><th>Entscheidung</th><th>Grund</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{new Date(e.zeitpunkt).toLocaleString("en-GB")}</td><td><span className="mono">{e.agent}</span></td><td><code>{e.aktion}</code></td><td>{money(e.betrag)}</td><td><Badge tone={e.entscheidung === "ALLOW" ? "good" : "bad"}>{e.entscheidung}</Badge></td><td><span className="reason-code">{e.grund}</span></td></tr>)}</tbody></table></div>;
}
