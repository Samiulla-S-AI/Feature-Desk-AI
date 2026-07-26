from typing import Optional


class FocusScorer:
    """Produces a focus score 0–100 combining pose and attention signals."""

    def score(
        self,
        head: Optional[dict],
        eye: Optional[dict],
        pose: Optional[dict],
    ) -> float:
        base = 100.0
        if head is None:
            base -= 50
        if pose is None:
            base -= 20
        return max(0.0, min(100.0, round(base, 2)))
