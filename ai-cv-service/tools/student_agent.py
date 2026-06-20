"""
FeatureDesk — Student CV Agent (LOCAL DEVICE ONLY)
==================================================

This is the local microservice the student runs on their own laptop/tablet.
It is the same proven pipeline as the Tkinter tester, but it:

  * follows the Enable/Disable flag the student sets from the web app
    (Supabase table `cv_monitoring_settings`),
  * downloads the models on first Enable,
  * pushes live results to Supabase (`cv_attention`) so the teacher's
    performance dashboard and the student's monitoring_range update live.

It NEVER runs on the web host — it only exists on the local device.

Setup (once):
    cd ai-cv-service
    pip install -r requirements.txt
    set SUPABASE_URL=...           (same as the web app's VITE_SUPABASE_URL)
    set SUPABASE_ANON_KEY=...      (same as VITE_SUPABASE_ANON_KEY)
    python tools/student_agent.py

Then in the web app (student login, on the local device) press Enable -> Confirm.
"""
import os
import sys
import time
import queue
import threading
import tkinter as tk
from tkinter import ttk, messagebox

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import cv2
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.analysis_service import AnalysisService
from api.v1.schemas.responses import LiveAnalysisResponse
import download_models

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
PUSH_EVERY_S = 1.0      # throttle writes to Supabase
ANALYZE_FPS = 6


def _headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


class SupabaseBridge:
    """Tiny Supabase REST client (no extra deps beyond httpx)."""

    def __init__(self) -> None:
        self._client = httpx.Client(timeout=5.0)

    def is_enabled(self, student_id: str) -> bool:
        url = (f"{SUPABASE_URL}/rest/v1/cv_monitoring_settings"
               f"?student_id=eq.{student_id}&select=enabled")
        r = self._client.get(url, headers=_headers())
        r.raise_for_status()
        rows = r.json()
        return bool(rows and rows[0].get("enabled"))

    def set_enabled(self, student_id: str, enabled: bool, exam_id: str = "") -> None:
        url = f"{SUPABASE_URL}/rest/v1/cv_monitoring_settings"
        headers = {**_headers(), "Prefer": "resolution=merge-duplicates"}
        self._client.post(url, headers=headers, json={
            "student_id": student_id, "enabled": enabled,
            "exam_id": exam_id or None, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }).raise_for_status()

    def push(self, student_id: str, exam_id: str, live: LiveAnalysisResponse) -> None:
        url = f"{SUPABASE_URL}/rest/v1/cv_attention"
        self._client.post(url, headers=_headers(), json={
            "student_id": student_id, "exam_id": exam_id or None,
            "status": live.status, "attention": live.attention,
            "phone": live.phone, "faces": live.faces,
        }).raise_for_status()


class AgentWorker(threading.Thread):
    def __init__(self, student_id, exam_id, bridge, out_q):
        super().__init__(daemon=True)
        self.student_id, self.exam_id, self.bridge, self.q = student_id, exam_id, bridge, out_q
        self._stop = threading.Event()
        self._service = AnalysisService()

    def stop(self):
        self._stop.set()

    def run(self):
        try:
            self.q.put(("status", "Downloading models (first run only)…"))
            download_models.download_models()
        except Exception as e:
            self.q.put(("error", f"Model download failed: {e}"))
            return

        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW if os.name == "nt" else 0)
        if not cap.isOpened():
            self.q.put(("error", "Could not open the webcam."))
            return
        self.q.put(("status", "Monitoring active."))

        last_push = 0.0
        min_dt = 1.0 / ANALYZE_FPS
        while not self._stop.is_set():
            t0 = time.monotonic()
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.2)
                continue
            frame = cv2.flip(frame, 1)
            try:
                resp, _, _ = self._service.run_pipeline(frame, self.student_id, int(time.time() * 1000))
                live = LiveAnalysisResponse.from_analysis(resp, self.student_id)
                self.q.put(("live", live))
                if time.monotonic() - last_push >= PUSH_EVERY_S:
                    self.bridge.push(self.student_id, self.exam_id, live)
                    last_push = time.monotonic()
            except Exception as e:
                self.q.put(("error", str(e)))
            dt = time.monotonic() - t0
            if dt < min_dt:
                time.sleep(min_dt - dt)
        cap.release()
        self.q.put(("status", "Monitoring stopped."))


