import pytest
import numpy as np
from unittest.mock import MagicMock
from vision.face_analyzer import FaceAnalyzer, FaceResult
from vision.eye_tracker import EyeTracker
from vision.head_pose import HeadPoseEstimator


class MockLandmark:
    def __init__(self, x: float, y: float, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z


@pytest.fixture
def mock_landmarks():
    # Create 478 mock landmarks
    lms = [MockLandmark(0.5, 0.5, 0.0) for _ in range(478)]
    
    # Configure left eye landmarks
    lms[362] = MockLandmark(0.45, 0.5)  # Nasal corner
    lms[263] = MockLandmark(0.55, 0.5)  # Temporal corner
    lms[386] = MockLandmark(0.5, 0.45)  # Top center
    lms[374] = MockLandmark(0.5, 0.55)  # Bottom center
    lms[385] = MockLandmark(0.48, 0.46)
    lms[387] = MockLandmark(0.52, 0.46)
    lms[373] = MockLandmark(0.48, 0.54)
    lms[380] = MockLandmark(0.52, 0.54)
    lms[468] = MockLandmark(0.5, 0.5)   # Iris center (gaze centered)
    
    # Configure right eye landmarks
    lms[33] = MockLandmark(0.35, 0.5)   # Temporal corner
    lms[133] = MockLandmark(0.45, 0.5)  # Nasal corner
    lms[159] = MockLandmark(0.4, 0.45)  # Top center
    lms[145] = MockLandmark(0.4, 0.55)  # Bottom center
    lms[160] = MockLandmark(0.38, 0.46)
    lms[158] = MockLandmark(0.42, 0.46)
    lms[153] = MockLandmark(0.38, 0.54)
    lms[144] = MockLandmark(0.42, 0.54)
    lms[473] = MockLandmark(0.4, 0.5)   # Iris center (gaze centered)

    # Configure other key landmarks for head pose
    lms[4] = MockLandmark(0.5, 0.5)     # Nose tip
    lms[152] = MockLandmark(0.5, 0.8)   # Chin
    lms[61] = MockLandmark(0.4, 0.7)    # Right mouth corner
    lms[291] = MockLandmark(0.6, 0.7)   # Left mouth corner

    return lms


def test_eye_tracker_gaze_and_ear(mock_landmarks):
    tracker = EyeTracker()
    face = FaceResult(landmarks=mock_landmarks, bbox=(100, 100, 300, 300))
    res = tracker.compute(face)
    
    assert res is not None
    assert "ear_left" in res
    assert "ear_right" in res
    assert "gaze_x" in res
    assert "gaze_y" in res
    
    # Since the gaze is centered, the relative gaze offsets should be close to 0
    assert abs(res["gaze_x"]) < 0.01
    assert abs(res["gaze_y"]) < 0.01
    
    # Let's shift the gaze left (both irises shift in the negative x direction)
    mock_landmarks[468].x = 0.48  # left iris shifts nasal (towards 362)
    mock_landmarks[473].x = 0.38  # right iris shifts temporal (towards 33)
    res_left = tracker.compute(FaceResult(landmarks=mock_landmarks, bbox=(100, 100, 300, 300)))
    assert res_left["gaze_x"] < 0.0  # looking left (relative to center)


def test_head_pose_estimator(mock_landmarks):
    estimator = HeadPoseEstimator()
    face = FaceResult(landmarks=mock_landmarks, bbox=(100, 100, 300, 300))
    pose = estimator.estimate(face)
    
    assert pose is not None
    assert "yaw" in pose
    assert "pitch" in pose
    assert "roll" in pose


def test_face_analyzer_empty_roi():
    analyzer = FaceAnalyzer()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Invalid ROI (x2 <= x1)
    res = analyzer.analyse(frame, (100, 100, 50, 100))
    assert res is None
    
    # Invalid ROI (out of bounds)
    res = analyzer.analyse(frame, (-10, -10, -5, -5))
    assert res is None


def test_face_analyzer_mock_mp():
    analyzer = FaceAnalyzer()
    mock_mp = MagicMock()
    analyzer._mp = mock_mp
    
    # Mock return value of detect
    mock_res = MagicMock()
    mock_res.face_landmarks = [["dummy_landmark"]]
    mock_mp.detect.return_value = mock_res
    
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    res = analyzer.analyse(frame, (100, 100, 200, 200))
    
    assert res is not None
    assert res.landmarks == ["dummy_landmark"]
    assert res.bbox == (100, 100, 200, 200)
    mock_mp.detect.assert_called_once()
