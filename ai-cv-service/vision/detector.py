from dataclasses import dataclass
from typing import List
import numpy as np


@dataclass
class Detection:
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    class_name: str


class YOLODetector:
    """Wraps YOLO11 for object detection. Lazy-loads the model on first call."""

    def __init__(self) -> None:
        self._model = None

    def _load(self):
        from loaders.yolo_loader import YOLOLoader
        self._model = YOLOLoader.instance()

    def detect(self, frame: np.ndarray) -> List[Detection]:
        if self._model is None:
            self._load()
        results = self._model(frame, verbose=False)[0]
        detections = []
        for box in results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append(Detection(
                bbox=(x1, y1, x2, y2),
                confidence=float(box.conf[0]),
                class_id=int(box.cls[0]),
                class_name=results.names[int(box.cls[0])],
            ))
        return detections
