from typing import Optional
import numpy as np
import cv2
import mediapipe as mp


class PoseAnalyzer:
    """MediaPipe pose landmark analysis."""

    def __init__(self) -> None:
        self._mp = None

    def _load(self):
        from loaders.mediapipe_loader import MediaPipeLoader
        self._mp = MediaPipeLoader.pose_instance()

    def analyse(self, frame: np.ndarray, roi: tuple) -> Optional[dict]:
        if self._mp is None:
            self._load()

        # Clamp ROI to frame bounds.
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = roi
        x1, y1 = max(0, int(x1)), max(0, int(y1))
        x2, y2 = min(w, int(x2)), min(h, int(y2))
        if x2 <= x1 or y2 <= y1:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        # MediaPipe Tasks expects an mp.Image (SRGB), not a raw ndarray.
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=crop_rgb)

        result = self._mp.detect(mp_image)
        if not result.pose_landmarks:
            return None
        return {"landmarks": result.pose_landmarks[0]}
