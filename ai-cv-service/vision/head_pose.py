import cv2
import numpy as np
from typing import Optional
from vision.face_analyzer import FaceResult
from utils.math_utils import rotation_matrix_to_euler


class HeadPoseEstimator:
    """Estimates yaw / pitch / roll from face landmarks using PnP solving."""

    # 3D model points of a standard human face (in millimeters)
    MODEL_POINTS = np.array([
        (0.0, 0.0, 0.0),             # Nose tip
        (0.0, -330.0, -65.0),        # Chin
        (-165.0, 170.0, -135.0),     # Right eye outer corner (viewer left)
        (165.0, 170.0, -135.0),      # Left eye outer corner (viewer right)
        (-150.0, -150.0, -125.0),    # Right mouth corner (viewer left)
        (150.0, -150.0, -125.0)      # Left mouth corner (viewer right)
    ], dtype=np.float32)

    # Indices of corresponding landmarks in the MediaPipe Face Mesh
    LANDMARK_INDICES = [4, 152, 33, 263, 61, 291]

    def estimate(self, face: Optional[FaceResult]) -> Optional[dict]:
        if face is None or face.landmarks is None:
            return None

        landmarks = face.landmarks
        if face.image_size:
            crop_w, crop_h = face.image_size
        else:
            crop_w = face.bbox[2] - face.bbox[0]
            crop_h = face.bbox[3] - face.bbox[1]

        # 2D image points (scaled to crop pixels)
        image_points = np.array([
            (landmarks[idx].x * crop_w, landmarks[idx].y * crop_h)
            for idx in self.LANDMARK_INDICES
        ], dtype=np.float32)

        # Approximate camera intrinsics matrix
        focal_length = crop_w
        center = (crop_w / 2, crop_h / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float32)

        # Assume no distortion (since it is a crop)
        dist_coeffs = np.zeros((4, 1), dtype=np.float32)

        # Solve for pose
        success, rvec, tvec = cv2.solvePnP(
            self.MODEL_POINTS,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )

        if not success:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}

        # Convert rotation vector to rotation matrix
        rmat, _ = cv2.Rodrigues(rvec)

        # Decompose rotation matrix into Euler angles
        euler = rotation_matrix_to_euler(rmat)
        # rotation_matrix_to_euler returns (pitch, yaw, roll) because:
        # x is pitch, y is yaw, z is roll.
        pitch, yaw, roll = euler[0], euler[1], euler[2]

        return {
            "yaw": float(yaw),
            "pitch": float(pitch),
            "roll": float(roll),
        }

