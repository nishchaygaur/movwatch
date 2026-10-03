// CineSync Global Real-Time Communication Channel
// Supports Global MQTT-over-WebSockets Signaling + WebRTC STUN/TURN for 100% Cross-Network Connectivity

const GLOBAL_ICE_SERVERS = [
  // Google Public STUN Servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Cloudflare STUN Server
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Metered STUN (Port 80 UDP)
  { urls: 'stun:stun.metered.ca:80' },
  // Metered TURN Relays (Port 80 UDP & TCP - bypasses Symmetric NAT & restrictive firewalls)
  {
    urls: 'turn:relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:relay.metered.ca:80?transport=tcp',
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
    this.mode = 'unknown'; // 'mqtt', 'socketio', 'peerjs'
    this.connected = false;

    // Identities
    this.roomId = null;
    this.topic = null;
    this.user = null;
    this.partnerUser = null;
    this.isHost = false;

    // Transports
    this.mqttClient = null;
    this.socket = null;
    this.peer = null;
    this.dataConn = null;
    this.activeMediaCall = null;

    // Timers
    this.heartbeatTimer = null;
    this.partnerTimeoutTimer = null;
    this.lastPartnerSeen = 0;
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
          console.error(`[Channel] Error in listener for ${event}:`, e);
        }
      });
    }
  }

  emit(event, data) {
    if (this.mode === 'socketio' && this.socket && this.socket.connected) {
      this.socket.emit(event, data);
      return;
    }

    if (this.mode === 'mqtt' && this.mqttClient && this.connected) {
      this.handleMqttEmit(event, data);
      return;
    }

    if (this.mode === 'peerjs') {
      this.handlePeerEmit(event, data);
    }
  }

  // Initialize room channel
  init({ roomId, userName, avatar }) {
    this.roomId = (roomId || 'cinema-main').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'cinema-main';
    this.topic = `cinesync/v3/theater/${this.roomId}`;
    this.user = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: userName || 'MovieFan',
      avatar: avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
      isHost: false
    };

    console.log('[Channel] Initializing CineSync for Room:', this.roomId, 'as User:', this.user.name);

    // If on localhost with Socket.IO running, allow local socketio connection
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocalhost && typeof io !== 'undefined') {
      try {
        console.log('[Channel] Testing local Socket.IO connection...');
        this.socket = io({ timeout: 2500, reconnectionAttempts: 2 });
        this.socket.on('connect', () => {
          console.log('[Channel] Connected via local Socket.IO server');
          this.mode = 'socketio';
          this.connected = true;

          [
            'room-joined', 'user-joined', 'user-left', 'movie-action', 'movie-sync',
            'movie-heartbeat', 'chat-message', 'screen-reaction', 'webrtc-signal',
            'user-media-status', 'new-host'
          ].forEach(evt => {
            this.socket.on(evt, (d) => this.trigger(evt, d));
          });

          this.socket.emit('join-room', { roomId: this.roomId, userName: this.user.name, avatar: this.user.avatar });
        });

        this.socket.on('connect_error', () => {
          if (this.mode !== 'mqtt') {
            console.log('[Channel] Socket.IO unavailable, switching to Global Internet Real-Time Transport');
            this.initMqttTransport();
          }
        });
        return;
      } catch (e) {
        console.warn('[Channel] Local socket error:', e);
      }
    }

    // Default & Production: Global Internet Real-Time Signaling (MQTT over WSS)
    this.initMqttTransport();
  }

  // Global Internet Transport (EMQX Cloud WSS with HiveMQ Failover)
  initMqttTransport() {
    this.mode = 'mqtt';
    this.updateStatusText('Connecting to global theater network...');

    if (typeof mqtt === 'undefined') {
      console.warn('[Channel] MQTT library not available, falling back to PeerJS');
      this.initPeerJsFallback();
      return;
    }

    const brokers = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];

    let brokerIdx = 0;
    const connectBroker = (url) => {
      console.log(`[Channel] Connecting to global messaging cluster: ${url}`);
      const clientId = `cine_${this.user.id}_${Math.random().toString(36).substring(2, 6)}`;

      try {
        this.mqttClient = mqtt.connect(url, {
          clientId,
          clean: true,
          connectTimeout: 5000,
          reconnectPeriod: 3000,
          keepalive: 30
        });

        this.mqttClient.on('connect', () => {
          console.log('[Channel] Connected to global messaging cluster! 🎉 Subscribing to topic:', this.topic);
          this.connected = true;
          this.updateStatusText('Looking for partner in room...');

          this.mqttClient.subscribe(this.topic, { qos: 1 }, (err) => {
            if (err) {
              console.error('[Channel] Subscription error:', err);
              return;
            }

            console.log('[Channel] Subscribed successfully. Announcing presence to room...');

            // Broadcast join announcement to discover existing peers in the room
            this.publish({
              type: 'join-ping',
              user: this.user,
              timestamp: Date.now()
            });

            // Trigger room-joined locally so theater UI opens with initial movie
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

            this.startHeartbeat();
          });
        });

        this.mqttClient.on('message', (topic, payload) => {
          if (topic !== this.topic) return;
          try {
            const packet = JSON.parse(payload.toString());
            this.handleMqttPacket(packet);
          } catch (e) {
            console.warn('[Channel] Error parsing MQTT packet:', e);
          }
        });

        this.mqttClient.on('error', (err) => {
          console.warn('[Channel] Broker error:', err);
          if (!this.connected && brokerIdx < brokers.length - 1) {
            brokerIdx++;
            console.log('[Channel] Trying fallback broker...');
            try { this.mqttClient.end(true); } catch(e){}
            connectBroker(brokers[brokerIdx]);
          }
        });

        // Setup beforeunload to notify partner on close
        if (typeof window !== 'undefined') {
          window.addEventListener('beforeunload', () => {
            try {
              this.publish({
                type: 'user-left',
                userId: this.user.id,
                userName: this.user.name
              });
            } catch (e) {}
          });
        }
      } catch (err) {
        console.error('[Channel] MQTT connection failed:', err);
        this.initPeerJsFallback();
      }
    };

    connectBroker(brokers[0]);
  }

  // Publish JSON packet to room topic
  publish(packet) {
    if (!this.mqttClient || !this.connected) return;
    try {
      const fullPacket = {
        fromId: this.user.id,
        ...packet
      };
      this.mqttClient.publish(this.topic, JSON.stringify(fullPacket), { qos: 1 });
    } catch (e) {
      console.warn('[Channel] Publish error:', e);
    }
  }

  // Handle incoming MQTT packet
  handleMqttPacket(packet) {
    if (!packet || packet.fromId === this.user.id) {
      return; // Ignore own messages
    }

    this.lastPartnerSeen = Date.now();

    // 1. New partner entered room
    if (packet.type === 'join-ping') {
      console.log('[Channel] Partner announced presence:', packet.user.name);
      this.partnerUser = packet.user;
      this.updateStatusText(`🟢 Connected with ${packet.user.name}`);
      window.toast && window.toast(`👋 ${packet.user.name} joined room!`);

      // Respond directly with join-pong containing our user info and current movie state
      let currentMovieState = null;
      if (window.syncPlayer) {
        currentMovieState = {
          source: window.syncPlayer.currentSource,
          isPlaying: window.syncPlayer.isPlaying(),
          currentTime: window.syncPlayer.getCurrentTime(),
          playbackRate: window.syncPlayer.video ? window.syncPlayer.video.playbackRate : 1,
          lastActionTimestamp: Date.now()
        };
      }

      this.publish({
        type: 'join-pong',
        targetUserId: packet.user.id,
        user: this.user,
        movieState: currentMovieState
      });

      this.trigger('user-joined', {
        user: this.partnerUser,
        users: [this.user, this.partnerUser]
      });

      return;
    }

    // 2. Existing partner replied with their presence and movie state
    if (packet.type === 'join-pong') {
      if (packet.targetUserId !== this.user.id) return; // Not for us
      console.log('[Channel] Received join-pong from existing partner:', packet.user.name);
      this.partnerUser = packet.user;
      this.updateStatusText(`🟢 Connected with ${packet.user.name}`);
      window.toast && window.toast(`🟢 Connected with ${packet.user.name}!`);

      this.trigger('user-joined', {
        user: this.partnerUser,
        users: [this.user, this.partnerUser]
      });

      // Synchronize to the existing movie state
      if (packet.movieState && window.syncPlayer) {
        this.trigger('movie-sync', packet.movieState);
      }

      return;
    }

    // 3. Movie Action (play / pause / seek)
    if (packet.type === 'movie-action') {
      this.trigger('movie-action', packet.data);
      return;
    }

    // 4. Full Movie State Sync
    if (packet.type === 'movie-sync') {
      this.trigger('movie-sync', packet.state);
      return;
    }

    // 5. Chat Message
    if (packet.type === 'chat-message') {
      this.trigger('chat-message', packet.message);
      return;
    }

    // 6. Floating Screen Reaction
    if (packet.type === 'screen-reaction') {
      this.trigger('screen-reaction', packet.data);
      return;
    }

    // 7. WebRTC Signaling (Offer / Answer / ICE Candidates)
    if (packet.type === 'webrtc-signal') {
      if (!packet.to || packet.to === this.user.id) {
        this.trigger('webrtc-signal', {
          from: packet.from,
          signal: packet.signal,
          type: packet.signalType,
          user: packet.user
        });
      }
      return;
    }

    // 8. User Media Status (Mic/Cam muted)
    if (packet.type === 'user-media-status') {
      this.trigger('user-media-status', packet.data);
      return;
    }

    // 9. Partner Left
    if (packet.type === 'user-left') {
      console.log('[Channel] Partner left room:', packet.userName);
      this.updateStatusText('Partner left room. Waiting for friend to join...');
      this.trigger('user-left', {
        userId: packet.userId,
        userName: packet.userName,
        users: [this.user]
      });
      this.partnerUser = null;
      return;
    }

    // 10. Heartbeat ping
    if (packet.type === 'heartbeat') {
      this.lastPartnerSeen = Date.now();
    }
  }

  // Handle emitting custom events to MQTT topic
  handleMqttEmit(event, data) {
    if (event === 'movie-action') {
      this.publish({
        type: 'movie-action',
        data: {
          ...data,
          updatedBy: this.user.name
        }
      });
    } else if (event === 'movie-sync') {
      this.publish({
        type: 'movie-sync',
        state: data
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
      // Trigger local echo for instant feedback, then publish
      this.trigger('chat-message', msg);
      this.publish({
        type: 'chat-message',
        message: msg
      });
    } else if (event === 'screen-reaction') {
      this.publish({
        type: 'screen-reaction',
        data: {
          emoji: data.emoji,
          sender: this.user.name,
          senderId: this.user.id
        }
      });
    } else if (event === 'webrtc-signal') {
      this.publish({
        type: 'webrtc-signal',
        to: data.to,
        from: this.user.id,
        user: this.user,
        signal: data.signal,
        signalType: data.type
      });
    } else if (event === 'media-status-change') {
      this.publish({
        type: 'user-media-status',
        data: {
          userId: this.user.id,
          ...data
        }
      });
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.publish({ type: 'heartbeat', timestamp: Date.now() });

        // Check if partner went silent
        if (this.partnerUser && this.lastPartnerSeen > 0 && Date.now() - this.lastPartnerSeen > 35000) {
          console.log('[Channel] Partner heartbeat timed out');
          this.trigger('user-left', {
            userId: this.partnerUser.id,
            userName: this.partnerUser.name,
            users: [this.user]
          });
          this.partnerUser = null;
          this.updateStatusText('Waiting for partner to join link...');
        }
      }
    }, 10000);
  }

  // PeerJS Fallback Transport (if MQTT WebSocket is unreachable on strict networks)
  initPeerJsFallback() {
    this.mode = 'peerjs';
    console.log('[Channel] Initializing PeerJS Fallback for room:', this.roomId);

    if (typeof Peer === 'undefined') {
      console.error('[Channel] PeerJS library not available');
      return;
    }

    const cleanRoom = (this.roomId || 'room').toLowerCase().replace(/[^a-z0-9]/g, '');
    const urlParams = new URLSearchParams(window.location.search);
    const hostFromUrl = urlParams.get('host');

    const peerId = hostFromUrl ? `cs-${cleanRoom}-g-${Math.random().toString(36).substring(2, 6)}` : `cs-${cleanRoom}-host`;
    this.peer = new Peer(peerId, {
      debug: 0,
      config: {
        iceServers: GLOBAL_ICE_SERVERS,
        iceCandidatePoolSize: 10
      }
    });

    this.peer.on('open', (id) => {
      console.log('[PeerJS] Registered as:', id);
      this.connected = true;
      if (hostFromUrl) {
        const conn = this.peer.connect(hostFromUrl, { reliable: true });
        this.setupDataConnection(conn);
      } else {
        this.trigger('room-joined', {
          user: this.user,
          users: [this.user],
          movieState: null,
          chatHistory: []
        });
      }
    });

    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.warn('[PeerJS] Error:', err.type || err);
      if (err.type === 'unavailable-id') {
        const guestId = `cs-${cleanRoom}-g-${Math.random().toString(36).substring(2, 6)}`;
        this.peer = new Peer(guestId, { config: { iceServers: GLOBAL_ICE_SERVERS } });
        this.peer.on('open', () => {
          const conn = this.peer.connect(`cs-${cleanRoom}-host`, { reliable: true });
          this.setupDataConnection(conn);
        });
      }
    });
  }

  setupDataConnection(conn) {
    this.dataConn = conn;
    conn.on('open', () => {
      this.connected = true;
      conn.send({ type: '__handshake__', user: this.user });
      this.updateStatusText('🟢 Connected with partner');
    });

    conn.on('data', (packet) => {
      if (!packet) return;
      if (packet.type === '__handshake__') {
        this.partnerUser = packet.user;
        this.trigger('user-joined', { user: this.partnerUser, users: [this.user, this.partnerUser] });
      } else if (packet.type === 'movie-action') {
        this.trigger('movie-action', packet.data);
      } else if (packet.type === 'movie-sync') {
        this.trigger('movie-sync', packet.state);
      } else if (packet.type === 'chat-message') {
        this.trigger('chat-message', packet.message);
      } else if (packet.type === 'screen-reaction') {
        this.trigger('screen-reaction', packet.data);
      }
    });
  }

  handlePeerEmit(event, data) {
    if (!this.dataConn || !this.dataConn.open) return;
    if (event === 'movie-action') {
      this.dataConn.send({ type: 'movie-action', data: { ...data, updatedBy: this.user.name } });
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
      this.dataConn.send({ type: 'screen-reaction', data: { emoji: data.emoji, sender: this.user.name, senderId: this.user.id } });
    }
  }

  updateStatusText(text) {
    const el = document.getElementById('syncStatusText');
    if (el) el.textContent = text;
  }
}

window.CineChannel = CineChannel;
