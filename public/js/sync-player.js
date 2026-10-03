// CineSync Universal Synchronized Movie Player Engine
// Supports YouTube, HLS (.m3u8), Google Drive, Vimeo, Direct MP4/WebM/MKV, and Local Files

class SyncPlayer {
  constructor(socket) {
    this.socket = socket;
    this.video = document.getElementById('mainVideo');
    this.container = document.getElementById('videoContainer');
    this.youtubePlayerEl = document.getElementById('youtubePlayer');
    this.embedPlayerEl = document.getElementById('genericEmbedPlayer');
    this.errorOverlay = document.getElementById('playerErrorOverlay');
    this.errorMessage = document.getElementById('playerErrorMessage');
    this.btnErrorOpenModal = document.getElementById('btnErrorOpenModal');

    // UI Elements
    this.btnPlayPause = document.getElementById('btnPlayPause');
    this.iconPlay = document.getElementById('iconPlay');
    this.iconPause = document.getElementById('iconPause');
    this.centerPlayOverlay = document.getElementById('centerPlayOverlay');
    this.centerPlayIcon = document.getElementById('centerPlayIcon');
    
    this.timelineContainer = document.getElementById('timelineContainer');
    this.progressBar = document.getElementById('progressBar');
    this.bufferedBar = document.getElementById('bufferedBar');
    this.progressThumb = document.getElementById('progressThumb');
    this.timeTooltip = document.getElementById('timeTooltip');
    
    this.currentTimeDisplay = document.getElementById('currentTime');
    this.totalDurationDisplay = document.getElementById('totalDuration');
    this.syncDriftText = document.getElementById('syncDriftText');
    this.syncStatusText = document.getElementById('syncStatusText');
    
    this.btnRewind10 = document.getElementById('btnRewind10');
    this.btnForward10 = document.getElementById('btnForward10');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.btnMuteVolume = document.getElementById('btnMuteVolume');
    this.iconVolumeHigh = document.getElementById('iconVolumeHigh');
    this.iconVolumeMuted = document.getElementById('iconVolumeMuted');
    
    this.btnSpeedSelector = document.getElementById('btnSpeedSelector');
    this.speedMenu = document.getElementById('speedMenu');
    this.btnFullscreen = document.getElementById('btnFullscreen');
    this.iconEnterFullscreen = document.getElementById('iconEnterFullscreen');
    this.iconExitFullscreen = document.getElementById('iconExitFullscreen');
    this.btnForceSync = document.getElementById('btnForceSync');
    this.videoTitleDisplay = document.getElementById('videoTitleDisplay');

    // Local file banner
    this.localFileBanner = document.getElementById('localFileBanner');
    this.bannerPartnerName = document.getElementById('bannerPartnerName');
    this.bannerFileName = document.getElementById('bannerFileName');
    this.partnerFilePicker = document.getElementById('partnerFilePicker');
    this.btnCloseBanner = document.getElementById('btnCloseBanner');

    // Engine & State Tracking
    this.currentEngine = 'html5'; // 'html5', 'youtube', 'hls', 'embed'
    this.ytPlayer = null;
    this.hls = null;
    this.isRemoteAction = false;
    this.isScrubbing = false;
    this.lastServerState = null;
    this.currentSource = null;
    this.driftCheckInterval = null;
    this.heartbeatInterval = null;
    this.ytProgressTimer = null;

    // Working Verified Presets
    this.presets = [
      {
        id: 'oceans',
        title: 'Oceans (HD Wildlife)',
        desc: 'Stunning HD exploration of ocean life from coral reefs to deep waters',
        url: 'https://vjs.zencdn.net/v/oceans.mp4',
        poster: 'https://vjs.zencdn.net/v/oceans.png',
        genre: 'Nature / 1080p MP4'
      },
      {
        id: 'bbb-hls',
        title: 'Big Buck Bunny (HLS Stream)',
        desc: 'High-bitrate adaptive live HLS stream (.m3u8)',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/640px-Big_buck_bunny_poster_big.jpg',
        genre: 'Animation / HLS Stream'
      },
      {
        id: 'bluemoon',
        title: 'Blue Moon Trailer (HD)',
        desc: 'High action extreme surfing cinematic showcase',
        url: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
        poster: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.jpg',
        genre: 'Action / 720p MP4'
      },
      {
        id: 'yt-sintel',
        title: 'Sintel (YouTube 4K)',
        desc: 'Epic fantasy adventure anime streamed directly from YouTube',
        url: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
        poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Sintel_poster.jpg/640px-Sintel_poster.jpg',
        genre: 'Fantasy / YouTube'
      }
    ];

    this.initEventListeners();
    this.initSocketListeners();
    this.renderPresetsGrid();
  }

