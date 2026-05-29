const { Server } = require('socket.io');

let io = null;

/**
 * Initializes the Socket.IO server
 * @param {import('http').Server} server 
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for local print agents or client apps
      methods: ['GET', 'POST']
    },
    pingTimeout: 30000,
    pingInterval: 10000
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Register hotel agent to their specific room
    socket.on('register-hotel', (data) => {
      try {
        const hotelId = typeof data === 'object' ? data.hotelId : data;
        if (!hotelId) {
          console.warn(`[SOCKET] Registration failed: hotelId is missing. socket: ${socket.id}`);
          socket.emit('error', { message: 'Registration failed: hotelId required' });
          return;
        }

        const roomName = `hotel-${hotelId}`;
        socket.join(roomName);
        console.log(`[SOCKET] Agent/Client registered to room: ${roomName} (Socket: ${socket.id})`);
        
        socket.emit('registered', { hotelId, roomName, status: 'success' });
      } catch (err) {
        console.error(`[SOCKET] Error in register-hotel:`, err.message);
        socket.emit('error', { message: 'Internal registration error' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`[SOCKET] Socket error for ${socket.id}:`, err);
    });
  });

  return io;
}

/**
 * Gets the singleton Socket.IO instance
 * @returns {Server}
 */
function getIO() {
  return io;
}

/**
 * Notifies all clients in a hotel room about an update
 * @param {number|string} hotelId 
 * @param {'table-update'|'room-update'} eventName 
 */
function notifyUpdate(hotelId, eventName) {
  if (io && hotelId) {
    const roomName = `hotel-${hotelId}`;
    console.log(`[SOCKET] Emitting ${eventName} to room: ${roomName}`);
    io.to(roomName).emit(eventName);
  }
}

module.exports = {
  initSocket,
  getIO,
  notifyUpdate
};
