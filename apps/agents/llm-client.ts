/**
 * apps/agents/llm-client.ts
 * OpenRouter / OpenAI LLM integration with real-time Reasoning Chain-of-Thought (CoT) streaming
 * and automated deterministic fallback rule engine.
 */

import * as dotenv from 'dotenv';
import { type z } from 'zod';

dotenv.config();

export interface LlmStreamOptions<T> {
  role: string;
  systemPrompt: string;
  userPrompt: string;
  schema?: z.ZodType<T, any, any>;
  fallbackGenerator: () => Promise<T> | T;
  fallbackCoTSteps?: string[];
  emitTrace?: (msg: string) => void;
  emitToken?: (token: string) => void;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * Strips markdown code fences (```json ... ```) and residual thinking tags if returned by LLM
 */
export function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  // Remove <think>...</think> if present
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  // Find boundaries of JSON object or array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    cleaned = cleaned.substring(startIdx);
  }

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  let endIdx = -1;

  if (lastBrace !== -1 && lastBracket !== -1) {
    endIdx = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    endIdx = lastBrace;
  } else if (lastBracket !== -1) {
    endIdx = lastBracket;
  }

  if (endIdx !== -1 && endIdx < cleaned.length - 1) {
    cleaned = cleaned.substring(0, endIdx + 1);
  }

  return cleaned.trim();
}

/**
 * Helper to emit fallback CoT steps with slight pacing for smooth UI streaming
 */
async function emitFallbackReasoning(
  steps: string[] | undefined,
  emitTrace?: (msg: string) => void
): Promise<void> {
  if (!steps || steps.length === 0 || !emitTrace) return;
  for (const step of steps) {
    emitTrace(step);
    await new Promise((r) => setTimeout(r, 80));
  }
}

/**
 * Executes an LLM inference call with real-time Reasoning Chain-of-Thought (CoT) streaming
 * and automated fallback to deterministic engine on any failure.
 */
