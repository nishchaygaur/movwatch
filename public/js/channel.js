// CineSync Unified Real-time Communication Channel
// Supports Global TURN / STUN NAT Traversal across any Internet connection (4G/5G, Wi-Fi, Firewalls)

const GLOBAL_ICE_SERVERS = [
  // Fast Google STUN servers (UDP)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // OpenRelay Global Free TURN Relays (Port 80 & 443 UDP - bypasses Symmetric NAT)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // OpenRelay Global Free TURN Relay (Port 443 TCP - bypasses strict enterprise & mobile firewalls)
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // Secure TLS TURNS Relay (Port 443 TCP - passes through all corporate/mobile deep packet inspection)
  {
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

if (typeof window !== 'undefined') {
  window.GLOBAL_ICE_SERVERS = GLOBAL_ICE_SERVERS;
}

class CineChannel {
  constructor() {
    this.events = new Map();
    this.mode = 'unknown'; // 'socketio' or 'peerjs'
    this.socket = null;
    this.peer = null;
    this.myPeerId = null;
    this.targetHostPeerId = null;
    this.dataConn = null;
    this.activeMediaCall = null;
    this.roomId = null;
    this.user = null;
    this.partnerUser = null;
    this.isHost = false;
    this.connected = false;
    this.reconnectTimer = null;
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

    // Check URL parameters for explicit host peer ID
    const urlParams = new URLSearchParams(window.location.search);
    this.targetHostPeerId = urlParams.get('host');

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost && typeof io !== 'undefined') {
      try {
        console.log('[Channel] Connecting via local Socket.IO server...');
        this.socket = io({ timeout: 3000, reconnectionAttempts: 2 });

        this.socket.on('connect', () => {
          console.log('[Channel] Connected via Socket.IO');
          this.mode = 'socketio';
          this.connected = true;

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
            console.log('[Channel] Socket.IO unavailable, switching to Internet P2P (TURN/STUN) transport');
            this.initInternetP2P();
          }
        });
        return;
      } catch (e) {
        console.warn('[Channel] Socket.IO initialization failed, using Internet P2P:', e);
      }
    }

    // Default: Global Internet P2P with TURN across any network
    this.initInternetP2P();
  }

  // Internet P2P Transport with full NAT Traversal (TURN & STUN)
  initInternetP2P() {
    this.mode = 'peerjs';
    console.log('[Channel] Initializing Internet P2P with global TURN relay for room:', this.roomId);

    if (typeof Peer === 'undefined') {
      console.error('[Channel] PeerJS library not loaded');
      return;
    }

    const cleanRoom = (this.roomId || 'room').toLowerCase().replace(/[^a-z0-9]/g, '');

    // If URL has ?host=..., we are a guest joining the host directly
    if (this.targetHostPeerId) {
      const guestPeerId = `cs-${cleanRoom}-g-${Math.random().toString(36).substring(2, 6)}`;
      this.connectAsGuest(guestPeerId, this.targetHostPeerId);
      return;
    }

    // Otherwise, we are creating/hosting this room
    // Use a unique host ID with random suffix to avoid stale ghost sessions on public broker
    const uniqueHostPeerId = `cs-${cleanRoom}-h-${Math.random().toString(36).substring(2, 6)}`;
    this.myPeerId = uniqueHostPeerId;

    this.peer = new Peer(uniqueHostPeerId, {
      debug: 0,
      config: {
        iceServers: GLOBAL_ICE_SERVERS,
        iceCandidatePoolSize: 10
      }
    });

    this.peer.on('open', (id) => {
      console.log('[PeerJS] Registered as Room Host with TURN:', id);
      this.isHost = true;
      this.user.isHost = true;
      this.connected = true;
      this.myPeerId = id;

      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', this.roomId);
        u.searchParams.set('host', id);
        window.history.replaceState({ path: u.href }, '', u.href);
      } catch (e) {}

      this.updateStatusText('Waiting for partner to join link...');

      // Trigger room-joined as host
      this.trigger('room-joined', {
        user: this.user,
        users: [this.user],
        movieState: {
          source: {
            type: 'preset',
            url: 'https://vjs.zencdn.net/v/oceans.mp4',
            title: 'Oceans (HD Wildlife)',
            poster: 'https://vjs.zencdn.net/v/oceans.png'
          },
          isPlaying: false,
          currentTime: 0,
          playbackRate: 1,
          lastActionTimestamp: Date.now()
        },
        chatHistory: []
      });
    });

    this.peer.on('error', (err) => {
      console.warn('[PeerJS] Peer notice:', err.type || err);
      if (err.type === 'unavailable-id') {
        const fallbackGuestId = `cs-${cleanRoom}-g-${Math.random().toString(36).substring(2, 6)}`;
        this.connectAsGuest(fallbackGuestId, `cs-${cleanRoom}-host`);
      }
    });

    // Host receives incoming DataConnection from Guest
    this.peer.on('connection', (conn) => {
      console.log('[PeerJS] Host received incoming connection from partner over Internet');
      this.setupDataConnection(conn);
    });

    // Host receives incoming Video/Audio Call
    this.peer.on('call', (call) => {
      console.log('[PeerJS] Host received incoming media call');
      this.handleIncomingMediaCall(call);
    });
  }

  connectAsGuest(guestId, hostId) {
    this.isHost = false;
    this.user.isHost = false;
    this.myPeerId = guestId;
    this.targetHostPeerId = hostId;

    this.updateStatusText('Connecting to partner over Internet...');

    this.peer = new Peer(guestId, {
      debug: 0,
      config: {
        iceServers: GLOBAL_ICE_SERVERS,
        iceCandidatePoolSize: 10
      }
    });

    this.peer.on('open', (id) => {
      console.log('[PeerJS] Guest registered with TURN:', id);
      console.log('[PeerJS] Initiating TURN/STUN connection to Host:', hostId);

      const conn = this.peer.connect(hostId, {
        reliable: true
      });
      this.setupDataConnection(conn);

      // Listen for incoming call from host
      this.peer.on('call', (call) => {
        console.log('[PeerJS] Guest received incoming media call');
        this.handleIncomingMediaCall(call);
      });
    });

    this.peer.on('error', (err) => {
      console.warn('[PeerJS] Guest connection notice:', err.type || err);
    });
  }

  setupDataConnection(conn) {
    this.dataConn = conn;

    conn.on('open', () => {
      console.log('[PeerJS] DataConnection OPEN between peers across Internet! 🎉');
      this.connected = true;
      this.updateStatusText('🟢 Connected with partner');
      window.toast && window.toast('🟢 Partner connected! Movie sync and video call active.');

      // Exchange presence handshake
      conn.send({
        type: '__handshake__',
        user: this.user,
        isHost: this.isHost
      });

      if (!this.isHost) {
        this.trigger('room-joined', {
          user: this.user,
          users: [this.user],
          movieState: null,
          chatHistory: []
        });
      }

      // If local media stream is ready, call partner with media stream
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

        // Host synchronizes current movie state to joining guest
        if (this.isHost && window.syncPlayer) {
          const currentMovie = window.syncPlayer.currentSource;
          const isPlaying = window.syncPlayer.isPlaying();
          conn.send({
            type: 'movie-sync',
            state: {
              source: currentMovie,
              isPlaying,
              currentTime: window.syncPlayer.getCurrentTime(),
              playbackRate: window.syncPlayer.video ? window.syncPlayer.video.playbackRate : 1,
              lastActionTimestamp: Date.now()
            }
          });
        }

        // If local media is active, send stream
        if (window.webrtcManager && window.webrtcManager.localStream) {
          this.callPartnerWithStream(window.webrtcManager.localStream);
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
      this.updateStatusText('Partner disconnected');
      if (this.partnerUser) {
        this.trigger('user-left', {
          userId: this.partnerUser.id,
          userName: this.partnerUser.name,
          users: [this.user]
        });
      }
      this.dataConn = null;
    });

    conn.on('error', (err) => {
      console.warn('[PeerJS] Connection error:', err);
    });
  }

  handleIncomingMediaCall(call) {
    if (this.activeMediaCall && this.activeMediaCall !== call) {
      try { this.activeMediaCall.close(); } catch (e) {}
    }
    this.activeMediaCall = call;
    const myStream = (window.webrtcManager && window.webrtcManager.localStream) ? window.webrtcManager.localStream : undefined;
    call.answer(myStream);
    call.on('stream', (remoteStream) => {
      console.log('[PeerJS] Received remote media stream via TURN/STUN');
      this.trigger('p2p-remote-stream', remoteStream);
    });
    call.on('error', (err) => console.warn('[PeerJS] Call warning:', err));
  }

  callPartnerWithStream(stream) {
    if (!this.peer || !this.dataConn || !stream) return;
    try {
      const targetPeerId = this.dataConn.peer;
      // If we already have an open call that is active, avoid glare
      if (this.activeMediaCall && this.activeMediaCall.open) {
        console.log('[PeerJS] Media call already active with stream');
        return;
      }
      console.log('[PeerJS] Calling partner with media stream via TURN relay to:', targetPeerId);
      const call = this.peer.call(targetPeerId, stream);
      this.activeMediaCall = call;
      call.on('stream', (remoteStream) => {
        console.log('[PeerJS] Received answer remote media stream via TURN');
        this.trigger('p2p-remote-stream', remoteStream);
      });
      call.on('error', (err) => console.warn('[PeerJS] Call warning:', err));
    } catch (e) {
      console.warn('[PeerJS] Call error:', e);
    }
  }

  handlePeerEmit(event, data) {
    if (!this.dataConn || !this.dataConn.open) {
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

  updateStatusText(text) {
    const el = document.getElementById('syncStatusText');
    if (el) el.textContent = text;
  }
}

window.CineChannel = CineChannel;
