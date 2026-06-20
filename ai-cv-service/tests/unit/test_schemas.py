import pytest
from pydantic import ValidationError
from api.v1.schemas.requests import FrameAnalysisRequest


def test_empty_frame_rejected():
    with pytest.raises(ValidationError):
        FrameAnalysisRequest(session_id="abc", frame_b64="   ")


def test_valid_request():
    r = FrameAnalysisRequest(session_id="s1", frame_b64="abc123")
    assert r.session_id == "s1"
