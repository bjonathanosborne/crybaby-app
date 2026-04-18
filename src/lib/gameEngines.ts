// Re-export shim. The canonical game-engine source lives in
// supabase/functions/_shared/gameEngines.ts so both the client and the
// Deno edge functions (extract-scores, apply-capture) import the same
// pure functions with zero duplication risk.
//
// Keep this file as a plain re-export — do not add client-only code here.
export * from "../../supabase/functions/_shared/gameEngines";
