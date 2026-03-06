import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { isLocalhost } from '@/lib/authMiddleware';

/**
 * Returns the auth token ONLY when called from localhost.
 * This allows the local web UI to auto-authenticate without manual configuration.
 */
export async function GET(req: NextRequest) {
    if (!isLocalhost(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = db.prepare('SELECT authToken FROM settings WHERE id = 1').get() as { authToken?: string } | undefined;
    return NextResponse.json({ token: settings?.authToken || '' });
}
