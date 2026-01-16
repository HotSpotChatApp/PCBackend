import redisClient from '../redis/client.js';
import { v4 as uuidv4 } from 'uuid';

// Helper function to get filtered active users (only idle users)
const getFilteredActiveUsers = async () => {
    try {
        const activeUsersSet = await redisClient.sMembers('active_users');
        const usersList = await Promise.all(
            activeUsersSet.map(async (id) => {
                const userData = await redisClient.hGetAll(`user:${id}`);
                return {
                    userId: id,
                    socketId: userData.socketId || '',
                    displayName: userData.displayName || 'Unknown',
                    status: userData.status || 'idle',
                };
            })
        );
        // Filter to show only idle users (exclude users in calls or calling)
        return usersList.filter(user => user.status === 'idle');
    } catch (error) {
        console.error('Error getting filtered active users:', error);
        return [];
    }
};

export const handleCallRequests = (io, socket) => {
    // Get incoming requests for current user
    socket.on('get-incoming-requests', async (callback) => {
        try {
            const { userId } = socket.auth;
            const incomingSet = await redisClient.sMembers(`incoming:${userId}`);
            const incomingRequests = await Promise.all(
                incomingSet.map(async (callerId) => {
                    const callerData = await redisClient.hGetAll(`user:${callerId}`);
                    return {
                        userId: callerId,
                        displayName: callerData.displayName || 'Unknown',
                        socketId: callerData.socketId || '',
                    };
                })
            );
            callback(incomingRequests);
            console.log(`📤 Sent ${incomingRequests.length} incoming requests to ${socket.auth?.displayName}`);
        } catch (error) {
            console.error('Error getting incoming requests:', error);
            callback([]);
        }
    });

    // Get outgoing requests for current user
    socket.on('get-outgoing-requests', async (callback) => {
        try {
            const { userId } = socket.auth;
            const outgoingSet = await redisClient.sMembers(`outgoing:${userId}`);
            const outgoingRequests = await Promise.all(
                outgoingSet.map(async (calleeId) => {
                    const calleeData = await redisClient.hGetAll(`user:${calleeId}`);
                    return {
                        userId: calleeId,
                        displayName: calleeData.displayName || 'Unknown',
                        socketId: calleeData.socketId || '',
                    };
                })
            );
            callback(outgoingRequests);
            console.log(`📤 Sent ${outgoingRequests.length} outgoing requests to ${socket.auth?.displayName}`);
        } catch (error) {
            console.error('Error getting outgoing requests:', error);
            callback([]);
        }
    });

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

                // Also emit to refresh incoming requests
                const incomingSet = await redisClient.sMembers(`incoming:${targetUserId}`);
                const incomingRequests = await Promise.all(
                    incomingSet.map(async (cId) => {
                        const cData = await redisClient.hGetAll(`user:${cId}`);
                        return {
                            userId: cId,
                            displayName: cData.displayName || 'Unknown',
                        };
                    })
                );
                calleeSocket.emit('incoming-requests:update', incomingRequests);
            }

            // Update caller's outgoing requests
            const callerSocket = io.sockets.sockets.get(callerData.socketId);
            if (callerSocket) {
                const outgoingSet = await redisClient.sMembers(`outgoing:${callerId}`);
                const outgoingRequests = await Promise.all(
                    outgoingSet.map(async (ceeId) => {
                        const ceeData = await redisClient.hGetAll(`user:${ceeId}`);
                        return {
                            userId: ceeId,
                            displayName: ceeData.displayName || 'Unknown',
                        };
                    })
                );
                callerSocket.emit('outgoing-requests:update', outgoingRequests);
            }

            // Update status to calling
            await redisClient.hSet(`user:${callerId}`, 'status', 'calling');
            await redisClient.hSet(`user:${targetUserId}`, 'status', 'calling');

            console.log(`📞 Call request from ${callerName} to ${calleeData.displayName}`);

            // Broadcast updated FILTERED active users (only idle - removes the calling users)
            const filteredUsers = await getFilteredActiveUsers();
            io.emit('active-users:update', filteredUsers);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users (call request initiated)`);
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

                // Clear outgoing requests
                callerSocket.emit('outgoing-requests:update', []);
            }

            if (calleeSocket) {
                calleeSocket.emit('call:accept', {
                    callId,
                    callerId,
                    callerName: callerData.displayName,
                    initiator: false,
                });

                // Clear incoming requests
                calleeSocket.emit('incoming-requests:update', []);
            }

            // Broadcast updated FILTERED active users (only idle - removes the in-call users)
            const filteredUsers = await getFilteredActiveUsers();
            io.emit('active-users:update', filteredUsers);
            console.log(`🎥 Call ${callId} established between ${callerData.displayName} and ${calleeName}`);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users (call accepted)`);
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

                // Update outgoing requests
                const outgoingSet = await redisClient.sMembers(`outgoing:${callerId}`);
                const outgoingRequests = await Promise.all(
                    outgoingSet.map(async (ceeId) => {
                        const ceeData = await redisClient.hGetAll(`user:${ceeId}`);
                        return {
                            userId: ceeId,
                            displayName: ceeData.displayName || 'Unknown',
                        };
                    })
                );
                callerSocket.emit('outgoing-requests:update', outgoingRequests);
            }

            // Update callee's incoming requests
            const calleeSocket = io.sockets.sockets.get(socket.id);
            if (calleeSocket) {
                const incomingSet = await redisClient.sMembers(`incoming:${calleeId}`);
                const incomingRequests = await Promise.all(
                    incomingSet.map(async (cId) => {
                        const cData = await redisClient.hGetAll(`user:${cId}`);
                        return {
                            userId: cId,
                            displayName: cData.displayName || 'Unknown',
                        };
                    })
                );
                calleeSocket.emit('incoming-requests:update', incomingRequests);
            }

            // Broadcast updated FILTERED active users (only idle - resets rejected users back to idle)
            const filteredUsers = await getFilteredActiveUsers();
            io.emit('active-users:update', filteredUsers);
            console.log(`❌ Call rejected from ${calleeId} to ${callerId}`);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users (call rejected)`);
        } catch (error) {
            console.error('Error handling call:reject:', error);
        }
    });

    socket.on('call:end', async (data) => {
        try {
            const { userId } = socket.auth;
            const { callId } = data;

            console.log(`📵 Call end requested - Call ID: ${callId}, User: ${userId}`);

            // Get call state
            const callData = await redisClient.hGetAll(`call:${callId}`);
            if (!callData || !callData.caller) {
                console.warn('⚠️ Call data not found:', callId);
                return;
            }

            // Remove call state
            await redisClient.del(`call:${callId}`);

            // Determine other user
            const otherUserId = callData.caller === userId ? callData.callee : callData.caller;
            console.log(`   Caller: ${callData.caller}, Callee: ${callData.callee}, Current: ${userId}`);
            console.log(`   Other user: ${otherUserId}`);

            // Reset status for both users
            await redisClient.hSet(`user:${userId}`, 'status', 'idle');
            await redisClient.hSet(`user:${otherUserId}`, 'status', 'idle');
            console.log(`   Both users reset to idle status`);

            // Get socket info for other user
            const otherUserData = await redisClient.hGetAll(`user:${otherUserId}`);
            const otherSocket = io.sockets.sockets.get(otherUserData.socketId);

            // Notify BOTH users that call has ended
            if (otherSocket) {
                console.log(`   Sending call:end to other user`);
                otherSocket.emit('call:end');
            } else {
                console.log(`   Other user socket not found: ${otherUserData.socketId}`);
            }

            // Also ensure current user gets the confirmation (important!)
            console.log(`   Sending call:end to current user (confirmation)`);
            socket.emit('call:end');

            // Broadcast updated FILTERED active users (only idle - restores users to active list)
            const filteredUsers = await getFilteredActiveUsers();
            console.log(`   Broadcasting active users update: ${filteredUsers.length} idle users`);
            io.emit('active-users:update', filteredUsers);

            console.log(`✅ Call ${callId} ended successfully`);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users (call ended - users back to active list)`);
        } catch (error) {
            console.error('❌ Error handling call:end:', error);
        }
    });
};
