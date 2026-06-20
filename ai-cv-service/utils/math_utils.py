import numpy as np
from typing import List


def ear(eye_landmarks: List) -> float:
    """Eye Aspect Ratio from 6 landmark points."""
    p1, p2, p3, p4, p5, p6 = eye_landmarks
    vertical1 = np.linalg.norm(np.array(p2) - np.array(p6))
    vertical2 = np.linalg.norm(np.array(p3) - np.array(p5))
    horizontal = np.linalg.norm(np.array(p1) - np.array(p4))
    return (vertical1 + vertical2) / (2.0 * horizontal)


def rotation_matrix_to_euler(R: np.ndarray) -> tuple[float, float, float]:
    """Decompose rotation matrix → (yaw, pitch, roll) in degrees."""
    sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    singular = sy < 1e-6
    if not singular:
        x = np.arctan2(R[2, 1], R[2, 2])
        y = np.arctan2(-R[2, 0], sy)
        z = np.arctan2(R[1, 0], R[0, 0])
    else:
        x = np.arctan2(-R[1, 2], R[1, 1])
        y = np.arctan2(-R[2, 0], sy)
        z = 0.0
    return tuple(np.degrees([x, y, z]))
