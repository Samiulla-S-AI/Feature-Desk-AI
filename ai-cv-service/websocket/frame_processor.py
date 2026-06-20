import base64

from api.v1.schemas.requests import FrameAnalysisRequest
from api.v1.schemas.responses import AnalysisResponse
from core.dependencies import get_analysis_service, get_session_service


class FrameProcessor:
    """Receives raw bytes from a WebSocket, wraps them as a FrameAnalysisRequest,
    runs the shared analysis pipeline and folds the result into the session
    aggregate. Reuses the cached singletons so models load only once."""

    async def process(self, session_id: str, raw_bytes: bytes) -> AnalysisResponse:
        b64 = base64.b64encode(raw_bytes).decode()
        req = FrameAnalysisRequest(session_id=session_id, frame_b64=b64)
        result = await get_analysis_service().process_frame(req)
        get_session_service().record(result)
        return result
