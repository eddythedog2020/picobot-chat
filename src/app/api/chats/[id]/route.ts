import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function DELETE(request: Request, context: any) {
    try {
        const { id } = await Promise.resolve(context.params);
        db.prepare('DELETE FROM chats WHERE id = ?').run(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: any) {
    try {
        const { id } = await Promise.resolve(context.params);
        const body = await request.json();

        const updates: string[] = [];
        const values: any[] = [];

        if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
        if (body.updatedAt !== undefined) { updates.push('updatedAt = ?'); values.push(body.updatedAt); }
        if (body.compactedSummary !== undefined) { updates.push('compactedSummary = ?'); values.push(body.compactedSummary); }
        if (body.compactedAtIndex !== undefined) { updates.push('compactedAtIndex = ?'); values.push(body.compactedAtIndex); }

        if (updates.length > 0) {
            values.push(id);
            db.prepare(`UPDATE chats SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating chat:', error);
        return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
    }
}
