import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { validateAuth } from "@/lib/authMiddleware";
import { WORKSPACE_DIR } from "@/lib/paths";

/**
 * POST /api/workspace/upload-image
 * Saves a base64 data URL image to the workspace uploads directory.
 * Returns the file path so the code execution engine can access it.
 */
export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const { imageDataUrl, filename } = await req.json();

        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
            return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
        }

        // Use the shared app-local workspace directory
        const uploadsDir = path.join(WORKSPACE_DIR, 'uploads');

        // Create uploads directory if it doesn't exist
        if (!existsSync(uploadsDir)) {
            mkdirSync(uploadsDir, { recursive: true });
        }

        // Extract the image format and base64 data
        const match = imageDataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
        if (!match) {
            return NextResponse.json({ error: "Could not parse image data URL" }, { status: 400 });
        }

        const extension = match[1].replace('+xml', ''); // handle svg+xml etc.
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate filename
        const safeName = filename
            ? filename.replace(/[^a-zA-Z0-9._-]/g, '_')
            : `image_${Date.now()}`;
        const finalFilename = safeName.includes('.') ? safeName : `${safeName}.${extension}`;
        const filePath = path.join(uploadsDir, finalFilename);

        // Write the file
        writeFileSync(filePath, buffer);

        return NextResponse.json({
            success: true,
            filePath,
            filename: finalFilename,
        });
    } catch (err: any) {
        return NextResponse.json({ error: `Failed to save image: ${err.message}` }, { status: 500 });
    }
}
