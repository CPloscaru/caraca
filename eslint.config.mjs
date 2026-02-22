import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // External image URLs (fal.ai, OpenRouter) can't use next/image
      "@next/next/no-img-element": "off",
      // Syncing local state from props/store is a valid React pattern
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // GSD tooling (CJS scripts, hooks)
    ".claude/**",
  ]),
]);

export default eslintConfig;
