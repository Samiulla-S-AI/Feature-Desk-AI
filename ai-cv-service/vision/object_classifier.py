from typing import List
from vision.detector import Detection

PHONE_CLASSES = {"cell phone"}
BOOK_CLASSES = {"book"}
LAPTOP_CLASSES = {"laptop"}


class ObjectClassifier:
    def classify(self, detections: List[Detection]) -> dict:
        names = {d.class_name.lower() for d in detections}
        return {
            "phone": bool(names & PHONE_CLASSES),
            "book": bool(names & BOOK_CLASSES),
            "laptop": bool(names & LAPTOP_CLASSES),
        }
