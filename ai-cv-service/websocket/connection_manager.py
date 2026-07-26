from fastapi import WebSocket
from typing import Dict


class ConnectionManager:
    """Manages active WebSocket connections keyed by session_id."""

    def __init__(self) -> None:
        self._active: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._active[session_id] = ws

    def disconnect(self, session_id: str) -> None:
        self._active.pop(session_id, None)

    async def send(self, session_id: str, data: dict) -> None:
        ws = self._active.get(session_id)
        if ws:
            await ws.send_json(data)

    async def broadcast(self, data: dict) -> None:
        for ws in self._active.values():
            await ws.send_json(data)
