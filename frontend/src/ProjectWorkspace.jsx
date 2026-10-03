import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bot, MessageSquare, Plus, Loader } from 'lucide-react';
import ChatPanel from './ChatPanel';
import DataUploader from './DataUploader';
import { getProjectDatasets, getChatSessions, getChatHistory } from './api';

export default function ProjectWorkspace({ project, onBack }) {
  const [session, setSession] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationNonce, setConversationNonce] = useState(0);

  useEffect(() => {
    getProjectDatasets(project.id)
      .then(items => { setDatasets(items); if (items[0]) setSession(toSession(items[0])); })
      .catch(error => setLoadError(error.message));
  }, [project.id]);

  const refreshConversations = useCallback(() => getChatSessions(project.id).then(setConversations).catch(() => {}), [project.id]);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  const openConversation = async conversation => {
    setActiveConversation(conversation.session_id);
    const dataset = datasets.find(item => item.session_id === conversation.dataset_session_id);
    if (dataset) setSession(toSession(dataset));
    setHistoryLoading(true);
    try {
      const items = await getChatHistory(conversation.session_id);
      setHistory(items.map(item => ({ ...item, role: item.role === 'ai' ? 'assistant' : item.role })));
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const onUpload = result => {
    setSession(result);
    setActiveConversation(result.session_id);
    setHistory([]);
    refreshConversations();
  };

  return <main className="chat-only-workspace">
    <header className="chat-only-header">
      <button className="chat-only-back" onClick={onBack}><ArrowLeft size={16} /> Projects</button>
      <div className="chat-only-brand"><span className="chat-only-mark"><Bot size={17} /></span><span>Axio</span><span className="chat-only-divider" />{project.name}</div>
      <div className="chat-only-status"><span /> AI assistant</div>
    </header>

    <div className="chat-workspace-body">
      <aside className="conversation-sidebar" aria-label="Conversation history">
        <button className="conversation-new" onClick={() => { setActiveConversation(session ? crypto.randomUUID() : null); setHistory([]); setConversationNonce(value => value + 1); }} disabled={!session}><Plus size={15} /> New conversation</button>
        <DataUploader projectId={project.id} onUploadSuccess={onUpload} compact />
        <div className="conversation-sidebar-label">Recent conversations</div>
        <div className="conversation-list">
          {conversations.length === 0 && <div className="conversation-empty">Your conversations will appear here.</div>}
          {conversations.map(conversation => <button
            key={conversation.session_id}
            className={`conversation-item ${activeConversation === conversation.session_id ? 'is-active' : ''}`}
            onClick={() => openConversation(conversation)}
          ><MessageSquare size={14} /><span>{conversation.label || 'Untitled conversation'}</span></button>)}
        </div>
      </aside>
      <section className="chat-only-main" aria-label="Axio chat">
      {loadError && <div className="chat-only-error" role="alert">Couldn’t load this project’s data: {loadError}</div>}

      {session ? <>
        {historyLoading ? <div className="conversation-loading"><Loader size={16} className="animate-spin" /> Loading conversation…</div> : <ChatPanel key={`${activeConversation || session.session_id}-${conversationNonce}`} sessionId={session.session_id} conversationId={activeConversation && activeConversation !== session.session_id ? activeConversation : null} initialMessages={history} onMessageSent={refreshConversations} />}
      </> : <div className="chat-only-start">
        <div className="chat-only-upload"><DataUploader projectId={project.id} onUploadSuccess={onUpload} /></div>
        <span className="chat-only-hint">CSV and Excel files · up to 50 MB</span>
      </div>}
      <p className="chat-only-footnote">Your AI assistant can make mistakes. Check important results.</p>
      </section>
    </div>
  </main>;
}

function toSession(dataset) {
  return {
    session_id: dataset.session_id,
    filename: dataset.filename,
    row_count: dataset.row_count,
    col_count: dataset.col_count,
    ...dataset.analysis,
  };
}
