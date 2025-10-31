// Socket.IO server for separate deployment
// Deploy this to Railway, Render, Fly.io, or any Node.js hosting
const { Server } = require('socket.io');
const http = require('http');

const port = process.env.PORT || 3001;
const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    // Use a small delay to ensure socket.join() has completed
    setTimeout(() => {
      if (!socket.connected) {
        console.log(`Socket ${socket.id} disconnected before room check`);
        return;
      }

      const room = io.sockets.adapter.rooms.get(roomId);
      const usersInRoom = room ? Array.from(room).filter(id => id !== socket.id) : [];

      console.log(`Room ${roomId} now has ${usersInRoom.length + 1} user(s). Other users:`, usersInRoom);

      if (usersInRoom.length > 0) {
        console.log(`Notifying ${socket.id} that peers are ready in room ${roomId}`);
        socket.emit('peer-ready', { roomId });
        console.log(`Notifying existing users in room ${roomId} that ${socket.id} joined`);
        socket.to(roomId).emit('user-joined', { newUserId: socket.id });
      } else {
        console.log(`User ${socket.id} is the first user in room ${roomId}, waiting for peers...`);
      }
    }, 50);
  });

  socket.on('offer', (data) => {
    console.log(`Offer from ${socket.id} to room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id,
    });
  });

  socket.on('answer', (data) => {
    console.log(`Answer from ${socket.id} to room ${data.roomId}`);
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      from: socket.id,
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id,
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Socket.IO server running on port ${port}`);
});

module.exports = server;
