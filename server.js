const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const isVercel = process.env.VERCEL === '1';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const io = new Server(httpServer, {
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
            // Then get all sockets in the room
            setTimeout(() => {
                // Check if socket is still connected
                if (!socket.connected) {
                    console.log(`Socket ${socket.id} disconnected before room check`);
                    return;
                }

                const room = io.sockets.adapter.rooms.get(roomId);
                const usersInRoom = room ? Array.from(room).filter(id => id !== socket.id) : [];

                console.log(`Room ${roomId} now has ${usersInRoom.length + 1} user(s). Other users:`, usersInRoom);

                if (usersInRoom.length > 0) {
                    // Notify the joining user that there's already someone in the room
                    // The NEW user will create the offer
                    console.log(`Notifying ${socket.id} that peers are ready in room ${roomId}`);
                    socket.emit('peer-ready', { roomId });
                    // Notify existing users that someone new joined (they should wait for the offer)
                    // Don't make existing users create offers - only the new user should
                    console.log(`Notifying existing users in room ${roomId} that ${socket.id} joined`);
                    socket.to(roomId).emit('user-joined', { newUserId: socket.id });
                } else {
                    // First user in room - they wait for someone to join
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

    // On Vercel, we don't need to listen on a port
    // Vercel handles the HTTP server automatically
    if (!isVercel) {
        httpServer
            .once('error', (err) => {
                console.error(err);
                process.exit(1);
            })
            .listen(port, () => {
                console.log(`> Ready on http://${hostname}:${port}`);
            });
    } else {
        // Export the server for Vercel
        module.exports = httpServer;
        console.log('> Ready on Vercel');
    }
});
