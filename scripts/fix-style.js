#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Common fixes to apply
const fixes = [
  // Fix double quotes to single quotes
  {
    pattern: /"(?!\\s*:\/\/)(?:[^"\\]|\\.)*"/g,
    replacement: (match) => {
      // Skip if it's a URL (contains ://)
      if (match.includes('://')) return match;
      return `'${match.slice(1, -1)}'`;
    }
  },
  // Fix missing trailing commas in multiline objects/arrays
  // This is more complex, so we'll rely on ESLint --fix for this
  // Fix missing semicolons
  // Fix missing radix in parseInt
  {
    pattern: /parseInt\(([^)]+)\)/g,
    replacement: 'parseInt($1, 10)'
  },
  // Fix trailing spaces
  {
    pattern: /\\s+$/gm,
    replacement: ''
  },
  // Ensure files end with newline
  // We'll handle this separately
];

async function fixFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf8');
    
    // Apply each fix
    for (const fix of fixes) {
      content = content.replace(fix.pattern, fix.replacement);
    }
    
    // Ensure file ends with newline
    if (content && !content.endsWith('\\n')) {
      content += '\\n';
    }
    
    await writeFile(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
  }
}

// Get all JS files in api directory
const apiDir = path.join(process.cwd(), 'api');
const jsFiles = [];

function findJsFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findJsFiles(filePath);
    } else if (path.extname(file) === '.js') {
      jsFiles.push(filePath);
    }
  }
}

findJsFiles(apiDir);

// Fix all files
jsFiles.forEach(fixFile);

console.log(`\\n🔧 Style fixes applied to ${jsFiles.length} files.`);
console.log('Run ESLint again to see remaining issues that need manual fixing.');