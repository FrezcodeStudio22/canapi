import { Client, createResource } from '../src/client/index.js';

const client = new Client({ baseUrl: `http://localhost:${process.env.PORT || 3002}` });

const todos = createResource({ name: 'todo', url: '/api/todos', client });

await todos.create({ name: 'Buy milk' });
await todos.create({ name: 'Ship canapi' });

await todos.reload({ pageSize: 50 });
console.log('state:', todos.state);
console.log('items:', JSON.stringify(todos.items, null, 2));

const first = todos.items[0];
if (first) {
  await todos.update(first.id, { name: `${first.name} (done)` });
}

await todos.remove(first.id);
console.log('after delete:', JSON.stringify(todos.items, null, 2));
console.log('api.get:', await client.get('/hello', { query: { from: 'example' } }));