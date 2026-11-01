"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type GraphNode = { id: string; label: string; typ: string; status: string };
type GraphEdge = { id: string; von: string; nach: string; typ: string; limit?: number | null };
type EventItem = { id: string; zeitpunkt: string; agent: string; aktion: string; entscheidung: string; grund: string; betrag?: string | null };
type ApiState = "pruefung" | "verbunden" | "getrennt";

const API_ORG = "org-alpenbank";
const AGENT = "agent-payment-01";
const CFO = "person-cfo-anna";
const ACCOUNT = "konto-corporate-1001";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const [auditIntegrity, setAuditIntegrity] = useState<boolean | null>(null);

  async function loadData() {
    try {
      const [health, graph, audit, paymentRows, integrity] = await Promise.all([
        fetch(`${API_BASE}/health`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/v1/autoritaetsgraph?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/v1/sicherheitsereignisse?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/v1/sandbox/zahlungen?organization_id=${API_ORG}`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/v1/audit/integritaet?organization_id=${API_ORG}`, { cache: "no-store" }),
      ]);
      if (!health.ok || !graph.ok || !audit.ok || !paymentRows.ok || !integrity.ok) throw new Error("Backend nicht erreichbar");
      const graphData = await graph.json();
      setNodes(graphData.knoten || []);
      setEdges(graphData.verbindungen || []);
      setEvents(await audit.json());
      setPayments((await paymentRows.json()).length);
      setAuditIntegrity(Boolean((await integrity.json()).gueltig));
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
      const response = await fetch(`${API_BASE}/api/v1/sandbox/zahlungen`, {
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

  const counts = useMemo(() => ({
    people: nodes.filter(n => n.typ === "MENSCH").length,
    agents: nodes.filter(n => n.typ === "KI_AGENT").length,
    resources: nodes.filter(n => n.typ === "RESSOURCE").length,
    denied: events.filter(e => e.entscheidung === "DENY").length,
  }), [nodes, events]);

  const nav = [
    { id: "uebersicht", label: "Übersicht", icon: "grid", group: "PLATTFORM" },
    { id: "graph", label: "Autoritätsgraph", icon: "graph", group: "AUTORITÄT" },
    { id: "berechtigungen", label: "Berechtigungen", icon: "shield", group: "AUTORITÄT" },
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
          <div className="brand-mark"><span /></div>
          <div><div className="brand-name">SHEWIUN</div><div className="brand-sub">BUSINESS AUTHORITY</div></div>
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
        <div className="sidebar-bottom"><div className="environment"><span className="env-dot" />SANDBOX-UMGEBUNG</div><div className="sidebar-version">SHEWIUN BA · VERSION 0.1.0</div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">SHEWIUN <span>/</span> {title().toUpperCase()}</div>
          <div className="topbar-right"><Badge tone={apiState === "verbunden" ? "good" : apiState === "getrennt" ? "bad" : "warn"}>{apiState === "verbunden" ? "BACKEND VERBUNDEN" : apiState === "getrennt" ? "BACKEND GETRENNT" : "VERBINDUNG WIRD GEPRÜFT"}</Badge><div className="user-chip"><span>SM</span><div><strong>Systemadministration</strong><small>Demo-Zugriff</small></div></div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">GESCHÄFTLICHE AUTORISIERUNG · CONTROL PLANE</div><h1>{title()}</h1><p>Geschäftliche Vollmachten nachvollziehen. Delegierte Rechte begrenzen. Aktionen vor Ausführung kontrollieren.</p></div>
            <div className="heading-actions"><button className="button button-secondary" onClick={loadData}><span>↻</span> Aktualisieren</button><button className="button button-primary" onClick={() => setSection("graph")}>Autoritätsgraph öffnen <Icon name="arrow" /></button></div>
          </div>

          {section === "uebersicht" && <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-top"><span>Identitäten</span><span className="stat-icon"><Icon name="shield" /></span></div><div className="stat-value">{counts.people + counts.agents || "—"}</div><div className="stat-foot">{counts.people} Personen <span>·</span> {counts.agents} KI-Agenten</div></div>
              <div className="stat-card"><div className="stat-top"><span>Aktive Vollmachten</span><span className="stat-icon"><Icon name="file" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "VOLLMACHT").length || "—"}</div><div className="stat-foot">Geschäftliche Autoritätsbeziehungen</div></div>
              <div className="stat-card"><div className="stat-top"><span>Delegationen</span><span className="stat-icon"><Icon name="graph" /></span></div><div className="stat-value">{edges.filter(e => e.typ === "DELEGATION").length || "—"}</div><div className="stat-foot">Explizit übertragene Teilrechte</div></div>
              <div className="stat-card"><div className="stat-top"><span>Verweigerte Aktionen</span><span className="stat-icon danger"><Icon name="lock" /></span></div><div className="stat-value">{counts.denied}</div><div className="stat-foot">Laufzeitentscheidungen · DENY</div></div>
            </div>

            <div className="section-grid">
              <section className="panel graph-panel">
                <div className="panel-header"><div><div className="panel-kicker">AUTORITÄTSMODELL</div><h2>Geschäftliche Autorität</h2><p>Ursprungsvollmacht und daraus abgeleitete Agentenrechte</p></div><button className="text-button" onClick={() => setSection("graph")}>Graph öffnen <Icon name="arrow" /></button></div>
                <AuthorityGraph nodes={nodes} edges={edges} />
                <div className="graph-legend"><span><i className="legend-human" />Mensch</span><span><i className="legend-agent" />KI-Agent</span><span><i className="legend-resource" />Ressource</span><span><i className="legend-line" />Delegation / Vollmacht</span></div>
              </section>
              <section className="panel authority-panel">
                <div className="panel-header"><div><div className="panel-kicker">EFFEKTIVE BERECHTIGUNG</div><h2>Zahlungsagent 01</h2><p>Abgeleitet aus der CFO-Vollmacht</p></div><Badge tone="good">AKTIV</Badge></div>
                <div className="limit-block"><span>Wirksames Zahlungslimit</span><strong>CHF 10.000</strong><small>Ursprung: CHF 100.000 · Delegation: CHF 10.000</small></div>
                <div className="authority-row"><span>Handelnde Person</span><strong>Anna Müller · CFO</strong></div>
                <div className="authority-row"><span>Ressource</span><strong>Geschäftskonto ·•••• 1001</strong></div>
                <div className="authority-row"><span>Erlaubte Aktion</span><strong><code>payment.create</code></strong></div>
                <div className="authority-row"><span>Weiterdelegation</span><Badge tone="bad">NICHT ERLAUBT</Badge></div>
                <div className="panel-footnote">Demo-Konfiguration · Effektives Limit wird serverseitig aus der Berechtigungskette berechnet.</div>
              </section>
            </div>

            <section className="panel test-panel">
              <div className="panel-header"><div><div className="panel-kicker">LIVE-ENFORCEMENT · SANDBOX</div><h2>Autorisierung praktisch prüfen</h2><p>Die Aktion wird durch die API geprüft. Nur eine erlaubte Aktion erzeugt einen Zahlungsdatensatz.</p></div><Badge tone="warn">SYNTHETISCHE DATEN</Badge></div>
              <div className="test-actions"><div className="test-case"><div><strong>Reguläre Zahlung</strong><small>CHF 5.000 · innerhalb der delegierten Vollmacht</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-primary" onClick={() => runPayment(5000)}>Zahlung ausführen <Icon name="arrow" /></button></div><div className="test-case"><div><strong>Limitüberschreitung</strong><small>CHF 15.000 · oberhalb der delegierten Vollmacht</small></div><button disabled={busy || apiState !== "verbunden"} className="button button-danger" onClick={() => runPayment(15000)}>Verweigerung testen <Icon name="arrow" /></button></div></div>
              {result && <div className={result.ok ? "result-box result-good" : "result-box result-bad"}><span>{result.ok ? "✓" : "!"}</span><div><strong>{result.ok ? "Aktion autorisiert" : "Aktion verweigert"}</strong><p>{result.text}</p></div></div>}
            </section>

            <section className="panel events-panel"><div className="panel-header"><div><div className="panel-kicker">NACHVOLLZIEHBARKEIT</div><h2>Letzte Autorisierungsentscheidungen</h2></div><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "HASH-KETTE GÜLTIG" : auditIntegrity === false ? "HASH-KETTE FEHLERHAFT" : "INTEGRITÄT UNGEPRÜFT"}</Badge><button className="text-button" onClick={() => setSection("laufzeit")}>Alle Ereignisse <Icon name="arrow" /></button></div><EventTable events={events.slice(0, 5)} /></section>
          </>}

          {section === "graph" && <section className="panel graph-full"><div className="panel-header"><div><div className="panel-kicker">BUSINESS AUTHORITY GRAPH</div><h2>Autoritätsbeziehungen</h2><p>Die Darstellung basiert auf den im Backend gespeicherten Vollmachten und Delegationen.</p></div><Badge tone="good">BACKEND-DATEN</Badge></div><AuthorityGraph nodes={nodes} edges={edges} large /><div className="graph-legend"><span><i className="legend-human" />Mensch</span><span><i className="legend-agent" />KI-Agent</span><span><i className="legend-resource" />Ressource</span><span><i className="legend-line" />Vollmacht / Delegation</span></div><div className="graph-table"><h3>Beziehungen im Graph</h3><table><thead><tr><th>Typ</th><th>Von</th><th>Nach</th><th>Limit</th></tr></thead><tbody>{edges.map(e=><tr key={e.id}><td>{e.typ}</td><td>{e.von}</td><td>{e.nach}</td><td>{money(e.limit)}</td></tr>)}</tbody></table></div></section>}

          {section === "berechtigungen" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">EFFECTIVE AUTHORITY</div><h2>Effektive Berechtigungen</h2><p>Die wirksame Berechtigung ergibt sich aus der Schnittmenge aller gültigen Autoritätsstufen.</p></div></div><div className="permission-chain"><div><small>URSPRUNGS-VOLLMACHT</small><strong>Anna Müller · CFO</strong><b>CHF 100.000</b><span>payment.create · payment.read · payment.approve</span></div><div className="chain-arrow">↓</div><div><small>DELEGATION</small><strong>Zahlungsagent 01</strong><b>CHF 10.000</b><span>payment.create · payment.read</span></div><div className="chain-arrow">↓</div><div className="effective-result"><small>EFFEKTIVE AUTORITÄT</small><strong>Minimale wirksame Grenze</strong><b>CHF 10.000</b><span>Weiterdelegation: nicht gestattet</span></div></div><div className="notice"><strong>Entscheidungsprinzip</strong><p>Eine Delegation kann Rechte einschränken, aber niemals die Ursprungsvollmacht erweitern. Nicht eindeutig auflösbare oder widerrufene Autoritätsketten werden verweigert.</p></div></section>}

          {section === "laufzeit" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">POLICY DECISION POINT</div><h2>Laufzeitkontrolle</h2><p>Jede geschützte Aktion wird unabhängig von der Agentenlogik serverseitig bewertet.</p></div><Badge tone="good">DEFAULT DENY</Badge></div><EventTable events={events} /></section>}

          {section === "freigaben" && <section className="panel empty-state"><div className="empty-icon"><Icon name="check" /></div><h2>Freigabeworkflow in Vorbereitung</h2><p>Als nächster Ausbauschritt werden aktionsgebundene Freigaben mit Intent-Hash, Ablaufzeit und Einmalverwendung implementiert.</p><Badge tone="warn">NOCH NICHT IMPLEMENTIERT</Badge></section>}

          {section === "nachweise" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">AUDIT EVIDENCE</div><h2>Autorisierungsnachweise</h2><p>Gespeicherte Entscheidungen mit Policy-Version, Delegationspfad und Entscheidungsgrund.</p></div></div><EventTable events={events} /></section>}

          {section === "system" && <section className="panel"><div className="panel-header"><div><div className="panel-kicker">SYSTEMSTATUS</div><h2>Integrationsstatus</h2><p>Technische Umgebung und aktuelle Schnittstellen.</p></div></div><div className="system-list"><div><span>Autorisierungs-API</span><Badge tone={apiState === "verbunden" ? "good" : "bad"}>{apiState === "verbunden" ? "Erreichbar" : "Nicht erreichbar"}</Badge></div><div><span>PostgreSQL</span><Badge tone={apiState === "verbunden" ? "good" : "warn"}>{apiState === "verbunden" ? "Über API verbunden" : "Status unbekannt"}</Badge></div><div><span>Sandbox-Zahlungen</span><Badge tone="good">{payments} Datensätze</Badge></div><div><span>Policy-Version</span><code>SHEWIUN-BA-0.1.0</code></div><div><span>Audit-Integrität</span><Badge tone={auditIntegrity === true ? "good" : auditIntegrity === false ? "bad" : "warn"}>{auditIntegrity === true ? "Hash-Kette gültig" : auditIntegrity === false ? "Prüfung fehlgeschlagen" : "Nicht geprüft"}</Badge></div><div><span>Authentifizierung</span><Badge tone="warn">Demo-Modus · keine OIDC-Prüfung</Badge></div></div></section>}
          <footer className="page-footer"><span>SHEWIUN BUSINESS AUTHORITY</span><span>Technischer Demonstrator · Keine Produktionsfreigabe</span><span>© 2026 SHEWIUN</span></footer>
        </div>
      </main>
    </div>
  );
}

function AuthorityGraph({ nodes, edges, large = false }: { nodes: GraphNode[]; edges: GraphEdge[]; large?: boolean }) {
  const known = [
    { id: "person-cfo-anna", x: 105, y: 110, width: 190, type: "human", title: "Anna Müller", sub: "CFO · CHF 100.000" },
    { id: "agent-payment-01", x: 420, y: 110, width: 190, type: "agent", title: "Zahlungsagent 01", sub: "Delegiert · CHF 10.000" },
    { id: "konto-corporate-1001", x: 735, y: 110, width: 205, type: "resource", title: "Geschäftskonto", sub: "Konto ·•••• 1001" },
    { id: "person-finance-peter", x: 105, y: 255, width: 190, type: "human", title: "Peter Meier", sub: "Finanzleitung · CHF 25.000" },
    { id: "agent-sub-01", x: 420, y: 255, width: 190, type: "agent", title: "Unteragent 01", sub: "Keine Delegation" },
    { id: "konto-corporate-2002", x: 735, y: 255, width: 205, type: "resource", title: "Geschäftskonto", sub: "Konto ·•••• 2002" },
  ];
  const present = known.filter(k => nodes.some(n => n.id === k.id));
  const height = large ? 390 : 330;
  return <div className={large ? "graph-canvas graph-canvas-large" : "graph-canvas"}><svg viewBox={`0 0 1000 ${height}`} role="img" aria-label="Darstellung der geschäftlichen Vollmachten und Agentendelegationen">
    {edges.map(e => {
      const a = present.find(n => n.id === e.von), b = present.find(n => n.id === e.nach);
      if (!a || !b) return null;
      const x1 = a.x + a.width, y1 = a.y + 35, x2 = b.x, y2 = b.y + 35;
      return <g key={e.id}><path className={e.typ === "DELEGATION" || e.typ === "DELEGIERTER_ZUGRIFF" ? "edge-delegation" : "edge-grant"} d={`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`} /><text x={(x1+x2)/2} y={(y1+y2)/2-9} className="edge-label">{e.typ === "DELEGATION" ? "DELEGATION" : e.typ === "DELEGIERTER_ZUGRIFF" ? "AGENTENZUGRIFF" : "VOLLMACHT"}</text></g>;
    })}
    {present.map(n => <g key={n.id} transform={`translate(${n.x},${n.y})`}><rect width={n.width} height="70" rx="5" className={`node node-${n.type}`} /><circle cx="17" cy="18" r="4" className="node-indicator" /><text x="30" y="23" className="node-title">{n.title}</text><text x="16" y="48" className="node-sub">{n.sub}</text></g>)}
  </svg></div>;
}

function EventTable({ events }: { events: EventItem[] }) {
  if (!events.length) return <div className="table-empty">Noch keine Autorisierungsentscheidungen vorhanden. Führe einen Sandbox-Test aus.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Agent</th><th>Aktion</th><th>Betrag</th><th>Entscheidung</th><th>Grund</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{new Date(e.zeitpunkt).toLocaleString("de-DE")}</td><td><span className="mono">{e.agent}</span></td><td><code>{e.aktion}</code></td><td>{money(e.betrag)}</td><td><Badge tone={e.entscheidung === "ALLOW" ? "good" : "bad"}>{e.entscheidung}</Badge></td><td><span className="reason-code">{e.grund}</span></td></tr>)}</tbody></table></div>;
}
