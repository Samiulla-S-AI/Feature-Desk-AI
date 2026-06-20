from abc import ABC, abstractmethod


class BaseLoader(ABC):
    """Abstract base for singleton model loaders."""

    _instance = None

    @classmethod
    def instance(cls):
        if cls.__dict__.get("_instance") is None:
            cls._instance = cls._load_model()
        return cls._instance

    @classmethod
    def is_loaded(cls) -> bool:
        return cls.__dict__.get("_instance") is not None

    @classmethod
    @abstractmethod
    def _load_model(cls):
        ...
