import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { validateAuth } from '@/lib/authMiddleware';

// GET all memories
export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const memories = db.prepare('SELECT * FROM memories ORDER BY createdAt DESC').all();
        return NextResponse.json(memories);
    } catch (error) {
        console.error('Error fetching memories:', error);
        return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
    }
}

// POST a new memory
export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const { content } = await req.json();
        if (!content || !content.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        const id = Date.now().toString();
        const createdAt = Date.now();
        db.prepare('INSERT INTO memories (id, content, createdAt) VALUES (?, ?, ?)').run(id, content.trim(), createdAt);
        return NextResponse.json({ id, content: content.trim(), createdAt });
    } catch (error) {
        console.error('Error saving memory:', error);
        return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 });
    }
}

// DELETE a memory by id (passed as query param)
export async function DELETE(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (id) {
            db.prepare('DELETE FROM memories WHERE id = ?').run(id);
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting memory:', error);
        return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
    }
}
