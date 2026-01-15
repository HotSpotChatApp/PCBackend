import redisClient from '../redis/client.js';

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

export const handlePresence = (io, socket) => {
    // Send initial active users list (filtered - only idle) to newly connected user
    socket.on('get-active-users', async (callback) => {
        try {
            const filteredUsers = await getFilteredActiveUsers();
            // Also filter out the current user from their own list
            const usersForClient = filteredUsers.filter(u => u.userId !== socket.auth?.userId);
            callback(usersForClient);
            console.log(`📤 Sent ${usersForClient.length} active users to ${socket.auth?.displayName}:`, usersForClient);
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

            console.log(`✅ ${displayName} came online (${userId})`);

            // Broadcast updated FILTERED active users list (only idle users)
            const filteredUsers = await getFilteredActiveUsers();
            
            // Emit to all clients
            io.emit('active-users:update', filteredUsers);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users to all clients`);
            console.log('📋 Idle active users list:', filteredUsers);
        } catch (error) {
            console.error('Error handling user:online:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const userId = socket.auth.userId;
            const userData = await redisClient.hGetAll(`user:${userId}`);
            const displayName = userData?.displayName || 'Unknown';

            // Remove from active users
            await redisClient.sRem('active_users', userId);
            await redisClient.del(`user:${userId}`);

            // Clean up call state
            await redisClient.del(`incoming:${userId}`);
            await redisClient.del(`outgoing:${userId}`);

            console.log(`❌ ${displayName} went offline (${userId})`);

            // Broadcast updated FILTERED active users list (only idle users)
            const filteredUsers = await getFilteredActiveUsers();
            io.emit('active-users:update', filteredUsers);
            console.log(`📢 Broadcasting ${filteredUsers.length} IDLE users after disconnect`);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
};
