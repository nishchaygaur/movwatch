// CineSync WebRTC Real-Time Video & Audio Calling Engine
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

  async startCallFlow() {
    try {
      await this.initLocalMedia();
      window.toast && window.toast('📷 Camera and microphone enabled');
      // If partner is already present, initiate connection
      if (this.partnerId) {
        this.createPeerConnection();
        this.initiateOffer(this.partnerId);
      }
    } catch (err) {
      console.warn('Call start error:', err);
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
      console.warn('Camera failed, trying audio-only:', err);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        this.isVideoOff = true;
        this.updateCamButtonUI();
      } catch (audioErr) {
        console.log('[WebRTC] Camera/Microphone not enabled or not found - running in chat & watch mode.');
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

    // If we have an existing peerConnection, add local tracks
    if (this.peerConnection) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    if (window.channel && typeof window.channel.callPartnerWithStream === 'function') {
      window.channel.callPartnerWithStream(this.localStream);
    }

    return this.localStream;
  }

  createPeerConnection() {
    if (this.peerConnection) {
      return this.peerConnection;
    }

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Send local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream track');
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.remoteVideo.srcObject = this.remoteStream;
      }
      this.remoteStream.addTrack(event.track);
      this.remotePlaceholder.classList.add('hidden');
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
      if (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.connectionState === 'failed') {
        this.handlePeerDisconnected();
      }
    };

    return this.peerConnection;
  }

  initSocketSignaling() {
    // P2P Direct Stream from PeerJS
    this.socket.on('p2p-remote-stream', (remoteStream) => {
      console.log('[WebRTC] Received direct P2P stream');
      this.remoteStream = remoteStream;
      this.remoteVideo.srcObject = remoteStream;
      this.remotePlaceholder.classList.add('hidden');
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
        console.warn('Local media init failed on partner join:', e);
      }

      // Existing peer initiates offer
      this.createPeerConnection();
      await this.initiateOffer(user.id);
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

  async initiateOffer(targetId) {
    if (!this.peerConnection) this.createPeerConnection();
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
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
    if (!this.localStream) {
      try {
        await this.initLocalMedia();
      } catch (e) {
        console.warn('Auto media on incoming offer failed:', e);
      }
    }

    this.createPeerConnection();

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    while (this.iceCandidateQueue.length > 0) {
      const cand = this.iceCandidateQueue.shift();
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket.emit('webrtc-signal', {
      to: fromId,
      type: 'answer',
      signal: answer
    });
  }

  async handleAnswer(answer) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      // Process queued candidates
      while (this.iceCandidateQueue.length > 0) {
        const cand = this.iceCandidateQueue.shift();
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      }
    }
  }

  async handleCandidate(candidate) {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.iceCandidateQueue.push(candidate);
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
        
        // Replace video track in peer connection
        if (this.peerConnection) {
          const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        this.localVideo.srcObject = this.screenStream;
        this.isScreenSharing = true;
        this.btnShareScreen.classList.add('active');

        screenTrack.onended = () => {
          this.stopScreenSharing();
        };

        window.toast && window.toast('🖥️ Screen sharing active');
      } catch (err) {
        console.warn('Screen share error:', err);
      }
    } else {
      this.stopScreenSharing();
    }
  }

  stopScreenSharing() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    if (this.localStream) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      if (this.peerConnection && cameraTrack) {
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraTrack);
        }
      }
      this.localVideo.srcObject = this.localStream;
    }

    this.isScreenSharing = false;
    this.btnShareScreen.classList.remove('active');
  }

  updateMicButtonUI() {
    this.iconMicOn.classList.toggle('hidden', this.isAudioMuted);
    this.iconMicOff.classList.toggle('hidden', !this.isAudioMuted);
    this.btnToggleMic.classList.toggle('muted', this.isAudioMuted);
  }

  updateCamButtonUI() {
    this.iconCamOn.classList.toggle('hidden', this.isVideoOff);
    this.iconCamOff.classList.toggle('hidden', !this.isVideoOff);
    this.btnToggleCam.classList.toggle('muted', this.isVideoOff);
  }

  // Voice Activity Detection / Audio Visualizer
  setupAudioMeter(stream, targetBorderElement) {
    if (!targetBorderElement) return;
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Speaking threshold
        if (average > 18) {
          targetBorderElement.classList.add('speaking');
        } else {
          targetBorderElement.classList.remove('speaking');
        }
        requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio meter setup error:', e);
    }
  }
}

window.WebRTCManager = WebRTCManager;
