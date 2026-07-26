import pytest
import base64
import numpy as np
import cv2


@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.anyio
async def test_analysis_requires_auth(client):
    resp = await client.post("/api/v1/analysis/frame", json={
        "session_id": "s1", "frame_b64": "x"
    })
    assert resp.status_code == 401
