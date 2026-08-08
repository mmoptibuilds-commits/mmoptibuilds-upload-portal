import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  globalIgnores([".next/**", "next-env.d.ts", "node_modules/**", "coverage/**", "playwright-report/**"]),
  ...tseslint.configs.recommended,
);
