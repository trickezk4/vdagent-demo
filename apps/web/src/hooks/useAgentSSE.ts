import { useState, useCallback, useRef } from 'react';

export interface TraceMessage {
  step: string;
  message: string;
  timestamp: string;
}

export type PipelineStage = 'data' | 'compare_insight' | 'chart' | 'report' | 'finance';

export interface StepState {
  status: 'idle' | 'running' | 'completed' | 'error';
  traceLogs: string[];
}

export function useAgentSSE() {
  const [isRunning, setIsRunning] = useState(false);
  const [traces, setTraces] = useState<TraceMessage[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const [stages, setStages] = useState<Record<PipelineStage, StepState>>({
    data: { status: 'idle', traceLogs: [] },
    compare_insight: { status: 'idle', traceLogs: [] },
    chart: { status: 'idle', traceLogs: [] },
    report: { status: 'idle', traceLogs: [] },
    finance: { status: 'idle', traceLogs: [] },
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    setTraces([]);
    setArtifacts({});
    setError(null);
    setIsDone(false);
    setStages({
      data: { status: 'idle', traceLogs: [] },
      compare_insight: { status: 'idle', traceLogs: [] },
      chart: { status: 'idle', traceLogs: [] },
      report: { status: 'idle', traceLogs: [] },
      finance: { status: 'idle', traceLogs: [] },
    });
  }, []);

  const startStream = useCallback(
    async (prompt: string) => {
      reset();
      setIsRunning(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const encoded = encodeURIComponent(prompt);
        const response = await fetch(`/api/v1/chat/stream?prompt=${encoded}`, {
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error('Response body stream is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
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
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.replace('event: ', '').trim();
            } else if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.replace('data: ', '').trim();
              let parsed: any = dataStr;
              try {
                parsed = JSON.parse(dataStr);
              } catch {
                // keep string
              }

              handleEvent(currentEvent, parsed);
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Stream error occurred');
        }
      } finally {
        setIsRunning(false);
      }
    },
    [reset]
  );

  const handleEvent = (event: string, data: any) => {
    const timestamp = new Date().toLocaleTimeString();

    if (event === 'trace') {
      const msg: TraceMessage = {
        step: data.step || 'trace',
        message: data.message || JSON.stringify(data),
        timestamp,
      };

      setTraces((prev) => [...prev, msg]);

      // Update stage state
      const step = (data.step || '').toLowerCase();
      setStages((prev) => {
        const next = { ...prev };
        if (step.includes('data')) {
          next.data = { status: 'running', traceLogs: [...next.data.traceLogs, msg.message] };
        } else if (step.includes('compare') || step.includes('insight')) {
          if (next.data.status === 'running') next.data.status = 'completed';
          next.compare_insight = {
            status: 'running',
            traceLogs: [...next.compare_insight.traceLogs, msg.message],
          };
        } else if (step.includes('chart')) {
          if (next.compare_insight.status === 'running') next.compare_insight.status = 'completed';
          next.chart = { status: 'running', traceLogs: [...next.chart.traceLogs, msg.message] };
        } else if (step.includes('report')) {
          if (next.chart.status === 'running') next.chart.status = 'completed';
          next.report = { status: 'running', traceLogs: [...next.report.traceLogs, msg.message] };
        } else if (step.includes('finance') || step.includes('python')) {
          next.finance = { status: 'running', traceLogs: [...next.finance.traceLogs, msg.message] };
        }
        return next;
      });
    } else if (event === 'artifact') {
      const envelope = data;
      const type = envelope.artifact_type;
      setArtifacts((prev) => ({ ...prev, [type]: envelope }));

      // Complete corresponding stage
      setStages((prev) => {
        const next = { ...prev };
        if (type === 'dataset') next.data.status = 'completed';
        if (type === 'comparison' || type === 'insight') {
          if (next.compare_insight.status === 'running') next.compare_insight.status = 'completed';
        }
        if (type === 'chart_spec') next.chart.status = 'completed';
        if (type === 'report') next.report.status = 'completed';
        if (type === 'finance_plan') next.finance.status = 'completed';
        return next;
      });
    } else if (event === 'done') {
      setIsDone(true);
      setStages((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as PipelineStage[]) {
          if (next[k].status === 'running') {
            next[k].status = 'completed';
          }
        }
        return next;
      });
    } else if (event === 'error') {
      setError(data.message || 'Error received from agent');
    }
  };

  return {
    isRunning,
    isDone,
    traces,
    artifacts,
    stages,
    error,
    startStream,
    reset,
  };
}
