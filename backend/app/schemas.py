from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

class AuthorizationRequest(BaseModel):
    organization_id: str = Field(min_length=1, max_length=80)
    agent_id: str = Field(min_length=1, max_length=100)
    acting_for_id: str = Field(min_length=1, max_length=100)
    resource_id: str = Field(min_length=1, max_length=100)
    action: str = Field(min_length=1, max_length=100)
    amount: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)

class PaymentRequest(BaseModel):
    organization_id: str
    agent_id: str
    acting_for_id: str
    account_id: str
    beneficiary: str = Field(min_length=2, max_length=200)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    currency: str = Field(min_length=3, max_length=3)

class DecisionResponse(BaseModel):
    decision_id: str
    entscheidung: str
    grund: str
    effektives_limit: Decimal | None
    delegationspfad: list[str]
    policy_version: str

class PaymentResponse(BaseModel):
    payment_id: str
    status: str
    amount: Decimal
    currency: str
    authorization_decision_id: str

class PrincipalView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    display_name: str
    kind: str
    status: str

class GraphNode(BaseModel):
    id: str
    label: str
    typ: str
    status: str

class GraphEdge(BaseModel):
    id: str
    von: str
    nach: str
    typ: str
    limit: Decimal | None = None
