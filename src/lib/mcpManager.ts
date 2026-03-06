/**
 * MCPManager — Singleton that manages MCP server connections.
 * 
 * Connects to MCP servers via stdio transport, discovers their tools,
 * and dispatches tool calls from the LLM to the correct server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import db from "@/lib/db";

// Types
export interface MCPServerConfig {
    id: string;
    name: string;
    command: string;
    args: string;   // JSON array string
    env: string;     // JSON object string
    enabled: number;
    createdAt: number;
}

export interface MCPTool {
    serverName: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

interface ConnectedServer {
    config: MCPServerConfig;
    client: Client;
    transport: StdioClientTransport;
    tools: MCPTool[];
}

class MCPManager {
    private servers: Map<string, ConnectedServer> = new Map();
    private initialized = false;

    /**
     * Initialize all enabled MCP servers from the database.
     * Safe to call multiple times — only runs once.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const configs = db.prepare(
            'SELECT * FROM mcp_servers WHERE enabled = 1'
        ).all() as MCPServerConfig[];

        for (const config of configs) {
            try {
                await this.connectServer(config);
            } catch (err) {
                console.error(`[MCP] Failed to connect to "${config.name}":`, err);
            }
        }

        const totalTools = this.getAllToolsSync().length;
        console.log(`[MCP] Initialized ${this.servers.size}/${configs.length} servers, ${totalTools} tools available`);
    }

    /**
     * Connect to a single MCP server and discover its tools.
     */
    private async connectServer(config: MCPServerConfig): Promise<void> {
        const parsedArgs = JSON.parse(config.args || '[]') as string[];
        const parsedEnv = JSON.parse(config.env || '{}') as Record<string, string>;

        const transport = new StdioClientTransport({
            command: config.command,
            args: parsedArgs,
            env: { ...process.env, ...parsedEnv } as Record<string, string>,
        });

        const client = new Client({
            name: "eddythebot",
            version: "1.0.0",
        });

        await client.connect(transport);

        // Discover available tools
        const toolsResult = await client.listTools();
        const tools: MCPTool[] = (toolsResult.tools || []).map((t) => ({
            serverName: config.name,
            name: t.name,
            description: t.description || '',
            inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
        }));

        this.servers.set(config.name, { config, client, transport, tools });
        console.log(`[MCP] Connected to "${config.name}" — ${tools.length} tools`);
    }

    /**
     * Get all tools from all connected servers (synchronous — uses cached list).
     */
    getAllToolsSync(): MCPTool[] {
        const allTools: MCPTool[] = [];
        for (const server of this.servers.values()) {
            allTools.push(...server.tools);
        }
        return allTools;
    }

    /**
     * Format tools as OpenAI-compatible `tools` array for the LLM API request.
     */
    getToolsForLLM(): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }> {
        const tools = this.getAllToolsSync();
        if (tools.length === 0) return [];

        return tools.map((t) => ({
            type: 'function' as const,
            function: {
                // Prefix tool name with server name to avoid collisions
                // e.g. "filesystem__read_file"
                name: `${t.serverName}__${t.name}`,
                description: `[${t.serverName}] ${t.description}`,
                parameters: t.inputSchema,
            },
        }));
    }

    /**
     * Call a tool on the correct MCP server.
     * @param qualifiedName The prefixed tool name, e.g. "filesystem__read_file"
     * @param args The tool arguments as a JSON object
     */
    async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
        const separatorIndex = qualifiedName.indexOf('__');
        if (separatorIndex === -1) {
            return JSON.stringify({ error: `Invalid tool name format: ${qualifiedName}` });
        }

        const serverName = qualifiedName.substring(0, separatorIndex);
        const toolName = qualifiedName.substring(separatorIndex + 2);

        const server = this.servers.get(serverName);
        if (!server) {
            return JSON.stringify({ error: `MCP server "${serverName}" not found or not connected` });
        }

        try {
            const result = await server.client.callTool({
                name: toolName,
                arguments: args,
            });

            // Extract text content from the result
            if (result.content && Array.isArray(result.content)) {
                const textParts = result.content
                    .filter((c: { type: string }) => c.type === 'text')
                    .map((c: { type: string; text?: string }) => c.text || '');
                return textParts.join('\n') || JSON.stringify(result.content);
            }

            return JSON.stringify(result);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[MCP] Error calling ${qualifiedName}:`, message);
            return JSON.stringify({ error: `Tool call failed: ${message}` });
        }
    }

    /**
     * Add a new MCP server config to the database and connect to it.
     */
    async addServer(name: string, command: string, args: string[] = [], env: Record<string, string> = {}): Promise<{ success: boolean; error?: string; toolCount?: number }> {
        const id = `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const config: MCPServerConfig = {
            id,
            name,
            command,
            args: JSON.stringify(args),
            env: JSON.stringify(env),
            enabled: 1,
            createdAt: Date.now(),
        };

        try {
            db.prepare(
                'INSERT INTO mcp_servers (id, name, command, args, env, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(config.id, config.name, config.command, config.args, config.env, config.enabled, config.createdAt);

            await this.connectServer(config);
            const server = this.servers.get(name);
            return { success: true, toolCount: server?.tools.length || 0 };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            // Clean up DB entry if connection failed
            try { db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id); } catch { /* ignore */ }
            return { success: false, error: message };
        }
    }

    /**
     * Remove an MCP server — disconnect and delete from DB.
     */
    async removeServer(name: string): Promise<void> {
        const server = this.servers.get(name);
        if (server) {
            try {
                await server.client.close();
            } catch { /* ignore close errors */ }
            this.servers.delete(name);
        }
        db.prepare('DELETE FROM mcp_servers WHERE name = ?').run(name);
    }

    /**
     * Toggle a server's enabled status.
     */
    async toggleServer(name: string, enabled: boolean): Promise<void> {
        db.prepare('UPDATE mcp_servers SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);

        if (enabled) {
            const config = db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name) as MCPServerConfig | undefined;
            if (config) {
                try {
                    await this.connectServer(config);
                } catch (err) {
                    console.error(`[MCP] Failed to enable "${name}":`, err);
                }
            }
        } else {
            const server = this.servers.get(name);
            if (server) {
                try { await server.client.close(); } catch { /* ignore */ }
                this.servers.delete(name);
            }
        }
    }

    /**
     * Restart a specific server's connection.
     */
    async restartServer(name: string): Promise<{ success: boolean; error?: string }> {
        const server = this.servers.get(name);
        const config = server?.config || db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name) as MCPServerConfig | undefined;

        if (!config) {
            return { success: false, error: `Server "${name}" not found` };
        }

        // Disconnect existing
        if (server) {
            try { await server.client.close(); } catch { /* ignore */ }
            this.servers.delete(name);
        }

        // Reconnect
        try {
            await this.connectServer(config);
            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    /**
     * Get status info for all configured servers.
     */
    getServerStatuses(): Array<{
        id: string;
        name: string;
        command: string;
        args: string[];
        enabled: boolean;
        connected: boolean;
        toolCount: number;
        tools: string[];
    }> {
        const configs = db.prepare('SELECT * FROM mcp_servers').all() as MCPServerConfig[];
        return configs.map((c) => {
            const connected = this.servers.has(c.name);
            const server = this.servers.get(c.name);
            return {
                id: c.id,
                name: c.name,
                command: c.command,
                args: JSON.parse(c.args || '[]'),
                enabled: c.enabled === 1,
                connected,
                toolCount: server?.tools.length || 0,
                tools: server?.tools.map(t => t.name) || [],
            };
        });
    }

    /**
     * Shut down all server connections gracefully.
     */
    async shutdown(): Promise<void> {
        for (const [name, server] of this.servers) {
            try {
                await server.client.close();
                console.log(`[MCP] Disconnected from "${name}"`);
            } catch { /* ignore */ }
        }
        this.servers.clear();
        this.initialized = false;
    }
}

// Export singleton
const mcpManager = new MCPManager();
export default mcpManager;
