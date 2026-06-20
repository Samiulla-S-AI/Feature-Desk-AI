from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class AttentionState(str, Enum):
    FOCUSED = "focused"
    DISTRACTED = "distracted"
    SLEEPING = "sleeping"
    ABSENT = "absent"


class HeadPose(BaseModel):
    yaw: float
    pitch: float
    roll: float


class EyeMetrics(BaseModel):
    ear_left: float = Field(..., description="Eye Aspect Ratio — left eye")
    ear_right: float = Field(..., description="Eye Aspect Ratio — right eye")
    gaze_x: Optional[float] = None
    gaze_y: Optional[float] = None


class BehaviorFlags(BaseModel):
    phone_detected: bool = False
    left_desk: bool = False
    eyes_closed: bool = False
    looking_away: bool = False


class StudentAnalysis(BaseModel):
    student_id: str
    track_id: Optional[int] = None
    attention_score: float = Field(..., ge=0, le=100)
    focus_score: float = Field(..., ge=0, le=100)
    state: AttentionState
    head_pose: Optional[HeadPose] = None
    eye_metrics: Optional[EyeMetrics] = None
    head_motion: Optional[float] = Field(None, description="Yaw+pitch std (deg) over window")
    perclos: Optional[float] = Field(None, description="Fraction of window with eyes closed")
    flags: BehaviorFlags = BehaviorFlags()


class AnalysisResponse(BaseModel):
    session_id: str
    timestamp_ms: int
    frame_id: int
    students: List[StudentAnalysis]
    processing_ms: float


# Human-readable status labels for the client dashboard (title case).
_STATUS_LABELS = {
    AttentionState.FOCUSED: "Focused",
    AttentionState.DISTRACTED: "Distracted",
    AttentionState.SLEEPING: "Sleeping",
    AttentionState.ABSENT: "Absent",
}


class LiveAnalysisResponse(BaseModel):
    """Flat, dashboard-ready contract the client wires directly into their UI:

        {"student_id": "S001", "status": "Focused", "attention": 94,
         "phone": false, "faces": 1}
    """

    student_id: str
    status: str
    attention: int = Field(..., ge=0, le=100)
    phone: bool
    faces: int

    @classmethod
    def from_analysis(
        cls, resp: "AnalysisResponse", student_id: Optional[str] = None
    ) -> "LiveAnalysisResponse":
        faces = len(resp.students)
        if not resp.students:
            return cls(
                student_id=student_id or "unknown",
                status="Absent",
                attention=0,
                phone=False,
                faces=0,
            )
        primary = resp.students[0]
        return cls(
            student_id=student_id or primary.student_id,
            status=_STATUS_LABELS.get(primary.state, "Absent"),
            attention=round(primary.attention_score),
            phone=any(s.flags.phone_detected for s in resp.students),
            faces=faces,
        )


class SessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    FLAGGED = "flagged"


class SessionResponse(BaseModel):
    session_id: str
    student_id: str
    created_at: int
    frame_count: int
    status: SessionStatus = SessionStatus.ACTIVE


class StateBreakdown(BaseModel):
    focused: int = 0
    distracted: int = 0
    sleeping: int = 0
    absent: int = 0


class FlagSummary(BaseModel):
    phone_detected: int = 0
    left_desk: int = 0
    eyes_closed: int = 0
    looking_away: int = 0


class SessionReport(BaseModel):
    """Aggregated session summary — the JSON the Teacher/Admin dashboards render."""

    session_id: str
    student_id: str
    status: SessionStatus
    created_at: int
    ended_at: Optional[int] = None
    duration_seconds: float = 0.0

    frames_analyzed: int = 0
    frames_with_face: int = 0

    avg_attention: float = Field(0.0, ge=0, le=100)
    min_attention: float = Field(0.0, ge=0, le=100)
    avg_focus: float = Field(0.0, ge=0, le=100)

    blink_count: int = 0
    blink_rate_per_min: float = 0.0

    head_motion_yaw_std: float = Field(0.0, description="Yaw variability (deg) — head motion")
    head_motion_pitch_std: float = Field(0.0, description="Pitch variability (deg) — head motion")

    dominant_state: AttentionState = AttentionState.ABSENT
    state_breakdown: StateBreakdown = StateBreakdown()
    flag_counts: FlagSummary = FlagSummary()

    verdict: str = Field("attentive", description="attentive | needs_attention | flagged")


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    models_loaded: bool
