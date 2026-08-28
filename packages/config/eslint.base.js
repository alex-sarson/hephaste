// Shared ESLint flat config, extended by each app/package's own eslint.config.js.
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
export const baseConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  prettierConfig,
  {
    ignores: ["**/dist/**", "**/build/**", "**/.turbo/**", "**/node_modules/**", "**/generated/**"],
  },
];

export default baseConfig;
