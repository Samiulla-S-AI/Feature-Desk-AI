from core.config import settings


class MediaPipeLoader:
    _face = None
    _pose = None

    @classmethod
    def is_loaded(cls) -> bool:
        return cls._face is not None and cls._pose is not None

    @classmethod
    def face_instance(cls):
        if cls._face is None:
            import mediapipe as mp
            options = mp.tasks.vision.FaceLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(
                    model_asset_path=settings.FACE_LANDMARKER_PATH
                ),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_faces=settings.MAX_FACES,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            cls._face = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        return cls._face

    @classmethod
    def pose_instance(cls):
        if cls._pose is None:
            import mediapipe as mp
            options = mp.tasks.vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(
                    model_asset_path=settings.POSE_LANDMARKER_PATH
                ),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
            )
            cls._pose = mp.tasks.vision.PoseLandmarker.create_from_options(options)
        return cls._pose
