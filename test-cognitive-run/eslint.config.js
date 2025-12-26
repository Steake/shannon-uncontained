/**
 * ESLint Configuration - LSG v2 Generated
 */

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        }
    }
];
