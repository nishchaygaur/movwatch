// CineSync Unified Real-time Communication Channel
// Supports both Socket.IO (for dedicated/local servers) and PeerJS P2P (for zero-config Vercel/serverless deployments)

class CineChannel {
  constructor() {
    this.events = new Map();
    this.mode = 'unknown'; // 'socketio' or 'peerjs'
    this.socket = null;
    this.peer = null;
    this.dataConn = null;
    this.activeMediaCall = null;
    this.roomId = null;
    this.user = null;
    this.partnerUser = null;
    this.isHost = false;
    this.connected = false;
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);
  }

  trigger(event, data) {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in channel listener for ${event}:`, e);
        }
      });
    }
  }

  emit(event, data) {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit(event, data);
      return;
    }

    if (this.mode === 'peerjs') {
      this.handlePeerEmit(event, data);
    }
  }

  // Initialize connection
  init({ roomId, userName, avatar }) {
    this.roomId = roomId;
    this.user = {
      id: 'usr_' + Math.random().toString(36).substring(2, 7),
      name: userName,
      avatar,
      isHost: false
    };

    // If running on localhost or on a host with Socket.IO, check Socket.IO availability
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost && typeof io !== 'undefined') {
      try {
        console.log('[Channel] Attempting Socket.IO connection...');
        this.socket = io({ timeout: 3000, reconnectionAttempts: 2 });

        this.socket.on('connect', () => {
          console.log('[Channel] Connected via Socket.IO');
          this.mode = 'socketio';
          this.connected = true;

          // Wire all socket events
          [
            'room-joined', 'user-joined', 'user-left', 'movie-action', 'movie-sync',
            'movie-heartbeat', 'chat-message', 'screen-reaction', 'webrtc-signal',
            'user-media-status', 'new-host'
          ].forEach(evt => {
            this.socket.on(evt, (d) => this.trigger(evt, d));
          });

          this.socket.emit('join-room', { roomId, userName, avatar });
        });

        this.socket.on('connect_error', () => {
          if (this.mode !== 'peerjs') {
            console.warn('[Channel] Socket.IO unavailable, switching to PeerJS P2P transport');
            this.initPeerJS();
          }
        });
        return;
      } catch (e) {
        console.warn('[Channel] Socket.IO initialization failed, using PeerJS:', e);
      }
    }

    // Default to PeerJS P2P on Vercel / serverless / custom domain
    this.initPeerJS();
  }

  // PeerJS P2P Transport (Direct browser-to-browser connection)
  initPeerJS() {
    this.mode = 'peerjs';
    console.log('[Channel] Initializing PeerJS P2P Mode for room:', this.roomId);

    if (typeof Peer === 'undefined') {
      console.error('[Channel] PeerJS library not loaded');
      return;
    }

    const cleanRoom = this.roomId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hostPeerId = `cinesync-${cleanRoom}-host`;
    const guestPeerId = `cinesync-${cleanRoom}-${Math.random().toString(36).substring(2, 6)}`;

    // Try creating Host peer first
    this.peer = new Peer(hostPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('[PeerJS] Registered as Room Host:', id);
      this.isHost = true;
      this.user.isHost = true;
      this.connected = true;

      // Trigger room-joined as host
      this.trigger('room-joined', {
        user: this.user,
        users: [this.user],
        movieState: {
          source: {
            type: 'preset',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            title: 'Big Buck Bunny (HD)',
            poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg'
          },
          isPlaying: false,
          currentTime: 0,
          playbackRate: 1,
          lastActionTimestamp: Date.now()
        },
        chatHistory: []
      });
    });

    // Handle error (e.g. host ID already taken -> We are the guest!)
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        console.log('[PeerJS] Host already exists, connecting as Guest...');
        this.peer.destroy();
        this.connectAsGuest(guestPeerId, hostPeerId);
      } else {
        console.warn('[PeerJS] Peer error:', err);
      }
    });

    // Host receives connection from Guest
    this.peer.on('connection', (conn) => {
      console.log('[PeerJS] Host received data connection from partner');
      this.setupDataConnection(conn);
    });

    // Handle incoming video/audio call
    this.peer.on('call', (call) => {
      console.log('[PeerJS] Received incoming video call');
      this.activeMediaCall = call;
      if (window.webrtcManager && window.webrtcManager.localStream) {
        call.answer(window.webrtcManager.localStream);
      } else {
        call.answer(); // Answer without stream initially
      }
      call.on('stream', (remoteStream) => {
        this.trigger('p2p-remote-stream', remoteStream);
      });
    });
  }

  connectAsGuest(guestId, hostId) {
    this.isHost = false;
    this.user.isHost = false;

    this.peer = new Peer(guestId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('[PeerJS] Registered as Guest:', id);
      console.log('[PeerJS] Connecting to Host:', hostId);

      const conn = this.peer.connect(hostId, { reliable: true });
      this.setupDataConnection(conn);

      this.peer.on('call', (call) => {
        console.log('[PeerJS] Guest received incoming video call');
        this.activeMediaCall = call;
        if (window.webrtcManager && window.webrtcManager.localStream) {
          call.answer(window.webrtcManager.localStream);
        } else {
          call.answer();
        }
        call.on('stream', (remoteStream) => {
          this.trigger('p2p-remote-stream', remoteStream);
        });
      });
    });
  }

  setupDataConnection(conn) {
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[PeerJS] DataConnection OPEN between peers! 🎉');
      this.connected = true;

      // Exchange presence
      conn.send({
        type: '__handshake__',
        user: this.user,
        isHost: this.isHost
      });

      if (!this.isHost) {
        // Guest triggers room joined
        this.trigger('room-joined', {
          user: this.user,
          users: [this.user],
          movieState: null,
          chatHistory: []
        });
      }

      // If local media is ready, call the partner
      if (window.webrtcManager && window.webrtcManager.localStream) {
        this.callPartnerWithStream(window.webrtcManager.localStream);
      }
    });

    conn.on('data', (packet) => {
      if (!packet) return;

      if (packet.type === '__handshake__') {
        this.partnerUser = packet.user;
        const allUsers = [this.user, this.partnerUser];

        this.trigger('user-joined', {
          user: this.partnerUser,
          users: allUsers
        });

        // If host, send current movie state to guest
        if (this.isHost && window.syncPlayer) {
          const currentMovie = window.syncPlayer.currentSource;
          const isPlaying = !window.syncPlayer.video.paused;
          conn.send({
            type: 'movie-sync',
            state: {
              source: currentMovie,
              isPlaying,
              currentTime: window.syncPlayer.video.currentTime,
              playbackRate: window.syncPlayer.video.playbackRate,
              lastActionTimestamp: Date.now()
            }
          });
        }
        return;
      }

      // Route custom event packets
      if (packet.type === 'movie-action') {
        this.trigger('movie-action', packet.data);
      } else if (packet.type === 'movie-sync') {
        this.trigger('movie-sync', packet.state);
      } else if (packet.type === 'chat-message') {
        this.trigger('chat-message', packet.message);
      } else if (packet.type === 'screen-reaction') {
        this.trigger('screen-reaction', packet.data);
      } else if (packet.type === 'user-media-status') {
        this.trigger('user-media-status', packet.data);
      }
    });

    conn.on('close', () => {
      console.log('[PeerJS] Partner disconnected');
      if (this.partnerUser) {
        this.trigger('user-left', {
          userId: this.partnerUser.id,
          userName: this.partnerUser.name,
          users: [this.user]
        });
      }
      this.dataConn = null;
    });
  }

  callPartnerWithStream(stream) {
    if (!this.peer || !this.dataConn || !stream) return;
    try {
      console.log('[PeerJS] Calling partner with media stream...');
      const call = this.peer.call(this.dataConn.peer, stream);
      this.activeMediaCall = call;
      call.on('stream', (remoteStream) => {
        this.trigger('p2p-remote-stream', remoteStream);
      });
    } catch (e) {
      console.warn('[PeerJS] Call error:', e);
    }
  }

  handlePeerEmit(event, data) {
    if (!this.dataConn || !this.dataConn.open) {
      // If action is local and data connection not open yet, local echo
      if (event === 'chat-message') {
        const msg = {
          id: 'msg_' + Date.now(),
          sender: this.user.name,
          senderId: this.user.id,
          avatar: this.user.avatar,
          text: data.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: false
        };
        this.trigger('chat-message', msg);
      }
      return;
    }

    if (event === 'movie-action') {
      this.dataConn.send({
        type: 'movie-action',
        data: {
          ...data,
          updatedBy: this.user.name
        }
      });
    } else if (event === 'chat-message') {
      const msg = {
        id: 'msg_' + Date.now(),
        sender: this.user.name,
        senderId: this.user.id,
        avatar: this.user.avatar,
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystem: false
      };
      // Send to partner and echo locally
      this.dataConn.send({ type: 'chat-message', message: msg });
      this.trigger('chat-message', msg);
    } else if (event === 'screen-reaction') {
      this.dataConn.send({
        type: 'screen-reaction',
        data: {
          emoji: data.emoji,
          sender: this.user.name,
          senderId: this.user.id
        }
      });
    } else if (event === 'media-status-change') {
      this.dataConn.send({
        type: 'user-media-status',
        data: {
          userId: this.user.id,
          ...data
        }
      });
    }
  }
}

window.CineChannel = CineChannel;
