/* eslint-disable @typescript-eslint/naming-convention */
/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
	// Automatically clear mock calls, instances, contexts and results before every test
	clearMocks: true,

	// Indicates whether the coverage information should be collected while executing the test
	collectCoverage: true,

	// The directory where Jest should output its coverage files
	coverageDirectory: "coverage",

	// Indicates which provider should be used to instrument code for coverage
	coverageProvider: "v8",

	// A preset that is used as a base for Jest's configuration
	preset: "ts-jest",

	// The test environment that will be used for testing
	testEnvironment: "node",

	// The glob patterns Jest uses to detect test files
	testMatch: [
		"**/__tests__/**/*.test.ts",
	],

	// A map from regular expressions to paths to transformers
	transform: {
		"^.+\\.tsx?$": ["ts-jest", {
			useESM: true,
			isolatedModules: true,
			diagnostics: {
				ignoreCodes: [
					2352, // Conversion of type 'X' to type 'Y' may be a mistake
					2353, // Object literal may only specify known properties
					2339, // Property 'X' does not exist on type 'Y'
					2769, // No overload matches this call
					2345, // Argument of type 'X' is not assignable to parameter of type 'Y'
					2741  // Property 'X' is missing in type 'Y'
				]
			}
		}],
	},

	// Indicates whether each individual test should be reported during the run
	verbose: true,

	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},

	extensionsToTreatAsEsm: ['.ts'],

	// The paths to modules that run some code to configure or set up the testing environment before each test
	setupFiles: [],
}; 