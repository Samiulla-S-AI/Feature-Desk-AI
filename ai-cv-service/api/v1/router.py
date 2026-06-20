from fastapi import APIRouter
from api.v1.routes import health, analysis, sessions, websocket

v1_router = APIRouter()
v1_router.include_router(health.router)
v1_router.include_router(analysis.router)
v1_router.include_router(sessions.router)
v1_router.include_router(websocket.router)
