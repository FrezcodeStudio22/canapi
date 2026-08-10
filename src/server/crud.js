import { Router } from 'express';
import { ApiError, notFound, badRequest, conflict } from './errors.js';

const UNIQUE_VIOLATION = '23505';

function repoFor(req, options) {
  if (options.repository) return options.repository;
  const dataSource = req.app.locals.dataSource;
  if (!dataSource) {
    throw new ApiError(500, 'TypeORM DataSource not initialized (set app.locals.dataSource via ApiServer).');
  }
  return dataSource.getRepository(options.entity);
}

function idCondition(idProp, id) {
  return { [idProp]: id };
}

function stripHidden(record, hidden) {
  if (!record || typeof record !== 'object') return record;
  const copy = Array.isArray(record) ? record.map((r) => stripHidden(r, hidden)) : { ...record };
  if (!Array.isArray(copy)) {
    for (const key of hidden) {
      if (key in copy) delete copy[key];
    }
  }
  return copy;
}

export function createCrudRouter(options = {}) {
  const {
    name = 'resource',
    idProp = 'id',
    entity,
    repository,
    pageSize = 20,
    maxPageSize = 100,
    select,
    include,
    validate,
    transform,
    hidden,
  } = options;

  if (!entity && !repository) {
    throw new Error('createCrudRouter requires either `entity` (TypeORM entity) or `repository`.');
  }

  const hide = hidden === undefined ? null : Array.isArray(hidden) ? hidden : [hidden];
  const respond = (record) => {
    let out = hide ? stripHidden(record, hide) : record;
    if (transform) out = transform(out);
    return out;
  };

  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const size = Math.min(maxPageSize, parseInt(req.query.pageSize, 10) || pageSize);
      const find = (limit, offset) => ({
        select,
        relations: include,
        take: limit,
        skip: offset,
        order: { [idProp]: 'ASC' },
      });

      let data;
      let total;
      if (typeof repo.findAndCount === 'function') {
        const [rows, count] = await repo.findAndCount(find(size, (page - 1) * size));
        data = rows;
        total = count;
      } else {
        data = await repo.find(find(size, (page - 1) * size));
        total = data.length;
      }
      res.json({ data: data.map(respond), total, page, pageSize: size });
    } catch (err) {
      normalizeError(err, next);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      const record = await repo.findOne({ where: idCondition(idProp, req.params.id), select, relations: include });
      if (!record) return next(notFound(`${name} not found`));
      res.json(respond(record));
    } catch (err) {
      normalizeError(err, next);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      let body = req.body || {};
      if (validate) body = (await validate(body, req)) || body;
      const record = await repo.save(repo.create(body));
      res.status(201).json(respond(record));
    } catch (err) {
      normalizeError(err, next);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      const existing = await repo.findOne({ where: idCondition(idProp, req.params.id) });
      if (!existing) return next(notFound(`${name} not found`));
      let body = req.body || {};
      if (validate) body = (await validate(body, req, existing)) || body;
      const record = await repo.save(repo.merge(existing, body));
      res.json(respond(record));
    } catch (err) {
      normalizeError(err, next);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      const existing = await repo.findOne({ where: idCondition(idProp, req.params.id) });
      if (!existing) return next(notFound(`${name} not found`));
      let body = req.body || {};
      if (validate) body = (await validate(body, req, existing)) || body;
      const record = await repo.save(repo.merge(existing, body));
      res.json(respond(record));
    } catch (err) {
      normalizeError(err, next);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const repo = repoFor(req, options);
      const existing = await repo.findOne({ where: idCondition(idProp, req.params.id) });
      if (!existing) return next(notFound(`${name} not found`));
      await repo.remove(existing);
      res.status(204).end();
    } catch (err) {
      normalizeError(err, next);
    }
  });

  return router;
}

function normalizeError(err, next) {
  if (err instanceof ApiError) return next(err);
  if (err && err.code === UNIQUE_VIOLATION) {
    return next(conflict('Duplicate value violates a unique constraint'));
  }
  if (err && err.name === 'QueryFailedError') {
    return next(new ApiError(400, err.message));
  }
  next(err);
}

export { badRequest, notFound, ApiError };