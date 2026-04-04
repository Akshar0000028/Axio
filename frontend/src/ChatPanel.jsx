import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendChatMessage } from './api';

const WELCOME = {
  role: 'assistant',
  content: "👋 Hi! I'm the **Axio ML Agent**. I can help you understand your dataset, interpret model results, choose better features, or explain any ML concept. What would you like to know?"
};

export default function ChatPanel({ sessionId }) {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await sendChatMessage(sessionId, msg, history);
      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="glass-card flex flex-col" style={{ height: '100%', minHeight: 480, overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex items-center" style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(79,140,255,0.12)',
          border: '1px solid rgba(79,140,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={16} color="#4f8cff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Axio ML Agent</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Powered by NVIDIA NIM</div>
        </div>
        <div style={{
          marginLeft: 'auto',
          width: 8, height: 8, borderRadius: '50%',
          background: '#34d399',
          boxShadow: '0 0 6px rgba(52,211,153,0.6)',
        }} />
      </div>

      {/* Messages */}
      <div className="flex flex-col" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        gap: 16,
      }}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            style={{ gap: 10 }}
          >
            {m.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(79,140,255,0.12)',
                border: '1px solid rgba(79,140,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
              }}>
                <Bot size={14} color="#4f8cff" />
              </div>
            )}
            <div
              className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}
              style={{
                padding: '10px 14px',
                maxWidth: '80%',
                fontSize: 14,
                lineHeight: 1.6,
                color: m.role === 'user' ? '#fff' : 'rgba(255,255,255,0.85)',
              }}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <div style={{ margin: 0 }}>{children}</div>,
                    strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
                    code: ({ children }) => (
                      <code style={{
                        background: 'rgba(255,255,255,0.08)',
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontFamily: 'monospace',
                      }}>{children}</code>
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : m.content}
            </div>
            {m.role === 'user' && (
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
              }}>
                <User size={14} color="rgba(255,255,255,0.6)" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center" style={{ gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(79,140,255,0.12)',
              border: '1px solid rgba(79,140,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={14} color="#4f8cff" />
            </div>
            <div className="chat-bubble-ai flex items-center" style={{ padding: '10px 14px', gap: 6 }}>
              <Loader size={14} color="rgba(255,255,255,0.5)" className="animate-spin" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div className="flex items-end" style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '8px 12px',
          gap: 8,
        }}>
          <textarea
            id="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your data, model, or ML concepts…"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: '#fff',
              fontSize: 14,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              padding: '2px 0',
              maxHeight: 120,
              overflowY: 'auto',
            }}
          />
          <button
            id="chat-send-btn"
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              width: 32, height: 32,
              borderRadius: 8,
              background: loading || !input.trim() ? 'rgba(79,140,255,0.2)' : '#4f8cff',
              border: 'none',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.2s',
            }}
          >
            <Send size={14} color="#fff" />
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6, textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
