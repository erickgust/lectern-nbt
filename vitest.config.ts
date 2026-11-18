import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/*.test.ts"],
          typecheck: { enabled: true, include: ["test/types/*.test-d.ts"] },
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/smoke/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "firefox" }],
          },
        },
      },
    ],
  },
});
