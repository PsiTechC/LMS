"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

interface Props {
  onDecoded: (decodedText: string) => void;
  onError: (message: string) => void;
}

// Renders an in-browser camera QR scanner (qr-scanner - Web Worker-based
// decoding) and reports the first successful decode, or a permission/camera
// failure, via callbacks. Callbacks are held in refs so re-renders of the
// parent never restart the camera.
export default function QrScannerView({ onDecoded, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [starting, setStarting] = useState(true);
  const onDecodedRef = useRef(onDecoded);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDecodedRef.current = onDecoded;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    // React Strict Mode's dev-only double-invoke runs this effect's cleanup
    // synchronously before scanner.start()'s promise has settled. Tearing the
    // scanner down mid-start races qr-scanner's internal camera-stream cache
    // and leaves the <video> element permanently stuck with no attached
    // stream on the real (second) mount. So a cleanup that fires before
    // start() has settled only marks `cleanedUp` - the actual stop()/
    // destroy() is deferred until start() itself settles. A cleanup that
    // fires after start() already succeeded (a real unmount, e.g. closing
    // the scan modal) stops the camera immediately, as before.
    let cleanedUp = false;
    let started = false;

    const scanner = new QrScanner(
      video,
      (result) => {
        if (stopped) return;
        stopped = true;
        scanner.stop();
        onDecodedRef.current(result.data);
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 10,
      }
    );

    scanner
      .start()
      .then(() => {
        started = true;
        if (cleanedUp) {
          scanner.stop();
          scanner.destroy();
          return;
        }
        setStarting(false);
      })
      .catch((err: unknown) => {
        if (cleanedUp) return;
        const msg = err instanceof Error ? err.message : String(err);
        onErrorRef.current(msg || "Camera permission was denied or no camera is available.");
      });

    return () => {
      stopped = true;
      cleanedUp = true;
      if (started) {
        scanner.stop();
        scanner.destroy();
      }
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {starting && (
        <div style={{ fontFamily: "Poppins, sans-serif", fontSize: 12, color: "#4A5573", textAlign: "center" as const }}>
          Requesting camera access…
        </div>
      )}
      <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 12, overflow: "hidden", background: "#000" }} />
    </div>
  );
}
