import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiServer, ApiError, createCrudRouter } from '../src/server/index.js';

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

async function start(repo, extra = {}) {
  const server = new ApiServer();
  server.app.locals.dataSource = { getRepository: () => repo };
  server.mount(
    '/api/widgets',
    createCrudRouter({ name: 'widget', repository: repo, hidden: ['secret'], ...extra })
  );
  const http = await new Promise((resolve) => {
    const s = server.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${http.address().port}`;
  return { repo, http, base };
}

test('CRUD lifecycle: create, list, get, update, delete', async () => {
  const { repo, http, base } = await start(makeRepo());
  try {
    const created = await (
      await fetch(`${base}/api/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'w1', secret: 's1' }),
      })
    ).json();
    assert.equal(created.name, 'w1');
    assert.equal(created.secret, undefined, 'hidden field stripped');
    assert.ok(repo.rows.length === 1);

    const list = await (await fetch(`${base}/api/widgets`)).json();
    assert.equal(list.total, 1);
    assert.equal(list.data[0].name, 'w1');

    const one = await (await fetch(`${base}/api/widgets/${created.id}`)).json();
    assert.equal(one.id, created.id);

    const updated = await (
      await fetch(`${base}/api/widgets/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'w1-renamed' }),
      })
    ).json();
    assert.equal(updated.name, 'w1-renamed');

    const del = await fetch(`${base}/api/widgets/${created.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    assert.equal(repo.rows.length, 0);
  } finally {
    http.close();
  }
});

test('pagination via page and pageSize', async () => {
  const repo = makeRepo();
  for (let i = 1; i <= 5; i++) repo.save({ name: `w${i}` });
  const { http, base } = await start(repo);
  try {
    const page1 = await (await fetch(`${base}/api/widgets?page=1&pageSize=2`)).json();
    assert.equal(page1.data.length, 2);
    assert.equal(page1.total, 5);
    assert.equal(page1.page, 1);

    const page3 = await (await fetch(`${base}/api/widgets?page=3&pageSize=2`)).json();
    assert.equal(page3.data.length, 1);
  } finally {
    http.close();
  }
});

test('404 for missing id on get/put/delete', async () => {
  const { http, base } = await start(makeRepo());
  try {
    assert.equal((await fetch(`${base}/api/widgets/999`)).status, 404);
    const put = await fetch(`${base}/api/widgets/999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    assert.equal(put.status, 404);
    assert.equal((await fetch(`${base}/api/widgets/999`, { method: 'DELETE' })).status, 404);
  } finally {
    http.close();
  }
});

test('validate hook can reject bad input', async () => {
  const { http, base } = await start(makeRepo(), {
    validate: async (body) => {
      if (!body.name) throw new ApiError(400, 'name is required');
      return body;
    },
  });
  try {
    const res = await fetch(`${base}/api/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    http.close();
  }
});

test('createCrudRouter without entity or repository throws', () => {
  assert.throws(() => createCrudRouter({}), /requires either/);
});