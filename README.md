# SHEWIUN — Business Authority & Runtime Authorization

SHEWIUN ist eine spezialisierte Autorisierungsplattform für geschäftliche Vollmachten, delegierte Agentenrechte und die serverseitige Durchsetzung geschützter Aktionen.

## Produktziel

SHEWIUN verbindet vier Ebenen, die in klassischen Rollenmodellen häufig getrennt betrachtet werden:

1. **Geschäftliche Autorität** – wer darf im Namen welcher Organisation über welche Ressourcen und Aktionen entscheiden?
2. **Delegation** – welche Teilmenge dieser Autorität wurde an welchen AI-Agenten übertragen?
3. **Laufzeit-Autorisierung** – ist genau diese Aktion mit genau diesen Parametern im aktuellen Kontext zulässig?
4. **Durchsetzung und Nachweis** – wird eine nicht autorisierte Aktion vor der Datenbankmutation blockiert und ist die Entscheidung nachvollziehbar?

SHEWIUN ersetzt weder ein Agenten-Framework noch ein IAM-System. Es ergänzt bestehende Plattformen um eine fachliche Autorisierungsebene für geschäftliche Aktionen.

## Architektur (MVP)

- **API:** FastAPI, Python 3.12
- **Persistenz:** PostgreSQL, SQLAlchemy 2 (Alembic-Migrationen als nächster Betriebsbaustein)
- **Domänenkern:** Authority Graph, Delegation, Effective Authority, Policy Decision Point
- **Durchsetzung:** geschützte Sandbox-Business-API mit transaktionaler Autorisierungsprüfung
- **Oberfläche:** Next.js / TypeScript (separater Web-Client; folgt nach dem stabilen Domänenkern)
- **Tests:** pytest, API- und Domänentests

## Sicherheitsprinzipien

- Standardmäßig verweigern (Default Deny).
- Das LLM ist niemals die Autorisierungsinstanz.
- Delegierte Rechte dürfen die übergeordnete Autorität nicht erweitern.
- Autorisierung wird serverseitig unmittelbar vor der Aktion geprüft.
- Freigaben sind an kanonische Aktionsparameter gebunden und einmalig verwendbar.
- Mandanten- und Ressourcenbezüge werden serverseitig validiert.
- Demo-Daten sind synthetisch; keine produktiven Bankdaten oder Zugangsdaten.

## Status

Aktive Entwicklung. Funktionen werden erst dann als implementiert bezeichnet, wenn sie durch Tests belegt sind. Dieses Repository ist ein technischer Demonstrator und keine zertifizierte oder produktionsfreigegebene Bankensicherheitslösung.

## Lokaler Start

Siehe [Entwicklungsanleitung](docs/ENTWICKLUNG.md).
