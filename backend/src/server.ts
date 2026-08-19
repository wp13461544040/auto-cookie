import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import https from 'https';
import app from './app';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || '';
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || '';

// Start HTTPS if TLS cert/key paths are configured, otherwise HTTP
if (TLS_KEY_PATH && TLS_CERT_PATH && fs.existsSync(TLS_KEY_PATH) && fs.existsSync(TLS_CERT_PATH)) {
  const tlsOptions = {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH),
    minVersion: 'TLSv1.2' as const,
  };
  https.createServer(tlsOptions, app).listen(HTTPS_PORT, () => {
    console.log(`HTTPS server running on port ${HTTPS_PORT}`);
  });
} else {
  // HTTP fallback for development; production should use HTTPS via reverse proxy
  http.createServer(app).listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT} (configure TLS_KEY_PATH/TLS_CERT_PATH for HTTPS)`);
  });
}
