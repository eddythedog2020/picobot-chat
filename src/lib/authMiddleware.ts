import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * Validates the auth token from the request.
 * Checks Authorization: Bearer <token> header first, then ?token= query param.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function validateAuth(req: NextRequest): NextResponse | null {
    const settings = db.prepare('SELECT authToken FROM settings WHERE id = 1').get() as { authToken?: string } | undefined;
    const expectedToken = settings?.authToken;

    // If no token is configured yet, allow all requests (first-run state)
    if (!expectedToken) return null;

    // Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (token === expectedToken) return null;
    }

    // Check query parameter (for SSE/EventSource which can't set headers)
    const tokenParam = req.nextUrl.searchParams.get('token');
    if (tokenParam === expectedToken) return null;

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Checks if the request originates from localhost.
 */
export function isLocalhost(req: NextRequest): boolean {
    const host = req.headers.get('host') || '';
    const forwarded = req.headers.get('x-forwarded-for') || '';
    return (
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1') ||
        host.startsWith('::1') ||
        forwarded.includes('127.0.0.1') ||
        forwarded.includes('::1')
    );
}
