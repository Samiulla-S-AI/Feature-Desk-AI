# FeatureDesk CV Service

An **independent** computer-vision microservice for the Feature Desk platform. It
analyses a student's webcam frames during exams/lessons and returns **JSON** for
the Student / Teacher / Admin dashboards:

- **Attention** — composite 0–100 score from gaze, head pose and eye state
- **Eye blink** — EAR-based blink detection and per-session blink rate
- **Head motion** — yaw / pitch / roll and head-motion variability
- **Objects** — phone / multiple-face / left-desk flags

It does **not** touch the React/Vite frontend or its Supabase database. The frontend
talks to it over HTTP/WebSocket and stores whatever JSON it wants. Raw frames are
analysed in memory and **never persisted**.

> This service complements the frontend's existing `proctoringService.ts` (which
> only covers browser events: tab-switch, copy/paste, screenshots). This adds the
> camera/vision dimension it lacks.

## Architecture

```
Frontend (React/Vite, Netlify)
   │  HTTPS frame  /  WSS stream   (X-API-Key)
   ▼
Edge      middleware/ + security/   CORS · API-key · rate-limit · timing · errors
API       api/v1/                   REST routes · WebSocket · Pydantic schemas
Service   services/                 analysis · session (aggregation) · report
Domain    vision/ tracking/ behavior/   perception → identity → scoring/flags/state
Infra     loaders/ core/ utils/ models/  singleton model loading · config · logging
```

Layered Clean Architecture; dependencies point inward. Stateless per frame —
session state is in-memory with TTL, so REST scales horizontally (WebSocket needs
sticky sessions).

## API (`/api/v1`, all but `/health` require `X-API-Key`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + `models_loaded` readiness |
| POST | `/sessions` | Start a session → `session_id` |
| GET | `/sessions/{id}` | Live session status |
| POST | `/sessions/{id}/close` | Finalise (marks `completed`/`flagged`) |
| GET | `/sessions/{id}/report` | Aggregated dashboard report |
| **POST** | **`/analysis/live`** | **Flat dashboard JSON (primary client contract)** |
| WS | `/ws/live/{session_id}` | Live stream of the flat JSON (binary in → JSON out) |
| POST | `/analysis/frame` | Detailed multi-student analysis |
| WS | `/ws/stream/{session_id}` | Detailed multi-student stream |

### Live response (`POST /analysis/live`) — the contract the client wires to their dashboard
```json
{ "student_id": "S001", "status": "Focused", "attention": 94, "phone": false, "faces": 1 }
```
`status` is one of `Focused | Distracted | Sleeping | Absent`. Send `student_id`
(e.g. `"S001"`), `session_id` and `frame_b64` in the request body. For continuous
live detection, open `WS /ws/live/{session_id}?student_id=S001` and push frame bytes.

### Detailed per-frame response (`POST /analysis/frame`)
```jsonc
{
  "session_id": "…", "timestamp_ms": 0, "frame_id": 0, "processing_ms": 38.0,
  "students": [{
    "student_id": "0", "track_id": 0,
    "attention_score": 82, "focus_score": 80, "state": "focused",
    "head_pose": { "yaw": -4.2, "pitch": 3.1, "roll": 0.5 },
    "eye_metrics": { "ear_left": 0.31, "ear_right": 0.30, "gaze_x": 0.0, "gaze_y": 0.0 },
    "flags": { "phone_detected": false, "left_desk": false, "eyes_closed": false, "looking_away": false }
  }]
}
```

### Session report (`GET /sessions/{id}/report`)
`avg_attention`, `min_attention`, `blink_count`, `blink_rate_per_min`,
`head_motion_yaw_std`, `dominant_state`, `state_breakdown`, `flag_counts`,
and a `verdict` of `attentive | needs_attention | flagged`.

## Try it on your own webcam first (local Tkinter tester)

Before the client wires this to their dashboard, verify it detects **your** face
and produces the right JSON — no server needed:

```bash
pip install -r requirements.txt          # core CV deps
pip install -r tools/requirements.txt    # pillow (tester UI only)
python download_models.py                # one-time model download
python tools/desktop_tester.py
```

A desktop window opens your webcam, draws the detected **face/person** (and any
**phone**) box, and shows the live JSON it would send to the dashboard
(`status`, `attention`, `phone`, `faces`). It runs the *exact same* pipeline as
the API, so what you see here is what the client receives. The first frame takes
a few seconds while models load.

## Run locally ($0, no cloud)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python download_models.py            # fetches free YOLO11n + MediaPipe weights
cp .env.example .env                 # set API_KEY
uvicorn app:app --host 0.0.0.0 --port 8000
# docs at http://localhost:8000/docs when DEBUG=true
```

Or with Docker:
```bash
docker compose -f docker/docker-compose.yml up --build
```

## Frontend integration (no frontend code changed)

Point the frontend at the service with one env var, then POST frames:

```ts
// VITE_CV_SERVICE_URL + VITE_CV_API_KEY in the frontend .env
const res = await fetch(`${import.meta.env.VITE_CV_SERVICE_URL}/api/v1/analysis/live`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": import.meta.env.VITE_CV_API_KEY },
  body: JSON.stringify({ session_id, student_id, frame_b64 }) // frame_b64 = canvas.toDataURL().split(",")[1]
});
const r = await res.json();
// { student_id: "S001", status: "Focused", attention: 94, phone: false, faces: 1 }
```

## Configuration

All via env (see `.env.example`): `API_KEY`, `CORS_ORIGINS`, model paths,
`PRELOAD_MODELS`, `BLINK_EAR_THRESHOLD`, `LOOKING_AWAY_*_DEG`, `SESSION_TTL_SECONDS`,
rate-limit window.

## Tests

```bash
pytest tests/            # vision + behavior unit tests, REST + WS integration tests
```

## Models (free, CPU-only)

| File | Role |
|---|---|
| `yolo11n.pt` | Phone / person / object detection (Ultralytics) |
| `face_landmarker.task` | Face mesh → eyes, blink, gaze, head pose (MediaPipe) |
| `pose_landmarker_lite.task` | Body / head motion (MediaPipe) |

Weights are gitignored and fetched by `download_models.py` at build time.
