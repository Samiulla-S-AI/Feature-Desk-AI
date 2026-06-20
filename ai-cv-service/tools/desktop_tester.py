"""
FeatureDesk CV Service — Local Desktop Tester (Tkinter)
=======================================================

Verifies the computer-vision pipeline on YOUR webcam BEFORE the client wires it
to their dashboard. Left = small live preview with bounding boxes. Right = a
behaviour dashboard + the exact flat JSON the client receives:

    {"student_id": "S001", "status": "Focused", "attention": 94,
     "phone": false, "faces": 1}

Run (repo root, venv active):

    pip install -r requirements.txt
    pip install -r tools/requirements.txt
    python download_models.py
    python tools/desktop_tester.py
"""
import os
import sys

# Quieten MediaPipe / TF-Lite C++ logging *before* those libs are imported.
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import time
import queue
import traceback
import threading
import tkinter as tk
from tkinter import ttk

import cv2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from PIL import Image, ImageTk
except ImportError:
    raise SystemExit("This tester needs Pillow for the video preview:  pip install pillow")

from services.analysis_service import AnalysisService
from api.v1.schemas.responses import LiveAnalysisResponse

STUDENT_ID = "S001"
SESSION_ID = "local-test"
TARGET_FPS = 10

# BGR colours for OpenCV overlay.
GREEN = (0, 200, 0)
RED = (0, 0, 230)
YELLOW = (0, 200, 230)
STATE_COLORS_BGR = {
    "focused": (0, 200, 0),
    "distracted": (0, 165, 255),
    "sleeping": (0, 0, 230),
    "absent": (150, 150, 150),
}

# UI palette.
BG = "#0f1117"
CARD = "#1a1f2e"
MUTED = "#9ca3af"
PREVIEW_W, PREVIEW_H = 380, 285

STATE_COLORS = {
    "Focused": "#22c55e",
    "Distracted": "#f59e0b",
    "Sleeping": "#ef4444",
    "Absent": "#6b7280",
}


def open_camera(index: int):
    """Try the fast DirectShow backend first (Windows), then the default."""
    backends = [cv2.CAP_DSHOW, cv2.CAP_ANY] if os.name == "nt" else [cv2.CAP_ANY]
    for backend in backends:
        cap = cv2.VideoCapture(index, backend)
        if cap.isOpened():
            return cap
        cap.release()
    return None


