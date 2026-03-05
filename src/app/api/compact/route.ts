import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import db from "@/lib/db";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
    const { messages, customPrompt } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    // Read settings from SQLite
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
        apiBaseUrl: string;
        apiKey: string;
        defaultModel: string;
    } | undefined;

    // Build conversation text for summarization
    const conversationText = messages.map((msg: { role: string; content: string }) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
    }).join('\n\n');

    // Build the compaction prompt
    let compactPrompt = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the following conversation. 

IMPORTANT RULES:
- Preserve ALL key facts, data, decisions, and context
- Include any specific values, numbers, names, code snippets, or table data that were discussed
- Note any ongoing tasks, preferences, or instructions the user has given
- Keep the summary structured and scannable
- The summary should be detailed enough that a new AI assistant could continue the conversation seamlessly
- Do NOT include any meta-commentary like "Here is the summary" — just output the summary directly`;

    if (customPrompt) {
        compactPrompt += `\n\nAdditional instruction from user: ${customPrompt}`;
    }

    compactPrompt += `\n\n--- CONVERSATION TO SUMMARIZE ---\n\n${conversationText}\n\n--- END OF CONVERSATION ---\n\nProvide the summary now:`;

    // Resolve binary path
    const ext = process.platform === "win32" ? ".exe" : "";
    const binPath = path.join(process.cwd(), "bin", `picobot${ext}`);

    // Build args
    const args = ["agent", "-m", compactPrompt];
    if (settings?.defaultModel) {
        args.push("-M", settings.defaultModel);
    }

    // Override the provider via environment variables
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (settings) {
        if (settings.apiKey) env.OPENAI_API_KEY = settings.apiKey;
        if (settings.apiBaseUrl) env.OPENAI_API_BASE = settings.apiBaseUrl;
    }

    try {
        const { stdout, stderr } = await execFileAsync(binPath, args, {
            env,
            timeout: 120000,
        });

        const summary = (stdout || stderr).trim();
        return NextResponse.json({ summary });
    } catch (e: any) {
        const fallback = e.stdout || e.stderr || e.message || "Compaction failed";
        return NextResponse.json({ summary: fallback });
    }
}
