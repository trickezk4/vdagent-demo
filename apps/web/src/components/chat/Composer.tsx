/**
 * apps/web/src/components/chat/Composer.tsx
 * Input box with tailored question chips per agent
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, CornerDownLeft } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

const SUGGESTIONS_PER_AGENT: Record<string, string[]> = {
  orchestrator: [
    'Tại sao phân khu Sapphire có căn hộ bán chậm hơn 90 ngày?',
    'Điều tra căn hộ chậm bán và xuất báo cáo 6 phần có chứng thực',
  ],
  'data-agent': [
    'Truy vấn danh sách căn hộ có DOM > 90 ngày trong kho dữ liệu',
    'Lấy chi tiết bản ghi căn hộ UNIT-VH-02 (S102-1406)',
  ],
  'compare-agent': [
    'So sánh căn UNIT-VH-02 với mặt bằng giá phân khu Sapphire',
    'Phân tích độ lệch giá và chênh lệch DOM so với đối chuẩn giỏ hàng',
  ],
  'insight-agent': [
    'Phân tích 3 nguyên nhân cốt lõi khiến căn UNIT-VH-02 bán chậm',
    'Đánh giá tác động của hướng Tây và chính sách hết hạn ưu đãi',
  ],
  'chart-agent': [
    'Vẽ biểu đồ phân bổ DOM so với ngưỡng cảnh báo 90 ngày',
    'Trực quan hóa so sánh đơn giá (tr/m2) giữa căn tồn kho và đối chuẩn',
  ],
  'report-agent': [
    'Xuất báo cáo tổng hợp điều tra BĐS chuẩn PRD 6 phần',
    'Tổng hợp kết luận điều tra và khuyến nghị chính sách bán hàng',
  ],
  'python-finance-agent': [
    'Tính gói vay 70% trong 20 năm cho căn hộ Sapphire 2.89 tỷ',
    'Lập lịch trả góp gốc và lãi hàng tháng theo dư nợ giảm dần',
  ],
};

export const Composer: React.FC = () => {
  const { activeAgent, sendMessage, isRunning } = useChat();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = SUGGESTIONS_PER_AGENT[activeAgent] || [
    'Nhập câu hỏi phân tích cho agent này...',
  ];

  const handleSend = () => {
    if (!text.trim() || isRunning) return;
    sendMessage(text, activeAgent);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  return (
    <div className="border-t border-slate-800 bg-slate-900/90 backdrop-blur p-4">
      {/* Suggestions Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
        <span className="text-slate-400 flex items-center gap-1 flex-shrink-0 text-[11px]">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Gợi ý:
        </span>
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setText(s);
              sendMessage(s, activeAgent);
            }}
            disabled={isRunning}
            className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-[11px] truncate max-w-xs"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="relative mt-1 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={`Nhắn tin cho ${activeAgent}... (Enter gửi, Shift+Enter xuống dòng)`}
          disabled={isRunning}
          className="flex-1 max-h-32 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none shadow-inner"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={isRunning || !text.trim()}
          className="p-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-sm flex items-center justify-center shadow-lg shadow-sky-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title="Gửi tin nhắn"
        >
          {isRunning ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
