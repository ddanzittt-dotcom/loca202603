import { createServer } from 'vite';

const server = await createServer({
  root: 'C:/Users/csene/claude/loca-source',
  server: { port: 5173, host: 'localhost' }
});
await server.listen();
server.printUrls();
