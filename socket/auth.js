import { verifyToken } from '../firebase/admin.js';

export const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;

        if (!token) {
            console.warn('⚠️ Socket auth: No token provided');
            return next(new Error('Authentication token required'));
        }

        console.log('🔍 Verifying Firebase token...');
        const decodedToken = await verifyToken(token);

        if (!decodedToken) {
            console.warn('⚠️ Socket auth: Token verification failed');
            return next(new Error('Invalid token'));
        }

        socket.auth = {
            userId: decodedToken.uid,
            email: decodedToken.email,
            displayName: decodedToken.name || decodedToken.email,
        };

        console.log(`✅ Socket authenticated: ${socket.auth.displayName} (${socket.auth.userId})`);
        next();
    } catch (error) {
        console.error('❌ Authentication error:', error.message || error);
        next(new Error('Authentication failed: ' + error.message));
    }
};
