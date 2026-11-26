import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always"],
      "no-nested-ternary": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "evals/**/*.ts", "scripts/**/*.{ts,mjs}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "reports/**",
    ".stryker-tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
