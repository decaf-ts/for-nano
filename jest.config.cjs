process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";
process.env.LEVEL = process.env.LEVEL || "warn";
process.env.VERBOSE = process.env.VERBOSE || "0";
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logging = require("@decaf-ts/logging");
  if (logging?.Logging?.setConfig) {
    logging.Logging.setConfig({
      level: "warn",
      verbose: 0,
    });
  }
} catch (err) {
  // ignore logging config errors in test bootstrap
  void err;
}

const config = {
  verbose: true,
  // eslint-disable-next-line no-undef
  rootDir: __dirname,
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  watchman: false,
  testRegex: "/tests/.*\\.(test|spec)\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  coverageDirectory: "./workdocs/reports/coverage",
  collectCoverage: false,
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/**/cli.ts"],
  reporters: ["default"],
};

// eslint-disable-next-line no-undef
module.exports = config;
