import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["tests/ui/**", "jsdom"]
    ],
    coverage: { provider: "v8", reporter: ["text"], include: ["src", "ui/src"] }
  }
});
