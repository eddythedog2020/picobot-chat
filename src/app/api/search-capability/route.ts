import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { detectSearchCapability } from '@/lib/searchDetection';

export async function GET() {
    try {
        const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
            apiBaseUrl: string;
            apiKey: string;
            defaultModel: string;
            preferLlmSearch?: number;
        } | undefined;

        if (!settings) {
            return NextResponse.json({
                hasSearch: false,
                provider: 'Unknown',
                confidence: 'low',
                detail: 'No settings configured yet',
                override: null,
            });
        }

        const detected = detectSearchCapability(settings.apiBaseUrl, settings.defaultModel);

        // Check for manual override in the database
        const overrideValue = settings.preferLlmSearch;
        const hasOverride = overrideValue !== null && overrideValue !== undefined;

        return NextResponse.json({
            ...detected,
            override: hasOverride ? overrideValue === 1 : null,
            // Effective value: override wins, otherwise use detection
            effectiveSearch: hasOverride ? overrideValue === 1 : detected.hasSearch,
        });
    } catch (error) {
        console.error('Error detecting search capability:', error);
        return NextResponse.json(
            { error: 'Failed to detect search capability' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const { override } = await request.json();

        // Ensure the column exists
        try {
            db.exec('ALTER TABLE settings ADD COLUMN preferLlmSearch INTEGER DEFAULT NULL');
        } catch {
            // Column already exists, that's fine
        }

        if (override === null || override === undefined) {
            db.prepare('UPDATE settings SET preferLlmSearch = NULL WHERE id = 1').run();
        } else {
            db.prepare('UPDATE settings SET preferLlmSearch = ? WHERE id = 1').run(override ? 1 : 0);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving search override:', error);
        return NextResponse.json(
            { error: 'Failed to save search preference' },
            { status: 500 }
        );
    }
}
