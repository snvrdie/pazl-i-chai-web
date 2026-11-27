import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRoomAction, createRoomGame, restoreRoomState } from './src/room-game.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDirectory = resolve(process.env.PUZZLEMOOD_ROOMS_DIR || join(root, '.rooms'));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT ?? 8000);
const tokenPattern = /^[0-9a-f]{32}$/;
const listeners = new Map();
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8',
};

mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') return;
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16 * 1024) return;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return;
  }
}

function roomFile(id) {
  return join(dataDirectory, id + '.json');
}

function loadRoom(id) {
  try {
    const room = JSON.parse(readFileSync(roomFile(id), 'utf8'));
    room.state = restoreRoomState(room.game, room.state);
    return room;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function saveRoom(room) {
  const file = roomFile(room.id);
  writeFileSync(file + '.tmp', JSON.stringify(room), { mode: 0o600 });
  renameSync(file + '.tmp', file);
}

function snapshot(room, client) {
  const { id, game, state, revision } = room;
  return { id, game, state, revision, ack: room.clients[client] ?? 0 };
}

function push(response, room, client) {
  if (!response.write('data: ' + JSON.stringify(snapshot(room, client)) + '\n\n')) response.end();
}

function subscribe(response, room, client) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  const entries = listeners.get(room.id) ?? new Map();
  listeners.set(room.id, entries);
  entries.set(response, client);
  response.on('close', () => {
    entries.delete(response);
    if (!entries.size) listeners.delete(room.id);
  });
  push(response, room, client);
}

setInterval(() => {
  for (const entries of listeners.values()) {
    for (const response of entries.keys()) response.write(': heartbeat\n\n');
  }
}, 20_000).unref();

async function roomRequest(request, response, url) {
  if (url.pathname === '/api/rooms') {
    if (request.method === 'GET') return json(response, 200, { available: true });
    if (request.method !== 'POST') return json(response, 405, { error: 'method not allowed' });
    const config = await body(request);
    const created = createRoomGame(config, randomBytes(4).readUInt32LE());
    if (!created) return json(response, 400, { error: 'unknown game or puzzle' });
    const room = { ...created, id: randomBytes(16).toString('hex'), revision: 0, clients: {} };
    saveRoom(room);
    return json(response, 201, snapshot(room));
  }

  const match = /^\/api\/rooms\/([a-f0-9]{32})(\/events)?$/.exec(url.pathname);
  if (!match) return json(response, 404, { error: 'room not found' });
  const [, id, events] = match;
  const client = url.searchParams.get('client');
  if (client !== null && !tokenPattern.test(client)) return json(response, 400, { error: 'invalid player' });
  if (request.method === 'GET') {
    const room = loadRoom(id);
    if (!room) return json(response, 404, { error: 'room not found' });
    if (events) return subscribe(response, room, client);
    return json(response, 200, snapshot(room, client));
  }
  if (events || request.method !== 'POST') return json(response, 405, { error: 'method not allowed' });

  const input = await body(request);
  if (!client || !Number.isSafeInteger(input?.sequence) || input.sequence < 1) {
    return json(response, 400, { error: 'invalid move' });
  }
  // Read and replace the room in one turn so two requests cannot overwrite one another.
  const room = loadRoom(id);
  if (!room) return json(response, 404, { error: 'room not found' });
  if (input.sequence <= (room.clients[client] ?? 0)) return json(response, 200, snapshot(room, client));
  const state = applyRoomAction(room.game, room.state, input.action);
  if (!state) return json(response, 400, { error: 'invalid move' });
  room.clients[client] = input.sequence;
  if (state !== room.state) room.revision += 1;
  room.state = state;
  saveRoom(room);
  for (const [stream, player] of listeners.get(id) ?? []) push(stream, room, player);
  return json(response, 200, snapshot(room, client));
}

function staticRequest(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'method not allowed' });
  const path = decodeURIComponent(url.pathname);
  const file = path === '/' ? 'index.html' : path.slice(1);
  const publicPath = file === 'index.html' || file === 'style.css'
    || /^(assets|src)\/[\w/.-]+$/.test(file) && !file.split('/').some((part) => part.startsWith('.'));
  const fullPath = join(root, file);
  const stat = publicPath && statSync(fullPath, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) return json(response, 404, { error: 'file not found' });
  response.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': file.startsWith('assets/') ? 'public, max-age=3600' : 'no-cache',
  });
  if (request.method === 'HEAD') return response.end();
  createReadStream(fullPath).on('error', () => response.destroy()).pipe(response);
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await roomRequest(request, response, url);
    else staticRequest(request, response, url);
  } catch (error) {
    if (error instanceof URIError) json(response, 400, { error: 'invalid url' });
    else {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'room service unavailable' });
      else response.destroy();
    }
  }
});

server.listen(port, host, () => console.log('PuzzleMood listening at http://' + host + ':' + server.address().port));
