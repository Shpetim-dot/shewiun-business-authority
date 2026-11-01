from decimal import Decimal
import secrets
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import Base, SessionLocal, engine, get_db
from .settings import settings
from .demo_data import ensure_demo_data
from .models import AuthorityGrant, AuthorizationDecision, BusinessResource, Delegation, Organization, Payment, Principal
from .schemas import AuthorizationRequest, DecisionResponse, GraphEdge, GraphNode, PaymentRequest, PaymentResponse
from .services.authorization import evaluate_and_record, verify_audit_chain

app = FastAPI(
    title="SHEWIUN | Business Authority",
    description="Geschäftliche Vollmachten, Delegationen und serverseitige Laufzeit-Autorisierung.",
    version="0.1.0",
)
# Nur lokale Entwicklungsoberfläche. Kundenumgebungen benötigen eine explizite Origin-Konfiguration.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Correlation-ID"])

@app.middleware("http")
async def protect_machine_api(request, call_next):
    # Öffentlicher Health-Ping enthält keine Mandanten- oder Geschäftsdaten.
    if request.url.path == "/health":
        return await call_next(request)
    expected = settings.api_shared_secret
    if not expected:
        if settings.environment.lower() not in {"development", "test"}:
            return JSONResponse(status_code=503, content={"code": "API_SECRET_NOT_CONFIGURED"})
    elif not secrets.compare_digest(request.headers.get("x-shewiun-api-key", ""), expected):
        return JSONResponse(status_code=401, content={"code": "MACHINE_AUTHENTICATION_REQUIRED"})
    return await call_next(request)

@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    if settings.demo_seed_enabled:
        with SessionLocal() as db:
            ensure_demo_data(db)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "produkt": "SHEWIUN",
        "version": "0.2.0",
        "speicher": settings.storage_mode,
        "persistenz_hinweis": "Dauerhaft" if settings.storage_mode == "postgresql" else "Flüchtiger Demo-Speicher je Function-Instanz",
    }

@app.get("/api/v1/autoritaetsgraph")
def authority_graph(organization_id: str = Query(min_length=1, max_length=80), db: Session = Depends(get_db)):
    # Mandantenfilter wird bereits in der Datenabfrage angewendet.
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden.")
    principals = db.scalars(select(Principal).where(Principal.organization_id == organization_id)).all()
    grants = db.scalars(select(AuthorityGrant).where(AuthorityGrant.organization_id == organization_id)).all()
    delegations = db.scalars(select(Delegation).where(Delegation.organization_id == organization_id)).all()
    resources = db.scalars(select(BusinessResource).where(BusinessResource.organization_id == organization_id)).all()
    nodes = [GraphNode(id=organization.id, label=organization.name, typ="ORGANISATION",
        status="ACTIVE", beschreibung=f"Rechtsträger · {organization.legal_entity_code}")]
    nodes += [GraphNode(id=p.id, label=p.display_name, typ="MENSCH" if p.kind == "HUMAN" else "KI_AGENT",
        status=p.status, beschreibung=f"{p.kind} · Aussteller: {p.issuer or 'nicht hinterlegt'}") for p in principals]
    nodes += [GraphNode(id=r.id, label=r.display_name, typ="RESSOURCE", status=r.status,
        beschreibung=f"Ressourcentyp · {r.resource_type}") for r in resources]
    edges = []
    for principal in principals:
        edges.append(GraphEdge(id=f"membership-{principal.id}", von=organization.id, nach=principal.id,
            typ="ORGANISATIONSZUGEHOERIGKEIT", beschreibung="Principal gehört zu diesem Rechtsträger"))
    for resource in resources:
        edges.append(GraphEdge(id=f"resource-{resource.id}", von=organization.id, nach=resource.id,
            typ="ORGANISATIONSRESSOURCE", beschreibung="Ressource des Rechtsträgers"))
    for grant in grants:
        edges.append(GraphEdge(id=grant.id, von=grant.principal_id, nach=grant.resource_id, typ="VOLLMACHT",
            limit=grant.max_amount, waehrung=grant.currency, aktionen=grant.actions,
            delegierbar=grant.can_delegate, gueltig_bis=grant.valid_until,
            beschreibung="Ursprüngliche geschäftliche Vollmacht"))
    for item in delegations:
        edges.append(GraphEdge(id=item.id, von=item.delegator_id, nach=item.delegate_id, typ="DELEGATION",
            limit=item.max_amount, waehrung=item.currency, aktionen=item.actions,
            delegierbar=item.can_subdelegate, gueltig_bis=item.valid_until,
            beschreibung=f"Teildelegation · Weiterdelegation {'erlaubt' if item.can_subdelegate else 'gesperrt'}"))
        edges.append(GraphEdge(id=f"access-{item.id}", von=item.delegate_id, nach=item.resource_id,
            typ="DELEGIERTER_ZUGRIFF", limit=item.max_amount, waehrung=item.currency,
            aktionen=item.actions, delegierbar=item.can_subdelegate, gueltig_bis=item.valid_until,
            beschreibung="Effektiver Zugriff des delegierten Agenten"))
    return {"knoten": [n.model_dump() for n in nodes], "verbindungen": [e.model_dump() for e in edges]}