  initEventListeners() {
    // Play/Pause button
    this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.video.addEventListener('click', () => this.togglePlayPause());

    // HTML5 Video Play / Pause / Time listeners
    this.video.addEventListener('play', () => {
      if (this.currentEngine !== 'html5' && this.currentEngine !== 'hls') return;
      this.updatePlayStateUI(true);
      if (!this.isRemoteAction) {
        this.socket.emit('movie-action', {
          action: 'play',
          time: this.video.currentTime,
          playbackRate: this.video.playbackRate
        });
      }
    });

    this.video.addEventListener('pause', () => {
      if (this.currentEngine !== 'html5' && this.currentEngine !== 'hls') return;
      this.updatePlayStateUI(false);
      if (!this.isRemoteAction) {
        this.socket.emit('movie-action', {
          action: 'pause',
          time: this.video.currentTime,
          playbackRate: this.video.playbackRate
        });
      }
    });

    this.video.addEventListener('timeupdate', () => {
      if (this.currentEngine === 'html5' || this.currentEngine === 'hls') {
        if (!this.isScrubbing) this.updateProgressUI();
      }
    });

    this.video.addEventListener('progress', () => this.updateBufferedUI());
    this.video.addEventListener('loadedmetadata', () => {
      this.totalDurationDisplay.textContent = this.formatTime(this.video.duration);
      this.hideError();
    });

    // Error handler for HTML5 video
    this.video.addEventListener('error', () => {
      if (this.currentEngine === 'html5' && this.video.src && this.video.src !== window.location.href) {
        console.warn('[SyncPlayer] Video failed to load:', this.video.error);
        this.showError('Unable to play this direct video format or URL due to CORS or network restrictions. Try YouTube, an HLS .m3u8 stream, or choose a local file!');
      }
    });

    // Timeline Scrubbing
    this.timelineContainer.addEventListener('mousedown', (e) => this.startScrubbing(e));
    window.addEventListener('mousemove', (e) => {
      if (this.isScrubbing) this.onScrub(e);
    });
    window.addEventListener('mouseup', () => {
      if (this.isScrubbing) this.stopScrubbing();
    });
    this.timelineContainer.addEventListener('mousemove', (e) => this.updateTimelineTooltip(e));

    // Rewind / Forward 10s
    this.btnRewind10.addEventListener('click', () => {
      const cur = this.getCurrentTime();
      this.seekTo(Math.max(0, cur - 10), true);
    });
    this.btnForward10.addEventListener('click', () => {
      const cur = this.getCurrentTime();
      const dur = this.getDuration();
      this.seekTo(Math.min(dur || Infinity, cur + 10), true);
    });

    // Volume & Mute
    this.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.setVolume(val);
      this.updateVolumeIcons();
    });

    this.btnMuteVolume.addEventListener('click', () => {
      this.toggleMute();
      this.updateVolumeIcons();
    });

    // Playback Speed
    this.btnSpeedSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('hidden');
    });

    this.speedMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.setPlaybackSpeed(speed, true);
        this.speedMenu.classList.add('hidden');
      });
    });

    window.addEventListener('click', () => this.speedMenu.classList.add('hidden'));

    // Fullscreen
    this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenUI());

    // Force Sync button
    this.btnForceSync.addEventListener('click', () => {
      this.socket.emit('movie-action', { action: 'request-sync' });
      window.toast && window.toast('🔄 Synchronizing movie with partner...');
    });

    // Error overlay button
    if (this.btnErrorOpenModal) {
      this.btnErrorOpenModal.addEventListener('click', () => {
        this.hideError();
        const modal = document.getElementById('modalMovieSelector');
        if (modal) modal.classList.remove('hidden');
      });
    }

    // Local file picker for partner banner
    this.partnerFilePicker.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadLocalFile(e.target.files[0]);
        this.localFileBanner.classList.add('hidden');
      }
    });

    this.btnCloseBanner.addEventListener('click', () => {
      this.localFileBanner.classList.add('hidden');
    });

    // Auto-hide controls
    let controlsTimer;
    this.container.addEventListener('mousemove', () => {
      this.container.classList.add('controls-visible');
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(() => {
        if (this.isPlaying()) {
          this.container.classList.remove('controls-visible');
        }
      }, 2500);
    });
  }

  initSocketListeners() {
    this.socket.on('movie-action', (data) => {
      this.handleIncomingMovieAction(data);
    });

    this.socket.on('movie-sync', (state) => {
      this.applyFullState(state);
    });

    this.socket.on('movie-heartbeat', ({ currentTime, isPlaying, timestamp }) => {
      if (!this.lastServerState) return;
      this.lastServerState.currentTime = currentTime;
      this.lastServerState.isPlaying = isPlaying;
      this.lastServerState.lastActionTimestamp = timestamp;
      this.checkAndCorrectDrift();
    });

    this.driftCheckInterval = setInterval(() => {
      this.checkAndCorrectDrift();
    }, 2500);

    this.heartbeatInterval = setInterval(() => {
      if (window.currentUser && window.currentUser.isHost && this.isPlaying()) {
        this.socket.emit('time-heartbeat', {
          currentTime: this.getCurrentTime(),
          isPlaying: this.isPlaying()
        });
      }
    }, 3000);
  }

  // Universal URL Identifier & Loader
  loadSource(source, emitChange = true) {
    if (!source || !source.url) return;
    this.hideError();
    this.currentSource = source;
    const url = source.url.trim();

    this.videoTitleDisplay.textContent = source.title || 'Movie';

    // 1. Check Local File
    if (source.type === 'local') {
      if (source.isPartnerInitiated) {
        this.bannerPartnerName.textContent = source.userName || 'Partner';
        this.bannerFileName.textContent = source.fileName || 'video.mp4';
        this.localFileBanner.classList.remove('hidden');
      }
      return;
    }
    this.localFileBanner.classList.add('hidden');

    // 2. Check YouTube URL
    const ytId = this.extractYouTubeId(url);
    if (ytId) {
      this.loadYouTubeSource(ytId, source.title || 'YouTube Video');
      if (emitChange) {
        this.socket.emit('movie-action', { action: 'change-source', source });
      }
      return;
    }

    // 3. Check HLS Stream (.m3u8)
    if (url.includes('.m3u8') || url.includes('application/x-mpegURL')) {
      this.loadHlsSource(url, source.title || 'HLS Live Stream');
      if (emitChange) {
        this.socket.emit('movie-action', { action: 'change-source', source });
      }
      return;
    }

    // 4. Check Google Drive URL
    const gdrive = this.parseGoogleDriveUrl(url);
    if (gdrive) {
      this.loadEmbedSource(gdrive.embedUrl, source.title || 'Google Drive Video');
      if (emitChange) {
        this.socket.emit('movie-action', { action: 'change-source', source });
      }
      return;
    }

    // 5. Check Vimeo URL
    const vimeoUrl = this.parseVimeoUrl(url);
    if (vimeoUrl) {
      this.loadEmbedSource(vimeoUrl, source.title || 'Vimeo Video');
      if (emitChange) {
        this.socket.emit('movie-action', { action: 'change-source', source });
      }
      return;
    }

    // 6. Direct MP4, WebM, MKV, OGG
    this.loadDirectHtml5Source(url, source.title || 'Direct Video Stream');
    if (emitChange) {
      this.socket.emit('movie-action', { action: 'change-source', source });
    }
  }

  // --- ENGINE 1: YouTube ---
  extractYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  loadYouTubeSource(videoId, title) {
    console.log('[SyncPlayer] Loading YouTube Engine:', videoId);
    this.currentEngine = 'youtube';

    // Show YouTube element, hide HTML5 & Embed
    this.youtubePlayerEl.classList.remove('hidden');
    this.embedPlayerEl.classList.add('hidden');
    this.video.classList.add('hidden');
    this.video.pause();

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    this.videoTitleDisplay.textContent = `🔴 ${title}`;

    if (window.YT && window.YT.Player) {
      this.initOrLoadYouTubePlayer(videoId);
    } else {
      // Wait for YT API
      window.onYouTubeIframeAPIReady = () => {
        this.initOrLoadYouTubePlayer(videoId);
      };
    }

    this.startYtProgressTimer();
  }

  initOrLoadYouTubePlayer(videoId) {
    if (this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
      this.ytPlayer.loadVideoById(videoId);
    } else {
      this.youtubePlayerEl.innerHTML = '';
      const div = document.createElement('div');
      div.id = 'ytPlayerFrame';
      this.youtubePlayerEl.appendChild(div);

      this.ytPlayer = new YT.Player('ytPlayerFrame', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            console.log('[YouTube] Player Ready');
            this.updatePlayStateUI(true);
            this.totalDurationDisplay.textContent = this.formatTime(event.target.getDuration());
          },
          onStateChange: (event) => {
            this.handleYouTubeStateChange(event);
          }
        }
      });
    }
  }

  handleYouTubeStateChange(event) {
    if (this.isRemoteAction) return;

    if (event.data === YT.PlayerState.PLAYING) {
      this.updatePlayStateUI(true);
      this.socket.emit('movie-action', {
        action: 'play',
        time: this.ytPlayer.getCurrentTime(),
        playbackRate: this.ytPlayer.getPlaybackRate()
      });
    } else if (event.data === YT.PlayerState.PAUSED) {
      this.updatePlayStateUI(false);
      this.socket.emit('movie-action', {
        action: 'pause',
        time: this.ytPlayer.getCurrentTime(),
        playbackRate: this.ytPlayer.getPlaybackRate()
      });
    }
  }

  startYtProgressTimer() {
    clearInterval(this.ytProgressTimer);
    this.ytProgressTimer = setInterval(() => {
      if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
        const cur = this.ytPlayer.getCurrentTime();
        const dur = this.ytPlayer.getDuration();
        if (dur && !isNaN(dur)) {
          this.totalDurationDisplay.textContent = this.formatTime(dur);
          const ratio = (cur / dur) * 100;
          this.progressBar.style.width = `${ratio}%`;
          this.progressThumb.style.left = `${ratio}%`;
          this.currentTimeDisplay.textContent = this.formatTime(cur);
        }
      }
    }, 400);
  }

  // --- ENGINE 2: HLS (.m3u8) ---
  loadHlsSource(url, title) {
    console.log('[SyncPlayer] Loading HLS Engine:', url);
    this.currentEngine = 'hls';

    this.video.classList.remove('hidden');
    this.youtubePlayerEl.classList.add('hidden');
    this.embedPlayerEl.classList.add('hidden');
    clearInterval(this.ytProgressTimer);

    this.videoTitleDisplay.textContent = `⚡ ${title}`;

    if (window.Hls && Hls.isSupported()) {
      if (this.hls) this.hls.destroy();
      this.hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.video.play().catch(e => console.log('Autoplay waiting gesture:', e));
      });
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('[HLS] Fatal error:', data.type);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            this.hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            this.hls.recoverMediaError();
          } else {
            this.showError('HLS live stream connection failed. Check stream URL.');
          }
        }
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple HLS
      this.video.src = url;
      this.video.load();
    } else {
      this.showError('HLS streaming is not supported by this browser.');
    }
  }

  // --- ENGINE 3: Google Drive & Generic Embed ---
  parseGoogleDriveUrl(url) {
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return {
        id: match[1],
        embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`
      };
    }
    return null;
  }

  parseVimeoUrl(url) {
    const match = url.match(/vimeo\.com\/([0-9]+)/);
    if (match) {
      return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
    }
    return null;
  }

  loadEmbedSource(embedUrl, title) {
    console.log('[SyncPlayer] Loading Embed Engine:', embedUrl);
    this.currentEngine = 'embed';

    this.embedPlayerEl.classList.remove('hidden');
    this.youtubePlayerEl.classList.add('hidden');
    this.video.classList.add('hidden');
    this.video.pause();
    clearInterval(this.ytProgressTimer);

    this.videoTitleDisplay.textContent = `📺 ${title}`;
    this.embedPlayerEl.src = embedUrl;
  }

  // --- ENGINE 4: Direct HTML5 MP4/WebM ---
  loadDirectHtml5Source(url, title) {
    console.log('[SyncPlayer] Loading Direct HTML5 Engine:', url);
    this.currentEngine = 'html5';

    this.video.classList.remove('hidden');
    this.youtubePlayerEl.classList.add('hidden');
    this.embedPlayerEl.classList.add('hidden');
    clearInterval(this.ytProgressTimer);

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    this.videoTitleDisplay.textContent = `🎬 ${title}`;
    this.video.src = url;
    this.video.load();
    this.video.play().catch(e => console.log('Autoplay waiting gesture:', e));
  }

  // --- ENGINE 5: Local File Sync ---
  loadLocalFile(file) {
    this.currentEngine = 'html5';
    this.video.classList.remove('hidden');
    this.youtubePlayerEl.classList.add('hidden');
    this.embedPlayerEl.classList.add('hidden');

    const objectUrl = URL.createObjectURL(file);
    const source = {
      type: 'local',
      title: file.name,
      fileName: file.name,
      url: objectUrl,
      size: file.size
    };

    this.currentSource = source;
    this.videoTitleDisplay.textContent = `📁 ${file.name}`;
    this.video.src = objectUrl;
    this.video.load();

    this.socket.emit('movie-action', {
      action: 'change-source',
      source: {
        type: 'local',
        title: file.name,
        fileName: file.name,
        isPartnerInitiated: true,
        userName: window.currentUser ? window.currentUser.name : 'Partner'
      }
    });

    window.toast && window.toast(`📁 Loaded local video: ${file.name}`);
  }

  // --- Unified Playback Controls Across All Engines ---
  togglePlayPause() {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getPlayerState === 'function') {
      const state = this.ytPlayer.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        this.ytPlayer.pauseVideo();
        this.triggerCenterPulse(false);
      } else {
        this.ytPlayer.playVideo();
        this.triggerCenterPulse(true);
      }
      return;
    }

    if (this.video.paused) {
      this.video.play().catch(e => console.warn('Play error:', e));
      this.triggerCenterPulse(true);
    } else {
      this.video.pause();
      this.triggerCenterPulse(false);
    }
  }

  seekTo(seconds, emit = true) {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      this.ytPlayer.seekTo(seconds, true);
    } else {
      this.video.currentTime = seconds;
    }

    if (emit && !this.isRemoteAction) {
      this.socket.emit('movie-action', {
        action: 'seek',
        time: seconds
      });
    }
  }

  setPlaybackSpeed(speed, emit = true) {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === 'function') {
      this.ytPlayer.setPlaybackRate(speed);
    } else {
      this.video.playbackRate = speed;
    }

    this.btnSpeedSelector.textContent = `${speed}x`;
    this.speedMenu.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });

    if (emit && !this.isRemoteAction) {
      this.socket.emit('movie-action', {
        action: 'ratechange',
        playbackRate: speed
      });
    }
  }

  setVolume(val) {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(val * 100);
    }
    this.video.volume = val;
    this.video.muted = (val === 0);
  }

  toggleMute() {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.isMuted === 'function') {
      if (this.ytPlayer.isMuted()) {
        this.ytPlayer.unMute();
        this.volumeSlider.value = 1;
      } else {
        this.ytPlayer.mute();
        this.volumeSlider.value = 0;
      }
      return;
    }
    this.video.muted = !this.video.muted;
    this.volumeSlider.value = this.video.muted ? 0 : (this.video.volume || 1);
  }

  getCurrentTime() {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
      return this.ytPlayer.getCurrentTime() || 0;
    }
    return this.video.currentTime || 0;
  }

  getDuration() {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getDuration === 'function') {
      return this.ytPlayer.getDuration() || 0;
    }
    return this.video.duration || 0;
  }

  isPlaying() {
    if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getPlayerState === 'function') {
      return this.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    }
    return !this.video.paused;
  }

  // --- Partner Action Synchronization ---
  handleIncomingMovieAction(data) {
    this.lastServerState = data;
    const { action, time, playbackRate, source, updatedBy } = data;

    switch (action) {
      case 'play':
        this.isRemoteAction = true;
        if (typeof time === 'number' && Math.abs(this.getCurrentTime() - time) > 1.0) {
          this.seekTo(time, false);
        }
        if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        } else {
          this.video.play().catch(e => console.log('Autoplay prevented:', e));
        }
        this.updatePlayStateUI(true);
        setTimeout(() => { this.isRemoteAction = false; }, 250);
        window.toast && window.toast(`▶️ ${updatedBy || 'Partner'} played`);
        break;

      case 'pause':
        this.isRemoteAction = true;
        if (typeof time === 'number' && Math.abs(this.getCurrentTime() - time) > 1.0) {
          this.seekTo(time, false);
        }
        if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
          this.ytPlayer.pauseVideo();
        } else {
          this.video.pause();
        }
        this.updatePlayStateUI(false);
        setTimeout(() => { this.isRemoteAction = false; }, 250);
        window.toast && window.toast(`⏸️ ${updatedBy || 'Partner'} paused`);
        break;

      case 'seek':
        this.isRemoteAction = true;
        this.seekTo(time, false);
        setTimeout(() => { this.isRemoteAction = false; }, 250);
        window.toast && window.toast(`⏩ ${updatedBy || 'Partner'} jumped to ${this.formatTime(time)}`);
        break;

      case 'ratechange':
        if (typeof playbackRate === 'number') {
          this.isRemoteAction = true;
          this.setPlaybackSpeed(playbackRate, false);
          setTimeout(() => { this.isRemoteAction = false; }, 250);
          window.toast && window.toast(`⚡ Speed set to ${playbackRate}x by ${updatedBy}`);
        }
        break;

      case 'change-source':
        if (source) {
          this.loadSource(source, false);
          window.toast && window.toast(`🎬 Partner loaded: ${source.title}`);
        }
        break;
    }
  }

  checkAndCorrectDrift() {
    if (!this.lastServerState) return;

    let targetTime = this.lastServerState.currentTime;
    if (this.lastServerState.isPlaying) {
      const elapsed = (Date.now() - this.lastServerState.lastActionTimestamp) / 1000;
      targetTime += (elapsed * (this.lastServerState.playbackRate || 1));
    }

    const cur = this.getCurrentTime();
    const drift = Math.abs(cur - targetTime);

    if (this.syncDriftText) {
      this.syncDriftText.textContent = `Synced: ${drift.toFixed(1)}s`;
    }

    if (drift > 1.5 && !this.isScrubbing) {
      console.log(`[CineSync] Correcting drift of ${drift.toFixed(2)}s`);
      this.isRemoteAction = true;
      this.seekTo(targetTime, false);
      setTimeout(() => { this.isRemoteAction = false; }, 300);
    }
  }

  applyFullState(state) {
    if (!state) return;
    this.lastServerState = state;

    if (state.source && (!this.currentSource || this.currentSource.url !== state.source.url)) {
      this.loadSource(state.source, false);
    }

    let targetTime = state.currentTime;
    if (state.isPlaying) {
      const elapsed = (Date.now() - state.lastActionTimestamp) / 1000;
      targetTime += (elapsed * (state.playbackRate || 1));
    }

    this.isRemoteAction = true;
    this.seekTo(Math.max(0, targetTime), false);

    if (state.playbackRate) {
      this.setPlaybackSpeed(state.playbackRate, false);
    }

    if (state.isPlaying) {
      if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
        this.ytPlayer.playVideo();
      } else {
        this.video.play().catch(e => console.log('Autoplay waiting gesture:', e));
      }
      this.updatePlayStateUI(true);
    } else {
      if (this.currentEngine === 'youtube' && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      } else {
        this.video.pause();
      }
      this.updatePlayStateUI(false);
    }

    setTimeout(() => { this.isRemoteAction = false; }, 350);
  }

  // --- UI Helpers ---
  triggerCenterPulse(isPlaying) {
    this.centerPlayIcon.innerHTML = isPlaying
      ? '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
      : '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    this.centerPlayOverlay.classList.add('active');
    setTimeout(() => this.centerPlayOverlay.classList.remove('active'), 500);
  }

  updatePlayStateUI(isPlaying) {
    this.iconPlay.classList.toggle('hidden', isPlaying);
    this.iconPause.classList.toggle('hidden', !isPlaying);
    this.container.classList.toggle('is-paused', !isPlaying);
  }

  startScrubbing(e) {
    this.isScrubbing = true;
    this.onScrub(e);
  }

  onScrub(e) {
    const rect = this.timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (this.getDuration() || 0);

    this.progressBar.style.width = `${ratio * 100}%`;
    this.progressThumb.style.left = `${ratio * 100}%`;
    this.currentTimeDisplay.textContent = this.formatTime(targetTime);
  }

  stopScrubbing() {
    this.isScrubbing = false;
    const ratio = parseFloat(this.progressBar.style.width) / 100;
    const targetTime = ratio * (this.getDuration() || 0);
    this.seekTo(targetTime, true);
  }

  updateTimelineTooltip(e) {
    const rect = this.timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (this.getDuration() || 0);

    this.timeTooltip.style.left = `${ratio * 100}%`;
    this.timeTooltip.textContent = this.formatTime(targetTime);
  }

  updateProgressUI() {
    const dur = this.getDuration();
    if (!dur) return;
    const cur = this.getCurrentTime();
    const ratio = (cur / dur) * 100;
    this.progressBar.style.width = `${ratio}%`;
    this.progressThumb.style.left = `${ratio}%`;
    this.currentTimeDisplay.textContent = this.formatTime(cur);
  }

  updateBufferedUI() {
    if (!this.video.duration || this.video.buffered.length === 0) return;
    const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
    const ratio = (bufferedEnd / this.video.duration) * 100;
    this.bufferedBar.style.width = `${ratio}%`;
  }

  updateVolumeIcons() {
    const muted = this.video.muted || this.video.volume === 0;
    this.iconVolumeHigh.classList.toggle('hidden', muted);
    this.iconVolumeMuted.classList.toggle('hidden', !muted);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(err => console.warn('Fullscreen:', err));
    } else {
      document.exitFullscreen();
    }
  }

  updateFullscreenUI() {
    const isFull = !!document.fullscreenElement;
    this.iconEnterFullscreen.classList.toggle('hidden', isFull);
    this.iconExitFullscreen.classList.toggle('hidden', !isFull);
  }

  showError(msg) {
    if (this.errorMessage) this.errorMessage.textContent = msg;
    if (this.errorOverlay) this.errorOverlay.classList.remove('hidden');
  }

  hideError() {
    if (this.errorOverlay) this.errorOverlay.classList.add('hidden');
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  }

  renderPresetsGrid() {
    const grid = document.getElementById('movieGrid');
    if (!grid) return;
    grid.innerHTML = '';

    this.presets.forEach(movie => {
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.innerHTML = `
        <img class="movie-card-thumb" src="${movie.poster}" alt="${movie.title}" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400'">
        <div class="movie-card-info">
          <h4>${movie.title}</h4>
          <span>${movie.genre}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        this.loadSource({
          type: 'preset',
          url: movie.url,
          title: movie.title,
          poster: movie.poster
        }, true);

        const modal = document.getElementById('modalMovieSelector');
        if (modal) modal.classList.add('hidden');
      });
      grid.appendChild(card);
    });
  }
}

window.SyncPlayer = SyncPlayer;
