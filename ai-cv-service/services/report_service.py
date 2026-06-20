import math

from api.v1.schemas.responses import (
    AttentionState,
    FlagSummary,
    SessionReport,
    StateBreakdown,
)


def _std(n: int, total: float, total_sq: float) -> float:
    if n < 2:
        return 0.0
    variance = (total_sq - (total * total) / n) / (n - 1)
    return math.sqrt(max(variance, 0.0))


class ReportService:
    """Turns a session aggregate bucket into the dashboard-facing SessionReport."""

    def build(self, session_id: str, bucket: dict) -> SessionReport:
        frames = bucket["frame_count"]
        with_face = bucket["frames_with_face"]

        avg_attention = bucket["attention_sum"] / with_face if with_face else 0.0
        avg_focus = bucket["focus_sum"] / with_face if with_face else 0.0
        min_attention = bucket["attention_min"] if with_face else 0.0

        ended_at = bucket["ended_at"] or bucket["last_seen"]
        duration_s = max(0.0, (ended_at - bucket["created_at"]) / 1000.0)
        blink_rate = (bucket["blink_count"] / (duration_s / 60.0)) if duration_s > 0 else 0.0

        state_counts = bucket["state_counts"]
        dominant = (
            max(state_counts, key=state_counts.get)
            if any(state_counts.values())
            else AttentionState.ABSENT.value
        )

        flag_counts = bucket["flag_counts"]
        verdict = self._verdict(avg_attention, flag_counts, frames)

        return SessionReport(
            session_id=session_id,
            student_id=bucket["student_id"],
            status=bucket["status"],
            created_at=bucket["created_at"],
            ended_at=bucket["ended_at"],
            duration_seconds=round(duration_s, 2),
            frames_analyzed=frames,
            frames_with_face=with_face,
            avg_attention=round(avg_attention, 2),
            min_attention=round(min_attention, 2),
            avg_focus=round(avg_focus, 2),
            blink_count=bucket["blink_count"],
            blink_rate_per_min=round(blink_rate, 2),
            head_motion_yaw_std=round(
                _std(bucket["yaw_n"], bucket["yaw_sum"], bucket["yaw_sumsq"]), 2
            ),
            head_motion_pitch_std=round(
                _std(bucket["yaw_n"], bucket["pitch_sum"], bucket["pitch_sumsq"]), 2
            ),
            dominant_state=AttentionState(dominant),
            state_breakdown=StateBreakdown(**state_counts),
            flag_counts=FlagSummary(**flag_counts),
            verdict=verdict,
        )

    @staticmethod
    def _verdict(avg_attention: float, flag_counts: dict, frames: int) -> str:
        if flag_counts.get("phone_detected", 0) > 0:
            return "flagged"
        if frames and flag_counts.get("looking_away", 0) > frames * 0.4:
            return "flagged"
        if avg_attention < 50:
            return "needs_attention"
        return "attentive"
