import { verifyToken } from '../firebase/admin.js';

export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decodedToken = await verifyToken(token);
    if (!decodedToken) {
      return next(new Error('Invalid token'));
    }

    socket.auth = {
      userId: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name || decodedToken.email,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    next(new Error('Authentication failed'));
  }
};
