// Re-export shim. Canonical source lives at
// supabase/functions/_shared/hammerMath.ts so client + Deno edge functions
// share one copy (same pattern as gameEngines + captureCadence).
export * from "../../supabase/functions/_shared/hammerMath";
export * from "../../supabase/functions/_shared/hammerTypes";
