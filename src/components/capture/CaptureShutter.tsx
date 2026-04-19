import { useCallback, useRef, useState } from "react";
import type { CaptureMime } from "./types";

/**
 * Full-screen shutter step of the capture flow.
 *
 * Renders a native file input with `capture="environment"` — on mobile
 * Safari / Chrome this opens the rear camera directly. On desktop it
 * falls back to the file picker (acceptable for web-first v1).
 *
 * After pick, shows a local preview with "Retake" and "Use photo" CTAs.
 * On "Use photo", strips the data-URL prefix, calls `onSubmit(base64, mime)`.
 *
 * Keyboard/a11y:
 *  - Shutter label is clickable + receives focus via label-wraps-input.
 *  - Cancel button is reachable via Tab and Escape.
 *  - Preview image has an alt describing the current step.
 */

const ACCEPTED_MIME_ATTR = "image/jpeg,image/png,image/heic,image/webp";

interface CaptureShutterProps {
  onSubmit: (base64: string, mime: CaptureMime) => void;
  onCancel: () => void;
}

function inferMime(file: File): CaptureMime {
  const t = file.type.toLowerCase();
  if (t === "image/png") return "image/png";
  if (t === "image/heic" || t === "image/heif") return "image/heic";
  if (t === "image/webp") return "image/webp";
  return "image/jpeg"; // default
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export default function CaptureShutter({ onSubmit, onCancel }: CaptureShutterProps): JSX.Element {
  const [preview, setPreview] = useState<{ dataUrl: string; base64: string; mime: CaptureMime } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const mime = inferMime(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = typeof e.target?.result === "string" ? e.target.result : null;
      if (!dataUrl) {
        setError("Couldn't read that photo. Try again or pick a different file.");
        return;
      }
      setPreview({ dataUrl, base64: stripDataUrlPrefix(dataUrl), mime });
    };
    reader.onerror = () => setError("Couldn't read that photo. Try again.");
    reader.readAsDataURL(file);
  }, []);

  const handleRetake = useCallback(() => {
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleUse = useCallback(() => {
    if (preview) onSubmit(preview.base64, preview.mime);
  }, [preview, onSubmit]);

  return (
    <div
      data-testid="capture-shutter"
      className="flex flex-col items-center justify-center gap-6 px-6 py-8 text-center"
    >
      {!preview ? (
        <>
          <div
            aria-hidden="true"
            className="flex h-48 w-48 items-center justify-center rounded-full bg-primary/10 text-6xl"
          >
            📷
          </div>
          <div className="space-y-1">
            <h2 className="font-pacifico text-2xl text-foreground">Snap the scorecard</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Hold steady. Fit the whole card in the frame — we can read crooked shots, but crisp is better.
            </p>
          </div>

          <label
            className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
            htmlFor="capture-shutter-input"
          >
            Take photo
            <input
              ref={inputRef}
              id="capture-shutter-input"
              type="file"
              accept={ACCEPTED_MIME_ATTR}
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              aria-label="Take or upload a photo of the scorecard"
            />
          </label>

          {error ? (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            className="text-sm text-muted-foreground underline hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <h2 className="font-pacifico text-2xl text-foreground">Looks good?</h2>
          <img
            src={preview.dataUrl}
            alt="Preview of the scorecard photo you just captured"
            className="max-h-[50vh] w-full rounded-xl object-contain shadow-md"
          />
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 rounded-xl border-2 border-border bg-transparent px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleUse}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Use photo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
