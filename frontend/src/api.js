/**
 * Axio ML Platform — API Service Layer v2.1
 * - Typed error class for structured error handling
 * - Automatic retry with exponential backoff
 * - AbortController timeout on every request
 * - X-API-Key header injected on every request (when VITE_API_KEY is set)
 */

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_KEY  = import.meta.env.VITE_API_KEY  || '';   // optional — set in .env

const DEFAULT_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS    = 100_000;
const TRAIN_TIMEOUT_MS   = 120_000;

export async function getProjects() { return apiFetch('/api/projects'); }
export async function createProject(name, description = '') {
  return apiFetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
}
export async function getProjectDatasets(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/datasets`);
}
export async function getProjectRuns(projectId) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/runs`);
}
export async function getAgentRun(sessionId) {
  return apiFetch(`/agent-run/${encodeURIComponent(sessionId)}`);
}

// ── Typed API Error ────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Auth headers helper ────────────────────────────────────────────────────
function authHeaders(extra = {}) {
  return API_KEY
    ? { 'X-API-Key': API_KEY, ...extra }
    : { ...extra };
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────
async function apiFetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Merge auth headers into every request
  const headers = authHeaders(options.headers ?? {});

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch (parseError) { void parseError; /* non-JSON error response */ }
      throw new ApiError(`API error ${res.status}: ${detail}`, res.status, detail);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new ApiError(`Invalid API response from ${path}`, res.status, 'The backend returned a non-JSON response. Check that the API server is running.');
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Request timed out', 408, 'timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Retry wrapper (for transient failures) ────────────────────────────────
async function withRetry(fn, retries = 2, delayMs = 800) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err instanceof ApiError
        ? err.status >= 500 || err.status === 408
        : err.name !== 'AbortError';
      if (!isRetryable || attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Upload a CSV/Excel dataset for analysis.
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 */
export async function uploadDataset(file, onProgress, projectId = '') {
  const formData = new FormData();
  formData.append('file', file);

  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/upload`);
      // Attach API key to XHR as well
      if (API_KEY) xhr.setRequestHeader('X-API-Key', API_KEY);
      if (projectId) xhr.setRequestHeader('X-Project-Id', projectId);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data;
        try { data = JSON.parse(xhr.responseText); }
        catch { reject(new ApiError('Invalid API response during upload', xhr.status, 'The backend returned a non-JSON response.')); return; }
        if (xhr.status >= 400) reject(new ApiError(data.detail ?? xhr.statusText, xhr.status, data.detail));
        else resolve(data);
      };
      xhr.onerror = () => reject(new ApiError('Network error during upload', 0, null));
      xhr.send(formData);
    });
  }

  return withRetry(() => apiFetch('/upload', {
    method: 'POST',
    headers: projectId ? { 'X-Project-Id': projectId } : {},
    body: formData,
  }));
}

/**
 * Train a model on the uploaded dataset.
 */
export async function trainModel(sessionId, targetColumn, opts = {}) {
  const body = {
    session_id:     sessionId,
    target_column:  targetColumn,
    test_size:      opts.testSize      ?? 0.2,
    cross_validate: opts.crossValidate ?? false,
    n_cv_folds:     opts.nCvFolds      ?? 5,
  };
  if (opts.modelKey) body.model_key = opts.modelKey;

  return apiFetch('/train', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }, TRAIN_TIMEOUT_MS);
}

/**
 * Run prediction using the trained model.
 */
export async function predict(sessionId, features) {
  return withRetry(() =>
    apiFetch('/predict', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ session_id: sessionId, features }),
    })
  );
}

/**
 * Send a chat message to the Axio ML Agent.
 */
export async function sendChatMessage(sessionId, message, history = []) {
  return apiFetch('/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ session_id: sessionId, message, history }),
  }, CHAT_TIMEOUT_MS);
}

/**
 * Get the download URL for a model export.
 */
export function getExportUrl(type, sessionId) {
  // Currently backend only supports 'model' type at /export/model/{id}
  return `${API_BASE}/export/model/${sessionId}`;
}

/** Download an authenticated export. Anchor downloads cannot attach X-API-Key. */
export async function downloadModel(sessionId) {
  const response = await fetch(getExportUrl('model', sessionId), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try { detail = (await response.json()).detail ?? detail; } catch (parseError) { void parseError; }
    throw new ApiError(`API error ${response.status}: ${detail}`, response.status, detail);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `axio_model_${sessionId}.pkl`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fetch past chat sessions.
 */
export async function getChatSessions() {
  return apiFetch('/chat/sessions');
}

/**
 * Fetch chat history for a given session.
 */
export async function getChatHistory(sessionId) {
  return apiFetch(`/chat/history/${sessionId}`);
}

/**
 * Health check — resolves true if backend is reachable.
 */
export async function healthCheck() {
  try {
    await apiFetch('/health', {}, 5_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a session and its uploaded files from the server.
 */
export async function deleteSession(sessionId) {
  return apiFetch(`/session/${sessionId}`, { method: 'DELETE' });
}
