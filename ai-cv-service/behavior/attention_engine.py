"""Statistical, temporal attention engine.

Replaces per-frame heuristics with proper time-window statistics per student:

* PERCLOS  — proportion of recent frames with eyes closed (standard drowsiness
  measure); a blink barely moves it, sustained closure drives it up.
* Head motion — standard deviation of yaw/pitch over the window (fidgeting /
  looking around lowers attention).
* EMA smoothing — exponential moving average so the score doesn't jitter.
* Closure-duration escalation — Focused -> attention-less -> no-attention ->
  Sleeping, using continuous eye-closure time.

All thresholds come from settings so they can be tuned without code changes.
"""
import math
import statistics
from collections import deque
from dataclasses import dataclass
from typing import Optional

from api.v1.schemas.responses import AttentionState
from core.config import settings


@dataclass
class EngineResult:
    attention: float
    state: AttentionState
    head_motion: float   # yaw+pitch std (deg) over the window
    perclos: float       # 0..1 fraction of window with eyes closed


@dataclass
class _Sample:
    ts: float            # seconds
    closed: bool
    yaw: float
    pitch: float


class AttentionEngine:
    """One sliding window + EMA per track_id."""

    def __init__(self) -> None:
        self._windows: dict[int, deque] = {}
        self._ema: dict[int, float] = {}
        self._closed_since: dict[int, Optional[float]] = {}

    def update(
        self,
        track_id: int,
        timestamp_ms: int,
        spatial_score: float,
        eye: Optional[dict],
        head: Optional[dict],
    ) -> EngineResult:
        ts = timestamp_ms / 1000.0

        # No usable face -> Absent, reset temporal state.
        if eye is None:
            self._windows.pop(track_id, None)
            self._ema.pop(track_id, None)
            self._closed_since[track_id] = None
            return EngineResult(0.0, AttentionState.ABSENT, 0.0, 0.0)

        avg_ear = (eye["ear_left"] + eye["ear_right"]) / 2
        closed = avg_ear < settings.BLINK_EAR_THRESHOLD
        yaw = head["yaw"] if head else 0.0
        pitch = head["pitch"] if head else 0.0

        win = self._windows.setdefault(track_id, deque())
        win.append(_Sample(ts, closed, yaw, pitch))
        cutoff = ts - settings.ATTENTION_WINDOW_SECONDS
        while win and win[0].ts < cutoff:
            win.popleft()

        # --- statistics over the window ---
        perclos = sum(1 for s in win if s.closed) / len(win)
        if len(win) >= 2:
            head_motion = statistics.pstdev([s.yaw for s in win]) + \
                statistics.pstdev([s.pitch for s in win])
        else:
            head_motion = 0.0

        # --- continuous eye-closure duration ---
        if closed:
            started = self._closed_since.get(track_id)
            if started is None:
                started = ts
            self._closed_since[track_id] = started
            closed_for = ts - started
        else:
            self._closed_since[track_id] = None
            closed_for = 0.0

        # A normal blink / short rest (closed but under the drowsy threshold) must
        # not move the score at all: eyes-closed makes gaze unreliable, so we hold
        # attention steady and keep the student Focused.
        if closed and closed_for < settings.DROWSY_SECONDS:
            attention = self._ema.get(track_id)
            if attention is None:
                attention = spatial_score
                self._ema[track_id] = attention
            state = (AttentionState.FOCUSED
                     if attention >= settings.FOCUS_ATTENTION_THRESHOLD
                     else AttentionState.DISTRACTED)
            return EngineResult(round(attention, 1), state,
                                round(head_motion, 1), round(perclos, 2))

        # --- composite raw attention (eyes open, or sustained closure) ---
        # NOTE: blink frequency (PERCLOS) deliberately does NOT reduce attention.
        # Blinking is normal; only *sustained* closure (>= DROWSY_SECONDS, handled
        # by the escalation below) counts as inattention. Attention is driven by
        # where the head/eyes point (spatial) and head stability (motion).
        motion_factor = max(0.0, 1.0 - head_motion / settings.HEAD_MOTION_REF_DEG)
        raw = spatial_score * (0.5 + 0.5 * motion_factor)

        # --- EMA smoothing ---
        alpha = settings.ATTENTION_EMA_ALPHA
        prev = self._ema.get(track_id, raw)
        attention = alpha * raw + (1 - alpha) * prev
        self._ema[track_id] = attention

        # --- time-based state escalation ---
        if closed_for >= settings.SLEEP_SECONDS:
            return EngineResult(0.0, AttentionState.SLEEPING, head_motion, perclos)
        if closed_for >= settings.INATTENTIVE_SECONDS:
            return EngineResult(min(attention, 10.0), AttentionState.DISTRACTED, head_motion, perclos)
        if closed_for >= settings.DROWSY_SECONDS:
            return EngineResult(min(attention, 45.0), AttentionState.DISTRACTED, head_motion, perclos)

        state = (AttentionState.FOCUSED
                 if attention >= settings.FOCUS_ATTENTION_THRESHOLD
                 else AttentionState.DISTRACTED)
        return EngineResult(round(attention, 1), state, round(head_motion, 1), round(perclos, 2))