@app.post("/api/v1/autorisierung/pruefen", response_model=DecisionResponse)
def authorize(request: AuthorizationRequest, db: Session = Depends(get_db)):
    result = evaluate_and_record(db, organization_id=request.organization_id, agent_id=request.agent_id,
        acting_for_id=request.acting_for_id, resource_id=request.resource_id, action=request.action,
        amount=request.amount, currency=request.currency)
    db.commit()
    return DecisionResponse(decision_id=result["decision_id"], entscheidung="ERLAUBT" if result["allowed"] else "VERWEIGERT",
        grund=result["reason_code"], effektives_limit=result["effective_limit"],
        delegationspfad=result["delegation_path"], policy_version=result["policy_version"])

@app.get("/api/v1/agenten/{agent_id}/effektive-berechtigungen")
def effective_authority(agent_id: str, organization_id: str, acting_for_id: str, resource_id: str, db: Session = Depends(get_db)):
    # Die Anzeige verwendet dieselbe Entscheidungslogik wie der Enforcement-Pfad.
    result = evaluate_and_record(db, organization_id=organization_id, agent_id=agent_id,
        acting_for_id=acting_for_id, resource_id=resource_id, action="payment.create", record_decision=False)
    return {"agent_id": agent_id, "ressource": resource_id, "entscheidung": "ERLAUBT" if result["allowed"] else "VERWEIGERT",
            "effektives_limit": result["effective_limit"], "delegationspfad": result["delegation_path"],
            "grund": result["reason_code"], "policy_version": result["policy_version"]}

@app.post("/api/v1/sandbox/zahlungen", response_model=PaymentResponse)
def create_sandbox_payment(request: PaymentRequest, db: Session = Depends(get_db)):
    # Autorisierung und Mutation liegen in derselben DB-Transaktion.
    try:
        result = evaluate_and_record(db, organization_id=request.organization_id, agent_id=request.agent_id,
            acting_for_id=request.acting_for_id, resource_id=request.account_id, action="payment.create",
            amount=request.amount, currency=request.currency)
        if not result["allowed"]:
            db.commit()  # DENY-Nachweis bleibt erhalten; keine Payment-Mutation.
            raise HTTPException(status_code=403, detail={"code": result["reason_code"], "decision_id": result["decision_id"]})
        payment_id = str(uuid4())
        payment = Payment(id=payment_id, organization_id=request.organization_id, account_id=request.account_id,
            created_by=request.agent_id, beneficiary=request.beneficiary, amount=request.amount,
            currency=request.currency, status="ERSTELLT", authorization_decision_id=result["decision_id"])
        db.add(payment)
        db.commit()
        return PaymentResponse(payment_id=payment_id, status=payment.status, amount=request.amount,
            currency=request.currency, authorization_decision_id=result["decision_id"])
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Interner Fehler bei der Sandbox-Zahlung.")

@app.get("/api/v1/sandbox/zahlungen")
def list_sandbox_payments(organization_id: str, db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).where(Payment.organization_id == organization_id).order_by(Payment.created_at.desc())).all()
    return [{"id": p.id, "beguenstigter": p.beneficiary, "betrag": str(p.amount), "waehrung": p.currency,
             "status": p.status, "entscheidung": p.authorization_decision_id} for p in rows]

@app.get("/api/v1/sicherheitsereignisse")
def security_events(organization_id: str, limit: int = 50, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 200))
    rows = db.scalars(select(AuthorizationDecision).where(AuthorizationDecision.organization_id == organization_id)
        .order_by(AuthorizationDecision.evaluated_at.desc()).limit(limit)).all()
    return [{"id": r.id, "zeitpunkt": r.evaluated_at.isoformat(), "agent": r.principal_id,
             "aktion": r.action, "entscheidung": r.decision, "grund": r.reason_code,
             "ressource": r.resource_id, "betrag": str(r.requested_amount) if r.requested_amount is not None else None,
             "policy_version": r.policy_version, "delegationspfad": r.delegation_path} for r in rows]


@app.get("/api/v1/audit/integritaet")
def audit_integrity(organization_id: str, db: Session = Depends(get_db)):
    if not db.get(Organization, organization_id):
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden.")
    return verify_audit_chain(db, organization_id)
