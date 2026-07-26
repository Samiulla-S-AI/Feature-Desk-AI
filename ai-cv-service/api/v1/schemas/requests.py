from pydantic import BaseModel, Field, field_validator
from typing import Optional


class FrameAnalysisRequest(BaseModel):
    session_id: str = Field(..., description="Unique student session identifier")
    frame_b64: str = Field(..., description="Base64-encoded JPEG/PNG frame")
    student_id: Optional[str] = Field(None, description="Student identifier, e.g. S001")
    timestamp_ms: Optional[int] = Field(None, description="Client-side epoch ms")

    @field_validator("frame_b64")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("frame_b64 must not be empty")
        return v


class SessionCreateRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=128)
    metadata: Optional[dict] = None
