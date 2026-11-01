# Technische Einordnung für S-PRO

## Partnerschaftsthese

S-PRO entwickelt digitale Produkte, Agenten und Prozessautomatisierungen für Finanzdienstleister. SHEWIUN soll diese Fähigkeiten nicht ersetzen. SHEWIUN adressiert eine engere technische Frage innerhalb solcher Lösungen:

**Welche konkrete geschäftliche Handlung darf dieser Agent im Auftrag dieser Person, innerhalb dieser Organisation und auf dieser Ressource jetzt ausführen?**

Die Plattform verbindet die fachliche Vollmacht eines Menschen mit den technisch ausführbaren Rechten eines Agenten.

## Abgrenzung zu allgemeinen Agenten- und Governance-Plattformen

| Ebene | Typische Aufgabe einer Agentenplattform | SHEWIUN-Fokus |
|---|---|---|
| Agenten-Orchestrierung | Agenten planen und führen Workflows aus | Nicht Bestandteil des Produktkerns |
| Identität | Benutzer und technische Workloads identifizieren | Identität mit geschäftlicher Vollmacht verknüpfen |
| Rollen / Zugriffsrechte | Rollen und Systemzugriffe verwalten | Geschäftliche Autorität und Delegationsketten modellieren |
| Human-in-the-Loop | Menschliche Freigabe in Workflows einbinden | Freigabe an kanonische Aktion und Parameter binden (Ausbaustufe) |
| Laufzeit | Tools und APIs aufrufen | Aktion vor der geschützten Mutation unabhängig autorisieren |
| Nachweis | Workflow- und Audit-Logs | Autorisierungsentscheidung mit Vollmachtspfad und Policy-Version belegen |

Diese Tabelle beschreibt die Produktgrenze, nicht eine Behauptung über fehlende S-PRO-Funktionen. S-PRO kann intern bereits vergleichbare Kontrollen implementiert haben. Der erste gemeinsame Schritt sollte daher ein Architekturabgleich sein.

## Kernunterschied: Business Authority statt nur technischer Identität

Ein Workload-Token belegt im besten Fall, welcher technische Agent eine Anfrage stellt. Es belegt nicht automatisch, dass der Agent eine bestimmte geschäftliche Vollmacht besitzt.

SHEWIUN modelliert deshalb explizit:

- den Menschen, der die geschäftliche Autorität innehat;
- die rechtliche Organisation und den Mandantenkontext;
- die geschützte Ressource;
- die erlaubten Geschäftsaktionen;
- Betrags- und Währungsgrenzen;
- die Gültigkeitsdauer und den Widerruf;
- die Delegation von Teilrechten an Agenten und Sub-Agenten.

Die effektive Autorität ist die Schnittmenge der Ursprungsvollmacht und jeder Delegationsstufe. Jede Stufe kann Rechte reduzieren, aber nicht erweitern.

## Was der aktuelle Demonstrator tatsächlich zeigt

1. Ein CFO besitzt eine synthetische Ursprungsvollmacht über CHF 100.000 für ein Geschäftskonto.
2. Der CFO delegiert an einen Zahlungsagenten ein Limit von CHF 10.000 und nur die Aktionen `payment.create` und `payment.read`.
3. Die API löst den Delegationspfad auf und prüft Identitätstyp, Mandant, Ressource, Status, Aktion, Gültigkeit, Währung und Betrag.
4. Eine Zahlung über CHF 5.000 wird in der Sandbox angelegt.
5. Eine Zahlung über CHF 15.000 wird serverseitig abgelehnt; es entsteht kein Zahlungsdatensatz.
6. Jede Entscheidung wird gespeichert und in eine mandantenbezogene SHA-256-Hash-Kette aufgenommen.
7. Ein eigener Endpunkt prüft Sequenz und Hash-Verkettung.

## Gemeinsamer Validierungsvorschlag

Ein sinnvoller S-PRO-Test wäre die Integration in einen bestehenden, nicht produktiven Banking-Agenten:

- S-PRO stellt den Agenten und einen Sandbox-Geschäftsprozess.
- SHEWIUN erhält den konkreten Aktionskontext und die Delegationsinformationen.
- Die geschützte API akzeptiert nur Aktionen mit einer gültigen SHEWIUN-Entscheidung.
- S-PRO und SHEWIUN testen gemeinsam Limitüberschreitung, falsche Ressource, Mandantenwechsel, widerrufene Delegation und manipulierte Aktionsparameter.

