import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function useAICommentary() {
  const [commentary, setCommentary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getCommentary = useCallback(async (
    contextType: "score_update" | "round" | "feed" | "trash_talk",
    contextData: Record<string, any>
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-commentary", {
        body: { context_type: contextType, context_data: contextData },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("Rate limited")) {
          toast({ title: "AI is catching its breath", description: "Try again in a moment." });
        } else if (data.error.includes("credits")) {
          toast({ title: "AI credits used up", description: "The AI caddie needs more tokens." });
        }
        return null;
      }
      setCommentary(data.commentary);
      return data.commentary as string;
    } catch (err) {
      console.error("AI commentary error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { commentary, loading, getCommentary };
}
