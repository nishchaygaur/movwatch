const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory Room State
// room = {
//   id: string,
//   users: Map<socketId, { id, name, avatar, isHost, isAudioMuted, isVideoOff }>,
//   movieState: {
//     source: { type: 'preset', url: string, title: string, poster: string, fileName?: string },
//     isPlaying: boolean,
//     currentTime: number,
//     playbackRate: number,
//     lastActionTimestamp: number,
//     updatedBy: string
//   },
//   chatHistory: []
// }
const rooms = new Map();

const DEFAULT_PRESET = {
  type: 'preset',
  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  title: 'Big Buck Bunny (HD)',
  poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg'
};

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),
      movieState: {
        source: { ...DEFAULT_PRESET },
        isPlaying: false,
        currentTime: 0,
        playbackRate: 1,
        lastActionTimestamp: Date.now(),
        updatedBy: 'System'
      },
      chatHistory: []
    });
  }
  return rooms.get(roomId);
}

function calculateCurrentMovieTime(movieState) {
  if (!movieState.isPlaying) {
    return movieState.currentTime;
  }
  const elapsedSeconds = (Date.now() - movieState.lastActionTimestamp) / 1000;
  return movieState.currentTime + (elapsedSeconds * movieState.playbackRate);
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUser = null;

  // Join Room
  socket.on('join-room', ({ roomId, userName, avatar }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId);
    const isFirstUser = room.users.size === 0;

    currentUser = {
      id: socket.id,
      name: userName || `CinemaFan_${socket.id.substring(0, 4)}`,
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      isHost: isFirstUser,
      isAudioMuted: false,
      isVideoOff: false
    };

    room.users.set(socket.id, currentUser);

    // Calculate updated current time of movie
    const liveTime = calculateCurrentMovieTime(room.movieState);
    const syncState = {
      ...room.movieState,
      currentTime: liveTime,
      lastActionTimestamp: Date.now()
    };

    // Send room state to the newly joined user
    socket.emit('room-joined', {
      user: currentUser,
      users: Array.from(room.users.values()),
      movieState: syncState,
      chatHistory: room.chatHistory.slice(-50)
    });

    // Notify other peers in room
    socket.to(roomId).emit('user-joined', {
      user: currentUser,
      users: Array.from(room.users.values())
    });

    // Push system chat message
    const joinMsg = {
      id: `sys_${Date.now()}_${Math.random()}`,
      sender: 'System',
      text: `${currentUser.name} entered the theater 🍿`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.chatHistory.push(joinMsg);
    io.in(roomId).emit('chat-message', joinMsg);
  });

  // WebRTC Signaling: relay between peers in the room
  socket.on('webrtc-signal', ({ to, signal, type }) => {
    if (to) {
      io.to(to).emit('webrtc-signal', {
        from: socket.id,
        signal,
        type,
        user: currentUser
      });
    } else if (currentRoomId) {
      socket.to(currentRoomId).emit('webrtc-signal', {
        from: socket.id,
        signal,
        type,
        user: currentUser
      });
    }
  });

  // Synchronized Movie Player Actions
  socket.on('movie-action', (actionData) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const { action, time, playbackRate, source } = actionData;
    const senderName = currentUser ? currentUser.name : 'Partner';

    switch (action) {
      case 'play':
        room.movieState.isPlaying = true;
        room.movieState.currentTime = typeof time === 'number' ? time : calculateCurrentMovieTime(room.movieState);
        room.movieState.lastActionTimestamp = Date.now();
        room.movieState.updatedBy = senderName;
        break;

      case 'pause':
        room.movieState.isPlaying = false;
        room.movieState.currentTime = typeof time === 'number' ? time : calculateCurrentMovieTime(room.movieState);
        room.movieState.lastActionTimestamp = Date.now();
        room.movieState.updatedBy = senderName;
        break;

      case 'seek':
        room.movieState.currentTime = time;
        room.movieState.lastActionTimestamp = Date.now();
        room.movieState.updatedBy = senderName;
        break;

      case 'ratechange':
        if (typeof playbackRate === 'number') {
          room.movieState.currentTime = calculateCurrentMovieTime(room.movieState);
          room.movieState.playbackRate = playbackRate;
          room.movieState.lastActionTimestamp = Date.now();
          room.movieState.updatedBy = senderName;
        }
        break;

      case 'change-source':
        if (source) {
          room.movieState.source = source;
          room.movieState.currentTime = 0;
          room.movieState.isPlaying = false;
          room.movieState.lastActionTimestamp = Date.now();
          room.movieState.updatedBy = senderName;

          const changeMsg = {
            id: `sys_${Date.now()}_${Math.random()}`,
            sender: 'System',
            text: `🎬 ${senderName} changed the movie to "${source.title}"`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSystem: true
          };
          room.chatHistory.push(changeMsg);
          io.in(currentRoomId).emit('chat-message', changeMsg);
        }
        break;

      case 'request-sync':
        // A peer asks for exact state sync
        socket.emit('movie-sync', {
          ...room.movieState,
          currentTime: calculateCurrentMovieTime(room.movieState),
          lastActionTimestamp: Date.now()
        });
        return;
    }

    // Broadcast movie action to all other peers in the room
    socket.to(currentRoomId).emit('movie-action', {
      action,
      time: room.movieState.currentTime,
      playbackRate: room.movieState.playbackRate,
      source: room.movieState.source,
      isPlaying: room.movieState.isPlaying,
      lastActionTimestamp: room.movieState.lastActionTimestamp,
      updatedBy: senderName
    });
  });

  // User Media Status Update (mic/video toggled)
  socket.on('media-status-change', (status) => {
    if (!currentRoomId || !currentUser) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (typeof status.isAudioMuted === 'boolean') currentUser.isAudioMuted = status.isAudioMuted;
    if (typeof status.isVideoOff === 'boolean') currentUser.isVideoOff = status.isVideoOff;

    socket.to(currentRoomId).emit('user-media-status', {
      userId: socket.id,
      isAudioMuted: currentUser.isAudioMuted,
      isVideoOff: currentUser.isVideoOff
    });
  });

  // Chat message
  socket.on('chat-message', (data) => {
    if (!currentRoomId || !currentUser) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: currentUser.name,
      senderId: socket.id,
      avatar: currentUser.avatar,
      text: data.text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: false
    };

    room.chatHistory.push(message);
    if (room.chatHistory.length > 100) room.chatHistory.shift();

    io.in(currentRoomId).emit('chat-message', message);
  });

  // Realtime Screen Reaction (floating emojis)
  socket.on('screen-reaction', ({ emoji }) => {
    if (!currentRoomId || !currentUser) return;
    io.in(currentRoomId).emit('screen-reaction', {
      emoji,
      sender: currentUser.name,
      senderId: socket.id
    });
  });

  // Heartbeat sync from host or peer to maintain millisecond precision
  socket.on('time-heartbeat', ({ currentTime, isPlaying }) => {
    if (!currentRoomId || !currentUser) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (currentUser.isHost && isPlaying) {
      room.movieState.currentTime = currentTime;
      room.movieState.lastActionTimestamp = Date.now();
      socket.to(currentRoomId).emit('movie-heartbeat', {
        currentTime,
        isPlaying,
        timestamp: Date.now()
      });
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    if (!currentRoomId || !currentUser) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.users.delete(socket.id);

    // Notify others
    socket.to(currentRoomId).emit('user-left', {
      userId: socket.id,
      userName: currentUser.name,
      users: Array.from(room.users.values())
    });

    const leaveMsg = {
      id: `sys_${Date.now()}_${Math.random()}`,
      sender: 'System',
      text: `${currentUser.name} left the room.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    room.chatHistory.push(leaveMsg);
    socket.to(currentRoomId).emit('chat-message', leaveMsg);

    // If host left, designate next user as host
    if (currentUser.isHost && room.users.size > 0) {
      const nextUser = room.users.values().next().value;
      nextUser.isHost = true;
      io.in(currentRoomId).emit('new-host', { hostId: nextUser.id, hostName: nextUser.name });
    }

    // Clean up empty rooms after 10 minutes
    if (room.users.size === 0) {
      setTimeout(() => {
        const checkRoom = rooms.get(currentRoomId);
        if (checkRoom && checkRoom.users.size === 0) {
          rooms.delete(currentRoomId);
        }
      }, 10 * 60 * 1000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🎬 CineSync Watch Party server running at http://localhost:${PORT}`);
});
