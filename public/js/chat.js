// CineSync Real-time Chat & Flying Reaction System
class ChatManager {
  constructor(socket) {
    this.socket = socket;

    // UI Elements
    this.chatDrawer = document.getElementById('chatDrawer');
    this.btnToggleChat = document.getElementById('btnToggleChat');
    this.btnCloseChatDrawer = document.getElementById('btnCloseChatDrawer');
    this.chatBadge = document.getElementById('chatBadge');
    this.chatMessages = document.getElementById('chatMessages');
    this.chatForm = document.getElementById('chatForm');
    this.chatInput = document.getElementById('chatInput');
    
    // Tabs
    this.tabChatBtn = document.getElementById('tabChatBtn');
    this.tabPeopleBtn = document.getElementById('tabPeopleBtn');
    this.tabChat = document.getElementById('tab-chat');
    this.tabPeople = document.getElementById('tab-people');
    this.peopleList = document.getElementById('peopleList');
    this.peopleCountBadge = document.getElementById('peopleCountBadge');

    // Reactions
    this.floatingLayer = document.getElementById('floatingReactionsLayer');
    this.emojiButtons = document.querySelectorAll('.emoji-btn');

    this.unreadCount = 0;

    this.initEventListeners();
    this.initSocketListeners();
  }

  initEventListeners() {
    // Drawer toggle
    this.btnToggleChat.addEventListener('click', () => this.toggleDrawer());
    this.btnCloseChatDrawer.addEventListener('click', () => this.closeDrawer());

    // Drawer Tabs
    this.tabChatBtn.addEventListener('click', () => {
      this.tabChatBtn.classList.add('active');
      this.tabPeopleBtn.classList.remove('active');
      this.tabChat.classList.add('active');
      this.tabPeople.classList.remove('active');
    });

    this.tabPeopleBtn.addEventListener('click', () => {
      this.tabPeopleBtn.classList.add('active');
      this.tabChatBtn.classList.remove('active');
      this.tabPeople.classList.add('active');
      this.tabChat.classList.remove('active');
    });

    // Send Message
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (!text) return;

      this.socket.emit('chat-message', { text });
      this.chatInput.value = '';
    });

    // Emoji reaction buttons
    this.emojiButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.socket.emit('screen-reaction', { emoji });
        this.spawnReaction(emoji);
      });
    });

    // Sound toggle checkbox
    const chkSound = document.getElementById('chkSoundEffects');
    if (chkSound) {
      chkSound.addEventListener('change', (e) => {
        window.soundFX && window.soundFX.setEnabled(e.target.checked);
      });
    }
  }

  initSocketListeners() {
    // Incoming message
    this.socket.on('chat-message', (msg) => {
      this.appendMessage(msg);
      if (this.chatDrawer.classList.contains('collapsed')) {
        this.unreadCount++;
        this.chatBadge.textContent = this.unreadCount;
        this.chatBadge.classList.remove('hidden');
      }
      if (!msg.isSystem) {
        window.soundFX && window.soundFX.playMessage();
      }
    });

    // Incoming Screen Reaction (Floating emoji)
    this.socket.on('screen-reaction', ({ emoji }) => {
      this.spawnReaction(emoji);
    });

    // Room update users
    this.socket.on('user-joined', ({ users }) => {
      this.updatePeopleList(users);
    });
    this.socket.on('user-left', ({ users }) => {
      this.updatePeopleList(users);
    });
  }

  toggleDrawer() {
    const isCollapsed = this.chatDrawer.classList.toggle('collapsed');
    if (!isCollapsed) {
      this.unreadCount = 0;
      this.chatBadge.classList.add('hidden');
      this.scrollToBottom();
      this.chatInput.focus();
    }
  }

  closeDrawer() {
    this.chatDrawer.classList.add('collapsed');
  }

  appendMessage(msg) {
    const isMine = window.currentUser && msg.senderId === window.currentUser.id;

    const item = document.createElement('div');
    if (msg.isSystem) {
      item.className = 'message-item system-log';
      item.innerHTML = `<span class="system-pill">${this.escapeHtml(msg.text)}</span>`;
    } else {
      item.className = `message-item ${isMine ? 'mine' : ''}`;
      item.innerHTML = `
        <img class="message-avatar" src="${msg.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}" alt="${msg.sender}">
        <div class="message-body">
          <div class="message-header">
            <span class="message-author">${this.escapeHtml(msg.sender)}</span>
            <span class="message-time">${msg.time}</span>
          </div>
          <div class="message-text">${this.escapeHtml(msg.text)}</div>
        </div>
      `;
    }

    this.chatMessages.appendChild(item);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  spawnReaction(emoji) {
    if (!this.floatingLayer) return;

    const el = document.createElement('div');
    el.className = 'floating-reaction-item';
    el.textContent = emoji;

    // Randomize horizontal position (0% - 80%) and slight delay
    const randomLeft = Math.floor(Math.random() * 80);
    el.style.left = `${randomLeft}%`;

    this.floatingLayer.appendChild(el);
    window.soundFX && window.soundFX.playReaction();

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2500);
  }

  updatePeopleList(users) {
    if (!users || !this.peopleList) return;
    this.peopleCountBadge.textContent = users.length;
    this.peopleList.innerHTML = '';

    users.forEach(u => {
      const isMe = window.currentUser && u.id === window.currentUser.id;
      const el = document.createElement('div');
      el.className = 'person-item';
      el.innerHTML = `
        <div class="person-left">
          <img class="person-avatar" src="${u.avatar}" alt="${u.name}">
          <div>
            <span class="person-name">${this.escapeHtml(u.name)} ${isMe ? '(You)' : ''}</span>
          </div>
        </div>
        <div>
          ${u.isHost ? '<span class="person-tag">HOST 👑</span>' : ''}
        </div>
      `;
      this.peopleList.appendChild(el);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
}

window.ChatManager = ChatManager;
