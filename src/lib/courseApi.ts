// Golf Course API — golfcourseapi.com
// Search: GET /v1/search?search_query={query}
// Detail: GET /v1/courses/{course_id}
// Auth:   Authorization: Key {VITE_GOLF_COURSE_API_KEY}

const API_BASE = "https://api.golfcourseapi.com/v1";

function apiKey(): string | undefined {
  return import.meta.env.VITE_GOLF_COURSE_API_KEY as string | undefined;
}

export function hasApiKey(): boolean {
  const k = apiKey();
  return !!k && k.length > 5;
}

export interface ApiCourseResult {
  course_id: string;
  course_name: string;
  city: string;
  state: string;
  country: string;
}

export interface AppCourse {
  id: string;
  api_id?: string;
  name: string;
  city: string;
  state?: string;
  country?: string;
  type: string;
  holes: number;
  pars: number[];
  handicaps: number[];
  tees: Array<{ name: string; slope: number; rating: number; yardage: number }>;
}

function normalizeCourse(raw: any): AppCourse {
  // API returns tees[], each with holes[]. Pars/handicaps come from the first tee.
  const firstTee = raw.tees?.[0];
  const holeData = firstTee?.holes || [];
  const sorted = [...holeData].sort((a: any, b: any) => a.hole_number - b.hole_number);

  return {
    id: `api_${raw.course_id}`,
    api_id: String(raw.course_id),
    name: raw.course_name,
    city: raw.city || "",
    state: raw.state || "",
    country: raw.country || "",
    type: "public",
    holes: sorted.length || 18,
    pars: sorted.length ? sorted.map((h: any) => h.par || 4) : Array(18).fill(4),
    handicaps: sorted.length
      ? sorted.map((h: any) => h.handicap || 0)
      : Array.from({ length: 18 }, (_, i) => i + 1),
    tees: (raw.tees || []).map((t: any) => ({
      name: t.tee_name || t.name || "Standard",
      slope: t.slope || 113,
      rating: t.rating || 72.0,
      yardage: (t.holes || []).reduce((s: number, h: any) => s + (h.yardage || 0), 0),
    })),
  };
}

export async function searchCourses(query: string): Promise<ApiCourseResult[]> {
  const key = apiKey();
  if (!key || !query.trim()) return [];
  try {
    const res = await fetch(
      `${API_BASE}/search?search_query=${encodeURIComponent(query.trim())}`,
      { headers: { Authorization: `Key ${key}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.courses || [];
  } catch {
    return [];
  }
}

export async function getCourseDetail(courseId: string): Promise<AppCourse | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}`, {
      headers: { Authorization: `Key ${key}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeCourse(data);
  } catch {
    return null;
  }
}
