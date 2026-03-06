import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { validateAuth } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const chats = db.prepare('SELECT * FROM chats ORDER BY updatedAt DESC').all();
        return NextResponse.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authError = validateAuth(request);
    if (authError) return authError;

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const { id, title, updatedAt } = body;
    try {
        db.prepare('INSERT INTO chats (id, title, updatedAt) VALUES (?, ?, ?)').run(id, title, updatedAt);
        return NextResponse.json({ id, title, updatedAt });
    } catch (error) {
        console.error('Error creating chat:', error);
        return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
    }
}
