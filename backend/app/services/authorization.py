from datetime import datetime, timezone
import hashlib
import json
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..domain.authority import AuthorityLayer, calculate_effective_authority
from ..models import AuditEvent, AuthorityGrant, AuthorizationDecision, BusinessResource, Delegation, Organization, Principal

POLICY_VERSION = "SHEWIUN-BA-0.2.0"

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
                        currency: str | None = None, record_decision: bool = True,
                        runtime_context: dict | None = None) -> dict:
    """Fail-closed PDP. Persistiert jede Entscheidung; ruft keine LLM-Komponente auf."""
    now = datetime.now(timezone.utc)
    decision_id = str(uuid4())
    correlation_id = str(uuid4())
    reason = "KEINE_GUELTIGE_VOLLMACHT"
    allowed = False
    effective_limit = None
    path: list[str] = []
    grant_id = None
    authority_valid = False
    checks: list[dict] = []
    context_value: dict = {}
    approval_required = False

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

    # Preserve the authority-chain result separately from amount/currency evaluation.
    authority_valid = allowed

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


    core_reason = reason
    if runtime_context is not None:
        # Demo inputs are evaluated deterministically; they are not cryptographic
        # attestations from an external agent runtime.
        context_value = {
            "purpose": str(runtime_context.get("purpose") or "")[:100],
            "runtime_identity": str(runtime_context.get("runtime_identity") or "")[:300],
            "tool": str(runtime_context.get("tool") or "")[:100],
            "permission": str(runtime_context.get("permission") or "")[:100],
            "data_scope": str(runtime_context.get("data_scope") or "")[:100],
            "approval_present": bool(runtime_context.get("approval_present")),
            "approval_fresh": bool(runtime_context.get("approval_fresh")),
        }

        identity_ok = bool(
            org and agent and human and resource
            and agent.organization_id == organization_id
            and human.organization_id == organization_id
            and resource.organization_id == organization_id
            and agent.kind == "AGENT" and human.kind == "HUMAN"
            and agent.status == "ACTIVE" and human.status == "ACTIVE"
            and resource.status == "ACTIVE"
            and agent.issuer
            and context_value["runtime_identity"] == agent.issuer
        )
        permission_ok = context_value["tool"] == action and context_value["permission"] == action
        purpose_ok = action == "payment.create" and context_value["purpose"] == "supplier_payment"
        scope_value = context_value["data_scope"].strip().lower()
        scope_ok = context_value["data_scope"] == resource_id and scope_value not in {"*", "all", "global", "any"}

        parameters_ok = True
        if action == "payment.create":
            parameters_ok = amount is not None and amount > 0 and bool(currency)
        elif amount is not None:
            parameters_ok = bool(currency)
        if amount is not None and effective_limit is not None and amount > effective_limit:
            parameters_ok = False
        if grant_id and currency:
            root = db.get(AuthorityGrant, grant_id)
            if root and root.currency and root.currency != currency:
                parameters_ok = False

        approval_required = (
            action == "payment.create" and amount is not None
            and currency == "CHF" and amount >= Decimal("7500.00")
        )
        approval_ok = not approval_required or (
            context_value["approval_present"] and context_value["approval_fresh"]
        )

        checks = [
            {"control": "identity", "result": "pass" if identity_ok else "fail",
             "detail": "Aktiver Agent und Auftraggeber sind dem Mandanten zugeordnet; Runtime-Aussteller stimmt." if identity_ok else "Identität, Status, Mandant oder Runtime-Aussteller ist nicht gültig."},
            {"control": "permission", "result": "pass" if permission_ok else "fail",
             "detail": "Tool, Permission und Geschäftsaktion sind exakt gebunden." if permission_ok else "Tool und Permission stimmen nicht exakt mit der Geschäftsaktion überein."},
            {"control": "purpose", "result": "pass" if purpose_ok else "fail",
             "detail": "Der Geschäftszweck ist für payment.create zugelassen." if purpose_ok else "Der Geschäftszweck fehlt oder ist für diese Aktion nicht zugelassen."},
            {"control": "resource_scope", "result": "pass" if scope_ok else "fail",
             "detail": "Der Daten-Scope ist auf die konkrete Kontoressource begrenzt." if scope_ok else "Der Daten-Scope ist abweichend oder zu breit."},
            {"control": "business_authority", "result": "pass" if authority_valid else "fail",
             "detail": "Ursprungsvollmacht und Delegationskette sind gültig." if authority_valid else f"Die geschäftliche Autoritätskette ist nicht gültig: {core_reason}."},
            {"control": "parameters", "result": "pass" if parameters_ok else "fail",
             "detail": "Betrag und Währung liegen innerhalb der wirksamen Grenze." if parameters_ok else "Betrag oder Währung verletzt die wirksame Grenze."},
            {"control": "approval", "result": "pass" if approval_ok else "fail",
             "detail": "Keine zusätzliche Freigabe erforderlich." if not approval_required else ("Frische Freigabe im Demo-Testkontext vorhanden." if approval_ok else "Ab CHF 7.500 ist eine vorhandene und frische Freigabe erforderlich.")},
        ]
        failed = next((item for item in checks if item["result"] == "fail"), None)
        if failed:
            allowed = False
            reason_by_control = {
                "identity": "RUNTIME_IDENTITAET_UNGUELTIG",
                "permission": "TOOL_PERMISSION_KONFLIKT",
                "purpose": "GESCHAEFTSZWECK_NICHT_ERLAUBT",
                "resource_scope": "RESSOURCENUMFANG_UEBERSCHRITTEN",
                "approval": "FRESH_APPROVAL_REQUIRED",
                "parameters": reason if reason != "AUTORITAET_GUELTIG" else "ZAHLUNGSPARAMETER_UNGUELTIG",
            }
            reason = reason_by_control.get(failed["control"], core_reason)

    if not record_decision:
        return {"decision_id": None, "allowed": allowed, "reason_code": reason,
                "effective_limit": effective_limit, "delegation_path": path,
                "policy_version": POLICY_VERSION, "correlation_id": correlation_id,
            "checks": checks, "context": context_value, "approval_required": approval_required,
            "claim_level": "policy-evaluation" if runtime_context is not None else "business-authority"}

    row = AuthorizationDecision(
        id=decision_id, correlation_id=correlation_id, organization_id=organization_id,
        principal_id=agent_id, acting_for_id=acting_for_id, resource_id=resource_id,
        action=action, decision="ALLOW" if allowed else "DENY", reason_code=reason,
        effective_limit=effective_limit, requested_amount=amount, currency=currency,
        grant_id=grant_id, delegation_path=path, policy_version=POLICY_VERSION,
        context=context_value, checks=checks,
    )
    db.add(row)
    db.flush()

    # Hash-verketteter Nachweis. Die Mandantenzeile serialisiert die Sequenzvergabe
    # bei parallelen Entscheidungen innerhalb derselben Organisation.
    locked_org = db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update())
    if locked_org is not None:
        previous = db.scalar(select(AuditEvent).where(AuditEvent.organization_id == organization_id)
            .order_by(AuditEvent.sequence.desc()).limit(1).with_for_update())
        sequence = (previous.sequence + 1) if previous else 1
        previous_hash = previous.event_hash if previous else ("0" * 64)
        payload = {
            "entscheidung_id": decision_id, "principal_id": agent_id, "acting_for_id": acting_for_id,
            "ressource_id": resource_id, "aktion": action, "entscheidung": "ALLOW" if allowed else "DENY",
            "grund": reason, "betrag": str(amount) if amount is not None else None,
            "waehrung": currency, "delegationspfad": path, "policy_version": POLICY_VERSION,
            "korrelations_id": correlation_id, "runtime_context": context_value, "checks": checks,
            "approval_required": approval_required,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        event_hash = hashlib.sha256(f"{previous_hash}|{sequence}|{canonical}".encode("utf-8")).hexdigest()
        db.add(AuditEvent(id=str(uuid4()), organization_id=organization_id, sequence=sequence,
            event_type="AUTORISIERUNGSENTSCHEIDUNG", actor_id=agent_id, payload=payload,
            previous_hash=previous_hash, event_hash=event_hash))

    return {"decision_id": decision_id, "allowed": allowed, "reason_code": reason,
            "effective_limit": effective_limit, "delegation_path": path,
            "policy_version": POLICY_VERSION, "correlation_id": correlation_id,
            "checks": checks, "context": context_value, "approval_required": approval_required,
            "claim_level": "policy-evaluation" if runtime_context is not None else "business-authority"}


def verify_audit_chain(db: Session, organization_id: str) -> dict:
    """Prüft Sequenz, Vorgängerbezug und SHA-256-Verkettung der Ereignisse."""
    events = db.scalars(select(AuditEvent).where(AuditEvent.organization_id == organization_id)
        .order_by(AuditEvent.sequence.asc())).all()
    previous_hash = "0" * 64
    expected_sequence = 1
    for event in events:
        canonical = json.dumps(event.payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        expected_hash = hashlib.sha256(
            f"{previous_hash}|{expected_sequence}|{canonical}".encode("utf-8")
        ).hexdigest()
        if event.sequence != expected_sequence:
            return {"gueltig": False, "ereignisse": len(events), "fehler": "SEQUENZLUECKE", "fehler_ereignis": event.id}
        if event.previous_hash != previous_hash or event.event_hash != expected_hash:
            return {"gueltig": False, "ereignisse": len(events), "fehler": "HASH_KETTE_UNGUELTIG", "fehler_ereignis": event.id}
        previous_hash = event.event_hash
        expected_sequence += 1
    return {"gueltig": True, "ereignisse": len(events), "letzter_hash": previous_hash, "fehler": None}
