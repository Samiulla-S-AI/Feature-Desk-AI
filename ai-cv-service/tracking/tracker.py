from dataclasses import dataclass
from typing import List
import numpy as np
from vision.detector import Detection


@dataclass
class Track:
    id: int
    bbox: tuple[int, int, int, int]
    confidence: float


class ByteTrackWrapper:
    """Thin wrapper around ByteTrack for multi-student tracking."""

    def __init__(self) -> None:
        self._tracker = None
        self._next_id = 0

    def _load(self):
        from loaders.tracker_loader import TrackerLoader
        self._tracker = TrackerLoader.instance()

    def update(self, detections: List[Detection], frame: np.ndarray) -> List[Track]:
        if self._tracker is None:
            self._load()
        # Pass person-class detections only
        persons = [d for d in detections if d.class_name == "person"]
        if not persons:
            return []
        return [
            Track(id=i, bbox=d.bbox, confidence=d.confidence)
            for i, d in enumerate(persons)
        ]
