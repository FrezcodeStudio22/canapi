import { ApiServer, createAuth, createCrudRouter } from '../src/server/index.js';

const todos = [];
let nextId = 1;

const PORT = process.env.PORT || 3002;
const server = new ApiServer({ port: PORT });

server.get('/hello', (req, res) => {
  res.json({ message: 'Hello from canapi', query: req.query });
});

const auth = createAuth({ secret: process.env.JWT_SECRET || 'dev-secret' });
server.post('/auth/login', auth.loginHandler(async ({ username, password }) => {
  if (username === 'admin' && password === 'secret') {
    return { id: 1, username };
  }
  return null;
}));
server.use('/private', auth.authenticate, (req, res) => {
  res.json({ user: req.user });
});

server.mount('/api/todos', createCrudRouter({
  name: 'todo',
  repository: {
    find: async ({ take, skip }) => todos.slice(skip || 0, (skip || 0) + (take || todos.length)),
    findAndCount: async ({ take, skip }) => [
      todos.slice(skip || 0, (skip || 0) + (take || todos.length)),
      todos.length,
    ],
    findOne: async ({ where }) => todos.find((t) => t.id === where.id) || null,
    create: (body) => ({ ...body }),
    save: (record) => {
      if (record.id === undefined) {
        record.id = String(nextId++);
        todos.push(record);
      } else {
        const idx = todos.findIndex((t) => t.id === record.id);
        if (idx >= 0) todos[idx] = record;
      }
      return record;
    },
    merge: (existing, body) => ({ ...existing, ...body }),
    remove: (record) => {
      const idx = todos.findIndex((t) => t.id === record.id);
      if (idx >= 0) todos.splice(idx, 1);
    },
  },
  pageSize: 20,
}));

server.listen(PORT, () => {
  console.log(`canapi example server listening on http://localhost:${PORT}`);
  console.log('  GET    /hello');
  console.log('  GET    /api/todos?page=1&pageSize=20');
  console.log('  POST   /api/todos  { "name": "..." }');
  console.log('  PUT    /api/todos/:id');
  console.log('  DELETE /api/todos/:id');
});