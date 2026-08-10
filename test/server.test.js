import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiServer, ApiError } from '../src/server/index.js';

function createServer() {
  const server = new ApiServer({ cors: { origin: '*' } });
  server.use('/timed', (req, res, next) => setTimeout(next, 10));
  server.get('/hello', (req, res) => {
    res.json({ message: 'Hello from canapi', query: req.query });
  });
  server.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id, name: `User ${req.params.id}` });
  });
  server.post('/echo', (req, res) => {
    res.json({ body: req.body, type: typeof req.body });
  });
  server.get('/boom', () => {
    throw new ApiError(422, 'Validation failed', { field: 'name' });
  });
  server.get('/crash', () => {
    throw new Error('kaboom');
  });
  return server;
}

async function start() {
  const server = createServer();
  const http = await new Promise((resolve) => {
    const s = server.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${http.address().port}`;
  return { server, http, base };
}

test('GET route with query and CORS header', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/hello?x=1&tag=a&tag=b`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.message, 'Hello from canapi');
    assert.deepEqual(body.query, { x: '1', tag: ['a', 'b'] });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  } finally {
    http.close();
  }
});

test('route params', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/users/42`);
    const body = await res.json();
    assert.equal(body.id, '42');
    assert.equal(body.name, 'User 42');
  } finally {
    http.close();
  }
});

test('JSON body parsing and echo', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'todo' }),
    });
    const body = await res.json();
    assert.deepEqual(body.body, { name: 'todo' });
    assert.equal(body.type, 'object');
  } finally {
    http.close();
  }
});

test('middleware can add a delay', async () => {
  const { http, base } = await start();
  try {
    const t0 = Date.now();
    await fetch(`${base}/timed/hello`);
    assert.ok(Date.now() - t0 >= 10);
  } finally {
    http.close();
  }
});

test('ApiError serialized with details', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Validation failed', details: { field: 'name' } });
  } finally {
    http.close();
  }
});

test('unhandled errors become 500', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/crash`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Internal Server Error');
  } finally {
    http.close();
  }
});

test('unknown route returns 404', async () => {
  const { http, base } = await start();
  try {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  } finally {
    http.close();
  }
});

test('custom onError handler is used', async () => {
  const server = new ApiServer();
  server.get('/x', () => {
    throw new ApiError(418, 'teapot');
  });
  server.onError((err, req, res) => {
    res.status(err.status || 500).json({ custom: err.message });
  });
  const http = await new Promise((resolve) => {
    const s = server.listen(0, () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${http.address().port}/x`);
    const body = await res.json();
    assert.equal(res.status, 418);
    assert.deepEqual(body, { custom: 'teapot' });
  } finally {
    http.close();
  }
});