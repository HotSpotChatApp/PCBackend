import redisClient from '../redis/client.js';

export const handleWebRTC = (io, socket) => {
  socket.on('webrtc:offer', async (data) => {
    try {
      const { callId, offer } = data;
      const callState = await redisClient.hGetAll(`call:${callId}`);

      if (!callState) {
        console.error(`Call ${callId} not found`);
        return;
      }

      // Determine recipient
      const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
      const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

      // Send offer to recipient
      const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
      if (recipientSocket) {
        recipientSocket.emit('webrtc:offer', { offer });
      }

      console.log(`WebRTC offer sent for call ${callId}`);
    } catch (error) {
      console.error('Error handling webrtc:offer:', error);
    }
  });

  socket.on('webrtc:answer', async (data) => {
    try {
      const { callId, answer } = data;
      const callState = await redisClient.hGetAll(`call:${callId}`);

      if (!callState) {
        console.error(`Call ${callId} not found`);
        return;
      }

      // Determine recipient
      const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
      const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

      // Send answer to recipient
      const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
      if (recipientSocket) {
        recipientSocket.emit('webrtc:answer', { answer });
      }

      console.log(`WebRTC answer sent for call ${callId}`);
    } catch (error) {
      console.error('Error handling webrtc:answer:', error);
    }
  });

  socket.on('webrtc:ice-candidate', async (data) => {
    try {
      const { callId, candidate } = data;
      const callState = await redisClient.hGetAll(`call:${callId}`);

      if (!callState) {
        console.error(`Call ${callId} not found`);
        return;
      }

      // Determine recipient
      const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
      const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

      // Send ICE candidate to recipient
      const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
      if (recipientSocket) {
        recipientSocket.emit('webrtc:ice-candidate', { candidate });
      }
    } catch (error) {
      console.error('Error handling webrtc:ice-candidate:', error);
    }
  });
};