class AgentApp:
    def __init__(self, root):
        self.root = root
        root.title("FeatureDesk — Student Monitoring Agent (local)")
        root.geometry("440x300")
        self.bridge = SupabaseBridge()
        self.q: "queue.Queue" = queue.Queue()
        self.worker = None
        self.flag_poll = None

        if not SUPABASE_URL or not SUPABASE_KEY:
            messagebox.showwarning(
                "Config missing",
                "Set SUPABASE_URL and SUPABASE_ANON_KEY (same as the web app) "
                "before starting, or the agent can't sync.")

        frm = tk.Frame(root, padx=14, pady=12)
        frm.pack(fill="both", expand=True)
        tk.Label(frm, text="Student ID").grid(row=0, column=0, sticky="w")
        self.sid = tk.StringVar(value="S001")
        ttk.Entry(frm, textvariable=self.sid, width=22).grid(row=0, column=1, sticky="w")
        tk.Label(frm, text="Exam ID (optional)").grid(row=1, column=0, sticky="w", pady=4)
        self.exam = tk.StringVar(value="")
        ttk.Entry(frm, textvariable=self.exam, width=22).grid(row=1, column=1, sticky="w")

        self.toggle = ttk.Button(frm, text="Enable monitoring", command=self.on_enable)
        self.toggle.grid(row=2, column=0, pady=10)
        ttk.Button(frm, text="Disable", command=self.on_disable).grid(row=2, column=1, pady=10, sticky="w")

        self.status = tk.Label(frm, text="Idle. Enable here or from the web app.",
                               fg="#555", wraplength=380, justify="left")
        self.status.grid(row=3, column=0, columnspan=2, sticky="w", pady=6)
        self.live = tk.Label(frm, text="", font=("Segoe UI", 13, "bold"))
        self.live.grid(row=4, column=0, columnspan=2, sticky="w")
        tk.Label(frm, text="Tip: leave this open during the exam. The Enable/Disable\n"
                 "button in the student web app controls it too.",
                 fg="#888", justify="left").grid(row=5, column=0, columnspan=2, sticky="w", pady=8)

        root.protocol("WM_DELETE_WINDOW", self.on_close)
        self._poll_ui()
        self._poll_flag()

    # --- control ---
    def on_enable(self):
        if not messagebox.askyesno(
            "Enable monitoring?",
            "This will turn on your camera, download the AI models to this device, "
            "and share attention status with your teacher during the exam. Continue?"):
            return
        try:
            self.bridge.set_enabled(self.sid.get().strip(), True, self.exam.get().strip())
        except Exception as e:
            self.status.config(text=f"Could not update flag: {e}")
        self._start()

    def on_disable(self):
        try:
            self.bridge.set_enabled(self.sid.get().strip(), False, self.exam.get().strip())
        except Exception:
            pass
        self._stop()

    def _start(self):
        if self.worker:
            return
        self.worker = AgentWorker(self.sid.get().strip(), self.exam.get().strip(), self.bridge, self.q)
        self.worker.start()
        self.toggle.config(text="Enabled ✓")

    def _stop(self):
        if self.worker:
            self.worker.stop()
            self.worker = None
        self.toggle.config(text="Enable monitoring")
        self.live.config(text="")

    # --- loops ---
    def _poll_flag(self):
        """React to the Enable/Disable toggle coming from the web app."""
        sid = self.sid.get().strip()
        if sid and SUPABASE_URL and SUPABASE_KEY:
            try:
                enabled = self.bridge.is_enabled(sid)
                if enabled and not self.worker:
                    self._start()
                elif not enabled and self.worker:
                    self._stop()
            except Exception:
                pass
        self.flag_poll = self.root.after(4000, self._poll_flag)

    def _poll_ui(self):
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == "status":
                    self.status.config(text=payload)
                elif kind == "error":
                    self.status.config(text=f"⚠ {payload}")
                elif kind == "live":
                    self.live.config(text=f"{payload.status} · attention {payload.attention}% · "
                                          f"faces {payload.faces}{' · 📱' if payload.phone else ''}")
        except queue.Empty:
            pass
        self.root.after(100, self._poll_ui)

    def on_close(self):
        self._stop()
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    AgentApp(root)
    root.mainloop()
