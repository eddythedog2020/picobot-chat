import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateAuth } from '@/lib/authMiddleware';

const PICOBOT_CONFIG_PATH = path.join(os.homedir(), '.picobot', 'config.json');

function readPicobotConfig() {
    try {
        return JSON.parse(fs.readFileSync(PICOBOT_CONFIG_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function writePicobotConfig(config: Record<string, unknown>) {
    try {
        const dir = path.dirname(PICOBOT_CONFIG_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(PICOBOT_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to write PicoBot config.json:', e);
    }
}

function maskSecret(secret: string): string {
    if (!secret || secret.length <= 8) return '****';
    return '****' + secret.slice(-4);
}

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
        const config = readPicobotConfig();

        // Merge channel settings from PicoBot's config.json
        const channels = config?.channels || {};

        // Mask sensitive values
        const maskedApiKey = maskSecret(settings?.apiKey as string || '');

        return NextResponse.json({
            ...settings,
            apiKey: maskedApiKey,
            authToken: undefined, // Never expose auth token
            telegram: {
                enabled: channels?.telegram?.enabled || false,
                token: maskSecret(channels?.telegram?.token || ''),
                allowFrom: (channels?.telegram?.allowFrom || []).join(', '),
            },
            discord: {
                enabled: channels?.discord?.enabled || false,
                token: maskSecret(channels?.discord?.token || ''),
                allowFrom: (channels?.discord?.allowFrom || []).join(', '),
            },
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authError = validateAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { apiBaseUrl, apiKey, defaultModel, telegram, discord, allowCodeExecution } = body;

        // Save LLM settings to SQLite
        db.prepare('UPDATE settings SET apiBaseUrl = ?, apiKey = ?, defaultModel = ? WHERE id = 1').run(
            apiBaseUrl, apiKey, defaultModel
        );

        // Save code execution setting
        if (allowCodeExecution !== undefined) {
            db.prepare('UPDATE settings SET allowCodeExecution = ? WHERE id = 1').run(allowCodeExecution);
        }

        // Sync everything to PicoBot's config.json
        const config = readPicobotConfig();

        // Provider settings
        if (!config.providers) config.providers = {};
        if (!config.providers.openai) config.providers.openai = {};
        config.providers.openai.apiKey = apiKey;
        config.providers.openai.apiBase = apiBaseUrl;

        // Model
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        config.agents.defaults.model = defaultModel;

        // Channel settings
        if (!config.channels) config.channels = {};

        // Telegram
        if (telegram) {
            config.channels.telegram = {
                enabled: telegram.enabled || false,
                token: telegram.token || '',
                allowFrom: telegram.allowFrom
                    ? telegram.allowFrom.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [],
            };
        }

        // Discord
        if (discord) {
            config.channels.discord = {
                enabled: discord.enabled || false,
                token: discord.token || '',
                allowFrom: discord.allowFrom
                    ? discord.allowFrom.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [],
            };
        }

        writePicobotConfig(config);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
