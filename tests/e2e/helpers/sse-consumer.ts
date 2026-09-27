export interface SSEEvent {
  event: string;
  data: any;
  raw: string;
}

export interface SSEConsumptionResult {
  events: SSEEvent[];
  traces: string[];
  artifacts: any[];
  isComplete: boolean;
  error?: string;
}

/**
 * Headless Server-Sent Events (SSE) consumer for opaque-box testing of the Gateway.
 * Connects to the given URL and parses streaming chunk events until 'complete', 'done',
 * stream end, or timeout.
 */
export async function consumeSSE(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<SSEConsumptionResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const events: SSEEvent[] = [];
  const traces: string[] = [];
  const artifacts: any[] = [];
  let isComplete = false;
  let errorMessage: string | undefined;

  try {
    const response = await fetch(url, {
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null or undefined');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.replace(/^event:\s*/, '').trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.replace(/^data:\s*/, '').trim();
          let parsedData: any = dataStr;
          try {
            parsedData = JSON.parse(dataStr);
          } catch {
            // Keep as string if not JSON
          }

          const sseEvt: SSEEvent = {
            event: currentEvent,
            data: parsedData,
            raw: dataStr,
          };
          events.push(sseEvt);

          if (currentEvent === 'trace' || parsedData?.type === 'TRACE') {
            traces.push(parsedData?.message || dataStr);
          } else if (
            currentEvent === 'artifact' ||
            currentEvent === 'complete' ||
            parsedData?.type === 'COMPLETE' ||
            parsedData?.artifact_id
          ) {
            artifacts.push(parsedData?.envelope || parsedData);
          } else if (currentEvent === 'done' || parsedData?.status === 'SUCCESS') {
            isComplete = true;
          } else if (currentEvent === 'error') {
            errorMessage = parsedData?.message || dataStr;
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      errorMessage = `SSE stream timed out after ${timeoutMs}ms`;
    } else {
      errorMessage = err.message || String(err);
    }
  } finally {
    clearTimeout(timer);
  }

  return {
    events,
    traces,
    artifacts,
    isComplete: isComplete || artifacts.length > 0,
    error: errorMessage,
  };
}
