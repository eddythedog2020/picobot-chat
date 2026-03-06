import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { validateAuth } from "@/lib/authMiddleware";
import { WORKSPACE_DIR } from "@/lib/paths";

const SOUL_PATH = path.join(WORKSPACE_DIR, "SOUL.md");
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
