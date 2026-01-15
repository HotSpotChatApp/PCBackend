import redisClient from '../redis/client.js';

export const handleWebRTC = (io, socket) => {
    socket.on('webrtc:offer', async (data) => {
        try {
            const { callId, offer } = data;
            console.log(`📨 Received WebRTC offer for call ${callId}`);
            const callState = await redisClient.hGetAll(`call:${callId}`);

            if (!callState) {
                console.error(`❌ Call ${callId} not found`);
                return;
            }

            // Determine recipient
            const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
            const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

            console.log(`📤 Forwarding offer to ${recipientData.displayName}`);
            // Send offer to recipient
            const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
            if (recipientSocket) {
                recipientSocket.emit('webrtc:offer', { offer });
                console.log(`✅ Offer sent to ${recipientData.displayName} (${recipientData.socketId})`);
            } else {
                console.error(`❌ Recipient socket not found for ${recipientId}`);
            }
        } catch (error) {
            console.error('❌ Error handling webrtc:offer:', error);
        }
    });

    socket.on('webrtc:answer', async (data) => {
        try {
            const { callId, answer } = data;
            console.log(`📨 Received WebRTC answer for call ${callId}`);
            const callState = await redisClient.hGetAll(`call:${callId}`);

            if (!callState) {
                console.error(`❌ Call ${callId} not found`);
                return;
            }

            // Determine recipient
            const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
            const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

            console.log(`📤 Forwarding answer to ${recipientData.displayName}`);
            // Send answer to recipient
            const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
            if (recipientSocket) {
                recipientSocket.emit('webrtc:answer', { answer });
                console.log(`✅ Answer sent to ${recipientData.displayName} (${recipientData.socketId})`);
            } else {
                console.error(`❌ Recipient socket not found for ${recipientId}`);
            }
        } catch (error) {
            console.error('❌ Error handling webrtc:answer:', error);
        }
    });

    socket.on('webrtc:ice-candidate', async (data) => {
        try {
            const { callId, candidate } = data;
            const callState = await redisClient.hGetAll(`call:${callId}`);

            if (!callState) {
                console.error(`❌ Call ${callId} not found`);
                return;
            }

            // Determine recipient
            const recipientId = callState.caller === socket.auth.userId ? callState.callee : callState.caller;
            const recipientData = await redisClient.hGetAll(`user:${recipientId}`);

            // Send ICE candidate to recipient
            const recipientSocket = io.sockets.sockets.get(recipientData.socketId);
            if (recipientSocket) {
                recipientSocket.emit('webrtc:ice-candidate', { candidate });
                console.log(`❄️ ICE candidate sent to ${recipientData.displayName}`);
            } else {
                console.error(`❌ Recipient socket not found for ${recipientId}`);
            }
        } catch (error) {
            console.error('❌ Error handling webrtc:ice-candidate:', error);
        }
    });
};
