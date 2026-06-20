import time

from api.v1.schemas.requests import FrameAnalysisRequest
from api.v1.schemas.responses import (
    AnalysisResponse,
    BehaviorFlags,
    EyeMetrics,
    HeadPose,
    StudentAnalysis,
)
from utils.image_utils import decode_base64_frame
from vision.detector import YOLODetector
from vision.face_analyzer import FaceAnalyzer
from vision.head_pose import HeadPoseEstimator
from vision.eye_tracker import EyeTracker
from vision.object_classifier import ObjectClassifier
from behavior.attention_scorer import AttentionScorer
from behavior.attention_engine import AttentionEngine
from behavior.flag_detector import FlagDetector
from core.logger import get_logger

logger = get_logger(__name__)


class AnalysisService:
    """CV -> behaviour pipeline for one frame.

    Faces come straight from MediaPipe on the full frame (reliable, multi-face).
    YOLO is used only for object detection (phone). Attention is produced by the
    statistical AttentionEngine (PERCLOS + head-motion + EMA + closure duration).
    """

    def __init__(self) -> None:
        self._detector = YOLODetector()
        self._face = FaceAnalyzer()
        self._head_pose = HeadPoseEstimator()
        self._eye = EyeTracker()
        self._obj_clf = ObjectClassifier()
        self._attention = AttentionScorer()
        self._engine = AttentionEngine()
        self._flags = FlagDetector()
        self._frame_counter: dict[str, int] = {}

    async def process_frame(self, req: FrameAnalysisRequest) -> AnalysisResponse:
        frame = decode_base64_frame(req.frame_b64)
        response, _, _ = self.run_pipeline(
            frame, req.session_id, req.timestamp_ms or int(time.time() * 1000)
        )
        return response

    def run_pipeline(self, frame, session_id: str, timestamp_ms: int):
        """Core synchronous pipeline. Returns (response, detections, faces) so
        callers that need the raw boxes (the Tkinter tester) can draw them."""
        t0 = time.monotonic()

        detections = self._detector.detect(frame)
        objects = self._obj_clf.classify(detections)
        faces = self._face.detect_faces(frame)

        students = []
        for idx, face in enumerate(faces):
            eye = self._eye.compute(face)
            head = self._head_pose.estimate(face)
            spatial = self._attention.score(head, eye)

            result = self._engine.update(idx, timestamp_ms, spatial, eye, head)
            flags = self._flags.detect(eye, objects, None, head)

            students.append(StudentAnalysis(
                student_id=str(idx),
                track_id=idx,
                attention_score=result.attention,
                focus_score=round(spatial, 1),
                state=result.state,
                head_pose=HeadPose(**head) if head else None,
                eye_metrics=EyeMetrics(**eye) if eye else None,
                head_motion=result.head_motion,
                perclos=result.perclos,
                flags=BehaviorFlags(**flags),
            ))

        frame_id = self._frame_counter.setdefault(session_id, 0)
        self._frame_counter[session_id] = frame_id + 1

        response = AnalysisResponse(
            session_id=session_id,
            timestamp_ms=timestamp_ms,
            frame_id=frame_id,
            students=students,
            processing_ms=round((time.monotonic() - t0) * 1000, 2),
        )
        return response, detections, faces
