import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    deps: {
      optimizer: {
        web: {
          include: ["@testing-library/jest-dom"],
        },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.ts", "src/stores/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/**/__tests__/**", "src/test/**", "src/**/*.d.ts"],
    },
  },
}))
