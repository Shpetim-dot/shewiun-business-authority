"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type GraphNode = { id: string; label: string; typ: string; status: string; beschreibung?: string | null };
type GraphEdge = { id: string; von: string; nach: string; typ: string; limit?: number | null; waehrung?: string | null; aktionen?: string[]; delegierbar?: boolean | null; gueltig_bis?: string | null; beschreibung?: string | null };
type EventItem = { id: string; zeitpunkt: string; agent: string; aktion: string; entscheidung: string; grund: string; betrag?: string | null };
type ApiState = "pruefung" | "verbunden" | "getrennt";
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
  const [section, setSection] = useState("uebersicht");
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
    { id: "uebersicht", label: "Übersicht", icon: "grid", group: "PLATTFORM" },
    { id: "graph", label: "Autoritätsgraph", icon: "graph", group: "AUTORITÄT" },
    { id: "berechtigungen", label: "Berechtigungen", icon: "shield", group: "AUTORITÄT" },
    { id: "autorisierung", label: "Autorisierung", icon: "activity", group: "DURCHSETZUNG" },
    { id: "laufzeit", label: "Laufzeitkontrolle", icon: "activity", group: "DURCHSETZUNG" },
    { id: "freigaben", label: "Freigaben", icon: "check", group: "DURCHSETZUNG" },
    { id: "nachweise", label: "Sicherheitsnachweise", icon: "file", group: "GOVERNANCE" },
    { id: "system", label: "System", icon: "settings", group: "VERWALTUNG" },
  ];
  const grouped = ["PLATTFORM", "AUTORITÄT", "DURCHSETZUNG", "GOVERNANCE", "VERWALTUNG"];

  function title() { return nav.find(n => n.id === section)?.label || "Übersicht"; }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div><div className="brand-name">SHEWIUN</div><div className="brand-sub">GESCHÄFTLICHE AUTORITÄT</div></div>
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
        <div className="sidebar-bottom"><div className="environment"><span className="env-dot" />TESTUMGEBUNG</div><div className="sidebar-version">SHEWIUN BA · VERSION 0.2.0</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">SHEWIUN <span>/</span> {title().toUpperCase()}</div>
          <div className="topbar-right"><Badge tone={apiState === "verbunden" ? "good" : apiState === "getrennt" ? "bad" : "warn"}>{apiState === "verbunden" ? "API VERBUNDEN" : apiState === "getrennt" ? "BACKEND GETRENNT" : "VERBINDUNG WIRD GEPRÜFT"}</Badge><div className="user-chip"><span>SM</span><div><strong>Systemadministration</strong><small>Demo-Zugriff</small></div></div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">STEUERUNG GESCHÄFTLICHER BERECHTIGUNGEN</div><h1>{title()}</h1><p>Geschäftliche Vollmachten nachvollziehen. Delegierte Rechte begrenzen. Aktionen vor Ausführung kontrollieren.</p></div>
            <div className="heading-actions"><button className="button button-secondary" onClick={loadData}><span>↻</span> Aktualisieren</button><button className="button button-primary" onClick={() => setSection("graph")}>Autoritätsgraph öffnen <Icon name="arrow" /></button></div>
          </div>

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

          {section === "freigaben" && <section className="panel empty-state"><div className="empty-icon"><Icon name="check" /></div><h2>Freigabeworkflow in Vorbereitung</h2><p>Als nächster Ausbauschritt werden aktionsgebundene Freigaben mit Intent-Hash, Ablaufzeit und Einmalverwendung implementiert.</p><Badge tone="warn">NOCH NICHT IMPLEMENTIERT</Badge></section>}

          {section === "nachweise" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">PRÜFNACHWEISE</div><h2>Autorisierungsnachweise</h2><p>Gespeicherte Entscheidungen mit Policy-Version, Delegationspfad und Entscheidungsgrund.</p></div></div><EventTable events={events} /></section>}

          {section === "system" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">SYSTEMSTATUS</div><h2>Integrationsstatus</h2><p>Technische Umgebung und aktuelle Schnittstellen.</p></div></div><div className="system-list"><div><span>Autorisierungs-API</span><Badge tone={apiState === "verbunden" ? "good" : "bad"}>{apiState === "verbunden" ? "Erreichbar" : "Nicht erreichbar"}</Badge></div><div><span>Datenhaltung</span><Badge tone={storageMode.startsWith("PostgreSQL") ? "good" : "warn"}>{storageMode}</Badge></div><div><span>Sandbox-Zahlungen</span><Badge tone="good">{payments} Datensätze</Badge></div><div><span>Policy-Version</span><code>SHEWIUN-BA-0.2.0</code></div><div><span>Audit-Integrität</span><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "Hash-Kette gültig" : auditIntegrity === false ? "Prüfung fehlgeschlagen" : "Nicht geprüft"}</Badge></div><div><span>Service-zu-Service</span><Badge tone={apiState === "verbunden" ? "good" : "warn"}>{apiState === "verbunden" ? "Geschützter Server-Proxy" : "Nicht verbunden"}</Badge></div>
          <div><span>Identitätsprüfung im Auftrag</span><Badge tone="warn">OIDC / Workload Identity als nächster Ausbauschritt</Badge></div></div></section>}
          <footer className="page-footer"><span>SHEWIUN GESCHÄFTLICHE AUTORITÄT</span><span>Technischer Demonstrator · Keine Produktionsfreigabe</span><span>© 2026 SHEWIUN</span></footer>
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
