from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import AuthorityGrant, AuthorizationDecision, BusinessResource, Delegation, Organization, Principal
from app.services.authorization import evaluate_and_record, verify_audit_chain


def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def seed(db):
    now = datetime.now(timezone.utc)
    db.add(Organization(id="org-1", name="Demo Bank", legal_entity_code="DEMO-1"))
    db.add_all([
        Principal(id="cfo", organization_id="org-1", display_name="CFO", kind="HUMAN", status="ACTIVE", issuer="demo-hr"),
        Principal(id="agent", organization_id="org-1", display_name="Zahlungsagent", kind="AGENT", status="ACTIVE", issuer="shewiun-demo-issuer"),
    ])
    db.add(BusinessResource(id="account-1", organization_id="org-1", resource_type="BANKKONTO", display_name="Konto 1", status="ACTIVE"))
    db.flush()
    db.add(AuthorityGrant(id="grant-1", organization_id="org-1", principal_id="cfo", resource_id="account-1",
        actions=["payment.create", "payment.approve"], max_amount=Decimal("100000"), currency="CHF", can_delegate=True,
        valid_from=now-timedelta(days=1), valid_until=now+timedelta(days=10), version=1))
    db.flush()
    db.add(Delegation(id="delegation-1", organization_id="org-1", grant_id="grant-1", delegator_id="cfo",
        delegate_id="agent", resource_id="account-1", actions=["payment.create"], max_amount=Decimal("10000"),
        currency="CHF", can_subdelegate=False, valid_from=now-timedelta(days=1),
        valid_until=now+timedelta(days=5), version=1))
    db.commit()


def evaluate(db, **overrides):
    values = {
        "purpose": "supplier_payment",
        "runtime_identity": "shewiun-demo-issuer",
        "tool": "payment.create",
        "permission": "payment.create",
        "data_scope": "account-1",
        "approval_present": False,
        "approval_fresh": False,
    }
    values.update(overrides)
    return evaluate_and_record(
        db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create",
        amount=Decimal("5000"), currency="CHF", runtime_context=values,
    )


def test_policy_evaluation_returns_seven_control_checks():
    db = make_session()
    seed(db)
    result = evaluate(db)
    db.commit()
    assert result["allowed"] is True
    assert len(result["checks"]) == 7
    assert all(check["result"] in {"pass", "not_applicable"} for check in result["checks"])
    row = db.scalar(select(AuthorizationDecision).where(AuthorizationDecision.id == result["decision_id"]))
    assert row.checks == result["checks"]
    assert verify_audit_chain(db, "org-1")["gueltig"] is True
    db.close()


def test_runtime_identity_mismatch_is_denied():
    db = make_session()
    seed(db)
    result = evaluate(db, runtime_identity="untrusted-runtime")
    assert result["allowed"] is False
    assert result["reason_code"] == "RUNTIME_IDENTITAET_UNGUELTIG"
    db.close()


def test_tool_permission_mismatch_is_denied():
    db = make_session()
    seed(db)
    result = evaluate(db, permission="beneficiary.update")
    assert result["allowed"] is False
    assert result["reason_code"] == "TOOL_PERMISSION_KONFLIKT"
    db.close()


def test_broad_resource_scope_is_denied():
    db = make_session()
    seed(db)
    result = evaluate(db, data_scope="*")
    assert result["allowed"] is False
    assert result["reason_code"] == "RESSOURCENUMFANG_UEBERSCHRITTEN"
    db.close()


def test_wrong_business_purpose_is_denied():
    db = make_session()
    seed(db)
    result = evaluate(db, purpose="account_enumeration")
    assert result["allowed"] is False
    assert result["reason_code"] == "GESCHAEFTSZWECK_NICHT_ERLAUBT"
    db.close()


def test_high_value_action_requires_fresh_approval():
    db = make_session()
    seed(db)
    result = evaluate_and_record(
        db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create",
        amount=Decimal("8000"), currency="CHF",
        runtime_context={
            "purpose": "supplier_payment", "runtime_identity": "shewiun-demo-issuer",
            "tool": "payment.create", "permission": "payment.create", "data_scope": "account-1",
            "approval_present": True, "approval_fresh": False,
        },
    )
    assert result["allowed"] is False
    assert result["reason_code"] == "FRESH_APPROVAL_REQUIRED"
    assert result["approval_required"] is True
    db.close()


def test_high_value_action_with_fresh_demo_approval_passes_policy_evaluation():
    db = make_session()
    seed(db)
    result = evaluate_and_record(
        db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create",
        amount=Decimal("8000"), currency="CHF",
        runtime_context={
            "purpose": "supplier_payment", "runtime_identity": "shewiun-demo-issuer",
            "tool": "payment.create", "permission": "payment.create", "data_scope": "account-1",
            "approval_present": True, "approval_fresh": True,
        },
    )
    assert result["allowed"] is True
    assert result["approval_required"] is True
    db.close()


def test_payment_create_without_amount_is_denied_with_parameter_reason():
    db = make_session()
    seed(db)
    result = evaluate_and_record(
        db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create", currency="CHF",
        runtime_context={
            "purpose": "supplier_payment", "runtime_identity": "shewiun-demo-issuer",
            "tool": "payment.create", "permission": "payment.create", "data_scope": "account-1",
        },
    )
    assert result["allowed"] is False
    assert result["reason_code"] == "ZAHLUNGSPARAMETER_UNGUELTIG"
    assert next(check for check in result["checks"] if check["control"] == "parameters")["result"] == "fail"
    db.close()


def test_payment_create_with_zero_amount_is_denied():
    db = make_session()
    seed(db)
    result = evaluate_and_record(
        db, organization_id="org-1", agent_id="agent", acting_for_id="cfo",
        resource_id="account-1", action="payment.create", amount=Decimal("0"), currency="CHF",
        runtime_context={
            "purpose": "supplier_payment", "runtime_identity": "shewiun-demo-issuer",
            "tool": "payment.create", "permission": "payment.create", "data_scope": "account-1",
        },
    )
    assert result["allowed"] is False
    assert result["reason_code"] == "ZAHLUNGSPARAMETER_UNGUELTIG"
    db.close()
