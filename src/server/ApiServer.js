import express from 'express';
import cors from 'cors';
import { ApiError, notFound } from './errors.js';

export class ApiServer {
  constructor(options = {}) {
    this.options = options;
    this.app = express();
    this.app.disable('x-powered-by');
    this.errorHandler = null;
    this.notFoundHandler = null;

    if (options.cors !== false) {
      this.app.use(cors(options.cors || {}));
    }
    this.app.use(express.json({ limit: options.bodyLimit || '1mb' }));
    if (options.urlencoded !== false) {
      this.app.use(express.urlencoded({ extended: true }));
    }

    if (Array.isArray(options.middleware)) {
      for (const mw of options.middleware) {
        this.app.use(mw);
      }
    }
  }

  use(...args) {
    this.app.use(...args);
    return this;
  }

  mount(path, router) {
    this.app.use(path, router);
    return this;
  }

  get(path, ...handlers) {
    this.app.get(path, ...handlers);
    return this;
  }

  post(path, ...handlers) {
    this.app.post(path, ...handlers);
    return this;
  }

  put(path, ...handlers) {
    this.app.put(path, ...handlers);
    return this;
  }

  patch(path, ...handlers) {
    this.app.patch(path, ...handlers);
    return this;
  }

  delete(path, ...handlers) {
    this.app.delete(path, ...handlers);
    return this;
  }

  all(path, ...handlers) {
    this.app.all(path, ...handlers);
    return this;
  }

  onError(handler) {
    this.errorHandler = handler;
    return this;
  }

  onNotFound(handler) {
    this.notFoundHandler = handler;
    return this;
  }

  finalize() {
    this.app.use(
      this.notFoundHandler ||
        ((req, res) => {
          res.status(404).json({ error: 'Not found', path: req.originalUrl });
        })
    );
    const handleError =
      this.errorHandler ||
      ((err, req, res) => {
        if (err instanceof ApiError) {
          const body = { error: err.message };
          if (err.details !== undefined) body.details = err.details;
          return res.status(err.status).json(body);
        }
        if (err && err.status >= 400 && err.status < 500 && err.type === 'entity.parse.failed') {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
        console.error('[canapi] Unhandled error:', err);
        res.status(500).json({ error: 'Internal Server Error', message: err.message });
      });
    this.app.use((err, req, res, next) => handleError(err, req, res, next));
    return this;
  }

  listen(port = this.options.port || 3001, host, callback) {
    this.finalize();
    if (typeof host === 'function') {
      callback = host;
      host = undefined;
    }
    return this.app.listen(port, host, callback);
  }

  notFound() {
    return (req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl });
  }
}