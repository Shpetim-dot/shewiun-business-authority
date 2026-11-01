# SHEWIUN – Architektur und Sicherheitsmodell

## Produktgrenze

SHEWIUN ist die Autorisierungsebene zwischen einem Agenten- oder Workflow-Runtime-System und einer geschützten Geschäfts-API. Das Agenten-Framework bleibt für Planung und Orchestrierung zuständig. SHEWIUN entscheidet unabhängig, ob eine konkrete Aktion innerhalb einer gültigen geschäftlichen Vollmacht liegt.

## Autoritätsmodell

- **Principal:** Mensch oder technischer Agent.
- **Organisation:** Mandant und rechtlicher Organisationskontext.
- **Ressource:** Konto oder andere geschäftliche Ressource.
- **Ursprungsvollmacht:** Geschäftliche Befugnis eines menschlichen Principals für konkrete Aktionen und Ressourcen.
- **Delegation:** Übertragung einer begrenzten Teilmenge der Ursprungsvollmacht.
- **Effektive Autorität:** Schnittmenge aller aktiven Stufen der Delegationskette.

Für eine Delegationskette müssen alle Stufen gültig sein, dieselbe Ressource und Aktion abdecken und zeitlich aktiv sein. Jede Delegation muss vom Inhaber der vorherigen Stufe stammen. Betragsgrenzen werden monoton reduziert. Eine Delegation darf die Ursprungsvollmacht nicht erweitern.

## Autorisierungsablauf

1. Organisation, menschlicher Auftraggeber, Agent und Ressource auflösen.
2. Mandantenzugehörigkeit und Status prüfen.
3. Eindeutige aktive Ursprungsvollmacht ermitteln.
4. Delegationspfad vom Agenten rückwärts bis zur Ursprungsvollmacht auflösen.
5. Zyklen, Mehrdeutigkeiten, Widerruf, Ablauf und unzulässige Weiterdelegation ablehnen.
6. Aktionen, Ressource, Währung und Betragsgrenzen auswerten.
7. Entscheidung mit Korrelations-ID und Policy-Version persistieren.
8. Geschützte Geschäftsaktion nur bei ALLOW innerhalb derselben Datenbanktransaktion ausführen.

## Audit-Nachweis

Jede persistierte Autorisierungsentscheidung erzeugt im selben Datenbank-Commit ein Audit-Ereignis. Die Ereignisse werden je Mandant sequenziert und über SHA-256 mit dem vorherigen Ereignis verkettet. Der Endpunkt `GET /api/v1/audit/integritaet?organization_id=...` prüft Sequenz, Vorgängerhash und Ereignishash.

Die Hash-Kette macht nachträgliche Veränderungen erkennbar, sofern ein Angreifer nicht zugleich die gesamte Kette und den vertrauenswürdigen letzten Hash kontrolliert. Sie ist kein WORM-Speicher und keine externe Signatur. Für Produktionsbetrieb wären getrennte Schreibrechte, externe Ankerung/Signierung und manipulationsgeschützte Aufbewahrung erforderlich.

## Abgrenzung

Der MVP demonstriert das fachliche Autoritätsmodell und die serverseitige Entscheidung für eine synthetische Zahlungs-Sandbox. Er enthält noch keine produktive Authentifizierung, keine vollständige Approval-Capability, keine DB-Row-Level-Security, keine externe Signaturinfrastruktur und keine hochverfügbare Betriebsarchitektur. Diese Punkte sind ausdrücklich nächste Ausbaustufen und dürfen nicht als bereits umgesetzt dargestellt werden.


## Laufzeit-Autorisierungsvertrag (Demo, Policy-Version 0.2.0)

Die zusätzliche Policy-Auswertung übernimmt das mehrdimensionale Prüfmodell aus dem AgentProof-Arbeitsstand: Identität, exakte Tool-/Permission-Bindung, Geschäftszweck, konkrete Datenreichweite, Business Authority, Aktionsparameter und zusätzliche Freigabe werden einzeln bewertet. Jede Kontrolle liefert PASS, FAIL oder N/A; jede fehlgeschlagene Kontrolle führt zu DENY.

Für den Bank-Demofall ist `payment.create` ausschließlich für den Zweck `supplier_payment` vorgesehen. Tool und Permission müssen exakt auf die Geschäftsaktion passen. Der Daten-Scope muss dem konkreten Konto entsprechen; globale oder Wildcard-Scopes werden verweigert. Die zugrunde liegende Vollmachts- und Delegationsprüfung bleibt die maßgebliche Business-Authority-Quelle. Ab CHF 7.500 fordert die Demo-Policy zusätzlich eine vorhandene und frische Freigabe.

**Wichtige Grenze:** Der Freigabestatus im neuen Test-Tab ist ein kontrollierter Demo-Testinput. Er stellt noch keine kryptografisch gebundene, einmalig verwendbare menschliche Approval-Capability dar. Ebenso ist die angezeigte Entscheidung eine Policy-Evaluation und kein Nachweis, dass ein externes Agenten-Runtime-System die Aktion tatsächlich ausgeführt hat. Signierte Runtime-Ingestion, Replay-Schutz mit dauerhaftem Nonce-Speicher und produktive Workload-Identity bleiben separate Ausbaustufen.