## Noch nicht als produktionsreif behaupten

Der aktuelle Stand ist ein MVP. Insbesondere sind echte OIDC-/Workload-Authentifizierung, signierte kurzlebige Capabilities, kryptografisch gebundene menschliche Freigaben, PostgreSQL Row-Level Security, extern verankerte Audit-Nachweise, eine vollständige versionierte DB-Migrationsstrategie und eine unabhängige Penetrationsprüfung noch nicht umgesetzt.

Die Demo soll technische Substanz beweisen, ohne aus einem funktionierenden Sandbox-Kern bereits eine zertifizierte Bankensicherheitslösung abzuleiten.


## Erweiterte Autorisierung im Demonstrator (Policy-Version 0.2.0)

Der neue Tab **Autorisierung** zeigt nicht nur eine effektive Berechtigung, sondern die einzelnen Entscheidungsebenen, die zwischen Agenten-Tool und Geschäftsaktion liegen. Die Policy wertet sieben Kontrollen separat aus:

1. **Identity:** aktiver Agent, Auftraggeber, Mandant und registrierter Demo-Aussteller.
2. **Tool / Permission:** exakte Bindung von Tool, Permission und angeforderter Geschäftsaktion.
3. **Purpose:** der deklarierte Geschäftszweck muss zur erlaubten Aktion passen.
4. **Resource Scope:** Zugriff nur auf das konkret delegierte Konto; Wildcard- und globale Scopes werden abgelehnt.
5. **Business Authority:** Ursprungsvollmacht und vollständiger Delegationspfad müssen gültig sein.
6. **Parameters:** Betrag und Währung müssen innerhalb der wirksamen Autorität liegen.
7. **Approval:** ab CHF 7.500 wird eine vorhandene und frische zusätzliche Freigabe verlangt.

Die Oberfläche ergänzt dies um eine Authority-Delta-Ansicht: Ursprungsvollmacht, tatsächlich delegierte Aktionen, beim Vollmachtgeber verbleibende Rechte und erreichbare Geschäftsaktionen. Dadurch wird sichtbar, warum eine technisch vorhandene Tool-Permission allein keine geschäftliche Autorität begründet.

### Gesprächsfähiger S-PRO-Demoablauf

| Testfall | Erwartetes Ergebnis | Nachweis |
|---|---|---|
| CHF 5.000, korrekte Identität, Zweck und Ressource | ALLOW | Sieben erfolgreiche Kontrollpunkte; bestehender Sandbox-Zahlungsweg bleibt verfügbar |
| Globaler Daten-Scope | DENY | Ressourcen-Scope schlägt fehl |
| Abweichende Tool-/Permission-Bindung | DENY | Exakte Permission-Bindung schlägt fehl |
| Unbekannter Runtime-Aussteller | DENY | Identity-Kontrolle schlägt fehl |
| Zweck `account_enumeration` statt `supplier_payment` | DENY | Purpose-Kontrolle schlägt fehl |
| CHF 8.000 ohne frische Freigabe | DENY | Approval-Kontrolle schlägt fehl |
| CHF 8.000 mit frischer Demo-Freigabe | Policy-ALLOW | Alle Kontrollen bestehen; keine externe Runtime-Ausführung wird behauptet |

Die Freigabe-Schalter im Demonstrator sind bewusst nur Testeingaben. Sie sind keine signierte, kurzlebige oder einmalig verwendbare Approval-Capability. Die dargestellte Entscheidung ist eine deterministische Policy-Evaluation. Für einen Pilot wären anschließend echte Workload-Identity, action-bound approvals und ein Enforcement-Adapter in der geschützten S-PRO-Geschäfts-API gemeinsam zu validieren.


## SHEWIUN Security Assessment und Service-Stufen

Die Demo enthält einen kontrollierten Assessment-Arbeitsbereich, der die Angebotslogik von SHEWIUN abbildet:

