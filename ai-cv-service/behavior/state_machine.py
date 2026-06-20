import time
from typing import Optional, Tuple

from api.v1.schemas.responses import AttentionState
from core.config import settings


class StateMachine:
    """Time-aware per-student attention state.

    Escalates by how long the eyes have been *continuously* closed, so a normal
    blink never trips Sleeping:

        < DROWSY_SECONDS         -> instantaneous Focused / Distracted
        DROWSY..INATTENTIVE      -> Distracted, "attention less"  (attention capped)
        INATTENTIVE..SLEEP       -> Distracted, "no attention"    (attention near 0)
        >= SLEEP_SECONDS         -> Sleeping
        no face                  -> Absent

    Returns (state, adjusted_attention) so the score the dashboard shows reflects
    the sustained inattention, not just the current frame.
    """

    def __init__(self) -> None:
        self._closed_since: dict[int, Optional[int]] = {}

    def transition(
        self,
        track_id: int,
        attention: float,
        eye: Optional[dict],
        timestamp_ms: Optional[int] = None,
    ) -> Tuple[AttentionState, float]:
        ts = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)

        if eye is None:  # no face in this person's ROI
            self._closed_since[track_id] = None
            return AttentionState.ABSENT, 0.0

        avg_ear = (eye["ear_left"] + eye["ear_right"]) / 2
        eyes_closed = avg_ear < settings.BLINK_EAR_THRESHOLD

        if eyes_closed:
            started = self._closed_since.get(track_id)
            if started is None:
                started = ts
            self._closed_since[track_id] = started
            closed_for = (ts - started) / 1000.0
        else:
            self._closed_since[track_id] = None
            closed_for = 0.0

        if closed_for >= settings.SLEEP_SECONDS:
            return AttentionState.SLEEPING, 0.0
        if closed_for >= settings.INATTENTIVE_SECONDS:
            return AttentionState.DISTRACTED, min(attention, 10.0)   # no attention
        if closed_for >= settings.DROWSY_SECONDS:
            return AttentionState.DISTRACTED, min(attention, 45.0)   # attention less

        state = AttentionState.FOCUSED if attention >= 60 else AttentionState.DISTRACTED
        return state, attention
