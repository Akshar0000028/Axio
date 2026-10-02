import { useEffect, useState } from 'react';
import { ArrowLeft, FolderKanban, Plus, Database, BrainCircuit } from 'lucide-react';
import { createProject, getProjects } from './api';

export default function ProjectDashboard({ onBack, onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => { getProjects().then(setProjects).catch(err => setError(err.message)); }, []);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const project = await createProject(name);
      setProjects(current => [project, ...current]);
      setName('');
      setShowCreate(false);
    } catch (err) { setError(err.message); }
  };

  return <div className="platform-shell">
    <header className="platform-header">
      <button className="platform-back" onClick={onBack}><ArrowLeft size={16} /> Landing</button>
      <div className="platform-brand">AXIO <span>ML PLATFORM</span></div>
      <div className="workspace-chip">Local workspace</div>
    </header>
    <main className="dashboard-main">
      <div className="dashboard-heading">
        <div><div className="section-eyebrow">Workspace</div><h1>Your projects</h1><p>Build, train, and manage machine learning models.</p></div>
        <button className="primary-action" onClick={() => setShowCreate(true)}><Plus size={17} /> New project</button>
      </div>
      {error && <div className="dashboard-error">{error}</div>}
      {projects.length === 0 ? <div className="dashboard-empty"><FolderKanban size={30}/><h2>Create your first project</h2><p>Projects keep datasets, training runs, and models organized.</p><button className="primary-action" onClick={() => setShowCreate(true)}><Plus size={16}/> Create project</button></div> :
        <div className="project-grid">{projects.map(project => <button className="project-card" key={project.id} onClick={() => onOpenProject(project)}><div className="project-icon"><FolderKanban size={20}/></div><h2>{project.name}</h2><p>{project.description || 'No description yet'}</p><div className="project-meta"><span><Database size={14}/> Datasets</span><span><BrainCircuit size={14}/> Models</span></div></button>)}</div>}
    </main>
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="create-modal" onSubmit={submit} onMouseDown={e => e.stopPropagation()}><h2>New project</h2><label>Project name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Customer churn model" required /></label><div className="modal-actions"><button type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-action" type="submit">Create project</button></div></form></div>}
  </div>;
}
