// ===================================================================
// Supabase data layer for the CV microservice (self-contained).
// Reuses the app's existing supabase client; defines nothing global.
// Tables are created by database/cv_microservice_schema.sql.
// ===================================================================
import { supabase } from "../supabase";

export interface CvAttention {
  student_id: string;
  exam_id?: string | null;
  status: "Focused" | "Distracted" | "Sleeping" | "Absent" | string;
  attention: number;
  phone: boolean;
  faces: number;
  created_at?: string;
}

export async function getMonitoringEnabled(studentId: string): Promise<boolean> {
  const { data } = await supabase
    .from("cv_monitoring_settings")
    .select("enabled")
    .eq("student_id", studentId)
    .maybeSingle();
  return Boolean(data?.enabled);
}

export async function setMonitoringEnabled(
  studentId: string,
  enabled: boolean,
  examId?: string,
): Promise<void> {
  await supabase.from("cv_monitoring_settings").upsert(
    {
      student_id: studentId,
      enabled,
      exam_id: examId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id" },
  );
}

export async function getLatestForStudent(studentId: string): Promise<CvAttention | null> {
  const { data } = await supabase
    .from("cv_attention")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data && data[0]) ?? null;
}

/** Latest row per student (teacher dashboard). */
export async function getLatestPerStudent(limit = 300): Promise<CvAttention[]> {
  const { data } = await supabase
    .from("cv_attention")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const seen = new Set<string>();
  const out: CvAttention[] = [];
  for (const row of (data ?? []) as CvAttention[]) {
    if (!seen.has(row.student_id)) {
      seen.add(row.student_id);
      out.push(row);
    }
  }
  return out;
}

/** Subscribe to live inserts on cv_attention. Returns an unsubscribe fn. */
export function subscribeAttention(onInsert: (row: CvAttention) => void): () => void {
  const channel = supabase
    .channel("cv_attention_live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "cv_attention" },
      (payload) => onInsert(payload.new as CvAttention),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
