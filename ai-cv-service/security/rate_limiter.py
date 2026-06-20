from collections import defaultdict
from time import time
from fastapi import Request, HTTPException


class InMemoryRateLimiter:
    """Simple fixed-window rate limiter (per API key)."""

    def __init__(self, max_calls: int = 100, window_seconds: int = 60) -> None:
        self._max = max_calls
        self._window = window_seconds
        self._calls: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        now = time()
        window_start = now - self._window
        self._calls[key] = [t for t in self._calls[key] if t > window_start]
        if len(self._calls[key]) >= self._max:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        self._calls[key].append(now)