| Programm | Umfang laut Produktmodell | Demo-Abbildung |
|---|---|---|
| Security Assessment · €2.900/Jahr oder €250/Monat | 1 Agent / MCP Surface, 1 kritischer Workflow, M2.7 Lite, 40+ Tests, 3–5 Composition-Szenarien, Parameter-/Scope-/Replay-Tests, Findings, Exact Retest und Verification Summary | 40 echte Policy-API-Aufrufe im Banking-Sandbox-Contract, 3 Composition-Fälle, Decision IDs, Checks und JSON-Evidence |
| Continuous Assurance · €6.900/Jahr oder €675/Monat | Bis 3 Workflows, 60+ Tests, Full M2.7, adaptive Attack-Path-Discovery, 10+ Composition-Szenarien, Cross-Workflow-Checks, bis zu 2 Retests, Executive Review | 67 Policy-Testfälle und 10 Composition-Fälle im selben Demo-Workflow. Cross-Workflow und adaptive Discovery sind als Produktumfang sichtbar, aber noch nicht als automatisierter Multi-Workflow-Agent implementiert. |
| Enterprise Security Assurance · ab €30.000/Monat | Mehrere Agenten, Cross-Agent-/Cross-System-Tests, private/VPC-Optionen, MCP/API/IAM/SIEM, Evidence Workspace, dediziertes Team und SOC-2-Readiness | Enterprise-Architektur, Integrationspunkte und Security-Workspace-Zielmodell werden gezeigt; diese Betriebsleistungen sind keine aktivierten Demo-Funktionen. |
| Custom Security Programme | Individuelle Agents, Integrationen, Deployment, SLAs, Oracles, Reporting und Audit-Unterstützung | Als konfigurierbares Zielmodell beschrieben; nicht als bereitgestellter Service innerhalb der Demo dargestellt. |

### Was die Assessment-Suite tatsächlich tut

- Sie sendet 40 bzw. 67 einzelne Requests an `POST /api/v1/autorisierung/evaluieren`.
- Die erwartete Entscheidung wird mit der echten Backend-Antwort verglichen.
- Jeder erfolgreich ausgewertete Request erhält eine Decision ID und die sieben Kontrollresultate.
- Unerwartetes ALLOW, unerwartetes DENY und API-Fehler werden als Abweichung angezeigt.
- Ein zweiter Lauf wiederholt denselben Katalog und erzeugt neue Decision IDs.
- Die Ergebnisse können als JSON exportiert werden. Das JSON markiert Claim-Level und bekannte Einschränkungen.

### Explizite Grenzen

Die Testfälle sind eine deterministische Policy-Testmatrix, kein autonomer M2.7 Security Agent. Die MCP-Fälle prüfen die Übergabe von Tool-/Permission-Claims an den SHEWIUN-PDP, nicht einen live integrierten MCP-Server. Der Replay-Test zeigt, dass eine identische PDP-Anfrage erneut bewertet wird; er weist keine Replay-Abwehr nach. Die Approval-Flags sind Demo-Eingaben und keine signierten, einmaligen oder an einen Action-Hash gebundenen Freigabe-Capabilities.

Der Workspace zeigt das Zielmodell für Rollen, SSO, MFA, SCIM, Workload Identity, Tenant RLS und Audit-Anker. Microsoft Entra ID, Okta und Keycloak sind nicht verbunden; es gibt noch keinen produktiven Login, keine echte Benutzer-RBAC-Durchsetzung und keine SCIM-Provisionierung. Diese Statusangaben sind bewusst sichtbar, damit der Demonstrator keine nicht vorhandenen Sicherheitskontrollen suggeriert.

### S-PRO-Pilotvorschlag

1. Einen nicht produktiven S-PRO-Agenten und einen kritischen Banking-Workflow auswählen.
2. Authorization Contract mit Agent-Identität, Auftraggeber, Mandant, Ressource, Geschäftsaktion, Parametern und Approval-Bedingungen festlegen.
3. Die 40 Lite-Fälle gegen die konkrete Agent-/Tool-/API-Grenze ausführen.
4. Findings mit S-PRO-Engineering und Security triagieren.
5. Remediation implementieren und dieselben Fälle erneut ausführen.
6. Bei erfolgreichem Pilot die Cross-Workflow-, Workload-Identity-, SSO- und Evidence-Integrationen priorisieren.

Die Produktpositionierung bleibt komplementär: S-PRO kann Agenten und Prozessintegration bereitstellen; SHEWIUN soll die unabhängige Prüfung geschäftlicher Autorität, Permission Composition und der tatsächlich erreichbaren Business Actions ergänzen. Die konkrete Grenze ist gemeinsam mit S-PRO zu validieren.
