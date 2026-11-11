import { useEffect, useRef } from "react";
import { SkyEngine } from "../sky/engine.js";

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Full-viewport background behind the app. Sky colours are CSS custom properties
// on <html> (set by App from the scene) so they can transition smoothly; the sun is
// a CSS element; everything else is drawn by SkyEngine on the canvas above it.
export default function Sky({ scene }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    const engine = new SkyEngine(canvasRef.current, { reducedMotion: reducedMotion() });
    engineRef.current = engine;
    if (!engine.ok) return;
    const onResize = () => engine.resize(window.innerWidth, window.innerHeight);
    onResize();
    engine.start();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); engine.stop(); };
  }, []);

  useEffect(() => { engineRef.current?.setScene(scene); }, [scene]);

  const { sun } = scene;
  return (
    <div className="sky" aria-hidden="true">
      <div className="sun" style={{
        "--sun-x": `${(sun.x * 100).toFixed(2)}%`,
        "--sun-y": `${(sun.y * 100).toFixed(2)}%`,
        "--sun-color": sun.color,
        "--sun-low": sun.low.toFixed(3),
        "--sun-disk": sun.disk.toFixed(3),
        opacity: sun.opacity.toFixed(3)
      }} />
      <canvas ref={canvasRef} className="sky-canvas" />
    </div>
  );
}
