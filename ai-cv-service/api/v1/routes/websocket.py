from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.v1.schemas.responses import LiveAnalysisResponse
from websocket.connection_manager import ConnectionManager
from websocket.frame_processor import FrameProcessor

router = APIRouter(tags=["websocket"])
manager = ConnectionManager()
processor = FrameProcessor()


@router.websocket("/ws/live/{session_id}")
async def ws_live(websocket: WebSocket, session_id: str, student_id: str | None = None):
    """Live behaviour stream: send raw frame bytes, receive the flat dashboard JSON
    ({student_id, status, attention, phone, faces}) per frame."""
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            result = await processor.process(session_id, data)
            live = LiveAnalysisResponse.from_analysis(result, student_id)
            await manager.send(session_id, live.model_dump(mode="json"))
    except WebSocketDisconnect:
        manager.disconnect(session_id)


@router.websocket("/ws/stream/{session_id}")
async def ws_stream(websocket: WebSocket, session_id: str):
    """Detailed multi-student stream (full AnalysisResponse per frame)."""
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            result = await processor.process(session_id, data)
            await manager.send(session_id, result.model_dump(mode="json"))
    except WebSocketDisconnect:
        manager.disconnect(session_id)
