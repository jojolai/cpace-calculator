import { NextRequest } from 'next/server';
import { runAgentLoop, getAnalysisState } from '@/lib/openai-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { analysisId, userResponse } = await request.json();

    if (!analysisId) {
      return new Response(
        JSON.stringify({ error: 'Analysis ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const state = getAnalysisState(analysisId);
    if (!state) {
      return new Response(
        JSON.stringify({ error: 'Analysis session not found. Please upload the file again.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Analyze] Starting stream for analysis:', analysisId);

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let eventCount = 0;
          for await (const event of runAgentLoop(analysisId, userResponse)) {
            eventCount++;
            console.log('[Analyze] Sending event #' + eventCount + ':', event.type);
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          console.log('[Analyze] Stream complete, sent', eventCount, 'events');
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[Analyze] Stream error:', error);
          const errorEvent = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
