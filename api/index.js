// Entry point for the hosted demo (Vercel serverless function).
// Hosting has no durable disk, so each visitor's profile and saved jobs are kept in
// their own browser cookie instead of the local JSON file. See src/data/cookieStore.js.
import { createApp } from '../src/app.js';
import { cookieStoreFactory } from '../src/data/cookieStore.js';

export default createApp({ storeFactory: cookieStoreFactory() });
