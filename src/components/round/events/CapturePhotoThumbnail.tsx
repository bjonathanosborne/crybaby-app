import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * Lazy-loading photo thumbnail for a scorecard capture. Takes a
 * `photo_path` (storage key in the `scorecards` bucket) and renders:
 *  - a skeleton shimmer while the signed URL resolves
 *  - the thumbnail when loaded
 *  - a click-to-expand handler that opens a full-screen modal
 *    with the same image (larger, pinch-zoomable on mobile)
 *
 * Never throws on missing path — renders a neutral placeholder if
 * the capture's photo didn't upload (common: bad connectivity on course).
 *
 * Signed URLs have a 1-hour expiry. We cache per photo_path in module
 * state so rapid re-renders don't thrash the Supabase API.
 */

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function getSignedUrl(photoPath: string): Promise<string | null> {
  const cached = signedUrlCache.get(photoPath);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }
  const { data, error } = await supabase.storage
    .from("scorecards")
    .createSignedUrl(photoPath, 3600);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(photoPath, {
    url: data.signedUrl,
    expiresAt: Date.now() + 55 * 60_000, // treat as expired 5 min early
  });
  return data.signedUrl;
}

export interface CapturePhotoThumbnailProps {
  photoPath: string | null | undefined;
  /** Small (~40px) or medium (~80px) size. */
  size?: "sm" | "md";
  /** Passed to the expanded modal's aria-label + thumbnail alt text. */
  captureLabel?: string;
  /** Optional extra classes on the outer button. */
  className?: string;
}

export default function CapturePhotoThumbnail(props: CapturePhotoThumbnailProps): JSX.Element | null {
  const { photoPath, size = "md", captureLabel = "scorecard photo", className } = props;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<boolean>(false);
  const aliveRef = useRef<boolean>(true);

  useEffect(() => {
    aliveRef.current = true;
    setUrl(null);
    setLoading(true);
    if (!photoPath) {
      setLoading(false);
      return () => { aliveRef.current = false; };
    }
    void getSignedUrl(photoPath).then(resolved => {
      if (!aliveRef.current) return;
      setUrl(resolved);
      setLoading(false);
    });
    return () => { aliveRef.current = false; };
  }, [photoPath]);

  const sizeClasses = useMemo(() => {
    return size === "sm"
      ? "h-10 w-10 rounded-md"
      : "h-20 w-20 rounded-lg";
  }, [size]);

  if (!photoPath) {
    // No photo uploaded — render a neutral muted placeholder, never expands.
    return (
      <div
        data-testid="capture-photo-thumbnail-missing"
        aria-label={`${captureLabel} — photo not uploaded`}
        className={`flex items-center justify-center bg-muted text-muted-foreground ${sizeClasses} ${className ?? ""}`}
      >
        <span aria-hidden="true" className="text-lg">📷</span>
      </div>
    );
  }

  if (loading || !url) {
    return (
      <div
        data-testid="capture-photo-thumbnail-skeleton"
        aria-label={`Loading ${captureLabel}`}
        className={`animate-pulse bg-muted ${sizeClasses} ${className ?? ""}`}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="capture-photo-thumbnail"
        aria-label={`Expand ${captureLabel}`}
        className={`relative overflow-hidden border border-border transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${sizeClasses} ${className ?? ""}`}
      >
        <img
          src={url}
          alt={captureLabel}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          data-testid="capture-photo-expanded"
          className="max-h-[95vh] max-w-[95vw] overflow-auto p-2"
        >
          <DialogTitle className="sr-only">Expanded {captureLabel}</DialogTitle>
          <DialogDescription className="sr-only">
            Pinch or scroll to zoom. Tap outside the image to close.
          </DialogDescription>
          <img
            src={url}
            alt={captureLabel}
            className="block max-h-[88vh] w-auto max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
