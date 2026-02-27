import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import pluginSecurity from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  pluginSecurity.configs.recommended,
  {
    rules: {
      // External image URLs (fal.ai, OpenRouter) can't use next/image
      "@next/next/no-img-element": "off",
      // Syncing local state from props/store is a valid React pattern
      "react-hooks/set-state-in-effect": "off",
      // False positive heavy — flags all bracket access on typed objects/arrays
      "security/detect-object-injection": "off",
      // All fs operations use Phase 28 path-traversal-safe resolved paths
      "security/detect-non-literal-fs-filename": "off",
      // Allow underscore-prefixed unused args/vars (common destructure-to-omit pattern)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
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
    // Website is a standalone Vite project (not Next.js)
    "website/**",
  ]),
]);

export default eslintConfig;
