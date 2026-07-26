import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient
from app import app


def test_websocket_stream():
    client = TestClient(app)
    
    # Establish connection
    with client.websocket_connect("/api/v1/ws/stream/session123") as websocket:
        # Create a dummy JPEG frame
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        _, jpeg_bytes = cv2.imencode(".jpg", frame)
        raw_bytes = jpeg_bytes.tobytes()
        
        # Send frame bytes
        websocket.send_bytes(raw_bytes)
        
        # Receive processing result
        response = websocket.receive_json()
        
        # Assertions
        assert "session_id" in response
        assert response["session_id"] == "session123"
        assert "students" in response
        # Since the frame is black/empty, there should be no person detected
        assert len(response["students"]) == 0
        assert "processing_ms" in response
        assert "frame_id" in response
