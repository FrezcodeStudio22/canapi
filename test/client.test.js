import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiServer, createCrudRouter } from '../src/server/index.js';
import { Client, ApiClientError, createResource } from '../src/client/index.js';

let nextId = 1;
function makeRepo() {
  const rows = [];
  return {
    rows,
    find: async ({ take, skip }) => rows.slice(skip || 0, (skip || 0) + (take || rows.length)),
    findAndCount: async ({ take, skip }) => [
      rows.slice(skip || 0, (skip || 0) + (take || rows.length)),
      rows.length,
    ],
    findOne: async ({ where }) => rows.find((r) => r.id === where.id) || null,
    create: (body) => ({ ...body }),
    save: (record) => {
      if (record.id === undefined) {
        record.id = String(nextId++);
        rows.push(record);
      } else {
        const idx = rows.findIndex((r) => r.id === record.id);
        if (idx >= 0) rows[idx] = record;
      }
      return record;
    },
    merge: (existing, body) => ({ ...existing, ...body }),
    remove: (record) => {
      const idx = rows.findIndex((r) => r.id === record.id);
      if (idx >= 0) rows.splice(idx, 1);
    },
  };
}

async function startServer() {
  const server = new ApiServer();
  server.mount('/api/todos', createCrudRouter({ name: 'todo', repository: makeRepo() }));
  const http = await new Promise((resolve) => {
    const s = server.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${http.address().port}`;
  const client = new Client({ baseUrl: base });
  return { http, client, base };
}

test('Client roundtrip: get, post, put, delete', async () => {
  const http = await startServer();
  try {
    const client = http.client;
    const created = await client.post('/api/todos', { name: 'a' });
    assert.equal(created.name, 'a');

    const created2 = await client.post('/api/todos', { name: 'b' });
    assert.equal(created2.name, 'b');

    const list = await client.get('/api/todos', { query: { pageSize: 10 } });
    assert.equal(list.total, 2);
    assert.equal(list.data.length, 2);

    const one = await client.get(`/api/todos/${created.id}`);
    assert.equal(one.name, 'a');

    const updated = await client.put(`/api/todos/${created.id}`, { name: 'a2' });
    assert.equal(updated.name, 'a2');

    await client.delete(`/api/todos/${created.id}`);
    const after = await client.get('/api/todos', { query: { pageSize: 10 } });
    assert.equal(after.total, 1);
  } finally {
    http.http.close();
  }
});

test('Client error mapping to ApiClientError', async () => {
  const http = await startServer();
  try {
    const err = await http.client.get('/api/todos/999').catch((e) => e);
    assert.ok(err instanceof ApiClientError);
    assert.equal(err.status, 404);
    assert.equal(err.message, 'todo not found');
    assert.equal(err.response.status, 404);
  } finally {
    http.http.close();
  }
});

test('Client timeout aborts', async () => {
  const server = new ApiServer();
  server.get('/slow', (req, res) => setTimeout(() => res.json({ ok: true }), 500));
  const http = await new Promise((resolve) => {
    const s = server.listen(0, () => resolve(s));
  });
  try {
    const client = new Client({ baseUrl: `http://127.0.0.1:${http.address().port}`, timeout: 100 });
    const err = await client.get('/slow').catch((e) => e);
    assert.ok(err instanceof ApiClientError);
    assert.equal(err.status, 0);
    assert.match(err.message, /timed out/);
  } finally {
    http.close();
  }
});

test('createResource: reload, create, update, remove with live server', async () => {
  const { http, client, base } = await startServer();
  try {
    const todos = createResource({ name: 'todo', url: '/api/todos', client });
    assert.equal(todos.state, 'idle');
    assert.equal(todos.items, null);

    await todos.reload({ pageSize: 50 });
    assert.equal(todos.state, 'success');
    assert.deepEqual(todos.items, []);

    await todos.create({ name: 'c1' });
    await todos.create({ name: 'c2' });

    const list = await client.get('/api/todos', { query: { pageSize: 50 } });
    assert.equal(list.total, 2);
    const id1 = list.data[0].id;
    const id2 = list.data[1].id;

    await todos.update(id1, { name: 'c1-updated' });
    const refreshed = await client.get('/api/todos', { query: { pageSize: 50 } });
    assert.equal(refreshed.data.find((t) => t.id === id1).name, 'c1-updated');

    await todos.remove(id2);
    const after = await client.get('/api/todos', { query: { pageSize: 50 } });
    assert.equal(after.total, 1);
  } finally {
    http.close();
  }
});

test('createResource error state on failure', async () => {
  const { http, client } = await startServer();
  try {
    const todos = createResource({ name: 'todo', url: '/api/does-not-exist', client });
    const err = await todos.reload().catch((e) => e);
    assert.ok(err instanceof ApiClientError);
    assert.equal(todos.state, 'error');
    assert.ok(todos.error instanceof ApiClientError);
  } finally {
    http.close();
  }
});