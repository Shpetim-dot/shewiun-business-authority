from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import AuthorityGrant, BusinessResource, Delegation, Organization, Principal

def ensure_demo_data(db: Session) -> None:
    """Idempotente, synthetische Bankdaten für lokale und isolierte Demo-Instanzen."""
    if db.scalar(select(Organization).where(Organization.id == "org-alpenbank")):
        return

    now = datetime.now(timezone.utc)
    db.add(Organization(id="org-alpenbank", name="Alpenbank Demo AG", legal_entity_code="CH-DEMO-001"))
    db.add_all([
        Principal(id="person-cfo-anna", organization_id="org-alpenbank", display_name="Anna Müller · CFO", kind="HUMAN", issuer="demo-hr"),
        Principal(id="person-finance-peter", organization_id="org-alpenbank", display_name="Peter Meier · Finanzleitung", kind="HUMAN", issuer="demo-hr"),
        Principal(id="agent-payment-01", organization_id="org-alpenbank", display_name="Zahlungsagent 01", kind="AGENT", issuer="shewiun-demo-issuer"),
        Principal(id="agent-sub-01", organization_id="org-alpenbank", display_name="Zahlungs-Unteragent 01", kind="AGENT", issuer="shewiun-demo-issuer"),
    ])
    db.add_all([
        BusinessResource(id="konto-corporate-1001", organization_id="org-alpenbank",
            resource_type="BANKKONTO", display_name="Geschäftskonto · •••• 1001"),
        BusinessResource(id="konto-corporate-2002", organization_id="org-alpenbank",
            resource_type="BANKKONTO", display_name="Geschäftskonto · •••• 2002"),
    ])
    db.flush()
    db.add_all([
        AuthorityGrant(id="grant-cfo-100k", organization_id="org-alpenbank", principal_id="person-cfo-anna",
            resource_id="konto-corporate-1001", actions=["payment.create", "payment.read", "payment.approve"],
            max_amount=Decimal("100000"), currency="CHF", can_delegate=True,
            valid_from=now-timedelta(days=30), valid_until=now+timedelta(days=365), version=1),
        AuthorityGrant(id="grant-finance-25k", organization_id="org-alpenbank", principal_id="person-finance-peter",
            resource_id="konto-corporate-1001", actions=["payment.create", "payment.read"],
            max_amount=Decimal("25000"), currency="CHF", can_delegate=False,
            valid_from=now-timedelta(days=30), valid_until=now+timedelta(days=365), version=1),
    ])
    db.flush()
    db.add(Delegation(id="delegation-cfo-agent-10k", organization_id="org-alpenbank",
        grant_id="grant-cfo-100k", delegator_id="person-cfo-anna", delegate_id="agent-payment-01",
        resource_id="konto-corporate-1001", actions=["payment.create", "payment.read"],
        max_amount=Decimal("10000"), currency="CHF", can_subdelegate=False,
        valid_from=now-timedelta(days=1), valid_until=now+timedelta(days=30), version=1))
    db.commit()
