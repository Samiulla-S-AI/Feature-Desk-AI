from functools import lru_cache
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from core.config import settings
from security.rate_limiter import InMemoryRateLimiter
from services.analysis_service import AnalysisService
from services.report_service import ReportService
from services.session_service import SessionService

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_rate_limiter = InMemoryRateLimiter(
    max_calls=settings.RATE_LIMIT_MAX_CALLS,
    window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
)


async def verify_api_key(api_key: str = Security(_api_key_header)) -> str:
    if api_key != settings.API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    _rate_limiter.check(api_key)  # raises 429 when the per-key window is exceeded
    return api_key


@lru_cache(maxsize=1)
def get_analysis_service() -> AnalysisService:
    return AnalysisService()


@lru_cache(maxsize=1)
def get_session_service() -> SessionService:
    return SessionService()


@lru_cache(maxsize=1)
def get_report_service() -> ReportService:
    return ReportService()
