from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_file_override=False,   # don't crash if .env is absent
    )

    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    API_KEY: str = Field(default="dev-secret-key", description="Secret API key for auth")
    CORS_ORIGINS: List[str] = [
        "https://featuredeskx.netlify.app",
        "http://localhost:5173",
    ]
    LOG_LEVEL: str = "INFO"

    # Frame constraints
    MAX_FRAME_WIDTH: int = 1280
    MAX_FRAME_HEIGHT: int = 720

    # Model paths
    YOLO_MODEL_PATH: str = "models/yolo11n.pt"
    BEST_MODEL_PATH: str = "models/best.pt"
    FACE_LANDMARKER_PATH: str = "models/face_landmarker.task"
    POSE_LANDMARKER_PATH: str = "models/pose_landmarker_lite.task"

    # Load every CV model at startup (True) or lazily on first frame (False).
    PRELOAD_MODELS: bool = False

    # Behaviour tuning
    BLINK_EAR_THRESHOLD: float = 0.21
    LOOKING_AWAY_YAW_DEG: float = 25.0
    LOOKING_AWAY_PITCH_DEG: float = 20.0

    # Time-based attention escalation (seconds of continuous eye closure).
    # <= DROWSY is treated as a normal blink/rest (stays Focused).
    DROWSY_SECONDS: float = 7.0        # > this  -> Distracted ("attention less")
    INATTENTIVE_SECONDS: float = 12.0  # > this  -> Distracted ("no attention")
    SLEEP_SECONDS: float = 20.0        # > this  -> "Sleeping"

    # Statistical attention engine
    MAX_FACES: int = 5
    ATTENTION_WINDOW_SECONDS: float = 4.0   # sliding window for PERCLOS / motion
    ATTENTION_EMA_ALPHA: float = 0.3        # smoothing (higher = more responsive)
    HEAD_MOTION_REF_DEG: float = 12.0       # yaw+pitch std at which motion is "high"
    FOCUS_ATTENTION_THRESHOLD: float = 60.0 # >= this with eyes open -> Focused

    # Session lifecycle / limits
    SESSION_TTL_SECONDS: int = 3600
    RATE_LIMIT_MAX_CALLS: int = 300
    RATE_LIMIT_WINDOW_SECONDS: int = 60


settings = Settings()