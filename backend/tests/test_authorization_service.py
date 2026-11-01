from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import AuthorityGrant, AuthorizationDecision, BusinessResource, Delegation, Organization, Principal
from app.services.authorization import evaluate_and_record

def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

def seed(db):
    now = datetime.now(timezone.utc)
    db.add(Organization(id="org-1", name="Demo Bank", legal_entity_code="DEMO-1"))
    db.add_all([
        Principal(id="cfo", organization_id="org-1", display_name="CFO", kind="HUMAN", status="ACTIVE"),
        Principal(id="agent", organization_id="org-1", display_name="Zahlungsagent", kind="AGENT", status="ACTIVE"),
    ])
    db.add(BusinessResource(id="account-1", organization_id="org-1", resource_type="BANKKONTO", display_name="Konto 1", status="ACTIVE"))
    db.flush()
    db.add(AuthorityGrant(id="grant-1", organization_id="org-1", principal_id="cfo", resource_id="account-1",
        actions=["payment.create"], max_amount=Decimal("100000"), currency="CHF", can_delegate=True,
        valid_from=now-timedelta(days=1), valid_until=now+timedelta(days=10), version=1))
    db.flush()
    db.add(Delegation(id="delegation-1", organization_id="org-1", grant_id="grant-1", delegator_id="cfo",
        delegate_id="agent", resource_id="account-1", actions=["payment.create"], max_amount=Decimal("10000"),
        currency="CHF", can_subdelegate=False, valid_from=now-timedelta(days=1),
        valid_until=now+timedelta(days=5), version=1))
    db.commit()

def test_authorized_payment_within_effective_limit():
    db = make_session()
    seed(db)
    result = evaluate_and_record(db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create", amount=Decimal("5000"), currency="CHF")
    db.commit()
    assert result["allowed"] is True
    assert result["effective_limit"] == Decimal("10000")
    assert len(result["delegation_path"]) == 2
    assert db.scalar(select(AuthorizationDecision).where(AuthorizationDecision.id == result["decision_id"])).decision == "ALLOW"
    db.close()

def test_amount_above_delegated_limit_is_denied_and_recorded():
    db = make_session()
    seed(db)
    result = evaluate_and_record(db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create", amount=Decimal("15000"), currency="CHF")
    db.commit()
    assert result["allowed"] is False
    assert result["reason_code"] == "DELEGIERTES_LIMIT_UEBERSCHRITTEN"
    row = db.scalar(select(AuthorizationDecision).where(AuthorizationDecision.id == result["decision_id"]))
    assert row.decision == "DENY"
    db.close()

def test_agent_cannot_use_action_not_in_delegation():
    db = make_session()
    seed(db)
    result = evaluate_and_record(db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="beneficiary.add")
    assert result["allowed"] is False
    assert result["reason_code"] == "AKTION_NICHT_DELEGIERT"
    db.close()
