import redisClient from '../redis/client.js';

export const handlePresence = (io, socket) => {
    // Send initial active users list to newly connected user
    socket.on('get-active-users', async (callback) => {
        try {
            const activeUsersSet = await redisClient.sMembers('active_users');
            const activeUsersList = await Promise.all(
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
            callback(activeUsersList);
            console.log('📤 Sent active users list to client:', activeUsersList);
        } catch (error) {
            console.error('Error getting active users:', error);
            callback([]);
        }
    });

    socket.on('user:online', async () => {
        try {
            const { userId, displayName } = socket.auth;

            // Add to active users set
            await redisClient.sAdd('active_users', userId);

            // Store user metadata
            await redisClient.hSet(`user:${userId}`, {
                socketId: socket.id,
                displayName,
                status: 'idle',
                timestamp: Date.now().toString(),
            });

            // Broadcast updated active users list
            const activeUsersSet = await redisClient.sMembers('active_users');
            const activeUsersList = await Promise.all(
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

            // Emit to all clients
            io.emit('active-users:update', activeUsersList);
            console.log(`📢 Broadcasting ${activeUsersList.length} active users`);
            console.log('✅ Active users list:', activeUsersList);
            console.log(`${displayName} came online`);
        } catch (error) {
            console.error('Error handling user:online:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const userId = socket.auth.userId;
            const userData = await redisClient.hGetAll(`user:${userId}`);

            // Remove from active users
            await redisClient.sRem('active_users', userId);
            await redisClient.del(`user:${userId}`);

            // Clean up call state
            await redisClient.del(`incoming:${userId}`);
            await redisClient.del(`outgoing:${userId}`);

            // Broadcast updated active users list
            const activeUsersSet = await redisClient.sMembers('active_users');
            const activeUsersList = await Promise.all(
                activeUsersSet.map(async (id) => {
                    const data = await redisClient.hGetAll(`user:${id}`);
                    return {
                        userId: id,
                        socketId: data.socketId,
                        displayName: data.displayName || 'Unknown',
                        status: data.status || 'idle',
                    };
                })
            );

            io.emit('active-users:update', activeUsersList);
            console.log(`${userData.displayName} went offline`);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
};