class CameraWorker(threading.Thread):
    """Grabs frames, runs the pipeline off the UI thread, pushes results to a
    queue. Never blocks the UI: it keeps only the latest frame in the queue."""

    def __init__(self, cam_index: int, out_queue: "queue.Queue") -> None:
        super().__init__(daemon=True)
        self._cam_index = cam_index
        self._queue = out_queue
        self._stop = threading.Event()
        self._service = AnalysisService()

    def stop(self) -> None:
        self._stop.set()

    def _emit(self, kind: str, payload) -> None:
        # Keep only the freshest item so a slow UI can never stall the worker.
        try:
            self._queue.put_nowait((kind, payload))
        except queue.Full:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait((kind, payload))
            except queue.Full:
                pass

    def run(self) -> None:
        try:
            cap = open_camera(self._cam_index)
            if cap is None:
                self._emit("error", f"Could not open camera index {self._cam_index}. "
                           "Close other apps using the webcam (Camera, Zoom, Meet) "
                           "and try index 0 or 1.")
                return
            self._emit("status", "Camera opened. Loading models (first frame is slow)…")

            min_dt = 1.0 / TARGET_FPS
            frames = 0
            while not self._stop.is_set():
                t0 = time.monotonic()
                ok, frame = cap.read()
                if not ok or frame is None:
                    self._emit("error", "Camera opened but returned no frame "
                               "(privacy shutter? wrong index?).")
                    time.sleep(0.2)
                    continue

                frame = cv2.flip(frame, 1)  # mirror, selfie-style
                try:
                    response, detections, faces = self._service.run_pipeline(
                        frame, SESSION_ID, int(time.time() * 1000)
                    )
                    live = LiveAnalysisResponse.from_analysis(response, STUDENT_ID)
                    annotated = self._annotate(frame, detections, faces, response, live)
                    frames += 1
                    self._emit("frame", (annotated, live, response, frames))
                except Exception:
                    self._emit("error", traceback.format_exc())
                    time.sleep(0.3)

                elapsed = time.monotonic() - t0
                if elapsed < min_dt:
                    time.sleep(min_dt - elapsed)

            cap.release()
        except Exception:
            self._emit("error", traceback.format_exc())

    @staticmethod
    def _annotate(frame, detections, faces, response, live):
        for i, face in enumerate(faces):
            x1, y1, x2, y2 = face.bbox
            student = response.students[i] if i < len(response.students) else None
            label = student.state.value if student else "?"
            colour = STATE_COLORS_BGR.get(label, GREEN)
            cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
            cv2.putText(frame, f"FACE / {label}", (x1, max(0, y1 - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)
        for d in detections:
            if d.class_name.lower() == "cell phone":
                x1, y1, x2, y2 = d.bbox
                cv2.rectangle(frame, (x1, y1), (x2, y2), RED, 2)
                cv2.putText(frame, "PHONE", (x1, max(0, y1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, RED, 2)
        banner = "FACE DETECTED" if live.faces > 0 else "NO FACE"
        bcol = GREEN if live.faces > 0 else RED
        cv2.putText(frame, f"{banner} | {live.status} | attention {live.attention}",
                    (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, bcol, 2)
        return frame


class TesterApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("FeatureDesk CV — Local Tester")
        self.root.configure(bg=BG)
        self.root.geometry("980x560")
        self.queue: "queue.Queue" = queue.Queue(maxsize=1)
        self.worker: CameraWorker | None = None
        self._imgtk = None
        self._eye_closed_since: float | None = None

        bar = tk.Frame(root, bg=BG)
        bar.pack(fill="x", padx=14, pady=10)
        tk.Label(bar, text="Camera index:", fg="#cbd5e1", bg=BG,
                 font=("Segoe UI", 10)).pack(side="left")
        self.cam_var = tk.StringVar(value="0")
        ttk.Entry(bar, textvariable=self.cam_var, width=4).pack(side="left", padx=(4, 12))
        self.start_btn = ttk.Button(bar, text="▶ Start camera", command=self.start)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(bar, text="■ Stop", command=self.stop, state="disabled")
        self.stop_btn.pack(side="left", padx=6)
        self.live_dot = tk.Label(bar, text="● idle", fg=MUTED, bg=BG, font=("Segoe UI", 10, "bold"))
        self.live_dot.pack(side="right")

        body = tk.Frame(root, bg=BG)
        body.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        # LEFT: small preview (fixed pixel size via a non-propagating frame)
        left = tk.Frame(body, bg=BG)
        left.pack(side="left", anchor="n")
        tk.Label(left, text="LIVE  (bounding-box analysis)", fg="#93c5fd", bg=BG,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(0, 6))
        holder = tk.Frame(left, width=PREVIEW_W, height=PREVIEW_H, bg="black")
        holder.pack()
        holder.pack_propagate(False)
        self.video = tk.Label(holder, bg="black")
        self.video.pack(fill="both", expand=True)
        self.fps = tk.Label(left, text="", fg=MUTED, bg=BG, font=("Consolas", 9))
        self.fps.pack(anchor="w", pady=(6, 0))

        # RIGHT: dashboard
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(16, 0))
        tk.Label(right, text="STUDENT BEHAVIOUR DASHBOARD", fg="#e5e7eb", bg=BG,
                 font=("Segoe UI", 13, "bold")).pack(anchor="w")

        self.status_card = tk.Frame(right, bg=CARD)
        self.status_card.pack(fill="x", pady=(10, 8))
        self.status_lbl = tk.Label(self.status_card, text="—", fg="#e5e7eb", bg=CARD,
                                    font=("Segoe UI", 22, "bold"), pady=12)
        self.status_lbl.pack()

        row = tk.Frame(right, bg=BG)
        row.pack(fill="x")
        self.attention_val = self._metric(row, "ATTENTION", "0", 0)
        self.faces_val = self._metric(row, "FACES", "0", 1)
        self.phone_val = self._metric(row, "PHONE", "—", 2)

        tk.Label(right, text="Attention level", fg=MUTED, bg=BG,
                 font=("Segoe UI", 9)).pack(anchor="w", pady=(10, 2))
        self.att_canvas = tk.Canvas(right, height=16, bg="#111827", highlightthickness=0)
        self.att_canvas.pack(fill="x")

        self.extra = tk.Label(right, text="head: —    eyes: —", fg=MUTED, bg=BG,
                              font=("Consolas", 10), justify="left")
        self.extra.pack(anchor="w", pady=(10, 4))

        tk.Label(right, text="JSON sent to client dashboard", fg="#93c5fd", bg=BG,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(2, 2))
        self.json_box = tk.Text(right, height=6, bg="#111827", fg="#e5e7eb",
                                insertbackground="#e5e7eb", font=("Consolas", 11), bd=0)
        self.json_box.pack(fill="x")

        self.status_hint = tk.Label(right, text="Idle — click Start. First frame loads "
                                    "models (a few seconds).", fg=MUTED, bg=BG,
                                    font=("Segoe UI", 9), justify="left", wraplength=520)
        self.status_hint.pack(anchor="w", pady=(8, 2))
        # Visible error panel (you asked for errors to show).
        self.error_box = tk.Label(right, text="", fg="#fca5a5", bg=BG,
                                  font=("Consolas", 9), justify="left", wraplength=520, anchor="w")
        self.error_box.pack(anchor="w", fill="x")

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _metric(self, parent, title, value, col) -> tk.Label:
        card = tk.Frame(parent, bg=CARD)
        card.grid(row=0, column=col, sticky="ew", padx=(0 if col == 0 else 8, 0))
        parent.grid_columnconfigure(col, weight=1)
        tk.Label(card, text=title, fg=MUTED, bg=CARD, font=("Segoe UI", 9)).pack(pady=(10, 0))
        val = tk.Label(card, text=value, fg="#e5e7eb", bg=CARD, font=("Segoe UI", 20, "bold"))
        val.pack(pady=(0, 10))
        return val

    def start(self) -> None:
        if self.worker:
            return
        try:
            cam = int(self.cam_var.get())
        except ValueError:
            cam = 0
        self.error_box.config(text="")
        self.status_hint.config(text="Starting camera and loading models…")
        self.live_dot.config(text="● connecting", fg="#f59e0b")
        self.worker = CameraWorker(cam, self.queue)
        self.worker.start()
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.root.after(30, self._poll)

    def stop(self) -> None:
        if self.worker:
            self.worker.stop()
            self.worker = None
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
        self.live_dot.config(text="● idle", fg=MUTED)
        self.status_hint.config(text="Stopped.")

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self.queue.get_nowait()
                if kind == "status":
                    self.status_hint.config(text=payload)
                elif kind == "error":
                    self.live_dot.config(text="● error", fg="#ef4444")
                    self.error_box.config(text=str(payload)[-1200:])
                    print(payload, file=sys.stderr)
                elif kind == "frame":
                    try:
                        self._render(*payload)
                    except Exception:
                        self.error_box.config(text=traceback.format_exc()[-1200:])
                        print(traceback.format_exc(), file=sys.stderr)
        except queue.Empty:
            pass
        if self.worker:
            self.root.after(15, self._poll)

    def _render(self, frame, live, response, frames) -> None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb).resize((PREVIEW_W, PREVIEW_H))
        self._imgtk = ImageTk.PhotoImage(img)
        self.video.config(image=self._imgtk)

        colour = STATE_COLORS.get(live.status, "#e5e7eb")
        self.status_card.config(bg=colour)
        self.status_lbl.config(text=live.status, bg=colour, fg="#0f1117")
        self.attention_val.config(text=str(live.attention))
        self.faces_val.config(text=str(live.faces))
        self.phone_val.config(text="⚠ YES" if live.phone else "✓ no",
                              fg="#ef4444" if live.phone else "#22c55e")

        self.att_canvas.delete("all")
        w = self.att_canvas.winfo_width() or 300
        self.att_canvas.create_rectangle(0, 0, w * live.attention / 100, 16, fill=colour, width=0)

        head = eyes = motion = "—"
        closed_txt = ""
        if response.students:
            s = response.students[0]
            if s.head_pose:
                head = f"yaw {s.head_pose.yaw:+.0f} pitch {s.head_pose.pitch:+.0f}"
            if s.head_motion is not None:
                motion = f"{s.head_motion:.1f}° (PERCLOS {s.perclos:.0%})"
            if s.eye_metrics:
                avg = (s.eye_metrics.ear_left + s.eye_metrics.ear_right) / 2
                eyes = f"EAR {avg:.2f}"
                if avg < 0.21:
                    self._eye_closed_since = self._eye_closed_since or time.monotonic()
                    closed_txt = f"   eyes-closed {time.monotonic() - self._eye_closed_since:.1f}s"
                else:
                    self._eye_closed_since = None
        else:
            self._eye_closed_since = None
        self.extra.config(text=f"head: {head}    eyes: {eyes}{closed_txt}\n"
                               f"face-motion: {motion}")

        self.json_box.delete("1.0", "end")
        self.json_box.insert("1.0", live.model_dump_json(indent=2))

        self.status_hint.config(text=("✓ face detected" if live.faces > 0
                                      else "✗ no face in frame — center yourself / improve lighting"))
        self.fps.config(text=f"frame #{frames}   pipeline {response.processing_ms:.0f} ms")
        self.live_dot.config(text="● LIVE", fg="#22c55e")

    def on_close(self) -> None:
        self.stop()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    TesterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
