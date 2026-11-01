# SHEWIUN — Business Authority & Runtime Authorization

SHEWIUN ist eine spezialisierte Autorisierungsebene für geschäftliche Vollmachten, delegierte Agentenrechte und die unabhängige Prüfung geschäftskritischer Agentenaktionen.

## Produktkern

SHEWIUN verbindet vier Ebenen:

1. **Business Authority** – wer darf im Namen welcher Organisation über welche Ressourcen und Aktionen entscheiden?
2. **Delegation** – welche Teilmenge dieser Autorität wurde an welchen Agenten übertragen?
3. **Runtime Authorization** – ist genau diese Aktion mit genau diesen Parametern im aktuellen Kontext zulässig?
4. **Enforcement & Evidence** – wird eine nicht autorisierte Aktion vor der geschützten Mutation blockiert und ist die Entscheidung nachvollziehbar?

SHEWIUN ersetzt weder Agenten-Orchestrierung noch IAM. Es ergänzt bestehende Plattformen um eine fachliche Autorisierungs- und Security-Validation-Ebene.

## Module im Demonstrator

- Business Authority Graph und Effective Authority
- Runtime PDP mit sieben getrennten Policy-Kontrollen
- M2.7 Lite Assessment mit 40 Policy-Testfällen und JSON-Evidence-Export
- Continuous-Testprofil mit 67 Policy-Testfällen und 10 Composition-Szenarien
- Findings aus Abweichungen, Exact Policy Retest und Verification Summary
- Enterprise Workspace-Zielmodell für SSO, RBAC, SCIM und Workload Identity
- Integrationsreferenz für MCP, REST, OpenAPI, IAM und SIEM
- Security-Header für den Web-Client

## Architektur (MVP)

- **API:** FastAPI, Python 3.12
- **Datenzugriff:** SQLAlchemy 2; produktive Persistenz benötigt PostgreSQL
- **Domänenkern:** Authority Graph, Delegation, Effective Authority und Policy Decision Point
- **Durchsetzung:** geschützte Sandbox-Business-API mit serverseitiger Autorisierungsprüfung
- **Web:** Next.js / TypeScript
- **Tests:** pytest, API- und Domänentests

## Security-Prinzipien

- Default Deny und fail-closed.
- Das LLM ist niemals die Autorisierungsinstanz.
- Delegierte Rechte dürfen die übergeordnete Autorität nicht erweitern.
- Die geschützte Business-API muss vor einer Mutation serverseitig prüfen.
- Signierte, aktionsgebundene und einmalig verwendbare Freigaben sind ein Produktionsziel; im Demo sind Approval-Flags nur Testeingaben.
- Mandanten- und Ressourcenbezüge werden serverseitig validiert.
- Demo-Daten sind synthetisch.

## Demo-Status und Grenzen

Der Security-Assessment-Tab sendet 40 bzw. 67 deterministische Policy-Requests an den Demo-PDP und vergleicht die Antworten mit den erwarteten Ergebnissen. Das Ergebnis kann als JSON exportiert werden.

Noch nicht implementiert sind produktives Human-SSO, SCIM, echte MCP-Runtime-Interception, adaptive Attack-Path-Discovery, Cross-Workflow- und Cross-System-Tests, action-bound Approval-Capabilities, PostgreSQL Row-Level Security und externe Audit-Verankerung. Das Continuous-Testprofil ist keine autonome M2.7-Security-Agent-Runtime. Die Demo nutzt aktuell flüchtiges SQLite, sofern kein dauerhaftes PostgreSQL konfiguriert ist.

Dieses Repository ist ein technischer Demonstrator und keine zertifizierte oder produktionsfreigegebene Bankensicherheitslösung.

## Lokaler Start

Siehe [Entwicklungsanleitung](docs/ENTWICKLUNG.md).
