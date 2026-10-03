// CineSync Synchronized Movie Player Engine
class SyncPlayer {
  constructor(socket) {
    this.socket = socket;
    this.video = document.getElementById('mainVideo');
    this.container = document.getElementById('videoContainer');
    
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

    // State Tracking
    this.isRemoteAction = false; // Prevents recursive broadcast loops
    this.isScrubbing = false;
    this.lastServerState = null;
    this.currentSource = null;
    this.driftCheckInterval = null;
    this.heartbeatInterval = null;
    this.lastDriftSeconds = 0;

    // Preset Movies Catalog
    this.presets = [
      {
        id: 'bbb',
        title: 'Big Buck Bunny (HD)',
        desc: 'Classic open animated movie with giant fluffy bunny',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
        genre: 'Animation / Comedy'
      },
      {
        id: 'sintel',
        title: 'Sintel (Fantasy Anime)',
        desc: 'Epic fantasy adventure of a lonely girl searching for a baby dragon',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
        genre: 'Action / Fantasy'
      },
      {
        id: 'tears',
        title: 'Tears of Steel (Sci-Fi VFX)',
        desc: 'Post-apocalyptic future in Amsterdam with high octane sci-fi VFX',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
        genre: 'Sci-Fi / Action'
      },
      {
        id: 'elephants',
        title: 'Elephants Dream (Sci-Fi)',
        desc: 'Surreal journey of Proog and Emo inside a giant machine world',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
        genre: 'Sci-Fi / Surreal'
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

    // Center play overlay animation
    this.video.addEventListener('play', () => {
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
      this.updatePlayStateUI(false);
      if (!this.isRemoteAction) {
        this.socket.emit('movie-action', {
          action: 'pause',
          time: this.video.currentTime,
          playbackRate: this.video.playbackRate
        });
      }
    });

    // Time update & Scrubber
    this.video.addEventListener('timeupdate', () => {
      if (!this.isScrubbing) {
        this.updateProgressUI();
      }
    });

    this.video.addEventListener('progress', () => this.updateBufferedUI());
    this.video.addEventListener('loadedmetadata', () => {
      this.totalDurationDisplay.textContent = this.formatTime(this.video.duration);
    });

    // Timeline Scrubbing
    this.timelineContainer.addEventListener('mousedown', (e) => this.startScrubbing(e));
    window.addEventListener('mousemove', (e) => {
      if (this.isScrubbing) this.onScrub(e);
    });
    window.addEventListener('mouseup', () => {
      if (this.isScrubbing) this.stopScrubbing();
    });

    // Timeline hover tooltip
    this.timelineContainer.addEventListener('mousemove', (e) => this.updateTimelineTooltip(e));

    // Rewind / Forward 10s
    this.btnRewind10.addEventListener('click', () => {
      const targetTime = Math.max(0, this.video.currentTime - 10);
      this.seekTo(targetTime, true);
    });
    this.btnForward10.addEventListener('click', () => {
      const targetTime = Math.min(this.video.duration || Infinity, this.video.currentTime + 10);
      this.seekTo(targetTime, true);
    });

    // Volume & Mute
    this.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.video.volume = val;
      this.video.muted = (val === 0);
      this.updateVolumeIcons();
    });

    this.btnMuteVolume.addEventListener('click', () => {
      this.video.muted = !this.video.muted;
      this.volumeSlider.value = this.video.muted ? 0 : (this.video.volume || 1);
      this.updateVolumeIcons();
    });

    // Playback Speed
    this.btnSpeedSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('hidden');
    });

    this.speedMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
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

    // Auto-hide controls when playing and inactive
    let controlsTimer;
    this.container.addEventListener('mousemove', () => {
      this.container.classList.add('controls-visible');
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(() => {
        if (!this.video.paused) {
          this.container.classList.remove('controls-visible');
        }
      }, 2500);
    });
  }

  initSocketListeners() {
    // Incoming Movie Action from Partner
    this.socket.on('movie-action', (data) => {
      this.handleIncomingMovieAction(data);
    });

    // Full Movie State Sync (from server on room join or sync request)
    this.socket.on('movie-sync', (state) => {
      this.applyFullState(state);
    });

    // Heartbeat Sync from room host
    this.socket.on('movie-heartbeat', ({ currentTime, isPlaying, timestamp }) => {
      if (!this.lastServerState) return;
      this.lastServerState.currentTime = currentTime;
      this.lastServerState.isPlaying = isPlaying;
      this.lastServerState.lastActionTimestamp = timestamp;
      this.checkAndCorrectDrift();
    });

    // Periodic Drift Checker (every 2.5s)
    this.driftCheckInterval = setInterval(() => {
      this.checkAndCorrectDrift();
    }, 2500);

    // Periodic Heartbeat Sender (if user is host & playing)
    this.heartbeatInterval = setInterval(() => {
      if (window.currentUser && window.currentUser.isHost && !this.video.paused) {
        this.socket.emit('time-heartbeat', {
          currentTime: this.video.currentTime,
          isPlaying: !this.video.paused
        });
      }
    }, 3000);
  }

  // Handle Play/Pause, Seek, Speed, Source Change from Partner
  handleIncomingMovieAction(data) {
    this.lastServerState = data;
    const { action, time, playbackRate, source, updatedBy } = data;

    switch (action) {
      case 'play':
        this.isRemoteAction = true;
        if (typeof time === 'number' && Math.abs(this.video.currentTime - time) > 0.8) {
          this.video.currentTime = time;
        }
        this.video.play().catch(e => console.warn('Autoplay prevented:', e));
        setTimeout(() => { this.isRemoteAction = false; }, 200);
        window.toast && window.toast(`▶️ ${updatedBy || 'Partner'} played`);
        break;

      case 'pause':
        this.isRemoteAction = true;
        if (typeof time === 'number' && Math.abs(this.video.currentTime - time) > 0.8) {
          this.video.currentTime = time;
        }
        this.video.pause();
        setTimeout(() => { this.isRemoteAction = false; }, 200);
        window.toast && window.toast(`⏸️ ${updatedBy || 'Partner'} paused`);
        break;

      case 'seek':
        this.isRemoteAction = true;
        this.video.currentTime = time;
        setTimeout(() => { this.isRemoteAction = false; }, 200);
        window.toast && window.toast(`⏩ ${updatedBy || 'Partner'} jumped to ${this.formatTime(time)}`);
        break;

      case 'ratechange':
        if (typeof playbackRate === 'number') {
          this.isRemoteAction = true;
          this.setPlaybackSpeed(playbackRate, false);
          setTimeout(() => { this.isRemoteAction = false; }, 200);
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

  // Calculate live expected time and correct if drift > 1.2s
  checkAndCorrectDrift() {
    if (!this.lastServerState || this.video.readyState < 2) return;

    let targetTime = this.lastServerState.currentTime;
    if (this.lastServerState.isPlaying) {
      const elapsed = (Date.now() - this.lastServerState.lastActionTimestamp) / 1000;
      targetTime += (elapsed * (this.lastServerState.playbackRate || 1));
    }

    const drift = Math.abs(this.video.currentTime - targetTime);
    this.lastDriftSeconds = drift;

    // Update drift pill
    if (this.syncDriftText) {
      this.syncDriftText.textContent = `Synced: ${drift.toFixed(1)}s`;
    }

    // If drift is significant (> 1.2s), smooth seek to targetTime
    if (drift > 1.2 && !this.isScrubbing) {
      console.log(`[CineSync] Adjusting drift of ${drift.toFixed(2)}s to ${targetTime.toFixed(2)}s`);
      this.isRemoteAction = true;
      this.video.currentTime = targetTime;
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
    this.video.currentTime = Math.max(0, targetTime);
    if (state.playbackRate) {
      this.setPlaybackSpeed(state.playbackRate, false);
    }

    if (state.isPlaying) {
      this.video.play().catch(e => console.log('Autoplay waiting user gesture:', e));
    } else {
      this.video.pause();
    }

    setTimeout(() => { this.isRemoteAction = false; }, 300);
  }

  loadSource(source, emitChange = true) {
    this.currentSource = source;
    this.videoTitleDisplay.textContent = source.title || 'Movie';

    if (source.type === 'local') {
      // If partner selected a local file
      if (source.isPartnerInitiated) {
        this.bannerPartnerName.textContent = source.userName || 'Partner';
        this.bannerFileName.textContent = source.fileName || 'video.mp4';
        this.localFileBanner.classList.remove('hidden');
      }
      return;
    }

    this.localFileBanner.classList.add('hidden');
    this.video.src = source.url;
    this.video.load();

    if (emitChange) {
      this.socket.emit('movie-action', {
        action: 'change-source',
        source
      });
    }
  }

  loadLocalFile(file) {
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

    // Broadcast file selection notice so partner is prompted to select their copy
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

    window.toast && window.toast(`📁 Loaded local movie: ${file.name}`);
  }

  togglePlayPause() {
    if (this.video.paused) {
      this.video.play().catch(e => console.warn('Play error:', e));
      this.triggerCenterPulse(true);
    } else {
      this.video.pause();
      this.triggerCenterPulse(false);
    }
  }

  triggerCenterPulse(isPlaying) {
    this.centerPlayIcon.innerHTML = isPlaying
      ? '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
      : '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    this.centerPlayOverlay.classList.add('active');
    setTimeout(() => this.centerPlayOverlay.classList.remove('active'), 500);
  }

  updatePlayStateUI(isPlaying) {
    if (isPlaying) {
      this.iconPlay.classList.add('hidden');
      this.iconPause.classList.remove('hidden');
      this.container.classList.remove('is-paused');
    } else {
      this.iconPlay.classList.remove('hidden');
      this.iconPause.classList.add('hidden');
      this.container.classList.add('is-paused');
    }
  }

  seekTo(seconds, emit = true) {
    this.video.currentTime = seconds;
    if (emit && !this.isRemoteAction) {
      this.socket.emit('movie-action', {
        action: 'seek',
        time: seconds
      });
    }
  }

  setPlaybackSpeed(speed, emit = true) {
    this.video.playbackRate = speed;
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

  // Scrubber Progress & Buffering
  startScrubbing(e) {
    this.isScrubbing = true;
    this.onScrub(e);
  }

  onScrub(e) {
    const rect = this.timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (this.video.duration || 0);

    this.progressBar.style.width = `${ratio * 100}%`;
    this.progressThumb.style.left = `${ratio * 100}%`;
    this.currentTimeDisplay.textContent = this.formatTime(targetTime);
  }

  stopScrubbing() {
    this.isScrubbing = false;
    const ratio = parseFloat(this.progressBar.style.width) / 100;
    const targetTime = ratio * (this.video.duration || 0);
    this.seekTo(targetTime, true);
  }

  updateTimelineTooltip(e) {
    const rect = this.timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (this.video.duration || 0);

    this.timeTooltip.style.left = `${ratio * 100}%`;
    this.timeTooltip.textContent = this.formatTime(targetTime);
  }

  updateProgressUI() {
    if (!this.video.duration) return;
    const ratio = (this.video.currentTime / this.video.duration) * 100;
    this.progressBar.style.width = `${ratio}%`;
    this.progressThumb.style.left = `${ratio}%`;
    this.currentTimeDisplay.textContent = this.formatTime(this.video.currentTime);
  }

  updateBufferedUI() {
    if (!this.video.duration || this.video.buffered.length === 0) return;
    const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
    const ratio = (bufferedEnd / this.video.duration) * 100;
    this.bufferedBar.style.width = `${ratio}%`;
  }

  updateVolumeIcons() {
    if (this.video.muted || this.video.volume === 0) {
      this.iconVolumeHigh.classList.add('hidden');
      this.iconVolumeMuted.classList.remove('hidden');
    } else {
      this.iconVolumeHigh.classList.remove('hidden');
      this.iconVolumeMuted.classList.add('hidden');
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(err => {
        console.warn(`Fullscreen error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  updateFullscreenUI() {
    const isFull = !!document.fullscreenElement;
    this.iconEnterFullscreen.classList.toggle('hidden', isFull);
    this.iconExitFullscreen.classList.toggle('hidden', !isFull);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
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
        <img class="movie-card-thumb" src="${movie.poster}" alt="${movie.title}">
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
