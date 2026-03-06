/**
 * MCPManager — Singleton that manages MCP server connections.
 * 
 * Connects to MCP servers via stdio transport, discovers their tools,
 * and dispatches tool calls from the LLM to the correct server.
 * 
 * Includes schema simplification for complex nested tool schemas
 * (e.g. Netlify's selectSchema pattern) so LLMs can call them easily.
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
    builtin?: boolean; // true for built-in servers (not user-removable)
}

export interface MCPTool {
    serverName: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

/**
 * Mapping from a simplified tool name back to the original MCP tool + operation.
 * Used to reconstruct the nested selectSchema format when calling the tool.
 */
interface SimplifiedToolMapping {
    originalServerName: string;
    originalToolName: string;
    operation: string;
    // The params properties from the original schema (for reference)
    paramsProperties: Record<string, unknown>;
    paramsRequired: string[];
}

interface ConnectedServer {
    config: MCPServerConfig;
    client: Client;
    transport: StdioClientTransport;
    tools: MCPTool[];
}

// ─── Built-in Server Definitions ───────────────────────────────────────────────

function getBuiltinServers(): MCPServerConfig[] {
    const servers: MCPServerConfig[] = [];

    // Netlify MCP — always available if token is configured
    const settings = db.prepare('SELECT netlifyToken FROM settings WHERE id = 1').get() as { netlifyToken?: string } | undefined;
    const netlifyToken = settings?.netlifyToken;
    if (netlifyToken) {
        servers.push({
            id: 'builtin_netlify',
            name: 'netlify',
            command: 'npx',
            args: JSON.stringify(['-y', '@netlify/mcp']),
            env: JSON.stringify({ NETLIFY_AUTH_TOKEN: netlifyToken }),
            enabled: 1,
            createdAt: 0,
            builtin: true,
        });
    }

    return servers;
}

// ─── Schema Simplification ─────────────────────────────────────────────────────

/**
 * Detect if a tool uses the Netlify-style "selectSchema" pattern.
 * If so, extract each operation into its own simplified tool.
 */
function simplifyToolSchemas(
    serverName: string,
    tools: MCPTool[]
): { simplifiedTools: MCPTool[]; mappings: Map<string, SimplifiedToolMapping> } {
    const simplifiedTools: MCPTool[] = [];
    const mappings = new Map<string, SimplifiedToolMapping>();

    for (const tool of tools) {
        const schema = tool.inputSchema as any;
        const selectSchema = schema?.properties?.selectSchema;

        // Check if this is a selectSchema-based tool
        if (!selectSchema) {
            // Not a selectSchema tool — pass through as-is
            simplifiedTools.push(tool);
            continue;
        }

        // Extract operations from the schema
        const operationSchemas: any[] = [];

        if (selectSchema.anyOf && Array.isArray(selectSchema.anyOf)) {
            // Multiple operations via anyOf
            operationSchemas.push(...selectSchema.anyOf);
        } else if (selectSchema.properties?.operation) {
            // Single operation (direct object, no anyOf)
            operationSchemas.push(selectSchema);
        }

        if (operationSchemas.length === 0) {
            // Can't simplify — pass through
            simplifiedTools.push(tool);
            continue;
        }

        // Create a simplified tool for each operation
        for (const opSchema of operationSchemas) {
            const operation = opSchema.properties?.operation?.const;
            if (!operation) continue;

            const params = opSchema.properties?.params || {};
            const paramsProperties = params.properties || {};
            const paramsRequired = params.required || [];

            // Create a clean, flat tool name: snake_case the operation
            const simplifiedName = operation.replace(/-/g, '_');
            const qualifiedName = `${serverName}__${simplifiedName}`;

            // Build a simple flat schema from the params
            const simplifiedSchema: Record<string, unknown> = {
                type: 'object',
                properties: { ...paramsProperties },
                required: [...paramsRequired],
                additionalProperties: false,
            };

            // Build a clear description
            const originalDesc = tool.description || '';
            const paramsList = Object.keys(paramsProperties).join(', ');
            const description = `[Netlify] ${operation}${paramsList ? ` (params: ${paramsList})` : ''}`;

            simplifiedTools.push({
                serverName,
                name: simplifiedName,
                description,
                inputSchema: simplifiedSchema,
            });

            // Store mapping for reconstruction
            mappings.set(qualifiedName, {
                originalServerName: serverName,
                originalToolName: tool.name,
                operation,
                paramsProperties,
                paramsRequired,
            });
        }
    }

    return { simplifiedTools, mappings };
}

/**
 * Reconstruct the nested selectSchema format from flat arguments.
 */
function reconstructSelectSchema(
    mapping: SimplifiedToolMapping,
    flatArgs: Record<string, unknown>
): Record<string, unknown> {
    return {
        selectSchema: {
            operation: mapping.operation,
            params: { ...flatArgs },
        },
    };
}

// ─── MCPManager Class ──────────────────────────────────────────────────────────

class MCPManager {
    private servers: Map<string, ConnectedServer> = new Map();
    private initialized = false;

    /** Maps simplified tool names → original tool + operation for reconstruction */
    private simplifiedMappings: Map<string, SimplifiedToolMapping> = new Map();

    /** Stores the simplified tools for LLM consumption */
    private cachedSimplifiedTools: MCPTool[] = [];

