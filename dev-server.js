'use strict';
// =============================================================================
// Yamaha Sac / ORVA Store — Local Full-Stack Development Server
// Serves Static Frontend + Vercel Serverless API Endpoints + Local Excel DB
// =============================================================================

require('dotenv').config({ path: '.env.local' });

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// API Route Handlers
const routes = {
    '/api/orders': require('./api/orders'),
    '/api/delivery': require('./api/delivery'),
    '/api/send-order': require('./api/send-order'),
    '/api/risk': require('./api/risk')
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function serveStatic(req, res, pathname) {
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    
    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Check if adding .html helps
            if (fs.existsSync(filePath + '.html')) {
                filePath = filePath + '.html';
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found: ' + pathname);
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server Error reading file');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
}

function createVercelResponse(res) {
    const resShim = {
        _headers: {},
        statusCode: 200,
        setHeader(key, val) {
            this._headers[key] = val;
            res.setHeader(key, val);
            return this;
        },
        status(code) {
            this.statusCode = code;
            res.statusCode = code;
            return this;
        },
        json(data) {
            if (!res.headersSent) {
                res.writeHead(this.statusCode, {
                    'Content-Type': 'application/json; charset=utf-8',
                    ...this._headers
                });
            }
            res.end(JSON.stringify(data));
        },
        send(data) {
            if (!res.headersSent) {
                res.writeHead(this.statusCode, this._headers);
            }
            res.end(data);
        },
        end(data) {
            if (!res.headersSent) {
                res.writeHead(this.statusCode, this._headers);
            }
            res.end(data);
        }
    };
    return resShim;
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS pre-flight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Match API route
    const handler = routes[pathname];
    if (handler) {
        let bodyRaw = '';
        req.on('data', chunk => { bodyRaw += chunk; });
        req.on('end', async () => {
            let body = {};
            if (bodyRaw) {
                try {
                    body = JSON.parse(bodyRaw);
                } catch (e) {
                    body = bodyRaw;
                }
            }

            req.query = parsedUrl.query || {};
            req.body = body;

            const vRes = createVercelResponse(res);
            try {
                await handler(req, vRes);
            } catch (err) {
                console.error(`[API Error] ${pathname}:`, err);
                if (!res.headersSent) {
                    vRes.status(500).json({ success: false, error: err.message });
                }
            }
        });
        return;
    }

    // Static files
    serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log('\n================================================================');
    console.log(`🚀 Yamaha Sac / ORVA Store — Local Dev Server Running on Port ${PORT}`);
    console.log('================================================================');
    console.log(`📊 Admin Dashboard:       http://localhost:${PORT}/admin.html`);
    console.log(`🛍️ Storefront Page:       http://localhost:${PORT}/index.html`);
    console.log(`📁 Local Excel Database:  ${path.join(__dirname, 'data', 'excel')}`);
    console.log(`⚙️ Storage Mode:          ${process.env.USE_LOCAL_EXCEL === 'false' ? 'Google Cloud Sheets' : 'Local Excel Simulation (.xlsx)'}`);
    console.log('================================================================\n');
});
