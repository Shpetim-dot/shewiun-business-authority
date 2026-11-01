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

Der aktuelle Stand ist ein MVP. Insbesondere sind echte OIDC-/Workload-Authentifizierung, signierte kurzlebige Capabilities, kryptografisch gebundene menschliche Freigaben, PostgreSQL Row-Level Security, extern verankerte Audit-Nachweise, Migrationen und eine unabhängige Penetrationsprüfung noch nicht umgesetzt.

Die Demo soll technische Substanz beweisen, ohne aus einem funktionierenden Sandbox-Kern bereits eine zertifizierte Bankensicherheitslösung abzuleiten.
