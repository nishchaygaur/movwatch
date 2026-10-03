// CineSync Main Orchestrator
document.addEventListener('DOMContentLoaded', () => {
  // Global Toast function
  window.toast = function(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  };

  // Extract Room ID from URL query if present (?room=romantic-cinema)
  const urlParams = new URLSearchParams(window.location.search);
  let initialRoomId = urlParams.get('room') || '';

  const inputUserName = document.getElementById('inputUserName');
  const inputRoomId = document.getElementById('inputRoomId');
  const btnRandomRoom = document.getElementById('btnRandomRoom');
  const btnEnterTheater = document.getElementById('btnEnterTheater');
  const modalWelcome = document.getElementById('modalWelcome');
  const avatarOptions = document.querySelectorAll('.avatar-opt');

  const displayRoomId = document.getElementById('displayRoomId');
  const btnCopyLink = document.getElementById('btnCopyLink');
  const btnInviteFriend = document.getElementById('btnInviteFriend');
  const modalInvite = document.getElementById('modalInvite');
  const btnCloseInviteModal = document.getElementById('btnCloseInviteModal');
  const shareableLinkInput = document.getElementById('shareableLinkInput');
  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  const btnCopyInviteInDrawer = document.getElementById('btnCopyInviteInDrawer');

  const myAvatarImg = document.getElementById('myAvatarImg');
  const myUsernameDisplay = document.getElementById('myUsernameDisplay');

  // Movie Selector Modal Elements
  const btnChangeMovie = document.getElementById('btnChangeMovie');
  const modalMovieSelector = document.getElementById('modalMovieSelector');
  const btnCloseMovieSelector = document.getElementById('btnCloseMovieSelector');
  const movieTabs = document.querySelectorAll('.m-tab');
  const movieContents = document.querySelectorAll('.m-content');
  const localFileInput = document.getElementById('localFileInput');
  const customVideoUrlInput = document.getElementById('customVideoUrlInput');
  const btnLoadCustomUrl = document.getElementById('btnLoadCustomUrl');
  const pillSamples = document.querySelectorAll('.pill-sample');

  let selectedAvatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix';

  // Random Room Names Generator
  function generateRandomRoom() {
    const adjectives = ['cosy', 'neon', 'retro', 'stellar', 'midnight', 'velvet', 'sunset', 'dream'];
    const nouns = ['cinema', 'theater', 'lounge', 'screening', 'oasis', 'club', 'corner', 'party'];
    const num = Math.floor(100 + Math.random() * 900);
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}-${noun}-${num}`;
  }

  // Pre-fill room input
  if (initialRoomId) {
    inputRoomId.value = initialRoomId;
  } else {
    inputRoomId.value = generateRandomRoom();
  }

  btnRandomRoom.addEventListener('click', () => {
    inputRoomId.value = generateRandomRoom();
  });

  // Avatar Selection
  avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAvatarUrl = opt.src;
    });
  });

  // Connect via CineChannel (Dual transport: Socket.IO + PeerJS)
  const channel = new CineChannel();
  window.channel = channel;

  // Initialize Modules
  const syncPlayer = new SyncPlayer(channel);
  window.syncPlayer = syncPlayer;
  const webrtcManager = new WebRTCManager(channel);
  window.webrtcManager = webrtcManager;
  const chatManager = new ChatManager(channel);
  window.chatManager = chatManager;

  // Enter Theater flow
  function enterTheater() {
    const userName = inputUserName.value.trim() || `MovieFan_${Math.floor(1000 + Math.random() * 9000)}`;
    const roomId = inputRoomId.value.trim() || 'cinema-duo-1';

    // Update URL without reload to reflect room and existing host
    const urlParams = new URLSearchParams(window.location.search);
    const existingHost = urlParams.get('host');
    let newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    if (existingHost) {
      newUrl += `&host=${encodeURIComponent(existingHost)}`;
    }
    window.history.pushState({ path: newUrl }, '', newUrl);

    // Save user info
    window.currentUser = {
      name: userName,
      avatar: selectedAvatarUrl,
      roomId
    };

    displayRoomId.textContent = roomId;
    myAvatarImg.src = selectedAvatarUrl;
    myUsernameDisplay.textContent = userName;

    modalWelcome.classList.add('hidden');

    // Initialize Channel (Socket.io or PeerJS)
    channel.init({
      roomId,
      userName,
      avatar: selectedAvatarUrl
    });

    // Automatically prompt camera / microphone for seamless duo call
    webrtcManager.startCallFlow();
  }

  btnEnterTheater.addEventListener('click', enterTheater);
  inputUserName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterTheater();
  });
  inputRoomId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterTheater();
  });

  // Room joined response
  channel.on('room-joined', ({ user, users, movieState, chatHistory }) => {
    window.currentUser = user;
    displayRoomId.textContent = user.roomId || inputRoomId.value;

    chatManager.updatePeopleList(users);

    // Populate initial chat history
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(msg => chatManager.appendMessage(msg));
    }

    // Apply synchronized movie state
    if (movieState) {
      syncPlayer.applyFullState(movieState);
    }

    window.toast(`🎬 Joined Room: ${inputRoomId.value}`);
  });

  // Copy Invite Link functionality
  function getInviteLink() {
    const currentRoom = inputRoomId.value || 'main';
    let link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
    if (window.channel && window.channel.myPeerId) {
      link += `&host=${encodeURIComponent(window.channel.myPeerId)}`;
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      const hostFromUrl = urlParams.get('host');
      if (hostFromUrl) {
        link += `&host=${encodeURIComponent(hostFromUrl)}`;
      }
    }
    return link;
  }

  function copyInvite() {
    const link = getInviteLink();
    navigator.clipboard.writeText(link).then(() => {
      window.toast('📋 Room link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this room link to share with your partner:', link);
    });
  }

  btnCopyLink.addEventListener('click', copyInvite);
  btnCopyInviteInDrawer.addEventListener('click', copyInvite);

  // Invite Modal
  btnInviteFriend.addEventListener('click', () => {
    shareableLinkInput.value = getInviteLink();
    modalInvite.classList.remove('hidden');
  });

  btnCloseInviteModal.addEventListener('click', () => {
    modalInvite.classList.add('hidden');
  });

  btnCopyInviteLink.addEventListener('click', () => {
    navigator.clipboard.writeText(shareableLinkInput.value).then(() => {
      window.toast('📋 Link copied to clipboard!');
      modalInvite.classList.add('hidden');
    });
  });

  // Movie Selector Modal Handlers
  btnChangeMovie.addEventListener('click', () => {
    modalMovieSelector.classList.remove('hidden');
  });

  btnCloseMovieSelector.addEventListener('click', () => {
    modalMovieSelector.classList.add('hidden');
  });

  movieTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      movieTabs.forEach(t => t.classList.remove('active'));
      movieContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Local File selection in modal
  localFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      syncPlayer.loadLocalFile(file);
      modalMovieSelector.classList.add('hidden');
    }
  });

  // Custom URL Load (Supports YouTube, HLS, Google Drive, Vimeo, MP4/WebM)
  function handleCustomUrlLoad() {
    const url = customVideoUrlInput.value.trim();
    if (!url) return;

    let title = 'Custom Video';
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      title = 'YouTube Stream';
    } else if (url.includes('.m3u8')) {
      title = 'HLS Live Stream';
    } else if (url.includes('drive.google.com')) {
      title = 'Google Drive Video';
    } else if (url.includes('vimeo.com')) {
      title = 'Vimeo Video';
    } else {
      const filename = url.split('/').pop().split('?')[0];
      if (filename && filename.length > 2) {
        title = decodeURIComponent(filename);
      }
    }

    syncPlayer.loadSource({
      type: 'url',
      url,
      title
    }, true);

    modalMovieSelector.classList.add('hidden');
    customVideoUrlInput.value = '';
    window.toast(`🎬 Loaded: ${title}`);
  }

  btnLoadCustomUrl.addEventListener('click', handleCustomUrlLoad);
  customVideoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomUrlLoad();
    }
  });

  // Sample quick buttons
  pillSamples.forEach(sample => {
    sample.addEventListener('click', () => {
      const url = sample.dataset.url;
      const title = sample.dataset.title;
      syncPlayer.loadSource({
        type: 'preset',
        url,
        title
      }, true);
      modalMovieSelector.classList.add('hidden');
      window.toast(`🎬 Loaded: ${title}`);
    });
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ignore hotkeys if user is focused inside an input or form
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        syncPlayer.togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        syncPlayer.seekTo(Math.max(0, syncPlayer.video.currentTime - 10), true);
        break;
      case 'ArrowRight':
        e.preventDefault();
        syncPlayer.seekTo(Math.min(syncPlayer.video.duration || Infinity, syncPlayer.video.currentTime + 10), true);
        break;
      case 'KeyM':
        syncPlayer.video.muted = !syncPlayer.video.muted;
        syncPlayer.updateVolumeIcons();
        break;
      case 'KeyF':
        syncPlayer.toggleFullscreen();
        break;
      case 'KeyC':
        chatManager.toggleDrawer();
        break;
    }
  });

  // Auto-focus username input if welcome modal is showing
  inputUserName.focus();
});
