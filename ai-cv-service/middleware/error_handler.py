from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from core.exceptions import (
    FrameValidationError,
    SessionNotFoundError,
    AnalysisPipelineError,
    ModelNotLoadedError,
)


def add_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(FrameValidationError)
    async def frame_validation_handler(request: Request, exc: FrameValidationError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(SessionNotFoundError)
    async def session_not_found_handler(request: Request, exc: SessionNotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ModelNotLoadedError)
    async def model_not_loaded_handler(request: Request, exc: ModelNotLoadedError):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(AnalysisPipelineError)
    async def pipeline_handler(request: Request, exc: AnalysisPipelineError):
        return JSONResponse(status_code=500, content={"detail": str(exc)})
