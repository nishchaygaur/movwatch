// CineSync WebRTC Real-Time Video & Audio Calling Engine
// Complete with Perfect Negotiation Glare Resolution, Dynamic Track Injection & Autoplay Protection

class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.screenStream = null;
    this.isScreenSharing = false;

    // UI Elements
    this.localVideo = document.getElementById('localVideo');
    this.remoteVideo = document.getElementById('remoteVideo');
    this.localPlaceholder = document.getElementById('localPlaceholder');
    this.remotePlaceholder = document.getElementById('remotePlaceholder');
    this.remoteUserName = document.getElementById('remoteUserName');
    this.remoteBadgeName = document.getElementById('remoteBadgeName');
    this.localSpeakingBorder = document.getElementById('localSpeakingBorder');
    this.remoteSpeakingBorder = document.getElementById('remoteSpeakingBorder');
    
    this.btnToggleMic = document.getElementById('btnToggleMic');
    this.iconMicOn = document.getElementById('iconMicOn');
    this.iconMicOff = document.getElementById('iconMicOff');
    this.btnToggleCam = document.getElementById('btnToggleCam');
    this.iconCamOn = document.getElementById('iconCamOn');
    this.iconCamOff = document.getElementById('iconCamOff');
    this.btnShareScreen = document.getElementById('btnShareScreen');
    this.btnStartCall = document.getElementById('btnStartCall');
    this.remoteVolumeSlider = document.getElementById('remoteVolumeSlider');
    
    this.videoCallDock = document.getElementById('videoCallDock');
    this.btnToggleCallDock = document.getElementById('btnToggleCallDock');

    // States
    this.isAudioMuted = false;
    this.isVideoOff = false;
    this.iceCandidateQueue = [];
    this.partnerId = null;

    // WebRTC Config (Verified active STUN & TURN relays)
    this.rtcConfig = {
      iceServers: (typeof window !== 'undefined' && window.GLOBAL_ICE_SERVERS) ? window.GLOBAL_ICE_SERVERS : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.metered.ca:80' },
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
      ],
      iceCandidatePoolSize: 10
    };

    this.initControls();
    this.initSocketSignaling();
  }

  initControls() {
    // Toggle mic
    this.btnToggleMic.addEventListener('click', () => this.toggleAudio());
    // Toggle cam
    this.btnToggleCam.addEventListener('click', () => this.toggleVideo());
    // Share screen
    this.btnShareScreen.addEventListener('click', () => this.toggleScreenShare());
    // Connect / Restart camera
    this.btnStartCall.addEventListener('click', () => this.startCallFlow());
    // Partner volume slider
    this.remoteVolumeSlider.addEventListener('input', (e) => {
      this.remoteVideo.volume = parseFloat(e.target.value);
    });

    // Toggle minimize dock
    this.btnToggleCallDock.addEventListener('click', () => {
      this.videoCallDock.classList.toggle('minimized');
    });
  }

  getMyId() {
    return (window.channel && window.channel.user) ? window.channel.user.id : '';
  }

  async startCallFlow() {
    try {
      await this.initLocalMedia();
      window.toast && window.toast('📷 Camera and microphone enabled');

      // If partner is already present, initiate connection if offerer
      if (this.partnerId) {
        this.createPeerConnection();
        const myId = this.getMyId();
        if (myId < this.partnerId) {
          console.log('[WebRTC] Manual call restart as offerer');
          await this.initiateOffer(this.partnerId);
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Call start error:', err);
      window.toast && window.toast('⚠️ Media permission denied or device not found');
    }
  }

  async initLocalMedia() {
    if (this.localStream) return this.localStream;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (err) {
      console.warn('[WebRTC] Camera failed, trying audio-only:', err);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        this.isVideoOff = true;
        this.updateCamButtonUI();
      } catch (audioErr) {
        console.log('[WebRTC] Camera/Microphone not enabled or not found - running in watch mode.');
        this.isVideoOff = true;
        this.isAudioMuted = true;
        this.localPlaceholder.classList.remove('hidden');
        this.updateCamButtonUI();
        this.updateMicButtonUI();
        return null;
      }
    }

    if (this.localStream) {
      this.localVideo.srcObject = this.localStream;
      this.localPlaceholder.classList.add('hidden');
      this.setupAudioMeter(this.localStream, this.localSpeakingBorder);
    }

    // Inject or replace tracks in existing peer connection
    if (this.peerConnection && this.localStream) {
      const senders = this.peerConnection.getSenders();
      this.localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(e => console.warn('[WebRTC] replaceTrack notice:', e));
        } else {
          this.peerConnection.addTrack(track, this.localStream);
        }
      });
    }

    return this.localStream;
  }

  createPeerConnection() {
    if (this.peerConnection) {
      return this.peerConnection;
    }

    console.log('[WebRTC] Creating RTCPeerConnection with STUN/TURN configuration');
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Send local tracks or transceivers
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      // Add transceivers to ensure SDP negotiates video and audio even before camera is granted
      try {
        this.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
        this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('[WebRTC] Transceiver add notice:', e);
      }
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      this.remoteVideo.srcObject = this.remoteStream;
      this.remotePlaceholder.classList.add('hidden');

      // Guarantee video playback against browser autoplay policies
      const playPromise = this.remoteVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[WebRTC] Autoplay notice, retrying with muted sound:', err);
          this.remoteVideo.muted = true;
          this.remoteVideo.play().then(() => {
            setTimeout(() => { this.remoteVideo.muted = false; }, 800);
          }).catch(e => console.warn('[WebRTC] Muted play failed:', e));
        });
      }

      this.setupAudioMeter(this.remoteStream, this.remoteSpeakingBorder);
    };

    // ICE Candidate generation
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc-signal', {
          to: this.partnerId,
          type: 'candidate',
          signal: event.candidate
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'connected') {
        console.log('[WebRTC] WebRTC Peer Connection is CONNECTED! 🎉');
        this.remotePlaceholder.classList.add('hidden');
      } else if (this.peerConnection.connectionState === 'failed') {
        console.warn('[WebRTC] Connection failed, attempting ICE restart...');
        const myId = this.getMyId();
        if (this.partnerId && myId < this.partnerId) {
          this.initiateOffer(this.partnerId, true);
        }
      } else if (this.peerConnection.connectionState === 'disconnected') {
        this.handlePeerDisconnected();
      }
    };

    return this.peerConnection;
  }

  initSocketSignaling() {
    // P2P Direct Stream fallback
    this.socket.on('p2p-remote-stream', (remoteStream) => {
      console.log('[WebRTC] Received direct P2P stream');
      this.remoteStream = remoteStream;
      this.remoteVideo.srcObject = remoteStream;
      this.remotePlaceholder.classList.add('hidden');
      this.remoteVideo.play().catch(e => console.warn('P2P play notice:', e));
      this.setupAudioMeter(remoteStream, this.remoteSpeakingBorder);
    });

    // Another user joined the room
    this.socket.on('user-joined', async ({ user }) => {
      this.partnerId = user.id;
      this.remoteUserName.textContent = user.name;
      this.remoteBadgeName.textContent = user.name;
      window.toast && window.toast(`👋 ${user.name} joined room`);
      window.soundFX && window.soundFX.playUserJoin();

      // Ensure local media is initialized
      try {
        await this.initLocalMedia();
      } catch (e) {
        console.warn('[WebRTC] Local media init failed on partner join:', e);
      }

      this.createPeerConnection();

      // Glare Prevention: Deterministic Offerer / Answerer designation
      const myId = this.getMyId();
      const isOfferer = myId < user.id;

      if (isOfferer) {
        console.log('[WebRTC] Designated offerer for partner:', user.id);
        await this.initiateOffer(user.id);
      } else {
        console.log('[WebRTC] Designated answerer; waiting for incoming offer from:', user.id);
      }
    });

    // Receive signaling message
    this.socket.on('webrtc-signal', async ({ from, signal, type, user }) => {
      this.partnerId = from;
      if (user) {
        this.remoteUserName.textContent = user.name;
        this.remoteBadgeName.textContent = user.name;
      }

      try {
        if (type === 'offer') {
          await this.handleOffer(from, signal);
        } else if (type === 'answer') {
          await this.handleAnswer(signal);
        } else if (type === 'candidate') {
          await this.handleCandidate(signal);
        }
      } catch (err) {
        console.error('[WebRTC] Signaling handling error:', err);
      }
    });

    // Partner media status (mic/video toggled)
    this.socket.on('user-media-status', ({ userId, isAudioMuted, isVideoOff }) => {
      if (userId === this.partnerId) {
        if (isVideoOff) {
          this.remotePlaceholder.classList.remove('hidden');
        } else {
          this.remotePlaceholder.classList.add('hidden');
        }
      }
    });

    // Partner left
    this.socket.on('user-left', ({ userId, userName }) => {
      if (userId === this.partnerId) {
        this.handlePeerDisconnected();
        window.toast && window.toast(`🚶 ${userName || 'Partner'} left the room`);
      }
    });
  }

  async initiateOffer(targetId, iceRestart = false) {
    if (!this.peerConnection) this.createPeerConnection();
    try {
      console.log('[WebRTC] Creating offer for partner:', targetId);
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart
      });
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('webrtc-signal', {
        to: targetId,
        type: 'offer',
        signal: offer
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }

  async handleOffer(fromId, offer) {
    console.log('[WebRTC] Handling offer from partner:', fromId);
    this.partnerId = fromId;

    if (!this.localStream) {
      try {
        await this.initLocalMedia();
      } catch (e) {
        console.warn('[WebRTC] Auto media on incoming offer failed:', e);
      }
    }

    this.createPeerConnection();

    // Glare resolution: Polite peer rolls back if collision occurs
    const myId = this.getMyId();
    const isPolite = myId > fromId;
    if (this.peerConnection.signalingState !== 'stable') {
      if (isPolite) {
        console.log('[WebRTC] Glare collision; polite peer rolling back');
        await this.peerConnection.setLocalDescription({ type: 'rollback' });
      } else {
        console.log('[WebRTC] Glare collision; impolite peer ignoring colliding offer');
        return;
      }
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    while (this.iceCandidateQueue.length > 0) {
      const cand = this.iceCandidateQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[WebRTC] Queued candidate error:', e);
      }
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    console.log('[WebRTC] Sending answer to partner:', fromId);
    this.socket.emit('webrtc-signal', {
      to: fromId,
      type: 'answer',
      signal: answer
    });
  }

  async handleAnswer(answer) {
    console.log('[WebRTC] Handling answer from partner');
    if (this.peerConnection) {
      if (this.peerConnection.signalingState === 'have-local-offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        // Process queued candidates
        while (this.iceCandidateQueue.length > 0) {
          const cand = this.iceCandidateQueue.shift();
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('[WebRTC] Queued candidate error:', e);
          }
        }
      }
    }
  }

  async handleCandidate(candidate) {
    if (!candidate) return;
    try {
      if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.iceCandidateQueue.push(candidate);
      }
    } catch (e) {
      console.warn('[WebRTC] Candidate notice:', e);
    }
  }

  handlePeerDisconnected() {
    this.partnerId = null;
    this.remoteStream = null;
    this.remoteVideo.srcObject = null;
    this.remotePlaceholder.classList.remove('hidden');
    this.remoteUserName.textContent = 'Waiting for partner...';
    this.remoteBadgeName.textContent = 'Partner';
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  toggleAudio() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isAudioMuted = !this.isAudioMuted;
      audioTrack.enabled = !this.isAudioMuted;
      this.updateMicButtonUI();

      this.socket.emit('media-status-change', {
        isAudioMuted: this.isAudioMuted
      });
    }
  }

  toggleVideo() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isVideoOff = !this.isVideoOff;
      videoTrack.enabled = !this.isVideoOff;
      this.updateCamButtonUI();
      this.localPlaceholder.classList.toggle('hidden', !this.isVideoOff);

      this.socket.emit('media-status-change', {
        isVideoOff: this.isVideoOff
      });
    }
  }

  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        const screenTrack = this.screenStream.getVideoTracks()[0];
        
        // Replace video track on sender
        if (this.peerConnection) {
          const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        // Show local screen preview in small tile
        this.localVideo.srcObject = this.screenStream;
        this.isScreenSharing = true;
        this.btnShareScreen.classList.add('active');
        window.toast && window.toast('🖥️ Screen sharing active');

        screenTrack.onended = () => this.stopScreenShare();
      } catch (err) {
        console.warn('Screen share canceled or failed:', err);
      }
    } else {
      this.stopScreenShare();
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.btnShareScreen.classList.remove('active');

    if (this.localStream) {
      const camTrack = this.localStream.getVideoTracks()[0];
      if (this.peerConnection && camTrack) {
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(camTrack);
        }
      }
      this.localVideo.srcObject = this.localStream;
    }
  }

  setupAudioMeter(stream, glowElement) {
    if (!stream || !glowElement) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const microphone = audioCtx.createMediaStreamSource(stream);
      const javascriptNode = audioCtx.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioCtx.destination);

      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;

        // If speaking volume passes threshold, activate speaking glow
        if (average > 18) {
          glowElement.classList.add('speaking');
        } else {
          glowElement.classList.remove('speaking');
        }
      };
    } catch (e) {
      console.warn('Audio meter setup notice:', e);
    }
  }

  updateMicButtonUI() {
    if (this.isAudioMuted) {
      this.btnToggleMic.classList.remove('active');
      this.btnToggleMic.classList.add('muted');
      this.iconMicOn.classList.add('hidden');
      this.iconMicOff.classList.remove('hidden');
    } else {
      this.btnToggleMic.classList.add('active');
      this.btnToggleMic.classList.remove('muted');
      this.iconMicOn.classList.remove('hidden');
      this.iconMicOff.classList.add('hidden');
    }
  }

  updateCamButtonUI() {
    if (this.isVideoOff) {
      this.btnToggleCam.classList.remove('active');
      this.btnToggleCam.classList.add('muted');
      this.iconCamOn.classList.add('hidden');
      this.iconCamOff.classList.remove('hidden');
    } else {
      this.btnToggleCam.classList.add('active');
      this.btnToggleCam.classList.remove('muted');
      this.iconCamOn.classList.remove('hidden');
      this.iconCamOff.classList.add('hidden');
    }
  }
}

window.WebRTCManager = WebRTCManager;