export async function streamLlmReasoningWithFallback<T>(options: LlmStreamOptions<T>): Promise<T> {
  const {
    role,
    systemPrompt,
    userPrompt,
    schema,
    fallbackGenerator,
    fallbackCoTSteps,
    emitTrace,
    emitToken,
    maxTokens = 4096,
    temperature = 0.2,
  } = options;

  // 1. Resolve API credentials (supports per-agent key overrides or shared OPENAI_API_KEY)
  const envPrefix = role.toUpperCase().replace(/-/g, '_');
  const apiKey =
    process.env[`${envPrefix}_API_KEY`]?.trim() ||
    process.env.OPENAI_API_KEY?.trim();

  const baseUrl = (
    process.env[`${envPrefix}_BASE_URL`] ||
    process.env.OPENAI_BASE_URL ||
    'https://openrouter.ai/api/v1'
  ).replace(/\/+$/, '');

  const model =
    process.env[`${envPrefix}_MODEL`] ||
    process.env.LLM_MODEL ||
    'deepseek/deepseek-v4-flash-0731';

  const timeoutMs = process.env.LLM_TIMEOUT_S
    ? Number(process.env.LLM_TIMEOUT_S) * 1000
    : (options.timeoutMs ?? 120000);

  // 2. Check for missing/placeholder API key
  if (!apiKey || apiKey === 'mock-key' || apiKey.startsWith('your-')) {
    emitTrace?.(`[${role}] Khởi động bộ suy luận Chain-of-Thought chuẩn xác (Deterministic Engine)...`);
    await emitFallbackReasoning(fallbackCoTSteps, emitTrace);
    return await fallbackGenerator();
  }

  // 3. Initiate Live Streaming LLM Request
  try {
    emitTrace?.(`[${role}] Đang gửi yêu cầu suy luận tới LLM API (${model})...`);

    const conciseInstruction = `\n\nQUY TẮC BẮT BUỘC VỀ SUY LUẬN (CHAIN-OF-THOUGHT):
1. Quá trình suy luận (thinking / CoT) phải cực kỳ ngắn gọn, súc tích bằng tiếng Việt (tối đa 2-3 gạch đầu dòng ngắn, dưới 50 từ).
2. KHÔNG tự tranh luận hay độc thoại dài dòng về schema.
3. Sau khi nêu nhanh 2-3 ý suy luận chính, lập tức xuất kết quả chính xác theo đúng cấu trúc yêu cầu.`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/vda-agent-poc',
        'X-Title': 'VDaAgent PoC',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt + conciseInstruction },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LLM API returned HTTP ${response.status} (${response.statusText}): ${errText.slice(0, 150)}`);
    }

    if (!response.body) {
      throw new Error('LLM API returned an empty response body stream.');
    }

    // 4. Stream consumption & CoT extraction
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let inThinkTag = false;
    let reasoningBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            // Case A: Explicit reasoning_content from model (DeepSeek R1/V3/V4)
            const reasoningDelta = delta.reasoning_content || delta.reasoning;
            if (reasoningDelta) {
              accumulatedReasoning += reasoningDelta;
              reasoningBuffer += reasoningDelta;
              emitToken?.(reasoningDelta);

              // If line break or sentence boundary, emit trace log
              if (reasoningBuffer.includes('\n') || reasoningBuffer.length > 80) {
                emitTrace?.(`💭 [${role} CoT] ${reasoningBuffer.trim()}`);
                reasoningBuffer = '';
              }
            }

            // Case B: Regular content
            const contentDelta = delta.content;
            if (contentDelta) {
              // Check for <think> and </think> tags inside content
              if (contentDelta.includes('<think>')) {
                inThinkTag = true;
              }

              if (inThinkTag) {
                const thinkText = contentDelta.replace(/<\/?think>/g, '');
                if (thinkText) {
                  accumulatedReasoning += thinkText;
                  reasoningBuffer += thinkText;
                  emitToken?.(thinkText);
                  if (reasoningBuffer.includes('\n') || reasoningBuffer.length > 80) {
                    emitTrace?.(`💭 [${role} CoT] ${reasoningBuffer.trim()}`);
                    reasoningBuffer = '';
                  }
                }
                if (contentDelta.includes('</think>')) {
                  inThinkTag = false;
                }
              } else {
                accumulatedContent += contentDelta;
                emitToken?.(contentDelta);
              }
            }
          } catch {
            // ignore chunk parse errors
          }
        }
      }
    }

    if (reasoningBuffer.trim()) {
      emitTrace?.(`💭 [${role} CoT] ${reasoningBuffer.trim()}`);
    }

    if (accumulatedReasoning) {
      emitTrace?.(`[${role}] Hoàn thành quá trình suy luận Chain-of-Thought (${accumulatedReasoning.length} ký tự CoT).`);
    }

    // 5. Parse and validate result
    const targetText = accumulatedContent.trim() || accumulatedReasoning.trim();
    if (!targetText) {
      throw new Error('LLM output stream was empty after completion.');
    }

    if (schema) {
      const cleaned = cleanJsonString(targetText);
      const parsedJson = JSON.parse(cleaned);
      const validated = schema.parse(parsedJson);
      emitTrace?.(`[${role}] Kết quả output đã được kiểm chứng và khớp 100% Zod Schema.`);
      return validated;
    }

    emitTrace?.(`[${role}] Hoàn tất xử lý yêu cầu thành công.`);
    return targetText as unknown as T;
  } catch (err: any) {
    emitTrace?.(
      `[${role}-FALLBACK] Không thể hoàn tất gọi LLM (${err.message}). Kích hoạt quy trình suy luận dự phòng...`
    );
    await emitFallbackReasoning(fallbackCoTSteps, emitTrace);
    return await fallbackGenerator();
  }
}

/**
 * Backward compatibility wrapper
 */
export async function callLlmWithFallback<T>(options: LlmStreamOptions<T>): Promise<T> {
  return streamLlmReasoningWithFallback(options);
}
