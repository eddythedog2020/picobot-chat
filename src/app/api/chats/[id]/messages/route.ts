import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request, context: any) {
    try {
        const { id: chatId } = await Promise.resolve(context.params);
        const messages = db.prepare('SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC').all(chatId) as any[];
        // Parse images JSON string back to array
        const parsed = messages.map(msg => ({
            ...msg,
            images: msg.images ? JSON.parse(msg.images) : undefined,
        }));
        return NextResponse.json(parsed);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
}

export async function POST(request: Request, context: any) {
    try {
        const { id: chatId } = await Promise.resolve(context.params);
        const { id, role, content, images, timestamp } = await request.json();

        // Store images as JSON string (or null)
        const imagesJson = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : null;

        db.prepare('INSERT OR REPLACE INTO messages (id, chatId, role, content, images, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
            id, chatId, role, content, imagesJson, timestamp
        );

        db.prepare('UPDATE chats SET updatedAt = ? WHERE id = ?').run(timestamp, chatId);

        return NextResponse.json({ id, chatId, role, content, timestamp });
    } catch (error) {
        console.error('Error adding message:', error);
        return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
    }
}

