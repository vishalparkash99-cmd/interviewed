/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      diagnostics: { ignoreCodes: ["TS151002"] },
      tsconfig: { isolatedModules: true },
    }],
  },
  moduleNameMapper: {
    "^@interviewed/([^/]+)/(.+)$": "<rootDir>/packages/$1/src/$2",
    "^@interviewed/([^/]+)$": "<rootDir>/packages/$1/src",
  },
  collectCoverageFrom: [
    "packages/**/src/**/*.ts",
    "apps/**/src/**/*.ts",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};
