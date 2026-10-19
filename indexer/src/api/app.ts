import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';
import { errorHandler, notFound, wrap } from './errors.js';
import { reads } from './routes/reads.js';
import { writes } from './routes/writes.js';
import { owner } from './routes/owner.js';
import { gifts } from './routes/gifts.js';
import { media } from './routes/media.js';

export function createApp(): Express {
  const c = config();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, frameguard: false }));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/v1/embed/')) res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(cors({ origin: true, credentials: false }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, chainId: c.CHAIN_ID, verificationMode: c.verificationMode, gsera: c.GSERA_MODE, settlement: c.settlementMode });
  });

  // Seed photos, uploads, and the public snapshot and results.
  app.use('/photos', express.static(path.join(c.seedDir, 'photos'), { maxAge: '1d', index: false }));
  app.use(express.static(c.publicDir, { maxAge: '1m', index: false }));
  app.get(
    '/uploads/:hash',
    wrap(async (req, res) => {
      const hash = String(req.params.hash).replace(/[^0-9a-f]/g, '');
      if (hash.length !== 64) throw notFound();
      const [evidence, mediaRow] = await Promise.all([
        db().evidence.findFirst({ where: { fileHash: `0x${hash}` } }),
        db().media.findFirst({ where: { fileHash: hash } }),
      ]);
      const mime = evidence?.mime ?? mediaRow?.mime;
      if (!mime) throw notFound();
      if (evidence?.removedAt && !mediaRow) throw notFound('evidence removed');
      const file = path.join(c.uploadDir, hash);
      await stat(file).catch(() => {
        throw notFound();
      });
      res.setHeader('content-type', mime);
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      res.sendFile(file);
    }),
  );
  app.get('/embed.js', (_req, res) => {
    res.setHeader('content-type', 'application/javascript');
    res.setHeader('cache-control', 'public, max-age=3600');
    res.send(
      `(function(){var s=document.querySelectorAll('[data-sera-give]');for(var i=0;i<s.length;i++){var el=s[i];if(el.getAttribute('data-sera-done'))continue;var f=document.createElement('iframe');f.src='${c.PUBLIC_API_URL}/api/v1/embed/give/'+encodeURIComponent(el.getAttribute('data-sera-give'));f.title='Give on causes.sera.cx';f.width='360';f.height='64';f.loading='lazy';f.style.border='0';f.style.overflow='hidden';el.appendChild(f);el.setAttribute('data-sera-done','1');}})();`,
    );
  });

  const api = express.Router();
  api.use(reads);
  api.use(writes);
  api.use(owner);
  api.use(gifts);
  api.use(media);
  app.use('/api/v1', api);

  app.use((_req, _res, next) => next(notFound('route not found')));
  app.use(errorHandler);
  return app;
}
