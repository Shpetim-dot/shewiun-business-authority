from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..domain.authority import AuthorityLayer, calculate_effective_authority
from ..models import AuthorityGrant, AuthorizationDecision, BusinessResource, Delegation, Organization, Principal

POLICY_VERSION = "SHEWIUN-BA-0.1.0"

def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def _layer_from_grant(grant: AuthorityGrant) -> AuthorityLayer:
    return AuthorityLayer(
        id=grant.id, principal_id=grant.principal_id, actions=frozenset(grant.actions),
        resource_id=grant.resource_id, max_amount=Decimal(grant.max_amount) if grant.max_amount is not None else None,
        currency=grant.currency, can_delegate=grant.can_delegate, valid_from=_utc(grant.valid_from),
        valid_until=_utc(grant.valid_until) if grant.valid_until else None, revoked_at=_utc(grant.revoked_at) if grant.revoked_at else None,
    )

def _layer_from_delegation(item: Delegation) -> AuthorityLayer:
    return AuthorityLayer(
        id=item.id, principal_id=item.delegate_id, delegator_id=item.delegator_id,
        actions=frozenset(item.actions), resource_id=item.resource_id,
        max_amount=Decimal(item.max_amount) if item.max_amount is not None else None,
        currency=item.currency, can_delegate=item.can_subdelegate, valid_from=_utc(item.valid_from),
        valid_until=_utc(item.valid_until) if item.valid_until else None, revoked_at=_utc(item.revoked_at) if item.revoked_at else None,
    )

def evaluate_and_record(db: Session, *, organization_id: str, agent_id: str, acting_for_id: str,
                        resource_id: str, action: str, amount: Decimal | None = None,
                        currency: str | None = None) -> dict:
    """Fail-closed PDP. Persistiert jede Entscheidung; ruft keine LLM-Komponente auf."""
    now = datetime.now(timezone.utc)
    decision_id = str(uuid4())
    correlation_id = str(uuid4())
    reason = "KEINE_GUELTIGE_VOLLMACHT"
    allowed = False
    effective_limit = None
    path: list[str] = []
    grant_id = None

    org = db.get(Organization, organization_id)
    agent = db.get(Principal, agent_id)
    human = db.get(Principal, acting_for_id)
    resource = db.get(BusinessResource, resource_id)
    if not org or not agent or not human or not resource:
        reason = "IDENTITAET_ODER_RESSOURCE_UNBEKANNT"
    elif any(p.organization_id != organization_id or p.status != "ACTIVE" for p in (agent, human)) or resource.organization_id != organization_id or resource.status != "ACTIVE":
        reason = "MANDANTEN_ODER_STATUSPRUEFUNG_FEHLGESCHLAGEN"
    elif agent.kind != "AGENT" or human.kind != "HUMAN":
        reason = "PRINCIPAL_TYP_UNGUELTIG"
    else:
        grants = db.scalars(select(AuthorityGrant).where(
            AuthorityGrant.organization_id == organization_id,
            AuthorityGrant.principal_id == acting_for_id,
            AuthorityGrant.resource_id == resource_id,
            AuthorityGrant.revoked_at.is_(None),
        ).with_for_update()).all()
        # Eindeutige, aktive Ursprungsberechtigung: Mehrdeutigkeit wird nicht geraten.
        candidates = [g for g in grants if _utc(g.valid_from) <= now and (g.valid_until is None or now < _utc(g.valid_until))]
        if len(candidates) == 1:
            grant = candidates[0]
            grant_id = grant.id
            delegations = db.scalars(select(Delegation).where(
                Delegation.organization_id == organization_id,
                Delegation.grant_id == grant.id,
                Delegation.revoked_at.is_(None),
            ).with_for_update()).all()
            by_id = {d.id: d for d in delegations}
            # Den zum Agenten gehörenden Pfad rückwärts auflösen. Zyklen/Mehrdeutigkeit fail-closed.
            terminal = [d for d in delegations if d.delegate_id == agent_id]
            if len(terminal) == 1:
                reverse_path = [terminal[0]]
                seen = {terminal[0].id}
                cursor = terminal[0]
                valid_chain = True
                while cursor.parent_delegation_id:
                    parent = by_id.get(cursor.parent_delegation_id)
                    if parent is None or parent.id in seen or parent.delegate_id != cursor.delegator_id:
                        valid_chain = False
                        break
                    reverse_path.append(parent)
                    seen.add(parent.id)
                    cursor = parent
                chain = list(reversed(reverse_path))
                # Die erste Delegation muss unmittelbar vom Inhaber der Ursprungsvollmacht kommen.
                if valid_chain and chain and chain[0].delegator_id == acting_for_id:
                    layers = [_layer_from_delegation(d) for d in chain]
                    result = calculate_effective_authority(
                        principal_id=agent_id, resource_id=resource_id, action=action,
                        root=_layer_from_grant(grant), delegations=layers, now=now,
                    )
                    allowed, reason, effective_limit, path = result.allowed, result.reason_code, result.max_amount, list(result.delegation_path)
                else:
                    reason = "DELEGATIONSKETTE_UNGUELTIG"
            elif len(terminal) > 1:
                reason = "MEHRDEUTIGE_DELEGATION"
            else:
                reason = "KEINE_DELEGATION_AN_AGENT"
        elif len(candidates) > 1:
            reason = "MEHRDEUTIGE_URSPRUNGSVOLLMACHT"

    if allowed and amount is not None:
        if currency is None:
            allowed, reason = False, "WAEHRUNG_FEHLT"
        elif effective_limit is not None and amount > effective_limit:
            allowed, reason = False, "DELEGIERTES_LIMIT_UEBERSCHRITTEN"
        else:
            root_currency = None
            if grant_id:
                root_currency = db.get(AuthorityGrant, grant_id).currency
            if root_currency and root_currency != currency:
                allowed, reason = False, "WAEHRUNGSKONFLIKT"

    row = AuthorizationDecision(
        id=decision_id, correlation_id=correlation_id, organization_id=organization_id,
        principal_id=agent_id, acting_for_id=acting_for_id, resource_id=resource_id,
        action=action, decision="ALLOW" if allowed else "DENY", reason_code=reason,
        effective_limit=effective_limit, requested_amount=amount, currency=currency,
        grant_id=grant_id, delegation_path=path, policy_version=POLICY_VERSION,
    )
    db.add(row)
    db.flush()
    return {"decision_id": decision_id, "allowed": allowed, "reason_code": reason,
            "effective_limit": effective_limit, "delegation_path": path,
            "policy_version": POLICY_VERSION, "correlation_id": correlation_id}
