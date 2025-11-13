import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '../.env' });
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import aiRouter from './routes/ai';
import authRouter from './routes/auth';
import departmentsRouter from './routes/departments';
import incidentsRouter from './routes/incidents';
import notificationsRouter from './routes/notifications';
import risksRouter from './routes/risks';
import usersRouter from './routes/users';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ai', aiRouter);
app.use('/api/auth', authRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/risks', risksRouter);
app.use('/api/users', usersRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Express API listening on http://localhost:${port}`);
});


