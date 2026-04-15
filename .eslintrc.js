module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
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
  },
};