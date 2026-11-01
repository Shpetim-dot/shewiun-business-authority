from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable

@dataclass(frozen=True)
class AuthorityLayer:
    """Eine einzelne, überprüfte Stufe der geschäftlichen Autoritätskette."""
    id: str
    principal_id: str
    actions: frozenset[str]
    resource_id: str
    max_amount: Decimal | None
    currency: str | None
    can_delegate: bool
    valid_from: datetime
    valid_until: datetime | None
    revoked_at: datetime | None

@dataclass(frozen=True)
class EffectiveAuthority:
    allowed: bool
    reason_code: str
    principal_id: str
    resource_id: str
    action: str
    max_amount: Decimal | None
    currency: str | None
    delegation_path: tuple[str, ...]

def _active(layer: AuthorityLayer, now: datetime) -> bool:
    return (
        layer.revoked_at is None
        and layer.valid_from <= now
        and (layer.valid_until is None or now < layer.valid_until)
    )

def calculate_effective_authority(
    *,
    principal_id: str,
    resource_id: str,
    action: str,
    root: AuthorityLayer,
    delegations: Iterable[AuthorityLayer],
    now: datetime | None = None,
) -> EffectiveAuthority:
    """Berechnet die Schnittmenge der Rechte entlang einer Delegationskette.

    Die Reihenfolge ist root -> unmittelbare Delegation -> Agent. Jeder Schritt
    muss dieselbe Ressource und Aktion abdecken. Limits werden monoton reduziert.
    """
    now = now or datetime.now(timezone.utc)
    chain = [root, *list(delegations)]
    expected_principal = root.principal_id
    limits: list[Decimal] = []
    currency: str | None = None
    path: list[str] = []

    for index, layer in enumerate(chain):
        if not _active(layer, now):
            return EffectiveAuthority(False, "AUTORITAET_NICHT_AKTIV", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
        if layer.principal_id != expected_principal:
            return EffectiveAuthority(False, "DELEGATIONSKETTE_UNGUELTIG", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
        if layer.resource_id != resource_id:
            return EffectiveAuthority(False, "RESSOURCE_NICHT_ABGEDECKT", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
        if action not in layer.actions and "*" not in layer.actions:
            return EffectiveAuthority(False, "AKTION_NICHT_DELEGIERT", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
        if index < len(chain) - 1 and not layer.can_delegate:
            return EffectiveAuthority(False, "WEITERDELEGATION_NICHT_ERLAUBT", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
        if layer.max_amount is not None:
            limits.append(Decimal(layer.max_amount))
        if layer.currency:
            if currency and currency != layer.currency:
                return EffectiveAuthority(False, "WAEHRUNGSKONFLIKT", principal_id, resource_id, action, None, None, tuple(path + [layer.id]))
            currency = layer.currency
        path.append(layer.id)
        if index < len(chain) - 1:
            expected_principal = delegations_list_delegate(chain, index)

    if chain[-1].principal_id != principal_id:
        return EffectiveAuthority(False, "AGENT_NICHT_DELEGIERT", principal_id, resource_id, action, None, currency, tuple(path))
    return EffectiveAuthority(True, "AUTORITAET_GUELTIG", principal_id, resource_id, action, min(limits) if limits else None, currency, tuple(path))

def delegations_list_delegate(chain: list[AuthorityLayer], index: int) -> str:
    # principal_id der Folgestufe wird vom Aufrufer in den Layern geführt.
    return getattr(chain[index + 1], "principal_id")
