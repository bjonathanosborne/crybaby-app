// Re-export shim for the shared cadence module. Canonical source lives
// at supabase/functions/_shared/captureCadence.ts so client + edge
// functions share one implementation.
export * from "../../supabase/functions/_shared/captureCadence";
