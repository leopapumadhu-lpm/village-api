import fs from "fs";
import path from "path";
import process from "node:process";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const cwd = process.cwd();
const allowDirty = process.argv.includes("--allow-dirty");

const envFiles = [
  path.join(cwd, ".env"),
  path.join(cwd, ".env.local"),
  path.join(cwd, "frontend", ".env"),
  path.join(cwd, "frontend", ".env.local"),
];

function parseEnvFiles() {
  const parsed = {};
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    Object.assign(parsed, dotenv.parse(content));
  }
  return parsed;
}

const fileEnv = parseEnvFiles();

function getEnv(name) {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && String(fromProcess).trim() !== "") {
    return String(fromProcess).trim();
  }
  const fromFile = fileEnv[name];
  if (fromFile !== undefined && String(fromFile).trim() !== "") {
    return String(fromFile).trim();
  }
  return "";
}

function checkMissing(keys) {
  return keys.filter((key) => !getEnv(key));
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("your_") ||
    normalized.includes("your-") ||
    normalized.includes("yourdomain") ||
    normalized.includes("example") ||
    normalized.includes("changeme") ||
    normalized === "password" ||
    normalized.endsWith("...")
  );
}

function listPlaceholders(keys) {
  return keys.filter((key) => {
    const value = getEnv(key);
    return value && isPlaceholder(value);
  });
}

function checkGitClean() {
  const out = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  return out.length === 0;
}

const backendRequired = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "CORS_ORIGINS",
  "FRONTEND_URL",
];

const emailRequired = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SENDER_EMAIL",
];

const stripeRequired = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PREMIUM_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_UNLIMITED_PRICE_ID",
];

const frontendRequired = ["VITE_API_URL"];

let failed = false;

if (!allowDirty) {
  const clean = checkGitClean();
  if (!clean) {
    failed = true;
    console.error("❌ Git working tree is dirty. Commit/stash before deploy.");
  } else {
    console.log("✅ Git working tree is clean.");
  }
} else {
  console.log("⚠️ Skipping git cleanliness check (--allow-dirty).");
}

const sections = [
  { name: "Backend env", keys: backendRequired },
  { name: "Email env", keys: emailRequired },
  { name: "Stripe env", keys: stripeRequired },
  { name: "Frontend env", keys: frontendRequired },
];

for (const section of sections) {
  const missing = checkMissing(section.keys);
  const placeholders = listPlaceholders(section.keys);

  if (missing.length > 0) {
    failed = true;
    console.error(`❌ ${section.name} missing: ${missing.join(", ")}`);
  } else {
    console.log(`✅ ${section.name} present.`);
  }

  if (placeholders.length > 0) {
    failed = true;
    console.error(`❌ ${section.name} has placeholder values: ${placeholders.join(", ")}`);
  }
}

const frontendUrl = getEnv("FRONTEND_URL");
const apiUrl = getEnv("VITE_API_URL");
if (frontendUrl && !/^https:\/\//.test(frontendUrl)) {
  failed = true;
  console.error("❌ FRONTEND_URL should use https:// in production.");
}
if (apiUrl && !/^https:\/\//.test(apiUrl)) {
  failed = true;
  console.error("❌ VITE_API_URL should use https:// in production.");
}

if (failed) {
  console.error("\nPredeploy check failed.");
  process.exit(1);
}

console.log("\n✅ Predeploy check passed.");
