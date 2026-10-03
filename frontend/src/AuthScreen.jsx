import { useState } from 'react';
import { loginUser, registerUser } from './api';

export default function AuthScreen({ onAuthenticated, onBack }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault();
    setError('');
    try {
      const result = mode === 'login' ? await loginUser(email, password) : await registerUser(email, name, password);
      onAuthenticated(result.user);
    } catch (err) { setError(err.detail || err.message); }
  };
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#090d14', color: '#fff', padding: 24 }}>
    <form onSubmit={submit} style={{ width: 'min(420px, 100%)', padding: 36, border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, background: '#111824' }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: '#9db8e8', cursor: 'pointer', padding: 0 }}>← Back</button>
      <p style={{ color: '#80aaff', letterSpacing: '.16em', fontSize: 12, marginTop: 30 }}>AXIO ML PLATFORM</p>
      <h1 style={{ margin: '8px 0' }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p style={{ color: 'rgba(255,255,255,.55)', marginBottom: 26 }}>{mode === 'login' ? 'Sign in to access your projects.' : 'Start building and training models.'}</p>
      {mode === 'register' && <label style={labelStyle}>Name<input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required /></label>}
      <label style={labelStyle}>Email<input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label style={labelStyle}>Password<input style={inputStyle} type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p style={{ color: '#ff8d8d', fontSize: 13 }}>{error}</p>}
      <button type="submit" style={{ width: '100%', marginTop: 8, padding: 13, border: 0, borderRadius: 8, background: '#c4f06d', color: '#10150d', fontWeight: 700, cursor: 'pointer' }}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={{ width: '100%', marginTop: 14, background: 'none', color: '#9db8e8', border: 0, cursor: 'pointer' }}>{mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}</button>
    </form>
  </div>;
}

const labelStyle = { display: 'block', fontSize: 13, color: 'rgba(255,255,255,.7)', marginBottom: 14 };
const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 7, padding: 12, borderRadius: 7, border: '1px solid rgba(255,255,255,.16)', background: '#0b111b', color: '#fff' };
