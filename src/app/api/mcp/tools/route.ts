import { NextRequest, NextResponse } from "next/server";
import mcpManager from "@/lib/mcpManager";
import { validateAuth } from "@/lib/authMiddleware";

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    await mcpManager.initialize();

    const tools = mcpManager.getAllToolsSync();
    const llmTools = mcpManager.getToolsForLLM();

    return NextResponse.json({
        totalTools: tools.length,
        tools: tools.map(t => ({
            server: t.serverName,
            name: t.name,
            description: t.description,
        })),
        llmFormat: llmTools,
    });
}
