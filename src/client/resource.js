import { Client } from './Client.js';
import { makeRef } from './ref.js';

const defaultClient = new Client({ baseUrl: '' });

export function createResource(options) {
  const {
    name = 'resource',
    url,
    idProp = 'id',
    client = defaultClient,
    reloadable = true,
  } = options;

  if (!url) {
    throw new Error('createResource requires a `url` (e.g. "/api/todos").');
  }

  const items = makeRef(null);
  const state = makeRef('idle');
  const error = makeRef(null);
  const lastParams = makeRef(null);

  function setState(next, err = null) {
    state.value = next;
    error.value = err;
  }

  async function reload(params = lastParams.value) {
    lastParams.value = params || null;
    setState('loading');
    try {
      const result = await client.get(url, { query: params });
      items.value = Array.isArray(result) ? result : result.data ?? result;
      setState('success');
      return items.value;
    } catch (err) {
      setState('error', err);
      throw err;
    }
  }

  async function get(id) {
    const record = await client.get(`${url}/${encodeURIComponent(id)}`);
    return record;
  }

  async function create(data) {
    const record = await client.post(url, data);
    if (reloadable && state.value === 'success') {
      if (Array.isArray(items.value)) items.value = [...items.value, record];
    }
    return record;
  }

  async function update(id, data) {
    const record = await client.put(`${url}/${encodeURIComponent(id)}`, data);
    if (Array.isArray(items.value)) {
      items.value = items.value.map((item) =>
        item && item[idProp] === id ? { ...item, ...record } : item
      );
    }
    return record;
  }

  async function remove(id) {
    await client.delete(`${url}/${encodeURIComponent(id)}`);
    if (Array.isArray(items.value)) {
      items.value = items.value.filter((item) => !(item && item[idProp] === id));
    }
    return id;
  }

  return {
    name,
    get items() {
      return items.value;
    },
    set items(v) {
      items.value = v;
    },
    get state() {
      return state.value;
    },
    get error() {
      return error.value;
    },
    getItem(id) {
      return get(id).then((record) => record);
    },
    reload,
    get,
    create,
    update,
    remove,
    refs: { items, state, error },
  };
}