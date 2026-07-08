import { Server, Socket } from 'socket.io';
import { verifyToken } from '../services/token.service';

export const initializeSockets = (io: Server) => {
  // Authenticate every socket connection via JWT in handshake auth
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));

    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    // Client joins a project room to receive project-scoped events
    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {});
  });
};
