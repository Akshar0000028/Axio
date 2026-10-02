import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader, BarChart3, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendChatMessage, downloadModel } from './api';

export default function ChatPanel({ sessionId, initialMessages = [], onMessageSent }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setDownloadError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput('');
    setMessages(previous => [...previous, { role: 'user', content: message }]);
    setLoading(true);
    try {
      const history = messages.map(item => ({ role: item.role, content: item.content }));
      const response = await sendChatMessage(sessionId, message, history);
      setMessages(previous => [...previous, { role: 'assistant', ...response }]);
      onMessageSent?.();
    } catch (error) {
      setMessages(previous => [...previous, { role: 'assistant', content: `⚠️ ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async action => {
    if (/download.*(pkl|model)|export/i.test(action)) {
      setDownloadError('');
      try { await downloadModel(sessionId); }
      catch (error) { setDownloadError(error.message); }
      return;
    }
    setInput(action);
  };

  const onKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };

  return <section className="chat-panel" aria-label="Chat with Axio">
    <div className="chat-panel-messages" aria-live="polite">
      {messages.length === 0 && <div className="chat-empty-state">
        <div className="chat-empty-chart" aria-hidden="true">
          <div className="chat-empty-chart-grid" />
          <div className="chat-empty-chart-bars">
            {[38, 54, 46, 68, 61, 82, 74, 94].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          </div>
          <div className="chat-empty-chart-line" />
          <span className="chat-empty-chart-point point-one" />
          <span className="chat-empty-chart-point point-two" />
          <span className="chat-empty-chart-point point-three" />
          <span className="chat-empty-chart-point point-four" />
        </div>
        <span className="chat-only-eyebrow"><Bot size={14} /> YOUR DATA COPILOT</span>
        <h1>What can I help you with?</h1>
        <p>Ask a question or share a dataset to get started. Axio handles the analysis behind the scenes.</p>
      </div>}
      {messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}>
        <span className="chat-message-avatar" aria-hidden="true">{message.role === 'assistant' ? <Bot size={16} /> : <User size={15} />}</span>
        <div className="chat-message-bubble">
          {message.role === 'assistant' ? <>
            <MarkdownContent content={message.content} />
            {message.metrics?.length > 0 && <div className="chat-metrics">
              {message.metrics.map(metric => <div className="chat-metric" key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong>{metric.delta && <small>{metric.delta}</small>}
              </div>)}
            </div>}
            {message.charts?.map((chart, chartIndex) => <ChartCard key={`${chart.title}-${chartIndex}`} chart={chart} />)}
            {message.actions?.length > 0 && <div className="chat-actions">
              {message.actions.map(action => <button key={action} onClick={() => handleAction(action)}>
                {/download|export/i.test(action) ? <Download size={13} /> : <BarChart3 size={13} />}{action}
              </button>)}
            </div>}
          </> : message.content}
        </div>
      </div>)}
      {loading && <div className="chat-message assistant"><span className="chat-message-avatar"><Bot size={16} /></span><div className="chat-message-bubble chat-thinking"><Loader size={15} className="animate-spin" /> Axio is thinking…</div></div>}
      <div ref={bottomRef} />
    </div>
    <div className="chat-panel-composer">
      <div className="chat-composer-row">
        <textarea
          id="chat-input"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Axio…"
          aria-label="Message Axio"
          rows={1}
        />
        <button id="chat-send-btn" onClick={send} disabled={loading || !input.trim()} aria-label="Send message"><Send size={17} /></button>
      </div>
      <p>Enter to send · Shift+Enter for a new line</p>
    </div>
  </section>;
}

function MarkdownContent({ content }) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let markdown = [];
  const flush = () => { if (markdown.length) { blocks.push({ type: 'markdown', value: markdown.join('\n') }); markdown = []; } };
  for (let index = 0; index < lines.length; index += 1) {
    if (isTableRow(lines[index]) && isTableSeparator(lines[index + 1])) {
      flush();
      const headers = splitTableRow(lines[index]);
      const rows = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) { rows.push(splitTableRow(lines[index])); index += 1; }
      index -= 1;
      blocks.push({ type: 'table', headers, rows });
    } else markdown.push(lines[index]);
  }
  flush();
  return <>{blocks.map((block, index) => block.type === 'table'
    ? <div className="chat-table-wrap" key={`table-${index}`}><table><thead><tr>{block.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? '—'}</td>)}</tr>)}</tbody></table></div>
    : <ReactMarkdown key={`markdown-${index}`} components={{ p: ({ children }) => <p>{children}</p> }}>{block.value}</ReactMarkdown>)}</>;
}

function isTableRow(line = '') { return line.trim().startsWith('|') && line.trim().endsWith('|'); }
function isTableSeparator(line = '') { return isTableRow(line) && line.split('|').slice(1, -1).every(cell => /^\s*:?-{3,}:?\s*$/.test(cell)); }
function splitTableRow(line) { return line.trim().slice(1, -1).split('|').map(cell => cell.trim()); }

function ChartCard({ chart }) {
  const total = chart.values.reduce((sum, value) => sum + value, 0) || 1;
  const colors = ['#588b58', '#9bb896', '#d6b36a', '#7a9cc6', '#b07aa1', '#6f8d7a'];
  const slices = chart.values.reduce((result, value, index) => {
    const start = result.cursor;
    const end = start + (value / total) * 360;
    result.parts.push(`${colors[index % colors.length]} ${start}deg ${end}deg`);
    result.cursor = end;
    return result;
  }, { cursor: 0, parts: [] }).parts.join(', ');
  return <div className="chat-chart-card">
    <div className="chat-chart-title"><BarChart3 size={14} />{chart.title}</div>
    <div className="chat-chart-body">
      {chart.type === 'pie' ? <div className="chat-pie" style={{ background: `conic-gradient(${slices})` }} /> :
        <div className="chat-bars">{chart.values.map((value, index) => <div className="chat-bar-row" key={`${chart.labels[index]}-${index}`}><span>{chart.labels[index]}</span><div><i style={{ width: `${(value / Math.max(...chart.values, 1)) * 100}%`, background: colors[index % colors.length] }} /></div><b>{value}</b></div>)}</div>}
      {chart.type === 'pie' && <div className="chat-legend">{chart.labels.map((label, index) => <span key={`${label}-${index}`}><i style={{ background: colors[index % colors.length] }} />{label}: {chart.values[index]}</span>)}</div>}
    </div>
  </div>;
}
