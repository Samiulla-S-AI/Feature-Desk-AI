import time
import uuid
from typing import Optional

from api.v1.schemas.responses import (
    AnalysisResponse,
    AttentionState,
    SessionResponse,
    SessionStatus,
)
from core.config import settings
from core.exceptions import SessionNotFoundError


def _new_bucket(student_id: str, created_at: int) -> dict:
    """In-memory aggregate for one session. Nothing here is persisted to disk."""
    return {
        "student_id": student_id,
        "created_at": created_at,
        "last_seen": created_at,
        "ended_at": None,
        "status": SessionStatus.ACTIVE,
        "frame_count": 0,
        "frames_with_face": 0,
        "attention_sum": 0.0,
        "attention_min": 100.0,
        "focus_sum": 0.0,
        "blink_count": 0,
        "_eyes_closed_prev": False,
        # Running stats for head-motion std (Welford-free: keep sums).
        "yaw_n": 0,
        "yaw_sum": 0.0,
        "yaw_sumsq": 0.0,
        "pitch_sum": 0.0,
        "pitch_sumsq": 0.0,
        "state_counts": {s.value: 0 for s in AttentionState},
        "flag_counts": {
            "phone_detected": 0,
            "left_desk": 0,
            "eyes_closed": 0,
            "looking_away": 0,
        },
    }


class SessionService:
    """Per-session live aggregation. State lives in memory only and is evicted
    after `SESSION_TTL_SECONDS`. Persistence of history is the frontend's job
    (it reads the returned JSON into Supabase)."""

    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def create(self, student_id: str, metadata: Optional[dict] = None) -> SessionResponse:
        self._evict_expired()
        session_id = str(uuid.uuid4())
        bucket = _new_bucket(student_id, int(time.time() * 1000))
        bucket["metadata"] = metadata or {}
        self._store[session_id] = bucket
        return self._to_response(session_id)

    def get(self, session_id: str) -> SessionResponse:
        self._require(session_id)
        return self._to_response(session_id)

    def close(self, session_id: str) -> SessionResponse:
        bucket = self._require(session_id)
        bucket["ended_at"] = int(time.time() * 1000)
        flagged = (
            bucket["flag_counts"]["phone_detected"] > 0
            or bucket["flag_counts"]["looking_away"] > bucket["frame_count"] // 2
        )
        bucket["status"] = SessionStatus.FLAGGED if flagged else SessionStatus.COMPLETED
        return self._to_response(session_id)

    # ------------------------------------------------------------------ #
    # Aggregation
    # ------------------------------------------------------------------ #
    def record(self, response: AnalysisResponse) -> None:
        """Fold a single frame's analysis into the session aggregate.
        Tolerant of unknown sessions: lazily creates a bucket so frames sent
        without an explicit /sessions call are still summarisable."""
        self._evict_expired()
        bucket = self._store.get(response.session_id)
        if bucket is None:
            student_id = response.students[0].student_id if response.students else "unknown"
            bucket = _new_bucket(student_id, int(time.time() * 1000))
            self._store[response.session_id] = bucket

        bucket["frame_count"] += 1
        # Lifecycle timestamps are server-clock so TTL eviction and report
        # duration stay correct regardless of client clock skew.
        bucket["last_seen"] = int(time.time() * 1000)

        if not response.students:
            bucket["flag_counts"]["left_desk"] += 1
            return

        # Exam = one student per camera; aggregate the primary subject.
        s = response.students[0]
        bucket["frames_with_face"] += 1
        bucket["attention_sum"] += s.attention_score
        bucket["attention_min"] = min(bucket["attention_min"], s.attention_score)
        bucket["focus_sum"] += s.focus_score
        bucket["state_counts"][s.state.value] = bucket["state_counts"].get(s.state.value, 0) + 1

        for flag, raised in s.flags.model_dump().items():
            if raised:
                bucket["flag_counts"][flag] = bucket["flag_counts"].get(flag, 0) + 1

        # Blink = falling edge of eye closure (open -> closed).
        if s.eye_metrics is not None:
            avg_ear = (s.eye_metrics.ear_left + s.eye_metrics.ear_right) / 2
            closed = avg_ear < settings.BLINK_EAR_THRESHOLD
            if closed and not bucket["_eyes_closed_prev"]:
                bucket["blink_count"] += 1
            bucket["_eyes_closed_prev"] = closed

        # Head-motion variability.
        if s.head_pose is not None:
            bucket["yaw_n"] += 1
            bucket["yaw_sum"] += s.head_pose.yaw
            bucket["yaw_sumsq"] += s.head_pose.yaw ** 2
            bucket["pitch_sum"] += s.head_pose.pitch
            bucket["pitch_sumsq"] += s.head_pose.pitch ** 2

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def raw(self, session_id: str) -> dict:
        return self._require(session_id)

    def _require(self, session_id: str) -> dict:
        self._evict_expired()
        bucket = self._store.get(session_id)
        if bucket is None:
            raise SessionNotFoundError(session_id)
        return bucket

    def _evict_expired(self) -> None:
        cutoff = (time.time() - settings.SESSION_TTL_SECONDS) * 1000
        expired = [sid for sid, b in self._store.items() if b["last_seen"] < cutoff]
        for sid in expired:
            self._store.pop(sid, None)

    def _to_response(self, session_id: str) -> SessionResponse:
        data = self._store[session_id]
        return SessionResponse(
            session_id=session_id,
            student_id=data["student_id"],
            created_at=data["created_at"],
            frame_count=data["frame_count"],
            status=data["status"],
        )
