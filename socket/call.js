import redisClient from '../redis/client.js';
import { v4 as uuidv4 } from 'uuid';

export const handleCallRequests = (io, socket) => {
  socket.on('call:request', async (data) => {
    try {
      const { userId: callerId, displayName: callerName } = socket.auth;
      const { targetUserId } = data;

      // Add to incoming requests (callee side)
      await redisClient.sAdd(`incoming:${targetUserId}`, callerId);

      // Add to outgoing requests (caller side)
      await redisClient.sAdd(`outgoing:${callerId}`, targetUserId);

      // Get caller info
      const callerData = await redisClient.hGetAll(`user:${callerId}`);
      const calleeData = await redisClient.hGetAll(`user:${targetUserId}`);

      // Get callee socket and emit incoming request
      const calleeSocket = io.sockets.sockets.get(calleeData.socketId);
      if (calleeSocket) {
        calleeSocket.emit('call:incoming', {
          caller: {
            userId: callerId,
            displayName: callerName,
          },
        });
      }

      // Update status to calling
      await redisClient.hSet(`user:${callerId}`, 'status', 'calling');
      await redisClient.hSet(`user:${targetUserId}`, 'status', 'calling');

      // Broadcast updated active users
      const activeUsersSet = await redisClient.sMembers('active_users');
      const activeUsersList = await Promise.all(
        activeUsersSet.map(async (id) => {
          const userData = await redisClient.hGetAll(`user:${id}`);
          return {
            userId: id,
            socketId: userData.socketId,
            displayName: userData.displayName || 'Unknown',
            status: userData.status || 'idle',
          };
        })
      );

      io.emit('active-users:update', activeUsersList);
      console.log(`Call request from ${callerName} to ${calleeData.displayName}`);
    } catch (error) {
      console.error('Error handling call:request:', error);
    }
  });

  socket.on('call:accept', async (data) => {
    try {
      const { userId: calleeId, displayName: calleeName } = socket.auth;
      const { callerId } = data;

      // Generate call ID
      const callId = uuidv4();

      // Store call state
      await redisClient.hSet(`call:${callId}`, {
        caller: callerId,
        callee: calleeId,
        status: 'active',
        startTime: Date.now().toString(),
      });

      // Remove from request lists
      await redisClient.sRem(`incoming:${calleeId}`, callerId);
      await redisClient.sRem(`outgoing:${callerId}`, calleeId);

      // Update user status
      await redisClient.hSet(`user:${callerId}`, 'status', 'in-call');
      await redisClient.hSet(`user:${calleeId}`, 'status', 'in-call');

      // Get socket info
      const callerData = await redisClient.hGetAll(`user:${callerId}`);
      const calleeData = await redisClient.hGetAll(`user:${calleeId}`);

      // Notify both users
      const callerSocket = io.sockets.sockets.get(callerData.socketId);
      const calleeSocket = io.sockets.sockets.get(calleeData.socketId);

      if (callerSocket) {
        callerSocket.emit('call:accept', {
          callId,
          calleeId,
          calleeName,
          initiator: true,
        });
      }

      if (calleeSocket) {
        calleeSocket.emit('call:accept', {
          callId,
          callerId,
          callerName: callerData.displayName,
          initiator: false,
        });
      }

      // Broadcast updated active users
      const activeUsersSet = await redisClient.sMembers('active_users');
      const activeUsersList = await Promise.all(
        activeUsersSet.map(async (id) => {
          const userData = await redisClient.hGetAll(`user:${id}`);
          return {
            userId: id,
            socketId: userData.socketId,
            displayName: userData.displayName || 'Unknown',
            status: userData.status || 'idle',
          };
        })
      );

      io.emit('active-users:update', activeUsersList);
      console.log(`Call ${callId} established between ${callerData.displayName} and ${calleeName}`);
    } catch (error) {
      console.error('Error handling call:accept:', error);
    }
  });

  socket.on('call:reject', async (data) => {
    try {
      const { userId: calleeId } = socket.auth;
      const { callerId } = data;

      // Remove from request lists
      await redisClient.sRem(`incoming:${calleeId}`, callerId);
      await redisClient.sRem(`outgoing:${callerId}`, calleeId);

      // Reset status
      await redisClient.hSet(`user:${callerId}`, 'status', 'idle');
      await redisClient.hSet(`user:${calleeId}`, 'status', 'idle');

      // Get socket info
      const callerData = await redisClient.hGetAll(`user:${callerId}`);

      // Notify caller
      const callerSocket = io.sockets.sockets.get(callerData.socketId);
      if (callerSocket) {
        callerSocket.emit('call:reject', {
          calleeId,
        });
      }

      // Broadcast updated active users
      const activeUsersSet = await redisClient.sMembers('active_users');
      const activeUsersList = await Promise.all(
        activeUsersSet.map(async (id) => {
          const userData = await redisClient.hGetAll(`user:${id}`);
          return {
            userId: id,
            socketId: userData.socketId,
            displayName: userData.displayName || 'Unknown',
            status: userData.status || 'idle',
          };
        })
      );

      io.emit('active-users:update', activeUsersList);
      console.log(`Call rejected from ${calleeId} to ${callerId}`);
    } catch (error) {
      console.error('Error handling call:reject:', error);
    }
  });

  socket.on('call:end', async (data) => {
    try {
      const { userId } = socket.auth;
      const { callId } = data;

      // Get call state
      const callData = await redisClient.hGetAll(`call:${callId}`);

      // Remove call state
      await redisClient.del(`call:${callId}`);

      // Determine other user
      const otherUserId = callData.caller === userId ? callData.callee : callData.caller;

      // Reset status
      await redisClient.hSet(`user:${userId}`, 'status', 'idle');
      await redisClient.hSet(`user:${otherUserId}`, 'status', 'idle');

      // Get socket info
      const otherUserData = await redisClient.hGetAll(`user:${otherUserId}`);

      // Notify other user
      const otherSocket = io.sockets.sockets.get(otherUserData.socketId);
      if (otherSocket) {
        otherSocket.emit('call:end');
      }

      // Broadcast updated active users
      const activeUsersSet = await redisClient.sMembers('active_users');
      const activeUsersList = await Promise.all(
        activeUsersSet.map(async (id) => {
          const userData = await redisClient.hGetAll(`user:${id}`);
          return {
            userId: id,
            socketId: userData.socketId,
            displayName: userData.displayName || 'Unknown',
            status: userData.status || 'idle',
          };
        })
      );

      io.emit('active-users:update', activeUsersList);
      console.log(`Call ${callId} ended`);
    } catch (error) {
      console.error('Error handling call:end:', error);
    }
  });
};
