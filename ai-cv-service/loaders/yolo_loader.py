from loaders.base_loader import BaseLoader
from core.config import settings


class YOLOLoader(BaseLoader):
    @classmethod
    def _load_model(cls):
        from ultralytics import YOLO
        return YOLO(settings.YOLO_MODEL_PATH)
