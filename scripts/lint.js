#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('🔍 Running ESLint...');
  execSync('npx eslint api/**/*.js --fix', { stdio: 'inherit' });
  
  console.log('\n🎨 Running Prettier...');
  execSync('npx prettier --write "api/**/*.js"', { stdio: 'inherit' });
  
  console.log('\n✅ Linting and formatting completed successfully!');
} catch (error) {
  console.error('❌ Linting/formatting failed:', error.message);
  process.exit(1);
}