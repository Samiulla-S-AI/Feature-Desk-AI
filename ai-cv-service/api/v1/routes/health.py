from fastapi import APIRouter

from api.v1.schemas.responses import HealthResponse
from core.config import settings
from loaders import all_loaded

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(version=settings.APP_VERSION, models_loaded=all_loaded())
