// ===================================================================
// Teacher "students performance monitoring" dashboard.
// Reads live CV attention from Supabase (written by students' local agents).
// New, self-contained component; does not modify any existing code.
// ===================================================================
import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  getLatestPerStudent,
  subscribeAttention,
  type CvAttention,
} from "../../lib/cv/cvStore";

const STATUS_COLOR: Record<string, string> = {
  Focused: "border-green-200 bg-green-50",
  Distracted: "border-amber-200 bg-amber-50",
  Sleeping: "border-red-200 bg-red-50",
  Absent: "border-gray-200 bg-gray-50",
};

export default function TeacherPerformanceMonitor() {
  const [rows, setRows] = useState<Record<string, CvAttention>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const latest = await getLatestPerStudent();
    const map: Record<string, CvAttention> = {};
    latest.forEach((r) => (map[r.student_id] = r));
    setRows(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const unsub = subscribeAttention((row) =>
      setRows((prev) => ({ ...prev, [row.student_id]: row })),
    );
    return unsub;
  }, []);

  const list = useMemo(() => Object.values(rows), [rows]);
  const avg = list.length
    ? Math.round(list.reduce((s, r) => s + r.attention, 0) / list.length)
    : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">Live Attention Monitoring</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {list.length} active · avg {avg}%
          </span>
          <button onClick={load} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          No students are being monitored yet. Students enable it from their device.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {list.map((r) => (
            <div
              key={r.student_id}
              className={`rounded-xl border p-3 ${
                STATUS_COLOR[r.status] ?? "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="truncate text-sm font-medium text-gray-700">{r.student_id}</div>
              <div className="mt-1 text-2xl font-bold text-gray-800">{r.attention}%</div>
              <div className="text-xs text-gray-500">{r.status}</div>
              {r.phone && <div className="mt-1 text-xs text-red-600">📱 phone</div>}
              {r.faces > 1 && (
                <div className="mt-1 text-xs text-red-600">⚠ {r.faces} faces</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
