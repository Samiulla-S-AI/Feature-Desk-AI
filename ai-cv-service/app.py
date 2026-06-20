"""
FeatureDesk CV Service — Entry point.
Run with: uvicorn app:app --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI
from contextlib import asynccontextmanager

from core.config import settings
from core.logger import get_logger
from api.v1.router import v1_router
from middleware.cors import add_cors
from middleware.request_timing import RequestTimingMiddleware
from middleware.error_handler import add_error_handlers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FeatureDesk CV Service", version=settings.APP_VERSION)
    if settings.PRELOAD_MODELS:
        from loaders import preload_all
        preload_all()
    yield
    logger.info("Shutting down FeatureDesk CV Service")


app = FastAPI(
    title="FeatureDesk CV Service",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

add_cors(app)
add_error_handlers(app)
app.add_middleware(RequestTimingMiddleware)
app.include_router(v1_router, prefix="/api/v1")
