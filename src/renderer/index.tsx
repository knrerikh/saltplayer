import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// #region agent log
fetch('http://127.0.0.1:7242/ingest/07f77fc9-9dbe-4e8a-9741-4b8c58039cd9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:start',message:'Renderer module loaded',data:{hasWindow:typeof window !== 'undefined',hasDocument:typeof document !== 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const container = document.getElementById('root');
// #region agent log
fetch('http://127.0.0.1:7242/ingest/07f77fc9-9dbe-4e8a-9741-4b8c58039cd9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:container',message:'Container found',data:{hasContainer:!!container},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion

if (!container) {
  throw new Error('Root element not found');
}

try {
  const root = createRoot(container);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/07f77fc9-9dbe-4e8a-9741-4b8c58039cd9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:beforeRender',message:'About to render App',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/07f77fc9-9dbe-4e8a-9741-4b8c58039cd9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:afterRender',message:'App rendered successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
} catch (error: any) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/07f77fc9-9dbe-4e8a-9741-4b8c58039cd9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:error',message:'Render error',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  console.error('Render error:', error);
}

