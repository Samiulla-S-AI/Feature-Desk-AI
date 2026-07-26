from dataclasses import dataclass, field
from typing import Optional, List
import numpy as np


import cv2
import mediapipe as mp


@dataclass
class FaceResult:
    landmarks: Optional[List] = None
    bbox: Optional[tuple] = None          # face box in pixels (x1, y1, x2, y2)
    image_size: Optional[tuple] = None    # (W, H) the landmarks are normalised to
    confidence: float = 0.0


class FaceAnalyzer:
    """MediaPipe face landmark analysis."""

    def __init__(self) -> None:
        self._mp = None

    def _load(self):
        from loaders.mediapipe_loader import MediaPipeLoader
        self._mp = MediaPipeLoader.face_instance()

    def detect_faces(self, frame: np.ndarray) -> List[FaceResult]:
        """Detect every face in the FULL frame (the reliable MediaPipe path).
        Returns one FaceResult per face, landmarks normalised to the frame."""
        if self._mp is None:
            self._load()

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._mp.detect(mp_image)

        faces: List[FaceResult] = []
        for landmarks in (result.face_landmarks or []):
            xs = [lm.x for lm in landmarks]
            ys = [lm.y for lm in landmarks]
            bbox = (
                max(0, int(min(xs) * w)), max(0, int(min(ys) * h)),
                min(w, int(max(xs) * w)), min(h, int(max(ys) * h)),
            )
            faces.append(FaceResult(landmarks=landmarks, bbox=bbox, image_size=(w, h)))
        return faces

    def analyse(self, frame: np.ndarray, roi: tuple) -> Optional[FaceResult]:
        """Legacy ROI-crop path (kept for unit tests / single-ROI callers)."""
        if self._mp is None:
            self._load()

        h, w = frame.shape[:2]
        x1, y1, x2, y2 = roi
        x1, y1 = max(0, int(x1)), max(0, int(y1))
        x2, y2 = min(w, int(x2)), min(h, int(y2))
        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=crop_rgb)
        result = self._mp.detect(mp_image)
        if not result.face_landmarks:
            return None

        return FaceResult(landmarks=result.face_landmarks[0], bbox=(x1, y1, x2, y2))

