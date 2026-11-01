import hashlib
import json
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import AuditEvent, Organization

def append_audit_event(db: Session, *, organization_id: str, actor_id: str,
                       event_type: str, payload: dict) -> AuditEvent:
    """Sequenziert und verkettet einen Nachweis innerhalb derselben DB-Transaktion."""
    organization = db.scalar(
        select(Organization).where(Organization.id == organization_id).with_for_update()
    )
    if organization is None:
        raise ValueError("Mandant für Audit-Ereignis nicht gefunden.")

    previous = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.organization_id == organization_id)
        .order_by(AuditEvent.sequence.desc())
        .limit(1)
        .with_for_update()
    )
    sequence = previous.sequence + 1 if previous else 1
    previous_hash = previous.event_hash if previous else "0" * 64
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    event_hash = hashlib.sha256(
        f"{previous_hash}|{sequence}|{canonical}".encode("utf-8")
    ).hexdigest()

    event = AuditEvent(
        id=str(uuid4()), organization_id=organization_id, sequence=sequence,
        event_type=event_type, actor_id=actor_id, payload=payload,
        previous_hash=previous_hash, event_hash=event_hash,
    )
    db.add(event)
    db.flush()
    return event
