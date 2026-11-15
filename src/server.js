import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

let app;
try {
  app = createApp(process.env.DATA_DIR ? { storePath: `${process.env.DATA_DIR}/store.json` } : {});
} catch (err) {
  console.error(`Failed to start: ${err.message}`);
  process.exit(1);
}

app.listen(port, host, () => {
  console.log(`Career mobility platform running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
