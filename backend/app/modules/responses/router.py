import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.responses import service
from app.modules.responses.schemas import (
    ResponseRuleCreate,
    ResponseRuleResponse,
    ResponseRuleUpdate,
)

router = APIRouter(prefix="/responses", tags=["responses"])


@router.get("/", response_model=list[ResponseRuleResponse])
async def list_rules(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[ResponseRuleResponse]:
    rules = await service.list_rules(db, skip=skip, limit=limit)
    return [ResponseRuleResponse.model_validate(r) for r in rules]


@router.post("/", response_model=ResponseRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: ResponseRuleCreate,
    db: AsyncSession = Depends(get_session),
) -> ResponseRuleResponse:
    rule = await service.create_rule(db, data)
    return ResponseRuleResponse.model_validate(rule)


@router.get("/{rule_id}", response_model=ResponseRuleResponse)
async def get_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ResponseRuleResponse:
    rule = await service.get_rule(db, rule_id)
    return ResponseRuleResponse.model_validate(rule)


@router.put("/{rule_id}", response_model=ResponseRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    data: ResponseRuleUpdate,
    db: AsyncSession = Depends(get_session),
) -> ResponseRuleResponse:
    rule = await service.update_rule(db, rule_id, data)
    return ResponseRuleResponse.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_rule(db, rule_id)


@router.post("/{rule_id}/toggle", response_model=ResponseRuleResponse)
async def toggle_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ResponseRuleResponse:
    rule = await service.toggle_rule(db, rule_id)
    return ResponseRuleResponse.model_validate(rule)
