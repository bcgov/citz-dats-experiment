import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { transfer } from './transfer.js';

// Define Express App
const app = express();

/**
 * Middleware for parsing request bodies.
 * @module body-parser
 */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  cors({
    origin: 'http://localhost:5200',
    credentials: true,
  }),
);

app.use(
  rateLimit({
    windowMs: 2 * 1000, // 2 seconds
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.disable('x-powered-by');

app.use('/transfer', transfer);

export default app;
