from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_entity_code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)

class Principal(Base):
    __tablename__ = "principals"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # HUMAN | AGENT
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

class BusinessResource(Base):
    __tablename__ = "business_resources"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(60), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)

class AuthorityGrant(Base):
    __tablename__ = "authority_grants"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    principal_id: Mapped[str] = mapped_column(ForeignKey("principals.id"), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(ForeignKey("business_resources.id"), nullable=False, index=True)
    actions: Mapped[list] = mapped_column(JSON, nullable=False)
    max_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    can_delegate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

class Delegation(Base):
    __tablename__ = "delegations"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    grant_id: Mapped[str] = mapped_column(ForeignKey("authority_grants.id"), nullable=False)
    delegator_id: Mapped[str] = mapped_column(ForeignKey("principals.id"), nullable=False)
    delegate_id: Mapped[str] = mapped_column(ForeignKey("principals.id"), nullable=False, index=True)
    parent_delegation_id: Mapped[str | None] = mapped_column(ForeignKey("delegations.id"))
    resource_id: Mapped[str] = mapped_column(ForeignKey("business_resources.id"), nullable=False)
    actions: Mapped[list] = mapped_column(JSON, nullable=False)
    max_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    can_subdelegate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

class AuthorizationDecision(Base):
    __tablename__ = "authorization_decisions"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    correlation_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    principal_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    acting_for_id: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(100), nullable=False)
    effective_limit: Mapped[float | None] = mapped_column(Numeric(18, 2))
    requested_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    grant_id: Mapped[str | None] = mapped_column(String(100))
    delegation_path: Mapped[list] = mapped_column(JSON, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("business_resources.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("principals.id"), nullable=False)
    beneficiary: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ERSTELLT", nullable=False)
    authorization_decision_id: Mapped[str] = mapped_column(ForeignKey("authorization_decisions.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (UniqueConstraint("organization_id", "sequence", name="uq_audit_org_sequence"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
