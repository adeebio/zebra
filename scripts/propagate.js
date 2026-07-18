import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");

// List of all directories to copy the app src folder to
const targetDirs = [
  path.join(rootDir, "hosts", "gochrome", "frontend", "src"),
  path.join(rootDir, "hosts", "pwa", "src"),
];

// Delete the above directories
for (const targetDir of targetDirs) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

// Copy the app src folder to the above directories
for (const targetDir of targetDirs) {
  fs.cpSync(srcDir, targetDir, { recursive: true });
  console.log(`Copied ${srcDir} -> ${targetDir}`);
}
