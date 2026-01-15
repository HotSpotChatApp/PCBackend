import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticateSocket } from './socket/auth.js';
import { handlePresence } from './socket/presence.js';
import { handleCallRequests } from './socket/call.js';
import { handleWebRTC } from './socket/webrtc.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// HTTP Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Socket.IO Middleware
io.use(authenticateSocket);

// Socket.IO Event Handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.auth.userId} (${socket.id})`);

  // Emit user:online
  socket.emit('user:online');

  // Register event handlers
  handlePresence(io, socket);
  handleCallRequests(io, socket);
  handleWebRTC(io, socket);

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.auth.userId}:`, error);
  });
});

// Server Startup
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 PeerConnect server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`Redis URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
