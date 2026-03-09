import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.feeding.models import FeedingLog, FeedingPlan, FoodItem
from app.modules.feeding.schemas import (
    FeedingLogCreate,
    FeedingPlanResponse,
    FeedingSummaryResponse,
    FoodItemCreate,
    FoodItemUpdate,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default food catalog seed data
# ---------------------------------------------------------------------------

_DEFAULT_FOODS: list[dict[str, Any]] = [
    # Fruits - safe
    {
        "name": "apple",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "Remove seeds — apple seeds contain cyanide compounds.",
    },
    {
        "name": "banana",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "High in sugar; offer in moderation.",
    },
    {
        "name": "grape",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Seedless preferred. Cut in half to avoid choking.",
    },
    {
        "name": "mango",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Remove the large pit. Excellent vitamin A source.",
    },
    {
        "name": "papaya",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Seeds are safe and contain beneficial enzymes.",
    },
    {
        "name": "blueberry",
        "category": "fruit",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "Rich in antioxidants. One of the best fruits for parrots.",
    },
    # Vegetables - safe
    {
        "name": "carrot",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "High in beta-carotene. Can be offered raw or cooked.",
    },
    {
        "name": "broccoli",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "Excellent source of vitamins C and K.",
    },
    {
        "name": "sweet potato",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Must be cooked. Great source of beta-carotene.",
    },
    {
        "name": "spinach",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "adult_only",
        "notes": "High oxalates; offer sparingly to avoid calcium binding.",
    },
    {
        "name": "peas",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "Fresh or frozen (thawed). Excellent protein source.",
    },
    {
        "name": "corn",
        "category": "vegetable",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Fresh or cooked. High in carbohydrates.",
    },
    # Grains - safe
    {
        "name": "rice (cooked)",
        "category": "grain",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Plain cooked only. Brown rice preferred for nutrition.",
    },
    {
        "name": "quinoa",
        "category": "grain",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Must be cooked. High complete protein for a grain.",
    },
    {
        "name": "oats",
        "category": "grain",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Cooked or soaked. Plain without added sugar or salt.",
    },
    # Seeds - safe
    {
        "name": "sunflower seeds",
        "category": "seed",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "all_ages",
        "notes": "High fat; use as treats only to avoid obesity.",
    },
    {
        "name": "pumpkin seeds",
        "category": "seed",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "all_ages",
        "notes": "Raw, unsalted. Good zinc source.",
    },
    {
        "name": "millet",
        "category": "seed",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "3x_week",
        "age_restriction": "all_ages",
        "notes": "Spray millet is a favorite foraging enrichment activity.",
    },
    # Nuts - safe
    {
        "name": "almonds (unsalted)",
        "category": "nut",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "adult_only",
        "notes": "Raw or dry-roasted only. Never salted. High fat.",
    },
    {
        "name": "walnuts",
        "category": "nut",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "adult_only",
        "notes": "Unsalted. Good omega-3 source. Break shells for safety.",
    },
    # Protein - safe
    {
        "name": "egg (cooked)",
        "category": "protein",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "all_ages",
        "notes": "Hard-boiled or scrambled without oil/salt. Excellent protein.",
    },
    {
        "name": "chicken (cooked)",
        "category": "protein",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "occasional",
        "age_restriction": "adult_only",
        "notes": "Plain cooked, no seasoning. Parrots are omnivores.",
    },
    # Pellets
    {
        "name": "pellets",
        "category": "pellet",
        "is_safe": True,
        "is_toxic": False,
        "frequency_recommendation": "daily",
        "age_restriction": "all_ages",
        "notes": "Should form 50-70% of diet. Choose species-appropriate brand.",
    },
    # Toxic foods
    {
        "name": "avocado",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — contains persin. Can cause cardiac arrest and death.",
    },
    {
        "name": "chocolate",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — theobromine and caffeine are lethal to parrots.",
    },
    {
        "name": "caffeine",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — coffee, tea, energy drinks. Cardiac arrhythmia risk.",
    },
    {
        "name": "alcohol",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — even trace amounts can be fatal.",
    },
    {
        "name": "onion",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — thiosulfates cause hemolytic anemia. All forms dangerous.",
    },
    {
        "name": "garlic",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — allicin destroys red blood cells. More toxic than onion.",
    },
    {
        "name": "mushroom",
        "category": "toxic",
        "is_safe": False,
        "is_toxic": True,
        "frequency_recommendation": "never",
        "age_restriction": "all_ages",
        "notes": "TOXIC — can cause liver failure and digestive problems.",
    },
]


async def seed_default_foods(db: AsyncSession) -> None:
    """Seed the food_items table with default parrot foods if not already present."""
    for food_data in _DEFAULT_FOODS:
        result = await db.execute(
            select(FoodItem).where(FoodItem.name == food_data["name"])
        )
        if result.scalar_one_or_none() is None:
            food = FoodItem(**food_data)
            db.add(food)
    await db.flush()
    logger.info("Default food catalog ensured")


# ---------------------------------------------------------------------------
# FoodItem CRUD
# ---------------------------------------------------------------------------

async def list_food_items(
    db: AsyncSession,
    category: str | None = None,
    is_safe: bool | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[FoodItem]:
    stmt = select(FoodItem)
    if category:
        stmt = stmt.where(FoodItem.category == category)
    if is_safe is not None:
        stmt = stmt.where(FoodItem.is_safe == is_safe)
    if search:
        stmt = stmt.where(
            or_(
                FoodItem.name.ilike(f"%{search}%"),
                FoodItem.notes.ilike(f"%{search}%"),
            )
        )
    stmt = stmt.order_by(FoodItem.is_toxic, FoodItem.category, FoodItem.name)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_food_item(db: AsyncSession, food_id: uuid.UUID) -> FoodItem:
    result = await db.execute(select(FoodItem).where(FoodItem.id == food_id))
    food = result.scalar_one_or_none()
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Food item {food_id} not found",
        )
    return food


async def create_food_item(db: AsyncSession, data: FoodItemCreate) -> FoodItem:
    food = FoodItem(
        name=data.name,
        category=data.category,
        is_safe=data.is_safe,
        is_toxic=data.is_toxic,
        nutritional_info=data.nutritional_info,
        frequency_recommendation=data.frequency_recommendation,
        notes=data.notes,
        age_restriction=data.age_restriction,
    )
    db.add(food)
    await db.flush()
    await db.refresh(food)
    return food


async def update_food_item(
    db: AsyncSession, food_id: uuid.UUID, data: FoodItemUpdate
) -> FoodItem:
    food = await get_food_item(db, food_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(food, field, value)
    await db.flush()
    await db.refresh(food)
    return food


# ---------------------------------------------------------------------------
# FeedingLog CRUD
# ---------------------------------------------------------------------------

async def list_feeding_logs(
    db: AsyncSession,
    parrot_id: uuid.UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[FeedingLog]:
    stmt = select(FeedingLog).where(FeedingLog.parrot_id == parrot_id)
    if start_date:
        stmt = stmt.where(FeedingLog.fed_at >= start_date)
    if end_date:
        stmt = stmt.where(FeedingLog.fed_at <= end_date)
    stmt = stmt.order_by(FeedingLog.fed_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_feeding_log(db: AsyncSession, data: FeedingLogCreate) -> FeedingLog:
    fed_at = data.fed_at or datetime.now(timezone.utc)
    log = FeedingLog(
        parrot_id=data.parrot_id,
        food_item_id=data.food_item_id,
        food_name=data.food_name,
        quantity=data.quantity,
        fed_at=fed_at,
        notes=data.notes,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


async def delete_feeding_log(db: AsyncSession, log_id: uuid.UUID) -> None:
    result = await db.execute(select(FeedingLog).where(FeedingLog.id == log_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feeding log {log_id} not found",
        )
    await db.delete(log)
    await db.flush()


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

async def get_feeding_summary(
    db: AsyncSession,
    parrot_id: uuid.UUID,
    days: int = 7,
) -> FeedingSummaryResponse:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(FeedingLog).where(
            FeedingLog.parrot_id == parrot_id,
            FeedingLog.fed_at >= since,
        )
    )
    logs = list(result.scalars().all())

    total_feedings = len(logs)
    unique_foods = len({log.food_name for log in logs})

    # Count occurrences per food name
    food_counts: dict[str, int] = {}
    for log in logs:
        food_counts[log.food_name] = food_counts.get(log.food_name, 0) + 1

    most_fed_foods = sorted(
        [{"food": name, "count": count} for name, count in food_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # Identify toxic foods fed by cross-referencing food_items
    food_item_ids = [log.food_item_id for log in logs if log.food_item_id is not None]
    toxic_foods_fed: list[str] = []
    if food_item_ids:
        toxic_result = await db.execute(
            select(FoodItem).where(
                FoodItem.id.in_(food_item_ids),
                FoodItem.is_toxic == True,  # noqa: E712
            )
        )
        toxic_items = toxic_result.scalars().all()
        toxic_foods_fed = [item.name for item in toxic_items]

    # Category breakdown via joined query
    category_breakdown: dict[str, int] = {}
    if food_item_ids:
        cat_result = await db.execute(
            select(FoodItem.category, func.count(FeedingLog.id)).join(
                FeedingLog, FeedingLog.food_item_id == FoodItem.id
            ).where(
                FeedingLog.parrot_id == parrot_id,
                FeedingLog.fed_at >= since,
            ).group_by(FoodItem.category)
        )
        for category, count in cat_result.all():
            category_breakdown[category] = count

    return FeedingSummaryResponse(
        parrot_id=parrot_id,
        days=days,
        total_feedings=total_feedings,
        unique_foods=unique_foods,
        most_fed_foods=most_fed_foods,
        toxic_foods_fed=toxic_foods_fed,
        category_breakdown=category_breakdown,
    )


# ---------------------------------------------------------------------------
# AI-generated feeding plan
# ---------------------------------------------------------------------------

async def suggest_feeding_plan(
    db: AsyncSession,
    parrot_id: uuid.UUID,
) -> FeedingPlanResponse:
    """Build context from parrot profile and recent logs, call Gemini, persist plan."""
    from app.modules.ai.gemini_client import _gemini_request, _parse_json_response
    from app.modules.parrot.models import Parrot
    from app.modules.parrot.service import calculate_age

    # 1. Fetch parrot profile
    parrot_result = await db.execute(select(Parrot).where(Parrot.id == parrot_id))
    parrot = parrot_result.scalar_one_or_none()
    if parrot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parrot {parrot_id} not found",
        )

    age_info = "unknown age"
    if parrot.birth_date:
        age = calculate_age(parrot.birth_date)
        age_info = f"{age.years} years, {age.months} months"

    # 2. Fetch recent feeding logs (last 14 days)
    since = datetime.now(timezone.utc) - timedelta(days=14)
    logs_result = await db.execute(
        select(FeedingLog).where(
            FeedingLog.parrot_id == parrot_id,
            FeedingLog.fed_at >= since,
        ).order_by(FeedingLog.fed_at.desc()).limit(50)
    )
    recent_logs = logs_result.scalars().all()

    # 3. Fetch safe food catalog
    safe_foods_result = await db.execute(
        select(FoodItem).where(FoodItem.is_safe == True).limit(50)  # noqa: E712
    )
    safe_foods = safe_foods_result.scalars().all()

    # 4. Build prompt context
    parrot_context = (
        f"Name: {parrot.name}\n"
        f"Species: {parrot.species or 'unknown'}\n"
        f"Age: {age_info}\n"
        f"Weight: {f'{parrot.weight_grams}g' if parrot.weight_grams else 'unknown'}\n"
        f"Sex: {parrot.sex or 'unknown'}"
    )

    recent_diet = (
        "\n".join(
            f"- {log.food_name} ({log.quantity or 'unspecified'}) "
            f"at {log.fed_at.strftime('%Y-%m-%d %H:%M')}"
            for log in recent_logs
        )
        or "No recent feeding records."
    )

    available_foods = "\n".join(
        f"- {food.name} (category={food.category}, "
        f"frequency={food.frequency_recommendation or 'unspecified'}, "
        f"age_restriction={food.age_restriction or 'all_ages'})"
        for food in safe_foods
    )

    system_prompt = """You are a certified avian nutritionist AI assistant.
Generate a healthy, balanced weekly meal plan for a pet parrot in Spanish.
Return ONLY a valid JSON object with no markdown code blocks and no extra text.
The JSON must follow this exact structure:
{
  "daily_meals": [
    {
      "day": "Lunes",
      "meals": [
        {
          "time": "08:00",
          "foods": ["apple", "pellets"],
          "portions": "small handful of pellets, 2 apple slices",
          "notes": "..."
        }
      ]
    }
  ],
  "weekly_variety_score": 8.5,
  "nutritional_notes": ["string1", "string2"],
  "warnings": ["string if diet is unbalanced"]
}"""

    user_content = f"""Generate a weekly meal plan for this parrot:

PARROT PROFILE:
{parrot_context}

RECENT DIET (last 14 days):
{recent_diet}

AVAILABLE SAFE FOODS:
{available_foods}

Create a varied, species-appropriate meal plan as JSON."""

    # 5. Call Gemini
    raw_response = await _gemini_request(
        contents=[{"role": "user", "parts": [{"text": user_content}]}],
        system_instruction=system_prompt,
    )
    plan_data = _parse_json_response(raw_response)

    # 6. Deactivate previous active plans for this parrot
    prev_result = await db.execute(
        select(FeedingPlan).where(
            FeedingPlan.parrot_id == parrot_id,
            FeedingPlan.active == True,  # noqa: E712
        )
    )
    for old_plan in prev_result.scalars().all():
        old_plan.active = False

    # 7. Persist and return the new plan
    new_plan = FeedingPlan(
        parrot_id=parrot_id,
        plan_data=plan_data,
        generated_at=datetime.now(timezone.utc),
        active=True,
    )
    db.add(new_plan)
    await db.flush()
    await db.refresh(new_plan)

    return FeedingPlanResponse.model_validate(new_plan)
