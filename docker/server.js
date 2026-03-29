'use strict';

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const { exec }   = require('child_process');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const os         = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;
const PDFLATEX_TIMEOUT_MS = 30_000; // 30 seconds

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'briefly-latex-compiler' });
});

// ─── POST /compile ─────────────────────────────────────────────────────────────
app.post('/compile', async (req, res) => {
  const { latex, filename = 'document' } = req.body;

  if (!latex || typeof latex !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "latex" field in request body.' });
  }

  // Unique working directory per request to avoid collisions
  const uid     = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `briefly_${uid}`);
  const texFile = path.join(workDir, 'document.tex');
  const pdfFile = path.join(workDir, 'document.pdf');
  const logFile = path.join(workDir, 'document.log');

  // Cleanup helper — always delete temp dir after response
  const cleanup = () => {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
  };

  try {
    // 1. Create isolated working directory
    fs.mkdirSync(workDir, { recursive: true });

    // 2. Write .tex source
    fs.writeFileSync(texFile, latex, 'utf-8');

    // 3. Run pdflatex (twice for cross-references, with timeout)
    const runPdflatex = () =>
      new Promise((resolve, reject) => {
        // -halt-on-error ensures non-zero exit on first error
        const cmd = `pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${workDir}" "${texFile}"`;
        const proc = exec(cmd, { timeout: PDFLATEX_TIMEOUT_MS }, (err, stdout, stderr) => {
          if (err) {
            // Read log for detailed error
            let log = '';
            try { log = fs.readFileSync(logFile, 'utf-8'); } catch (_) { log = stderr || err.message; }
            reject({ log, killed: proc.killed });
          } else {
            resolve();
          }
        });
      });

    // First pass
    await runPdflatex();
    // Second pass for TOC / cross-references (best-effort; ignore errors)
    try { await runPdflatex(); } catch (_) {}

    // 4. Read PDF
    if (!fs.existsSync(pdfFile)) {
      let log = '';
      try { log = fs.readFileSync(logFile, 'utf-8'); } catch (_) {}
      cleanup();
      return res.status(500).json({
        error: 'pdflatex ran but no PDF was produced.',
        log: truncateLog(log),
      });
    }

    const pdfBuffer = fs.readFileSync(pdfFile);

    // 5. Stream PDF back
    const safeFilename = sanitizeFilename(filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (err) {
    // pdflatex failed
    const isTimeout = err.killed;
    const status    = isTimeout ? 504 : 422;
    const message   = isTimeout
      ? `pdflatex timed out after ${PDFLATEX_TIMEOUT_MS / 1000}s. Check for infinite loops or missing packages.`
      : 'pdflatex compilation failed. See "log" for details.';

    return res.status(status).json({
      error: message,
      log: truncateLog(err.log || ''),
    });
  } finally {
    cleanup();
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function truncateLog(log) {
  // Return only the last 4 KB of the log (most relevant errors are at the end)
  const MAX = 4096;
  if (log.length <= MAX) return log;
  return '... [truncated] ...\n' + log.slice(-MAX);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document';
}

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Briefly LaTeX Compiler running on http://localhost:${PORT}`);
  console.log(`  POST /compile  — compile LaTeX → PDF`);
  console.log(`  GET  /health   — health check`);
});
