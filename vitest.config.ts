import { defineConfig } from "vitest/config";

// Dos proyectos: pruebas de nodo (web, scripts) y pruebas del panel (React, con jsdom).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "nodo",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "worker/**/*.test.js"],
          exclude: ["src/admin/**", "node_modules/**", "worker/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "panel",
          environment: "jsdom",
          include: ["src/admin/**/*.test.{ts,tsx}"],
          setupFiles: ["src/admin/pruebas-config.ts"],
        },
      },
    ],
  },
});
