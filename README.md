# canapi

API framework for Can apps. One npm package, two sides:

- **Server** — Express-powered REST server: routes, middleware, JSON + form bodies, CORS, error handling, TypeORM-backed CRUD routers, and JWT auth helpers.
- **Client** — fetch-based HTTP client plus reactive resources that connect to `@decaspace/can-framework` observables (`ref`), with a plain fallback when the framework is not installed.

## Install

```bash
npm install canapi
```

`express`, `typeorm`, `jsonwebtoken`, and `cors` are optional dependencies installed by default (omit with `--omit=optional` if you only use the client). `@decaspace/can-framework` is an optional peer dependency — the client works without it using a plain fallback.

## Server

```js
import { ApiServer, createAuth, createCrudRouter } from 'canapi/server';
import { User } from './entities/User.js';

const server = new ApiServer();

server.get('/hello', (req, res) => {
  res.json({ message: 'Hello from canapi' });
});

server.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, query: req.query });
});

const auth = createAuth({ secret: process.env.JWT_SECRET });
server.post('/auth/login', auth.loginHandler(async ({ username, password }) => {
  if (username === 'admin' && password === 'secret') {
    return { id: 1, username };
  }
  return null;
}));
server.use('/private', auth.authenticate, (req, res) => {
  res.json({ user: req.user });
});

server.mount('/api/users', createCrudRouter({
  name: 'user',
  entity: User,          // TypeORM entity
  idProp: 'id',
  pageSize: 20,
  hidden: ['password'],  // strip from responses
}));

server.listen(3001, () => console.log('API on :3001'));
```

- Register the TypeORM `DataSource` with `server.app.locals.dataSource = dataSource` (or pass `repository` directly to `createCrudRouter`).
- Error helpers: `ApiError`, `notFound()`, `badRequest()`, `unauthorized()`, `forbidden()`, `conflict()`. Throw them from handlers; the default error middleware serializes them as `{ error, details }`.
- Custom handlers: `server.onError(fn)` and `server.onNotFound(fn)`.

### Custom repository (no TypeORM)

```js
server.mount('/api/items', createCrudRouter({
  name: 'item',
  repository: {
    find: async () => items,
    findOne: async ({ where }) => items.find((i) => i.id === where.id),
    create: (body) => body,
    save: (rec) => save(rec),
    merge: (existing, body) => ({ ...existing, ...body }),
    remove: (rec) => remove(rec),
  },
}));
```

## Client

```js
import { Client, createResource } from 'canapi/client';

const api = new Client({ baseUrl: 'http://localhost:3001' });

// plain HTTP
const todos = await api.get('/api/todos', { query: { page: 1 } });
await api.post('/api/todos', { name: 'Ship canapi' });
```

### Reactive resources

```js
import { createResource } from 'canapi/client';

const todos = createResource({ name: 'todo', url: '/api/todos' });

await todos.reload();
todos.items;         // array of rows (a `ref` when @decaspace/can-framework is installed)
todos.state;         // 'idle' | 'loading' | 'success' | 'error'
todos.error;         // last error or null

await todos.create({ name: 'New todo' });  // appends to items
await todos.update(3, { complete: true });  // merges into items
await todos.remove(3);                      // removes from items
```

With the framework installed, `items`/`state`/`error` are `ref`s so Can components re-render automatically:

```can
<ul>
  {{#each todos.items}}
    <li>{{name}}</li>
  {{/each}}
</ul>
```

## API

### Server

| Name | Description |
| --- | --- |
| `ApiServer(options)` | `{ port, cors, bodyLimit, middleware }`; fluent `get/post/put/patch/delete/all`, `mount(path, router)`, `use(...)`, `onError(fn)`, `onNotFound(fn)`, `listen(port, cb)` |
| `createAuth({ secret, expiresIn })` | `{ sign(user), verify(token), authenticate, loginHandler(validate) }` — login handler expects the validate fn to return a user object or null |
| `createCrudRouter(options)` | `{ name, entity, repository, idProp, pageSize, maxPageSize, select, include, validate, transform, hidden }` — auto REST endpoints `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id` with pagination `{ data, total, page, pageSize }` |
| `ApiError(status, message, details)` | throwable; plus factories `notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict` |

### Client

| Name | Description |
| --- | --- |
| `Client(options)` | `{ baseUrl, headers, timeout, fetchImpl, onRequest, onResponse }`; methods `get/post/put/patch/delete(path, opts)` with `{ query, body, headers }`; rejects with `ApiClientError(status, message, details)` |
| `createResource(options)` | `{ name, url, idProp, client, reloadable }`; returns `{ items, state, error, reload, get, create, update, remove, getItem, refs }` |

## Examples

See `examples/` for a standalone server and a client script talking to it.

## License

MIT