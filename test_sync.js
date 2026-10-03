const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const ROOM_ID = 'test-cinema-room';

console.log('--- Starting CineSync 2-User Simulation Test ---');

const socket1 = io(SERVER_URL);
const socket2 = io(SERVER_URL);

let s1Joined = false;
let s2Joined = false;
let playReceivedByS2 = false;
let chatReceivedByS1 = false;
let reactionReceivedByS2 = false;

socket1.on('connect', () => {
  console.log('✅ User 1 (Alice) connected to server');
  socket1.emit('join-room', {
    roomId: ROOM_ID,
    userName: 'Alice',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alice'
  });
});

socket1.on('room-joined', (data) => {
  console.log(`✅ Alice received room-joined confirmation (Host: ${data.user.isHost})`);
  s1Joined = true;
  
  // Now connect User 2
  socket2.emit('join-room', {
    roomId: ROOM_ID,
    userName: 'Bob',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Bob'
  });
});

socket2.on('room-joined', (data) => {
  console.log(`✅ User 2 (Bob) joined room (Users in room: ${data.users.length})`);
  s2Joined = true;

  // Alice plays movie at 15.0 seconds
  console.log('🎬 Alice starts movie playback at 15.0s');
  socket1.emit('movie-action', {
    action: 'play',
    time: 15.0,
    playbackRate: 1.0
  });
});

socket2.on('movie-action', (action) => {
  if (action.action === 'play') {
    console.log(`✅ Bob received movie-action: PLAY at ${action.time}s from ${action.updatedBy}`);
    playReceivedByS2 = true;

    // Bob sends a chat message
    console.log('💬 Bob sends chat message: "Pass the popcorn!"');
    socket2.emit('chat-message', { text: 'Pass the popcorn!' });
  }
});

socket1.on('chat-message', (msg) => {
  if (msg.sender === 'Bob' && msg.text === 'Pass the popcorn!') {
    console.log(`✅ Alice received chat message from Bob: "${msg.text}"`);
    chatReceivedByS1 = true;

    // Alice sends a floating popcorn reaction
    console.log('🍿 Alice sends screen reaction: 🍿');
    socket1.emit('screen-reaction', { emoji: '🍿' });
  }
});

socket2.on('screen-reaction', ({ emoji, sender }) => {
  if (emoji === '🍿') {
    console.log(`✅ Bob received screen reaction: ${emoji} from ${sender}`);
    reactionReceivedByS2 = true;

    console.log('\n=======================================');
    console.log('🎉 ALL 2-USER REALTIME TESTS PASSED! 🎉');
    console.log('=======================================');

    socket1.disconnect();
    socket2.disconnect();
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('❌ Test timed out! State:', { s1Joined, s2Joined, playReceivedByS2, chatReceivedByS1, reactionReceivedByS2 });
  socket1.disconnect();
  socket2.disconnect();
  process.exit(1);
}, 6000);
