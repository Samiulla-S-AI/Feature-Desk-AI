// ===================================================================
// Student "monitoring_range" panel + Enable/Disable control.
// LOCAL DEVICE ONLY — renders nothing on the web host.
// New, self-contained component; does not modify any existing code.
// ===================================================================
import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { isLocalDevice } from "../../lib/cv/localGuard";
import {
  getMonitoringEnabled,
  setMonitoringEnabled,
  getLatestForStudent,
  subscribeAttention,
  type CvAttention,
} from "../../lib/cv/cvStore";

const STATUS_COLOR: Record<string, string> = {
  Focused: "bg-green-100 text-green-700",
  Distracted: "bg-amber-100 text-amber-700",
  Sleeping: "bg-red-100 text-red-700",
  Absent: "bg-gray-100 text-gray-600",
};

export default function StudentMonitoringPanel({ examId }: { examId?: string }) {
  const { user } = useAuth();
  const studentId = (user as { id?: string } | null)?.id ?? "";
  const show = isLocalDevice() && !!studentId;

  const [enabled, setEnabled] = useState(false);
  const [latest, setLatest] = useState<CvAttention | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    let active = true;
    getMonitoringEnabled(studentId).then((v) => active && setEnabled(v));
    getLatestForStudent(studentId).then((v) => active && setLatest(v));
    const unsub = subscribeAttention((row) => {
      if (row.student_id === studentId) setLatest(row);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [show, studentId]);

  // Hard gate: never show on the web host (after all hooks, per rules of hooks).
  if (!show) return null;

  async function toggle(next: boolean) {
    if (next) {
      const ok = window.confirm(
        "Enable AI monitoring?\n\nThis turns on your camera on THIS device, downloads " +
          "the AI models, and shares your attention status with your teacher during the " +
          "exam. Make sure the Student Monitoring Agent app is open on this device.",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setMonitoringEnabled(studentId, next, examId);
      setEnabled(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">AI Attention Monitoring</h3>
        </div>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
          Local device only
        </span>
      </div>

      <p className="mt-2 text-sm text-gray-500">
        When enabled, your camera is analysed on this device only and your live attention
        status is shared with your teacher. You can turn it off anytime.
      </p>

      <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        In the Monitoring Agent app, enter this exact <strong>Student ID</strong> so your
        data links to your account:
        <code className="ml-1 select-all rounded bg-white px-1.5 py-0.5 font-mono text-indigo-900">
          {studentId}
        </code>
      </div>

      <button
        disabled={busy}
        onClick={() => toggle(!enabled)}
        className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white ${
          enabled ? "bg-red-500 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-700"
        } disabled:opacity-60`}
      >
        {enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {enabled ? "Disable monitoring" : "Enable monitoring"}
      </button>

      {enabled && !latest && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          Waiting for the Student Monitoring Agent… open it on this device.
        </div>
      )}

      {latest && (
        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Your live status (monitoring_range)</div>
          <div className="mt-1 flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                STATUS_COLOR[latest.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {latest.status}
            </span>
            <span className="text-2xl font-bold text-gray-800">{latest.attention}%</span>
            <span className="text-sm text-gray-500">
              faces {latest.faces} {latest.phone ? "· 📱 phone detected" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
