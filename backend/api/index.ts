/**
 * Vercel serverless function entry point
 * Wraps the Express app for Vercel deployment
 */
import { createApp } from '../src/app.js';

const app = createApp();

export default async function handler(req: any, res: any) {
  await new Promise<void>((resolve) => {
    app(req, res, () => resolve());
  });
}
