import path from "path";
import fs from "fs";

/**
 * Central workspace path — always inside the app directory.
 * Works identically on Windows, macOS, and Linux.
 */
export const WORKSPACE_DIR = path.join(process.cwd(), "workspace");

// Auto-create on first import
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}
