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

## Abgrenzung

Der MVP demonstriert das fachliche Autoritätsmodell und die serverseitige Entscheidung für eine synthetische Zahlungs-Sandbox. Er enthält noch keine produktive Authentifizierung, keine vollständige Approval-Capability, keine DB-Row-Level-Security, keine externe Signaturinfrastruktur und keine hochverfügbare Betriebsarchitektur. Diese Punkte sind ausdrücklich nächste Ausbaustufen und dürfen nicht als bereits umgesetzt dargestellt werden.
