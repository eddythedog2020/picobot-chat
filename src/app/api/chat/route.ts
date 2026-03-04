import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import db from "@/lib/db";
import { detectSearchCapability } from "@/lib/searchDetection";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
    const { message } = await req.json();

    if (!message) {
        return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Read settings from SQLite (these are the user's preferred provider settings)
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
        apiBaseUrl: string;
        apiKey: string;
        defaultModel: string;
        preferLlmSearch?: number | null;
    } | undefined;

    // Detect search capability
    const detected = detectSearchCapability(
        settings?.apiBaseUrl || '',
        settings?.defaultModel || ''
    );
    const hasOverride = settings?.preferLlmSearch !== null && settings?.preferLlmSearch !== undefined;
    const effectiveSearch = hasOverride ? settings!.preferLlmSearch === 1 : detected.hasSearch;

    // Append instructions for Canvas
    let promptSuffix = "\n\n(System Note: If you write or modify any code, scripts, or files to fulfill this request, you MUST output the complete code in a markdown fenced code block in your final response. This is required so the Web UI can display the code in the Canvas panel.)";

    // If the LLM has native search, tell PicoBot to prefer it
    if (effectiveSearch) {
        promptSuffix += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, real-time data, or need to look something up, prefer using your built-in search capability directly instead of the browser tool — it is significantly faster and more reliable.)`;
    }

    const fullMessage = message + promptSuffix;




    // Resolve binary path
    const ext = process.platform === "win32" ? ".exe" : "";
    const binPath = path.join(process.cwd(), "bin", `picobot${ext}`);

    // Build args — use -M flag to override model per-request
    const args = ["agent", "-m", fullMessage];
    if (settings?.defaultModel) {
        args.push("-M", settings.defaultModel);
    }

    // Override the provider via environment variables so the chat uses
    // the SQLite settings (e.g. OpenRouter) while PicoBot's config.json
    // can stay pointed at the local Ollama for gateway/heartbeat use.
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (settings) {
        if (settings.apiKey) env.OPENAI_API_KEY = settings.apiKey;
        if (settings.apiBaseUrl) env.OPENAI_API_BASE = settings.apiBaseUrl;
    }

    try {
        const { stdout, stderr } = await execFileAsync(binPath, args, {
            env,
            timeout: 120000, // 2 min timeout
        });

        const response = (stdout || stderr).trim();
        return NextResponse.json({ response });
    } catch (e: any) {
        const fallback = e.stdout || e.stderr || e.message || "PicoBot error";
        return NextResponse.json({ response: fallback });
    }
}
