import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no canvas implementation; the sky engine treats a null context as "don't draw".
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch (e) {}
});
