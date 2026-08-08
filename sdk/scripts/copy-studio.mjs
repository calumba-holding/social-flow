import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceDir = join(root, "src", "studio");
const targetDir = join(root, "dist", "studio");

mkdirSync(targetDir, { recursive: true });
for (const name of readdirSync(sourceDir)) {
  const srcPath = join(sourceDir, name);
  if (!statSync(srcPath).isFile()) continue;
  copyFileSync(srcPath, join(targetDir, name));
}
console.log(`[sdk] copied studio assets -> ${targetDir}`);
