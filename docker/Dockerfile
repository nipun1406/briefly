# ─── Briefly LaTeX Compiler ───────────────────────────────────────────────────
# Node 20 on Debian Bullseye Slim for a small, stable image
FROM node:20-bullseye-slim

# Install TeX Live packages needed for most modern resumes/cover letters
# texlive-latex-base       — core LaTeX
# texlive-fonts-recommended — common fonts (lmodern, etc.)
# texlive-latex-extra      — geometry, enumitem, titlesec, parskip, hyperref, etc.
# texlive-fonts-extra      — broader font support (FontAwesome, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-fonts-recommended \
      texlive-latex-extra \
      texlive-fonts-extra \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install Node dependencies first (layer cache-friendly)
COPY package.json ./
RUN npm install --omit=dev

# Copy application source
COPY server.js ./

# Non-root user for security
RUN groupadd -r briefly && useradd -r -g briefly briefly \
    && chown -R briefly:briefly /app /tmp
USER briefly

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
