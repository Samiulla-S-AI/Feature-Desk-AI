import numpy as np
from typing import Optional
from vision.face_analyzer import FaceResult
from utils.math_utils import ear


class EyeTracker:
    """Computes Eye Aspect Ratio (EAR) and gaze direction."""

    EAR_THRESHOLD = 0.21

    # Left eye indices (nasal to temporal: 362 to 263, vertical: 385/387 to 373/380)
    LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
    # Right eye indices (temporal to nasal: 33 to 133, vertical: 160/158 to 153/144)
    RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]

    def compute(self, face: Optional[FaceResult]) -> Optional[dict]:
        if face is None or face.landmarks is None:
            return None
        
        landmarks = face.landmarks
        if face.image_size:
            crop_w, crop_h = face.image_size
        else:
            crop_w = face.bbox[2] - face.bbox[0]
            crop_h = face.bbox[3] - face.bbox[1]

        # Calculate Left Eye EAR
        left_pts = [np.array([landmarks[idx].x * crop_w, landmarks[idx].y * crop_h]) for idx in self.LEFT_EYE_INDICES]
        ear_left = float(ear(left_pts))

        # Calculate Right Eye EAR
        right_pts = [np.array([landmarks[idx].x * crop_w, landmarks[idx].y * crop_h]) for idx in self.RIGHT_EYE_INDICES]
        ear_right = float(ear(right_pts))

        # Gaze tracking via Iris landmarks
        gaze_x = 0.0
        gaze_y = 0.0
        if len(landmarks) >= 478:
            # Left Eye gaze
            left_nasal = landmarks[362]
            left_temporal = landmarks[263]
            left_iris = landmarks[468]
            left_center_x = (left_nasal.x + left_temporal.x) / 2
            left_eye_w = abs(left_temporal.x - left_nasal.x)
            
            left_top = landmarks[386]
            left_bottom = landmarks[374]
            left_center_y = (left_top.y + left_bottom.y) / 2
            left_eye_h = abs(left_bottom.y - left_top.y)
            
            gaze_left_x = (left_iris.x - left_center_x) / left_eye_w if left_eye_w > 0 else 0.0
            gaze_left_y = (left_iris.y - left_center_y) / left_eye_h if left_eye_h > 0 else 0.0

            # Right Eye gaze
            right_temporal = landmarks[33]
            right_nasal = landmarks[133]
            right_iris = landmarks[473]
            right_center_x = (right_temporal.x + right_nasal.x) / 2
            right_eye_w = abs(right_nasal.x - right_temporal.x)
            
            right_top = landmarks[159]
            right_bottom = landmarks[145]
            right_center_y = (right_top.y + right_bottom.y) / 2
            right_eye_h = abs(right_bottom.y - right_top.y)
            
            gaze_right_x = (right_iris.x - right_center_x) / right_eye_w if right_eye_w > 0 else 0.0
            gaze_right_y = (right_iris.y - right_center_y) / right_eye_h if right_eye_h > 0 else 0.0

            # Average gazes
            gaze_x = float((gaze_left_x + gaze_right_x) / 2)
            gaze_y = float((gaze_left_y + gaze_right_y) / 2)

        return {
            "ear_left": ear_left,
            "ear_right": ear_right,
            "gaze_x": gaze_x,
            "gaze_y": gaze_y,
        }

