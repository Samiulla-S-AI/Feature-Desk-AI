"""Model loaders + lifecycle helpers.

`preload_all()` is called from the app lifespan when PRELOAD_MODELS is true;
otherwise each model loads lazily on its first frame. `all_loaded()` backs the
/health readiness probe.
"""
from core.logger import get_logger

logger = get_logger(__name__)


def preload_all() -> None:
    """Eagerly initialise every model singleton. Never raises — a missing weight
    file is logged and left to lazy-load (and surface) on first use instead of
    crash-looping the container."""
    from loaders.yolo_loader import YOLOLoader
    from loaders.mediapipe_loader import MediaPipeLoader
    from loaders.tracker_loader import TrackerLoader

    for name, fn in (
        ("yolo", YOLOLoader.instance),
        ("face_landmarker", MediaPipeLoader.face_instance),
        ("pose_landmarker", MediaPipeLoader.pose_instance),
        ("tracker", TrackerLoader.instance),
    ):
        try:
            fn()
            logger.info("model_loaded", model=name)
        except Exception as exc:  # noqa: BLE001 — readiness must not kill startup
            logger.error("model_load_failed", model=name, error=str(exc))


def all_loaded() -> bool:
    from loaders.yolo_loader import YOLOLoader
    from loaders.mediapipe_loader import MediaPipeLoader
    from loaders.tracker_loader import TrackerLoader

    return (
        YOLOLoader.is_loaded()
        and MediaPipeLoader.is_loaded()
        and TrackerLoader.is_loaded()
    )
