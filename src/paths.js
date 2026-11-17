// Where Ballast keeps its state (portfolio, price cache).
// From a git checkout: ./data next to the code. Installed from npm (npx / global): ~/.ballast.
// BALLAST_HOME (or the older XRAY_HOME) overrides both.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const installed = pkgDir.split(/[\\/]/).some((part) => part === "node_modules" || part === "_npx");
export const DATA_DIR = process.env.BALLAST_HOME || process.env.XRAY_HOME || (installed ? join(homedir(), ".ballast") : join(pkgDir, "data"));
mkdirSync(DATA_DIR, { recursive: true });
export const dataFile = (name) => join(DATA_DIR, name);
