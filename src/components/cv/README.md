# CV Microservice UI module (drop-in, non-invasive)

These are **new, self-contained** files. Nothing in the existing app was modified.
The feature is **local-device only** — it renders nothing on the deployed web host
(`isLocalDevice()` gate). Delete this folder + `src/lib/cv/` to remove it entirely.

## What's here
- `StudentMonitoringPanel.tsx` — student `monitoring_range`: Enable/Disable + Confirm,
  shows the student's own live status. Hidden on web host.
- `TeacherPerformanceMonitor.tsx` — teacher "students performance monitoring" dashboard,
  live from Supabase.
- `../../lib/cv/localGuard.ts` — `isLocalDevice()`.
- `../../lib/cv/cvStore.ts` — Supabase read/write (uses the app's existing client).

## One-time setup
1. Run `database/cv_microservice_schema.sql` in Supabase (creates 2 new tables).
2. The student runs the local agent on their device:
   `ai-cv-service/` → `pip install -r requirements.txt` → `python tools/student_agent.py`
   (set `SUPABASE_URL` / `SUPABASE_ANON_KEY` to the same values the web app uses).

## Mount (2 lines each — additive, optional)

**Student dashboard** (`src/components/student/StudentDashboard.tsx`), inside the render:
```tsx
import { StudentMonitoringPanel } from "../cv";
// ...somewhere in the dashboard JSX:
<StudentMonitoringPanel />
```

**Teacher dashboard** (`src/components/teacher/TeacherDashboard.tsx` or `AnalyticsDashboard.tsx`):
```tsx
import { TeacherPerformanceMonitor } from "../cv";
// ...somewhere in the dashboard JSX:
<TeacherPerformanceMonitor />
```

That's the only change to existing files — a single import and a single tag.
The student panel auto-hides on the web host, so it's safe to mount unconditionally.

## Flow
Student (local) clicks Enable → Confirm → flag written to `cv_monitoring_settings` →
local agent downloads models, analyses webcam, writes `cv_attention` → both the student's
`monitoring_range` and the teacher's dashboard update live via Supabase realtime.
