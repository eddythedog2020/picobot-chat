import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import mcpManager from "@/lib/mcpManager";
import { validateAuth } from "@/lib/authMiddleware";

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    // Initialize MCP servers if not already done
    await mcpManager.initialize();

    const servers = mcpManager.getServerStatuses();
    return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const { name, command, args, env } = await req.json();

    if (!name || !command) {
        return NextResponse.json({ error: "Name and command are required" }, { status: 400 });
    }

    const result = await mcpManager.addServer(
        name,
        command,
        args || [],
        env || {}
    );

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
        message: `Server "${name}" added successfully`,
        toolCount: result.toolCount,
    });
}

export async function DELETE(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const { name } = await req.json();
    if (!name) {
        return NextResponse.json({ error: "Server name is required" }, { status: 400 });
    }

    await mcpManager.removeServer(name);
    return NextResponse.json({ message: `Server "${name}" removed` });
}

export async function PATCH(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const { name, action, enabled } = await req.json();

    if (!name) {
        return NextResponse.json({ error: "Server name is required" }, { status: 400 });
    }

    if (action === 'restart') {
        const result = await mcpManager.restartServer(name);
        return NextResponse.json(result);
    }

    if (action === 'toggle' && typeof enabled === 'boolean') {
        await mcpManager.toggleServer(name, enabled);
        return NextResponse.json({ message: `Server "${name}" ${enabled ? 'enabled' : 'disabled'}` });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
