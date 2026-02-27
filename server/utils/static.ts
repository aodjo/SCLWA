import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATIC_ROOTS = [
  normalize(join(__dirname, '../../webapp/dist')),
  normalize(join(__dirname, '../../web')),
];

/**
 * Maps file extension to content type.
 *
 * @param {string} extension - File extension.
 * @returns {string} MIME type.
 */
function contentTypeFor(extension: string): string {
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Tries to serve a static file from the configured web roots.
 *
 * @param {string} pathname - Incoming request path.
 * @returns {Promise<Response | null>} Response when served, otherwise `null`.
 */
export async function serveStatic(pathname: string): Promise<Response | null> {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;

  for (const staticRoot of STATIC_ROOTS) {
    const requestedPath = normalize(join(staticRoot, normalizedPath));
    if (!requestedPath.startsWith(staticRoot)) {
      continue;
    }

    try {
      const data = await readFile(requestedPath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentTypeFor(extname(requestedPath)) },
      });
    } catch {
      // Continue to next static root.
    }
  }

  try {
    const fallbackIndex = normalize(join(STATIC_ROOTS[0], 'index.html'));
    const data = await readFile(fallbackIndex);
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return null;
  }
}
