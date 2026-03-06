import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { validateAuth } from "@/lib/authMiddleware";

const SOUL_PATH = path.join(os.homedir(), ".picobot", "workspace", "SOUL.md");
const DEFAULT_NAME = "Eddy";

function extractBotName(): string {
    try {
        const content = fs.readFileSync(SOUL_PATH, "utf-8");
        const match = content.match(/I am (\w+)/i);
        if (match && match[1]) {
            return match[1];
        }
        return DEFAULT_NAME;
    } catch {
        return DEFAULT_NAME;
    }
}

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    return NextResponse.json({ name: extractBotName() });
}
