const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expo,
  { ignores: ["android/**", "ios/**", "dist/**", ".expo/**"] },
  {
    files: ["*.cjs"],
    languageOptions: { globals: { __dirname: "readonly", require: "readonly", module: "readonly" } },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
]);
