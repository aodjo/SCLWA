import { useState } from 'react';
import { BiSend } from 'react-icons/bi';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
}

export default function ChatPanel({ messages, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b border-zinc-800">
        <span className="text-sm text-zinc-400">AI 채팅</span>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 p-4 overflow-auto">
        {messages.length === 0 ? (
          <p className="text-zinc-600 text-sm">
            질문이 있으면 물어봐요!
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-zinc-700 text-zinc-50'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력해주세요..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-50 outline-none focus:border-zinc-700 placeholder:text-zinc-600"
          />
          <button
            type="submit"
            className="bg-zinc-800 rounded-md px-3 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50 transition-colors"
          >
            <BiSend />
          </button>
        </div>
      </form>
    </div>
  );
}
