import numpy as np
from core.exceptions import FrameValidationError


def validate_frame_shape(frame: np.ndarray) -> None:
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise FrameValidationError(f"Expected HxWx3 frame, got shape {frame.shape}")
    h, w = frame.shape[:2]
    if h < 16 or w < 16:
        raise FrameValidationError(f"Frame too small: {w}x{h}")
