# Entwicklungsanleitung

## Voraussetzungen
- Docker und Docker Compose
- Python 3.12 (für lokale Tests außerhalb von Docker)

## Start
```bash
cp .env.example .env
docker compose up --build
```

API-Prüfung: `http://localhost:8000/health`  
OpenAPI: `http://localhost:8000/docs`

## Synthetische Demo-Daten
In einem zweiten Terminal:

```bash
docker compose exec api python -m scripts.seed_demo
```

## Beispiel: Autorisierung prüfen
```bash
curl -X POST http://localhost:8000/api/v1/autorisierung/pruefen \
  -H 'Content-Type: application/json' \
  -d '{
    "organization_id":"org-alpenbank",
    "agent_id":"agent-payment-01",
    "acting_for_id":"person-cfo-anna",
    "resource_id":"konto-corporate-1001",
    "action":"payment.create",
    "amount":"5000.00",
    "currency":"CHF"
  }'
```

## Beispiel: Sandbox-Zahlung
```bash
curl -X POST http://localhost:8000/api/v1/sandbox/zahlungen \
  -H 'Content-Type: application/json' \
  -d '{
    "organization_id":"org-alpenbank",
    "agent_id":"agent-payment-01",
    "acting_for_id":"person-cfo-anna",
    "account_id":"konto-corporate-1001",
    "beneficiary":"Lieferant Beispiel AG",
    "amount":"5000.00",
    "currency":"CHF"
  }'
```

Ein Betrag über CHF 10.000 muss abgelehnt werden. Eine Ablehnung wird als Autorisierungsentscheidung gespeichert; es darf kein Zahlungsdatensatz entstehen.

## Architekturhinweis
Der aktuelle Stand ist ein vertikaler MVP-Kern. Vor einem produktiven Einsatz fehlen unter anderem echte OIDC-Tokenvalidierung, mTLS zwischen Diensten, DB-RLS/mandantenbezogene DB-Policies, signierte und einmalige Freigabe-Capabilities, Idempotenz-/Replay-Schutz für Zahlungsbefehle, Alembic-Migrationen, Key-Management, Rate Limits und unabhängige Sicherheitsprüfung. Die Demo-API ist deshalb nicht als produktionsreif einzustufen.


## Audit-Integrität prüfen
```bash
curl "http://localhost:8000/api/v1/audit/integritaet?organization_id=org-alpenbank"
```

Die Antwort enthält `gueltig`, die Zahl der geprüften Ereignisse und den letzten Hash.
