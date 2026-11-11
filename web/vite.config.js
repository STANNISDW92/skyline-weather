import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    // Node 25+ ships its own localStorage global, which hides jsdom's.
    execArgv: ["--no-experimental-webstorage"]
  }
});
