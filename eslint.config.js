import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const compat = new FlatCompat({
  baseDirectory: process.cwd(),
  recommended: true
});

export default [
  js.configs.recommended,
  ...compat.extends('airbnb-base'),
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'build/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module'
    },
    rules: {
      // Possible errors
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      
      // Best practices
      'consistent-return': 'off',
      'no-param-reassign': ['error', { 'props': false }],
      
      // Style overrides
      'indent': ['error', 2, { 'SwitchCase': 1 }],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'arrow-spacing': ['error', { 'before': true, 'after': true }],
      
      // Airbnb overrides for our codebase
      'no-plusplus': ['error', { 'allowForLoopAfterthoughts': true }],
      'func-names': ['error', 'as-needed'],
      'no-restricted-syntax': [
        'error',
        'ForInStatement',
        'LabeledStatement',
        'WithStatement',
      ],
      
      // Specific rules we want to enforce
      'prefer-const': 'error',
      'prefer-destructuring': ['error', {
        'array': false,
        'object': true
      }],
      'no-restricted-globals': ['error', 'isFinite', 'isNaN'],
      'no-process-env': 'off', // We need to access process.env
      'no-underscore-dangle': ['error', { 'allow': ['_startTime'] }], // Allow _startTime for performance tracking
    }
  }
];