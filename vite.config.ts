import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  base: "/wiki/",
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
      // Strip /wiki prefix before forwarding to backend (mirrors nginx prod behavior)
      "/wiki/api": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/wiki/, ""),
      },
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    alias: {
      // tippy.js and @tiptap/suggestion are runtime peer deps not installed in dev.
      // Stub them so the bundler resolves without errors in tests.
      "tippy.js": path.resolve(__dirname, "./src/test/stubs/tippy.stub.ts"),
      "@tiptap/suggestion": path.resolve(__dirname, "./src/test/stubs/suggestion.stub.ts"),
    },
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
