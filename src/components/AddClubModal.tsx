import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

type Tee = { name: string; slope: number; rating: number; yardage: number };
type CourseData = {
  name: string;
  city: string;
  state: string;
  holes: 9 | 18;
  pars: number[];
  handicaps: number[];
  tees: Tee[];
};

const blankCourse = (): CourseData => ({
  name: "",
  city: "",
  state: "",
  holes: 18,
  pars: Array(18).fill(4),
  handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
  tees: [{ name: "White", slope: 113, rating: 69.0, yardage: 6200 }],
});

type Step = "upload" | "analyzing" | "confirm";

interface Props {
  onClose: () => void;
  onSaved: (course: CourseData & { id: string }) => void;
}

export default function AddClubModal({ onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [course, setCourse] = useState<CourseData>(blankCourse());
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Image handling ────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);

      // Extract base64 payload (strip "data:image/...;base64,")
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      await analyzeImage(base64, mimeType);
    };
    reader.readAsDataURL(file);
  }, []);

  const analyzeImage = async (base64: string, mimeType: string) => {
    setStep("analyzing");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-scorecard", {
        body: { image: base64, mimeType },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Analysis failed");
      }

      const parsed = data.course as CourseData;
      // Ensure arrays match hole count
      const holes = parsed.holes === 9 ? 9 : 18;
      setCourse({
        name: parsed.name || "",
        city: parsed.city || "",
        state: parsed.state || "",
        holes,
        pars: (parsed.pars || []).slice(0, holes).concat(Array(holes).fill(4)).slice(0, holes),
        handicaps: (parsed.handicaps || []).slice(0, holes).concat(Array.from({ length: holes }, (_, i) => i + 1)).slice(0, holes),
        tees: parsed.tees?.length ? parsed.tees : [{ name: "White", slope: 113, rating: 69.0, yardage: 6200 }],
      });
      setStep("confirm");
    } catch (err: any) {
      toast({
        title: "Couldn't read scorecard",
        description: "No problem — fill in the details manually.",
        variant: "destructive",
      });
      setStep("confirm");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) processFile(file);
  }, [processFile]);

  // ─── Course field helpers ──────────────────────────────────────────────────
  const setHoles = (h: 9 | 18) => {
    setCourse(prev => ({
      ...prev,
      holes: h,
      pars: h === 9
        ? prev.pars.slice(0, 9).concat(Array(Math.max(0, 9 - prev.pars.length)).fill(4))
        : prev.pars.concat(Array(Math.max(0, 18 - prev.pars.length)).fill(4)).slice(0, 18),
      handicaps: h === 9
        ? Array.from({ length: 9 }, (_, i) => i + 1)
        : Array.from({ length: 18 }, (_, i) => i + 1),
    }));
  };

  const setPar = (i: number, val: number) =>
    setCourse(prev => { const p = [...prev.pars]; p[i] = val; return { ...prev, pars: p }; });

  const setHandicap = (i: number, val: number) =>
    setCourse(prev => { const h = [...prev.handicaps]; h[i] = val; return { ...prev, handicaps: h }; });

  const addTee = () =>
    setCourse(prev => ({ ...prev, tees: [...prev.tees, { name: "", slope: 113, rating: 69.0, yardage: 6000 }] }));

  const removeTee = (i: number) =>
    setCourse(prev => ({ ...prev, tees: prev.tees.filter((_, idx) => idx !== i) }));

  const setTeeField = (i: number, field: keyof Tee, val: string | number) =>
    setCourse(prev => {
      const tees = [...prev.tees];
      tees[i] = { ...tees[i], [field]: val };
      return { ...prev, tees };
    });

  // ─── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!course.name.trim()) {
      toast({ title: "Course name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data, error } = await supabase
        .from("user_courses")
        .insert({
          name: course.name.trim(),
          city: course.city.trim(),
          state: course.state.trim(),
          created_by: user.id,
          course_data: {
            holes: course.holes,
            pars: course.pars,
            handicaps: course.handicaps,
            tees: course.tees,
          },
        } as any)
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Club added!", description: `${course.name} is ready to play.` });
      onSaved({ ...course, id: data.id });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Styles ────────────────────────────────────────────────────────────────
  const font = "'Inter', sans-serif";
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #DDD0BB",
    fontFamily: font, fontSize: 14, outline: "none", boxSizing: "border-box",
    background: "#FAF5EC", color: "#1E130A",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase",
    letterSpacing: "0.06em", marginBottom: 6, display: "block",
  };
  const cellStyle: React.CSSProperties = {
    width: 36, textAlign: "center", padding: "6px 0", borderRadius: 8,
    border: "1.5px solid #DDD0BB", fontFamily: font, fontSize: 13, fontWeight: 600,
    background: "#FAF5EC", color: "#1E130A", outline: "none",
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#FAF5EC", borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 480, maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: "1px solid #F3F4F6", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: font, fontSize: 17, fontWeight: 800, color: "#1E130A" }}>
              {step === "upload" ? "Add Your Club ⛳" : step === "analyzing" ? "Reading Scorecard…" : "Confirm Details"}
            </div>
            <div style={{ fontFamily: font, fontSize: 12, color: "#A8957B", marginTop: 2 }}>
              {step === "upload"
                ? "Upload a scorecard photo or enter manually"
                : step === "analyzing"
                ? "AI is extracting course info"
                : "Review and edit before saving"}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: "50%", border: "none",
            background: "#EDE7D9", cursor: "pointer", fontSize: 18, lineHeight: "32px",
            color: "#8B7355", display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px", flex: 1 }}>

          {/* ── STEP: Upload ── */}
          {step === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#2D5016" : "#CEC0AA"}`,
                  borderRadius: 16, padding: "36px 20px", textAlign: "center",
                  cursor: "pointer", background: dragOver ? "#F0FDF4" : "#FAFAFA",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 10 }}>📸</div>
                <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: "#1E130A", marginBottom: 6 }}>
                  Upload Scorecard Photo
                </div>
                <div style={{ fontFamily: font, fontSize: 13, color: "#A8957B" }}>
                  Tap to choose or drag a screenshot here
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "#DDD0BB" }} />
                <span style={{ fontFamily: font, fontSize: 12, color: "#A8957B" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#DDD0BB" }} />
              </div>

              {/* Manual entry shortcut */}
              <button
                onClick={() => setStep("confirm")}
                style={{
                  padding: "14px", borderRadius: 12, border: "1.5px solid #DDD0BB",
                  background: "#FAF5EC", fontFamily: font, fontSize: 14, fontWeight: 600,
                  color: "#374151", cursor: "pointer",
                }}
              >
                Enter details manually ✏️
              </button>
            </div>
          )}

          {/* ── STEP: Analyzing ── */}
          {step === "analyzing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 16 }}>
              {imagePreview && (
                <img src={imagePreview} alt="Scorecard" style={{
                  width: "100%", maxHeight: 180, objectFit: "cover",
                  borderRadius: 12, opacity: 0.7,
                }} />
              )}
              <div style={{ fontSize: 36, animation: "spin 1.5s linear infinite" }}>⛳</div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: "#1E130A" }}>
                AI is reading your scorecard…
              </div>
              <div style={{ fontFamily: font, fontSize: 13, color: "#A8957B", textAlign: "center" }}>
                Extracting course name, pars, handicaps, and tee info
              </div>
            </div>
          )}

          {/* ── STEP: Confirm ── */}
          {step === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {imagePreview && (
                <img src={imagePreview} alt="Scorecard" style={{
                  width: "100%", maxHeight: 120, objectFit: "cover",
                  borderRadius: 10, opacity: 0.8,
                }} />
              )}

              {/* Basic info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Club / Course Name *</label>
                  <input
                    style={inputStyle}
                    value={course.name}
                    placeholder="e.g. Pebble Beach Golf Links"
                    onChange={(e) => setCourse(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>City</label>
                    <input
                      style={inputStyle}
                      value={course.city}
                      placeholder="City"
                      onChange={(e) => setCourse(p => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>State</label>
                    <select
                      style={{ ...inputStyle, appearance: "none" }}
                      value={course.state}
                      onChange={(e) => setCourse(p => ({ ...p, state: e.target.value }))}
                    >
                      <option value="">--</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Holes toggle */}
              <div>
                <label style={labelStyle}>Holes</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([9, 18] as const).map(h => (
                    <button
                      key={h}
                      onClick={() => setHoles(h)}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer",
                        border: "none", fontFamily: font, fontSize: 14, fontWeight: 700,
                        background: course.holes === h ? "#2D5016" : "#EDE7D9",
                        color: course.holes === h ? "#fff" : "#374151",
                        transition: "all 0.15s",
                      }}
                    >{h} Holes</button>
                  ))}
                </div>
              </div>

              {/* Pars grid */}
              <div>
                <label style={labelStyle}>Pars per Hole</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[0, 9].filter(start => start < course.holes).map(start => (
                    <div key={start} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontFamily: font, fontSize: 10, color: "#A8957B", width: 24, flexShrink: 0 }}>
                        {start + 1}–{Math.min(start + 9, course.holes)}
                      </span>
                      {course.pars.slice(start, start + 9).map((par, idx) => (
                        <input
                          key={start + idx}
                          type="number"
                          min={3}
                          max={6}
                          value={par}
                          onChange={(e) => setPar(start + idx, Math.min(6, Math.max(3, parseInt(e.target.value) || 4)))}
                          style={cellStyle}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", marginTop: 4 }}>
                  Total par: {course.pars.reduce((a, b) => a + b, 0)}
                </div>
              </div>

              {/* Handicaps grid */}
              <div>
                <label style={labelStyle}>Handicap Strokes (1 = hardest)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[0, 9].filter(start => start < course.holes).map(start => (
                    <div key={start} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontFamily: font, fontSize: 10, color: "#A8957B", width: 24, flexShrink: 0 }}>
                        {start + 1}–{Math.min(start + 9, course.holes)}
                      </span>
                      {course.handicaps.slice(start, start + 9).map((hcp, idx) => (
                        <input
                          key={start + idx}
                          type="number"
                          min={1}
                          max={course.holes}
                          value={hcp}
                          onChange={(e) => setHandicap(start + idx, Math.min(course.holes, Math.max(1, parseInt(e.target.value) || 1)))}
                          style={cellStyle}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tees */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Tees</label>
                  <button
                    onClick={addTee}
                    style={{
                      fontSize: 12, fontWeight: 700, color: "#2D5016", background: "none",
                      border: "none", cursor: "pointer", fontFamily: font, padding: 0,
                    }}
                  >+ Add Tee</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {course.tees.map((tee, i) => (
                    <div key={i} style={{
                      background: "#FAF5EC", borderRadius: 12, padding: "12px",
                      border: "1.5px solid #DDD0BB",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <input
                          style={{ ...inputStyle, width: "auto", flex: 1, marginRight: 8, padding: "6px 10px" }}
                          placeholder="Tee name (e.g. Blue)"
                          value={tee.name}
                          onChange={(e) => setTeeField(i, "name", e.target.value)}
                        />
                        {course.tees.length > 1 && (
                          <button
                            onClick={() => removeTee(i)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#A8957B", padding: 4 }}
                          >✕</button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[
                          { label: "Slope", key: "slope" as const, placeholder: "113" },
                          { label: "Rating", key: "rating" as const, placeholder: "69.0" },
                          { label: "Yards", key: "yardage" as const, placeholder: "6200" },
                        ].map(({ label, key, placeholder }) => (
                          <div key={key} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#A8957B", marginBottom: 4, fontFamily: font }}>{label}</div>
                            <input
                              type="number"
                              style={{ ...inputStyle, padding: "6px 8px", textAlign: "center" }}
                              placeholder={placeholder}
                              value={tee[key]}
                              onChange={(e) => setTeeField(i, key, parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "confirm" && (
          <div style={{
            padding: "16px 20px", borderTop: "1px solid #F3F4F6", flexShrink: 0,
            display: "flex", gap: 10,
          }}>
            <button
              onClick={() => setStep("upload")}
              style={{
                flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #DDD0BB",
                background: "#FAF5EC", fontFamily: font, fontSize: 14, fontWeight: 600,
                color: "#374151", cursor: "pointer",
              }}
            >Try Another Photo</button>
            <button
              onClick={handleSave}
              disabled={saving || !course.name.trim()}
              style={{
                flex: 2, padding: "14px", borderRadius: 12, border: "none",
                background: !course.name.trim() ? "#CEC0AA" : "#2D5016",
                color: "#fff", fontFamily: font, fontSize: 14, fontWeight: 700,
                cursor: saving || !course.name.trim() ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Saving…" : "Save Club ✓"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
