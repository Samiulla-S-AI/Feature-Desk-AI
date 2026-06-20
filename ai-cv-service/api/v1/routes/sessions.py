from fastapi import APIRouter, Depends, HTTPException, status

from api.v1.schemas.requests import SessionCreateRequest
from api.v1.schemas.responses import SessionReport, SessionResponse
from core.dependencies import (
    get_report_service,
    get_session_service,
    verify_api_key,
)
from core.exceptions import SessionNotFoundError
from services.report_service import ReportService
from services.session_service import SessionService

router = APIRouter(tags=["sessions"])


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    _: str = Depends(verify_api_key),
    svc: SessionService = Depends(get_session_service),
) -> SessionResponse:
    return svc.create(body.student_id, body.metadata)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    _: str = Depends(verify_api_key),
    svc: SessionService = Depends(get_session_service),
) -> SessionResponse:
    try:
        return svc.get(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@router.post("/sessions/{session_id}/close", response_model=SessionResponse)
async def close_session(
    session_id: str,
    _: str = Depends(verify_api_key),
    svc: SessionService = Depends(get_session_service),
) -> SessionResponse:
    try:
        return svc.close(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@router.get("/sessions/{session_id}/report", response_model=SessionReport)
async def get_session_report(
    session_id: str,
    _: str = Depends(verify_api_key),
    svc: SessionService = Depends(get_session_service),
    reports: ReportService = Depends(get_report_service),
) -> SessionReport:
    try:
        bucket = svc.raw(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return reports.build(session_id, bucket)
