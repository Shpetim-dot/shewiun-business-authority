from datetime import datetime, timedelta, timezone
from decimal import Decimal
from app.domain.authority import AuthorityLayer, calculate_effective_authority

NOW = datetime.now(timezone.utc)

def layer(id, principal, actions, limit, can_delegate=False, delegator=None, revoked=None):
    return AuthorityLayer(id=id, principal_id=principal, delegator_id=delegator,
        actions=frozenset(actions), resource_id="konto-1", max_amount=Decimal(limit) if limit else None,
        currency="CHF", can_delegate=can_delegate, valid_from=NOW-timedelta(days=1),
        valid_until=NOW+timedelta(days=1), revoked_at=revoked)

def test_effective_limit_is_reduced_by_delegation():
    root = layer("grant", "cfo", ["payment.create"], "100000", True)
    delegation = layer("delegation", "agent", ["payment.create"], "10000", False, "cfo")
    result = calculate_effective_authority(principal_id="agent", resource_id="konto-1",
        action="payment.create", root=root, delegations=[delegation], now=NOW)
    assert result.allowed is True
    assert result.max_amount == Decimal("10000")

def test_delegation_cannot_expand_root_authority():
    root = layer("grant", "cfo", ["payment.create"], "10000", True)
    delegation = layer("delegation", "agent", ["payment.create"], "50000", False, "cfo")
    result = calculate_effective_authority(principal_id="agent", resource_id="konto-1",
        action="payment.create", root=root, delegations=[delegation], now=NOW)
    assert result.allowed is True
    assert result.max_amount == Decimal("10000")

def test_revoked_delegation_is_denied():
    root = layer("grant", "cfo", ["payment.create"], "100000", True)
    delegation = layer("delegation", "agent", ["payment.create"], "10000", False, "cfo", revoked=NOW)
    result = calculate_effective_authority(principal_id="agent", resource_id="konto-1",
        action="payment.create", root=root, delegations=[delegation], now=NOW)
    assert result.allowed is False
    assert result.reason_code == "AUTORITAET_NICHT_AKTIV"

def test_action_not_delegated_is_denied():
    root = layer("grant", "cfo", ["payment.create", "beneficiary.add"], "100000", True)
    delegation = layer("delegation", "agent", ["payment.create"], "10000", False, "cfo")
    result = calculate_effective_authority(principal_id="agent", resource_id="konto-1",
        action="beneficiary.add", root=root, delegations=[delegation], now=NOW)
    assert result.allowed is False
    assert result.reason_code == "AKTION_NICHT_DELEGIERT"
