import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      ".local-evaluation/**",
      ".codex-staging/**",
      "*.config.js",
    ],
  },
  {
    files: ["scripts/phase85-pre/**/*.mjs"],
    languageOptions: {
      globals: { URL: "readonly", console: "readonly" },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["docs/phase8.8.3-r/scripts/**/*.cjs"],
    languageOptions: {
      globals: { require: "readonly", console: "readonly", Buffer: "readonly", process: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
