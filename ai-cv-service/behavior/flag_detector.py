from typing import Optional
from core.config import settings


class FlagDetector:
    """Detects boolean behavioral flags from eye, object, head and pose data."""

    def detect(
        self,
        eye: Optional[dict],
        objects: dict,
        pose: Optional[dict],
        head: Optional[dict] = None,
    ) -> dict:
        eyes_closed = False
        if eye:
            avg_ear = (eye["ear_left"] + eye["ear_right"]) / 2
            eyes_closed = avg_ear < settings.BLINK_EAR_THRESHOLD

        looking_away = False
        if head:
            looking_away = (
                abs(head["yaw"]) > settings.LOOKING_AWAY_YAW_DEG
                or abs(head["pitch"]) > settings.LOOKING_AWAY_PITCH_DEG
            )

        return {
            "phone_detected": objects.get("phone", False),
            "left_desk": pose is None,
            "eyes_closed": eyes_closed,
            "looking_away": looking_away,
        }
