from typing import Optional


class AttentionScorer:
    """Instantaneous *spatial* attention 0–100 from where the head/eyes point.

    Eye closure is deliberately NOT penalised here — drowsiness is a temporal
    signal owned by the statistical engine (PERCLOS + closure duration). This
    keeps a normal blink from tanking the score.
    """

    def score(self, head: Optional[dict], eye: Optional[dict]) -> float:
        if head is None and eye is None:
            return 0.0
        score = 100.0
        if head:
            score -= min(abs(head["yaw"]) / 45.0, 1.0) * 30     # turning away
            score -= min(abs(head["pitch"]) / 30.0, 1.0) * 20   # looking down/up
        if eye and eye.get("gaze_x") is not None:
            score -= min(abs(eye["gaze_x"]) / 0.6, 1.0) * 20    # eyes off-centre (x)
            score -= min(abs(eye.get("gaze_y", 0.0)) / 0.6, 1.0) * 15  # off-centre (y)
        return max(0.0, min(100.0, round(score, 2)))
