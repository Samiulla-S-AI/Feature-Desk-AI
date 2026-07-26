import base64
import numpy as np
import cv2
from core.config import settings
from core.exceptions import FrameValidationError


def decode_base64_frame(b64: str) -> np.ndarray:
    try:
        raw = base64.b64decode(b64)
        buf = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    except Exception as e:
        raise FrameValidationError(f"Could not decode frame: {e}") from e
    if frame is None:
        raise FrameValidationError("Decoded frame is None — invalid image data")
    return resize_frame(frame)


def resize_frame(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    max_w, max_h = settings.MAX_FRAME_WIDTH, settings.MAX_FRAME_HEIGHT
    if w > max_w or h > max_h:
        scale = min(max_w / w, max_h / h)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    return frame
