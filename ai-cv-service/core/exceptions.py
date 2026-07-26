class FeatureDeskError(Exception):
    """Base exception for all service errors."""


class FrameValidationError(FeatureDeskError):
    """Raised when an incoming frame fails validation."""


class ModelNotLoadedError(FeatureDeskError):
    """Raised when a model loader hasn't initialised yet."""


class SessionNotFoundError(FeatureDeskError):
    """Raised when a session ID is unknown."""


class AnalysisPipelineError(FeatureDeskError):
    """Raised when the vision/behavior pipeline fails."""
