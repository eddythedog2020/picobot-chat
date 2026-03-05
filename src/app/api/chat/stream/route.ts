import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import db from "@/lib/db";
import { detectSearchCapability } from "@/lib/searchDetection";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const { message, history, compactedSummary, memories } = await req.json();

    if (!message) {
        return new Response(JSON.stringify({ error: "Message is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Build persistent memories context
    let memoriesContext = '';
    if (memories) {
        memoriesContext = `(System Note: The following are persistent user memories/preferences. Always keep these in mind when responding.)\n${memories}\n\n`;
    }

    // Build conversation context from compacted summary or history
    let conversationContext = memoriesContext;
    if (compactedSummary) {
        conversationContext += `(System Note: The following is a compacted summary of the earlier conversation. Use it to maintain continuity and understand references to earlier discussions.)\n\n${compactedSummary}\n\n`;
        if (history && Array.isArray(history) && history.length > 0) {
            const contextLines = history.map((msg: { role: string; content: string }) => {
                const role = msg.role === 'user' ? 'User' : 'Assistant';
                const content = msg.role === 'ai' && msg.content.length > 800
                    ? msg.content.substring(0, 800) + '...[truncated]'
                    : msg.content;
                return `${role}: ${content}`;
            });
            conversationContext += `(Recent messages since compaction:)\n\n${contextLines.join('\n\n')}\n\n---\nCurrent message:\n`;
        } else {
            conversationContext += `---\nCurrent message:\n`;
        }
    } else if (history && Array.isArray(history) && history.length > 0) {
        const contextLines = history.map((msg: { role: string; content: string }) => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const content = msg.role === 'ai' && msg.content.length > 800
                ? msg.content.substring(0, 800) + '...[truncated]'
                : msg.content;
            return `${role}: ${content}`;
        });
        conversationContext += `(System Note: Here is the conversation history for context. Use this to understand references like "the data", "that table", etc.)\n\n${contextLines.join('\n\n')}\n\n---\nCurrent message:\n`;
    }

    // Read settings from SQLite
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

    // Append instructions
    let promptSuffix = "\n\n(System Note: If you write or modify any code, scripts, or files to fulfill this request, you MUST output the complete code in a markdown fenced code block in your final response. This is required so the Web UI can display the code in the Canvas panel.)";

    if (effectiveSearch) {
        promptSuffix += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, real-time data, or need to look something up, prefer using your built-in search capability directly instead of the browser tool — it is significantly faster and more reliable.)`;
    }

    promptSuffix += `\n\n(System Note: Whenever you reference news articles, current events, statistics, or factual claims that come from external sources, you MUST cite your sources. Include the publication name and URL where possible. Format citations clearly at the end of your response, e.g. "Source: [Publication Name](URL)". Never present news or factual information without attribution.)`;

    const fullMessage = conversationContext + message + promptSuffix;

    // Resolve binary path
    const ext = process.platform === "win32" ? ".exe" : "";
    const binPath = path.join(process.cwd(), "bin", `picobot${ext}`);

    // Build args
    const args = ["agent", "-m", fullMessage];
    if (settings?.defaultModel) {
        args.push("-M", settings.defaultModel);
    }

    // Override environment
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (settings) {
        if (settings.apiKey) env.OPENAI_API_KEY = settings.apiKey;
        if (settings.apiBaseUrl) env.OPENAI_API_BASE = settings.apiBaseUrl;
    }

    // Create a readable stream from the process stdout
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const proc = spawn(binPath, args, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let killed = false;
            const timeout = setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Timeout after 2 minutes" })}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            }, 120000);

            proc.stdout.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
            });

            proc.stderr.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
            });

            proc.on('close', () => {
                if (!killed) {
                    clearTimeout(timeout);
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
