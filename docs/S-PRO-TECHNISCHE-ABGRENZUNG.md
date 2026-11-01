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
