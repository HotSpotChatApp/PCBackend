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
        origin: (origin, callback) => {
            const allowedOrigins = [
                'http://localhost:5173',
                'http://localhost:3000',
                process.env.FRONTEND_URL,
                'https://pcfrontend.onrender.com'
            ];

            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                // Remove trailing slashes and try again
                const originWithoutSlash = origin.replace(/\/$/, '');
                if (allowedOrigins.includes(originWithoutSlash)) {
                    callback(null, true);
                } else {
                    console.warn(`❌ CORS rejected origin: ${origin}`);
                    callback(new Error('CORS not allowed'), false);
                }
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
        allowEIO3: true,
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6,
    pingInterval: 25000,
    pingTimeout: 60000,
});

// Middleware
app.use(cors());
app.use(express.json());

// HTTP Routes
app.get('/health', (req, res) => {
    console.log('📍 Health check');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Socket.IO Middleware
io.use((socket, next) => {
    console.log('🔐 Authenticating socket connection...');
    authenticateSocket(socket, next);
});

// Socket.IO Event Handlers
io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.auth?.userId} (Socket: ${socket.id})`);
    console.log(`📊 Total connected users: ${io.engine.clientsCount}`);

    // Register event handlers FIRST before emitting user:online
    handlePresence(io, socket);
    handleCallRequests(io, socket);
    handleWebRTC(io, socket);

    // Small delay to let frontend set up listeners
    setTimeout(() => {
        socket.emit('user:online');
        console.log(`📤 Emitted user:online to ${socket.auth?.userId}`);
    }, 100);

    socket.on('error', (error) => {
        console.error(`❌ Socket error for ${socket.auth?.userId}:`, error);
    });

    socket.on('disconnect', (reason) => {
        console.log(`❌ User disconnected: ${socket.auth?.userId} (Reason: ${reason})`);
        console.log(`📊 Total connected users: ${io.engine.clientsCount}`);
    });
});

// Error handling for Socket.IO
io.on('error', (error) => {
    console.error('❌ Socket.IO error:', error);
});

// Server Startup
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`\n🚀 PeerConnect server running on port ${PORT}`);
    console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log(`📍 Redis URL: ${process.env.REDIS_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🔐 Firebase: ${process.env.FIREBASE_PROJECT_ID ? '✅ Configured' : '❌ Not configured'}\n`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
