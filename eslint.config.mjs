import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores(['node_modules/', 'main.js', 'test/plugin-dist/', 'test/logs/', '.obsidian-cache/']),
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		languageOptions: {
			sourceType: 'module',
			globals: {
				...globals.node,
			},
		},
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
			'@typescript-eslint/ban-ts-comment': 'off',
			'no-prototype-builtins': 'off',
			'@typescript-eslint/no-empty-function': 'off',
		},
	},
	{
		// E2E specs poke at undocumented Obsidian internals (app.plugins,
		// app.commands, …) that have no public types.
		files: ['test/specs/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
);
