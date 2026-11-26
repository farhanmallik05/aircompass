import { chromium, defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Local: builds the PRODUCTION bundle and serves it on a dedicated port. It never reuses a running server:
 * a stale server from a previous build silently gives false results.
 * Remote: BASE_URL=https://<project>.vercel.app npx playwright test csp
 */
const PORT = Number(process.env.CSP_PORT ?? 3217);
const base = process.env.BASE_URL ?? `http://localhost:${PORT}`;

function resolveLocalExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const defaultPath = chromium.executablePath();
  if (existsSync(defaultPath)) return undefined;
  const msRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : undefined;
  if (msRoot && existsSync(msRoot)) {
    const dirs = readdirSync(msRoot)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      const candidate = path.join(
        msRoot,
        d,
        "chrome-headless-shell-win64",
        "chrome-headless-shell.exe",
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return existsSync(winChrome) ? winChrome : undefined;
}

function cleanEnv(overrides: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v;
  }
  return { ...out, ...overrides };
}

const executablePath = resolveLocalExecutable();

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: base,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${PORT}`,
        url: base,
        timeout: 240_000,
        reuseExistingServer: false,
        ...(process.env.LIVE_E2E
          ? {}
          : {
              env: cleanEnv({
                GEMINI_API_KEY: "",
                GOOGLE_API_KEY: "",
                NEXT_PUBLIC_DEMO_MODE: "true",
              }),
            }),
      },
});
