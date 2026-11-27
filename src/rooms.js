import { applyRoomAction } from './room-game.js?v=puzzle-layout';

const endpoint = new URL('./api/rooms', document.baseURI);

function roomUrl(id, suffix = '') {
  return new URL(endpoint.href + '/' + id + suffix);
}

async function request(url, data) {
  const options = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    keepalive: true,
  };
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Object.assign(new Error('room request failed'), { status: response.status });
  return response.json();
}

export async function roomsAvailable() {
  try {
    return (await request(endpoint)).available === true;
  } catch {
    return false;
  }
}

export function createRoom(game) {
  return request(endpoint, game);
}

export function loadRoom(id) {
  return request(roomUrl(id));
}

export function connectRoom(initial, onState, onStatus) {
  const { id, game } = initial;
  const client = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const url = roomUrl(id);
  const events = roomUrl(id, '/events');
  url.searchParams.set('client', client);
  events.searchParams.set('client', client);
  const stream = new EventSource(events);
  let sequence = 0;
  let revision = initial.revision;
  let base = initial.state;
  let displayed = base;
  let pending = [];
  let connected = false;
  let failed = false;
  let sending = false;
  let closed = false;

  function display(state) {
    if (state !== displayed) {
      displayed = state;
      if (!closed) onState(displayed);
    }
  }

  function render() {
    display(pending.reduce((current, { action }) => applyRoomAction(game, current, action) ?? current, base));
  }

  function status() {
    if (!closed) onStatus(failed ? 'failed' : !connected ? 'connecting' : pending.length ? 'saving' : 'connected');
  }

  function accept(update) {
    if (update.revision > revision) {
      revision = update.revision;
      base = update.state;
    }
    pending = pending.filter(({ sequence }) => sequence > update.ack);
    render();
    status();
  }

  async function flush() {
    if (sending) return;
    sending = true;
    while (pending.length) {
      const operation = pending[0];
      try {
        const update = await request(url, operation);
        if (!closed) accept(update);
        else pending = pending.filter(({ sequence }) => sequence > update.ack);
      } catch (error) {
        if (error.status >= 400 && error.status < 500) {
          failed = true;
          pending = pending.filter((item) => item !== operation);
          render();
          status();
        } else if (closed) {
          break;
        } else {
          connected = false;
          status();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    sending = false;
  }

  stream.addEventListener('message', (event) => {
    connected = true;
    accept(JSON.parse(event.data));
  });
  stream.addEventListener('error', () => {
    connected = false;
    status();
  });
  status();

  return {
    send(action) {
      if (closed) return;
      const next = applyRoomAction(game, displayed, action);
      if (!next || next === displayed) return;
      failed = false;
      pending.push({ sequence: ++sequence, action });
      display(next);
      status();
      void flush();
    },
    close() {
      closed = true;
      stream.close();
    },
  };
}
