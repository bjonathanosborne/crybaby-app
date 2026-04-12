import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import {
  searchCourses,
  getCourseDetail,
  hasApiKey,
  AppCourse,
  ApiCourseResult,
} from "@/lib/courseApi";
import { AUSTIN_COURSES } from "@/data/constants";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

interface CourseSearchProps {
  value?: string;           // display name of currently selected course
  onSelect: (course: AppCourse) => void;
  onAddManually?: () => void;
  placeholder?: string;
}

export default function CourseSearch({
  value,
  onSelect,
  onAddManually,
  placeholder = "Search for a course…",
}: CourseSearchProps) {
  const [query, setQuery] = useState(value || "");
  const [apiResults, setApiResults] = useState<ApiCourseResult[]>([]);
  const [localResults, setLocalResults] = useState<AppCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display value when parent changes it externally
  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();

    // Local preset search (always available, no key required)
    if (trimmed.length >= 2) {
      const lower = trimmed.toLowerCase();
      const local = (AUSTIN_COURSES as AppCourse[]).filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.city.toLowerCase().includes(lower)
      );
      setLocalResults(local);
    } else {
      setLocalResults([]);
      setApiResults([]);
      setLoading(false);
      return;
    }

    // API search (requires key, min 3 chars)
    if (!hasApiKey() || trimmed.length < 3) {
      setApiResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const results = await searchCourses(trimmed);

    // De-dupe against local presets by name
    const localNames = new Set(
      (AUSTIN_COURSES as AppCourse[]).map((c) => c.name.toLowerCase())
    );
    setApiResults(
      results
        .filter((r) => !localNames.has(r.course_name.toLowerCase()))
        .slice(0, 8)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const selectLocal = (course: AppCourse) => {
    setQuery(course.name);
    setOpen(false);
    setApiResults([]);
    setLocalResults([]);
    onSelect(course);
  };

  const selectApi = async (result: ApiCourseResult) => {
    setFetchingId(result.course_id);
    const detail = await getCourseDetail(result.course_id);
    setFetchingId(null);
    if (detail) {
      setQuery(detail.name);
      setOpen(false);
      setApiResults([]);
      setLocalResults([]);
      onSelect(detail);
    }
  };

  const showDropdown =
    open && (localResults.length > 0 || apiResults.length > 0 || loading);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          border: query ? "2px solid #2D5016" : "1px solid #DDD0BB",
          background: "#FAF5EC",
          boxSizing: "border-box",
          transition: "border 0.15s",
        }}
      >
        {loading ? (
          <Loader2
            size={16}
            color="#A8957B"
            style={{ flexShrink: 0, animation: "spin 1s linear infinite" }}
          />
        ) : (
          <Search size={16} color="#A8957B" style={{ flexShrink: 0 }} />
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setOpen(true);
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            fontFamily: FONT,
            fontSize: 14,
            color: "#1E130A",
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setApiResults([]);
              setLocalResults([]);
              setOpen(false);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "#A8957B",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            border: "1px solid #DDD0BB",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {/* Austin-area presets */}
          {localResults.length > 0 && (
            <>
              <div
                style={{
                  padding: "8px 14px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#A8957B",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: FONT,
                }}
              >
                Austin Area
              </div>
              {localResults.map((course) => (
                <CourseRow
                  key={course.id}
                  icon={<MapPin size={14} color="#2D5016" />}
                  primary={course.name}
                  secondary={`${course.city} · ${course.type}`}
                  onClick={() => selectLocal(course)}
                />
              ))}
            </>
          )}

          {/* API results */}
          {apiResults.length > 0 && (
            <>
              <div
                style={{
                  padding: "8px 14px 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#A8957B",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: FONT,
                  borderTop: localResults.length > 0 ? "1px solid #F3F4F6" : "none",
                }}
              >
                Worldwide
              </div>
              {apiResults.map((result) => (
                <CourseRow
                  key={result.course_id}
                  icon={
                    fetchingId === result.course_id ? (
                      <Loader2
                        size={14}
                        color="#A8957B"
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <Search size={14} color="#A8957B" />
                    )
                  }
                  primary={result.course_name}
                  secondary={[result.city, result.state].filter(Boolean).join(", ")}
                  disabled={fetchingId === result.course_id}
                  onClick={() => selectApi(result)}
                />
              ))}
            </>
          )}

          {/* No results */}
          {!loading && localResults.length === 0 && apiResults.length === 0 && query.length >= 2 && (
            <div
              style={{
                padding: "16px 14px",
                textAlign: "center",
                fontSize: 13,
                color: "#A8957B",
                fontFamily: FONT,
              }}
            >
              No courses found
            </div>
          )}
        </div>
      )}

      {/* API key nudge */}
      {!hasApiKey() && (
        <div
          style={{
            marginTop: 5,
            fontSize: 11,
            color: "#A8957B",
            fontFamily: FONT,
          }}
        >
          Searching Austin-area courses ·{" "}
          <a
            href="https://golfcourseapi.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#2D5016", fontWeight: 600 }}
          >
            Add API key
          </a>{" "}
          for worldwide search
        </div>
      )}

      {/* Manual add fallback */}
      {onAddManually && (
        <button
          onClick={onAddManually}
          style={{
            background: "none",
            border: "none",
            padding: "4px 0",
            fontFamily: FONT,
            fontSize: 13,
            color: "#2D5016",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            display: "block",
            marginTop: 4,
          }}
        >
          Don't see your course? Add it. ➕
        </button>
      )}
    </div>
  );
}

function CourseRow({
  icon,
  primary,
  secondary,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        background: hovered ? "#FAF5EC" : "none",
        padding: "10px 14px",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONT,
        opacity: disabled ? 0.6 : 1,
        transition: "background 0.1s",
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>
          {primary}
        </div>
        <div style={{ fontSize: 11, color: "#A8957B" }}>{secondary}</div>
      </div>
    </button>
  );
}
