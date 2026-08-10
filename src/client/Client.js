export class ApiClientError extends Error {
  constructor(status, message, details, response) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
    this.response = response;
  }
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl && !/^https?:\/\//.test(baseUrl) ? `http://x${baseUrl}` : baseUrl || 'http://x/');
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    url.pathname = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.append(key, value);
      }
    }
  }
  return url;
}

export class Client {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    this.timeout = options.timeout || 30000;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.onRequest = typeof options.onRequest === 'function' ? options.onRequest : null;
    this.onResponse = typeof options.onResponse === 'function' ? options.onResponse : null;
  }

  async request(method, path, options = {}) {
    const { query, body, headers, timeout } = options;
    const url = buildUrl(this.baseUrl, path, query);
    const init = {
      method,
      headers: { ...this.defaultHeaders, ...(headers || {}) },
    };
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    if (this.onRequest) {
      const modified = await this.onRequest({ url, init, path, method });
      if (modified) {
        if (modified.url) init.url = modified.url;
        if (modified.init) Object.assign(init, modified.init);
      }
    }

    const controller = new AbortController();
    init.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeout || this.timeout);
    let response;
    try {
      response = await this.fetchImpl(url.toString(), init);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiClientError(0, `Request timed out after ${timeout || this.timeout}ms`, undefined, err);
      }
      throw new ApiClientError(0, 'Network error: ' + err.message, undefined, err);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (this.onResponse) {
      const modified = await this.onResponse({
        status: response.status,
        data,
        response,
      });
      if (modified !== undefined && modified !== null) data = modified;
    }

    if (!response.ok) {
      const message = data && (data.error || data.message) || 'Request failed';
      const details = data && data.details;
      throw new ApiClientError(response.status, message, details, response);
    }

    return data;
  }

  get(path, options = {}) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }
}