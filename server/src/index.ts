import './types';
import http from 'http';
import { Server } from 'socket.io';
import { app } from './app';
import { env } from './config/env';
import { initializeSockets } from './sockets';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach io to app so controllers can emit events via req.app.get('io')
app.set('io', io);

initializeSockets(io);

server.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
