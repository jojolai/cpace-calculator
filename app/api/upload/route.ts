import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { parseExcelBuffer } from '@/lib/excel-parser';
import { initializeAnalysis } from '@/lib/openai-agent';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Parse the Excel file
    console.log('[Upload] Parsing file:', file.name);
    const buffer = await file.arrayBuffer();
    const workbook = parseExcelBuffer(buffer, file.name);
    console.log('[Upload] Parsed workbook with', workbook.sheets.length, 'sheets');

    // Save file to Vercel Blob Storage
    let blobUrl: string | undefined;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blobPath = `uploads/${timestamp}_${file.name}`;
      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      blobUrl = blob.url;
      console.log('[Upload] Saved to blob storage:', blobUrl);
    } catch (blobError) {
      // Log but don't fail the upload if blob storage isn't configured
      console.warn('[Upload] Blob storage not configured or failed:', blobError);
    }

    // Initialize analysis session
    const analysisId = initializeAnalysis(workbook);
    console.log('[Upload] Created analysis session:', analysisId);

    return NextResponse.json({
      success: true,
      workbook: {
        id: workbook.id,
        filename: workbook.filename,
        sheets: workbook.sheets.map((s) => ({
          name: s.name,
          headers: s.headers,
          rowCount: s.rows.length,
        })),
      },
      analysisId,
      blobUrl,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}