    /**
     * Initialize all enabled MCP servers from the database + built-in servers.
     * Safe to call multiple times — only runs once.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Connect built-in servers
        const builtins = getBuiltinServers();
        for (const config of builtins) {
            try {
                await this.connectServer(config);
            } catch (err) {
                console.error(`[MCP] Failed to connect built-in "${config.name}":`, err);
            }
        }

        // 2. Connect user-added servers from DB (skip any that share a name with a built-in)
        const builtinNames = new Set(builtins.map(b => b.name));
        const configs = db.prepare(
            'SELECT * FROM mcp_servers WHERE enabled = 1'
        ).all() as MCPServerConfig[];

        for (const config of configs) {
            if (builtinNames.has(config.name)) {
                console.log(`[MCP] Skipping user server "${config.name}" — overridden by built-in`);
                continue;
            }
            try {
                await this.connectServer(config);
            } catch (err) {
                console.error(`[MCP] Failed to connect to "${config.name}":`, err);
            }
        }

        // 3. Build simplified tool cache
        this.rebuildSimplifiedToolCache();

        const totalTools = this.cachedSimplifiedTools.length;
        console.log(`[MCP] Initialized ${this.servers.size} servers, ${totalTools} simplified tools available`);
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
     * Rebuild the simplified tool cache after server connections change.
     */
    private rebuildSimplifiedToolCache(): void {
        const allSimplified: MCPTool[] = [];
        this.simplifiedMappings.clear();

        for (const server of this.servers.values()) {
            const { simplifiedTools, mappings } = simplifyToolSchemas(
                server.config.name,
                server.tools
            );
            allSimplified.push(...simplifiedTools);
            for (const [key, value] of mappings) {
                this.simplifiedMappings.set(key, value);
            }
        }

        this.cachedSimplifiedTools = allSimplified;
    }

    /**
     * Get all tools from all connected servers (synchronous — uses cached list).
     * Returns the SIMPLIFIED tools (after schema flattening).
     */
    getAllToolsSync(): MCPTool[] {
        return this.cachedSimplifiedTools;
    }

    /**
     * Format tools as OpenAI-compatible `tools` array for the LLM API request.
     * Uses simplified (flattened) schemas.
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
                // e.g. "filesystem__read_file" or "netlify__deploy_site"
                name: `${t.serverName}__${t.name}`,
                description: `[${t.serverName}] ${t.description}`,
                parameters: t.inputSchema,
            },
        }));
    }

    /**
     * Call a tool on the correct MCP server.
     * Handles both simplified (flattened) tools and direct tools.
     * 
     * @param qualifiedName The prefixed tool name, e.g. "netlify__deploy_site"
     * @param args The tool arguments as a JSON object
     */
    async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
        // Check if this is a simplified tool that needs schema reconstruction
        const mapping = this.simplifiedMappings.get(qualifiedName);
        if (mapping) {
            // Reconstruct the nested selectSchema format
            const reconstructedArgs = reconstructSelectSchema(mapping, args);
            console.log(`[MCP] Simplified tool "${qualifiedName}" → original "${mapping.originalToolName}" operation="${mapping.operation}"`);

            const server = this.servers.get(mapping.originalServerName);
            if (!server) {
                return JSON.stringify({ error: `MCP server "${mapping.originalServerName}" not found` });
            }

            try {
                const result = await server.client.callTool({
                    name: mapping.originalToolName,
                    arguments: reconstructedArgs,
                });

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

        // Direct (non-simplified) tool call — original logic
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
            this.rebuildSimplifiedToolCache();
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
        this.rebuildSimplifiedToolCache();
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
                    this.rebuildSimplifiedToolCache();
                } catch (err) {
                    console.error(`[MCP] Failed to enable "${name}":`, err);
                }
            }
        } else {
            const server = this.servers.get(name);
            if (server) {
                try { await server.client.close(); } catch { /* ignore */ }
                this.servers.delete(name);
                this.rebuildSimplifiedToolCache();
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
            this.rebuildSimplifiedToolCache();
            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    /**
     * Get status info for all configured servers (built-in + user).
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
        builtin: boolean;
    }> {
        const results: Array<{
            id: string;
            name: string;
            command: string;
            args: string[];
            enabled: boolean;
            connected: boolean;
            toolCount: number;
            tools: string[];
            builtin: boolean;
        }> = [];

        // Built-in servers
        for (const config of getBuiltinServers()) {
            const connected = this.servers.has(config.name);
            const server = this.servers.get(config.name);
            // Count simplified tools for this server
            const simplifiedCount = this.cachedSimplifiedTools.filter(t => t.serverName === config.name).length;
            results.push({
                id: config.id,
                name: config.name,
                command: config.command,
                args: JSON.parse(config.args || '[]'),
                enabled: true,
                connected,
                toolCount: simplifiedCount || server?.tools.length || 0,
                tools: this.cachedSimplifiedTools
                    .filter(t => t.serverName === config.name)
                    .map(t => t.name),
                builtin: true,
            });
        }

        // User-added servers from DB
        const configs = db.prepare('SELECT * FROM mcp_servers').all() as MCPServerConfig[];
        const builtinNames = new Set(getBuiltinServers().map(b => b.name));
        for (const c of configs) {
            if (builtinNames.has(c.name)) continue; // Skip if overridden by built-in
            const connected = this.servers.has(c.name);
            const server = this.servers.get(c.name);
            results.push({
                id: c.id,
                name: c.name,
                command: c.command,
                args: JSON.parse(c.args || '[]'),
                enabled: c.enabled === 1,
                connected,
                toolCount: server?.tools.length || 0,
                tools: server?.tools.map(t => t.name) || [],
                builtin: false,
            });
        }

        return results;
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
        this.simplifiedMappings.clear();
        this.cachedSimplifiedTools = [];
    }
}

// Export singleton
const mcpManager = new MCPManager();
export default mcpManager;
