# 🍿 CineSync — Watch Movies Together with Duo Video Call & Chat

**CineSync** is a modern, real-time web application designed specifically for two people (or groups) to watch movies together in synchronized lockstep while having live peer-to-peer video calls and interactive chat with animated floating reactions.

---

## 🌟 Key Features

### 🎬 1. Synchronized Movie Player
- **Real-Time Lockstep Playback**: Play, pause, scrub, and change playback speed — state synchronizes instantly on both screens.
- **Continuous Drift Correction**: Auto-calculates playback drift down to milliseconds and smoothly aligns frames so you and your partner stay in perfect sync.
- **Multiple Video Sources**:
  1. **Curated Cinema Library**: High-definition open films ready to stream (*Big Buck Bunny*, *Sintel*, *Tears of Steel*, *Elephants Dream*).
  2. **Direct URL Streaming**: Paste any direct MP4, WebM, or video stream link.
  3. **Zero-Lag Local File Sync (⚡ Game Changer)**: Both you and your partner can select the **same movie file from your respective hard drives** (`.mp4`, `.webm`, `.mkv`). The app synchronizes playback without uploading gigabytes to any server — instant 4K/1080p quality with zero buffering!
- **Luxury Custom Controls**: Hover scrubber with tooltip timestamps, buffered progress indicator, 10s skip/rewind buttons, volume slider, playback speed selector (0.5x – 2x), and fullscreen mode (`F`).

### 📹 2. Duo WebRTC Video Call
- **P2P HD Video & Audio**: Crystal clear low-latency video calling built on WebRTC with Google STUN servers.
- **Floating / Dockable Tiles**: Moveable, minimizable video call dock with picture-in-picture view.
- **Voice Activity Detection (VAD)**: Visual pulsating green glow around video tiles when either you or your partner speaks.
- **Independent Partner Volume Control**: Balance your partner's voice volume against movie audio so you never struggle to hear each other!
- **Hardware Toggles & Screen Share**: 
  - Mute/Unmute microphone.
  - Turn camera on/off.
  - One-click screen and tab audio sharing.

### 💬 3. Live Chat & Instant Screen Reactions
- **Real-time Drawer Chat**: Beautiful message bubbles with sender avatars, timestamps, and auto-scroll.
- **System Event Logs**: Automatic in-chat status notices (e.g. *"🎬 Alice paused at 14:20"*, *"John changed movie to Sintel"*).
- **Flying Screen Reactions**: Click reactions (🍿, ❤️, 🔥, 😂, 😱, 👏) to send animated floating emojis rising up across the movie screen!
- **Web Audio Sound Effects**: Custom synthesized audio chimes for chat messages, reactions, and partner joins (built purely with the Web Audio API — zero missing asset errors).

### 🔗 4. Seamless Room System & Sharing
- **1-Click Shareable Link**: Generates a shareable URL (e.g., `http://localhost:3000/?room=cozy-cinema-724`).
- **Zero Registration**: Enter a nickname, pick an avatar, and start watching immediately.

---

## 🚀 Quick Start Guide

### 1. Start the Server
Make sure Node.js is installed. Run the following command inside the project directory:

```bash
npm start
```

The server will start at:
```
http://localhost:3000
```

---

## 👥 How to Test With Two People (or 2 Windows)

1. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
2. Enter your nickname (e.g. `Alex`) and click **Enter Theater 🎬**.
3. Click **Invite Partner** or the copy button next to the Room Code in the top bar to copy your invite link:
   ```
   http://localhost:3000/?room=cozy-cinema-724
   ```
4. Open a **second window** (or an **Incognito / Private tab**, or send the link to another computer on the same Wi-Fi using your local IP like `http://192.168.x.x:3000/?room=...`).
5. In the second window, enter another nickname (e.g. `Sam`) and enter the theater.
6. **Watch the magic happen**:
   - Both users connect to the video call automatically!
   - Press **Space** or Play in one window — the video starts playing in both windows simultaneously!
   - Scrub the timeline — both jump to the exact same second!
   - Type in the chat drawer or click the **🍿 Popcorn** button to see emojis fly across both screens!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Space`** | Play / Pause movie |
| **`←` / `→`** | Rewind / Forward 10 seconds |
| **`M`** | Mute / Unmute movie audio |
| **`F`** | Toggle Fullscreen |
| **`C`** | Open / Close Chat Drawer |

---

## 📁 Project Structure

```
d:\Antigravity\Movie\
├── server.js               # Express + Socket.IO server & WebRTC signaling
├── package.json            # Node project configuration & dependencies
├── test_sync.js            # Automated 2-user real-time test suite
├── public/                 # Static frontend assets
│   ├── index.html          # Cinema layout, video player, video call dock & modals
│   ├── css/
│   │   └── style.css       # Luxury dark cinema theme, glassmorphism & responsive CSS
│   └── js/
│       ├── sound.js        # Web Audio API synthesizer for UI sounds & chimes
│       ├── sync-player.js  # Playback sync engine, drift corrector & controls
│       ├── webrtc.js       # WebRTC video/audio calling, VAD visualizer & screen share
│       ├── chat.js         # Realtime chat, system logs & flying screen reactions
│       └── app.js          # App orchestrator, hotkeys, room link generator
```
