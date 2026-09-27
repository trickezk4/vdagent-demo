/**
 * apps/gateway/src/dynamic-router.ts
 * Analyzes user prompts and routes to either Real Estate DAG or Hot-Plugged Dynamic Agents.
 */

import { registry, type RegisteredAgent } from './registry.js';

export type RoutedIntent =
  | 'investigate_slow_moving'
  | 'calculate_mortgage'
  | 'unsupported_finance'
  | 'general_query';

export interface RouteDecision {
  intent: RoutedIntent;
  targetAgent?: RegisteredAgent;
  targetRole?: string;
  isDynamic: boolean;
  systemPromptAddition?: string;
}

export class DynamicRouter {
  public classifyIntent(userPrompt: string): RouteDecision {
    const normalized = userPrompt.toLowerCase();

    // Financial & mortgage keywords
    const financeKeywords = [
      'vay',
      'lãi suất',
      'lai suat',
      'ngân hàng',
      'ngan hang',
      'mortgage',
      'loan',
      'tín dụng',
      'tin dung',
      'tài chính',
      'tai chinh',
      'trả góp',
      'tra gop',
      'tiền vay',
      'tien vay',
      'hạn mức',
      'gói vay',
      'goi vay',
      'lịch trả nợ',
    ];

    const isFinancial = financeKeywords.some((kw) => normalized.includes(kw));

    if (isFinancial) {
      // Check if Python Finance Agent (or any agent supporting calculate_mortgage) is registered
      const financeAgent =
        registry.get('python-finance-agent') ||
        registry.findAgentForIntent('calculate_mortgage') ||
        registry.findAgentForIntent('compare_loan_packages');

      if (financeAgent) {
        return {
          intent: 'calculate_mortgage',
          targetAgent: financeAgent,
          targetRole: financeAgent.agent_id,
          isDynamic: true,
          systemPromptAddition: `[DynamicRoute] Đã kích hoạt Agent Tài chính (${financeAgent.agent_id}) qua gRPC ${financeAgent.grpc_target}.`,
        };
      } else {
        return {
          intent: 'unsupported_finance',
          isDynamic: false,
          systemPromptAddition: `Yêu cầu tài chính/vay vốn chưa thể thực hiện vì Agent Tài chính chưa được cắm nóng vào hệ thống. Vui lòng bấm "Cắm Agent Tài chính" hoặc chạy register script.`,
        };
      }
    }

    // Default: Real estate slow-moving investigation DAG pipeline
    return {
      intent: 'investigate_slow_moving',
      isDynamic: false,
      systemPromptAddition: `Phân tích điều tra sản phẩm bán chậm theo chuỗi 6 Core Agents.`,
    };
  }
}

export const dynamicRouter = new DynamicRouter();
