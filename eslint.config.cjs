module.exports = [{
  // Files to lint – all JavaScript files
  files: ["**/*.js"],
  languageOptions: {
    ecmaVersion: 2021,
    sourceType: "script",
    globals: {}
  },
  rules: {
    "eqeqeq": "error"
  }
}];
