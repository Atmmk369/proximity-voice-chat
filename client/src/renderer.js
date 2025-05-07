// Import required dependencies
const io = require('socket.io-client');
const { ipcRenderer } = require('electron');
const SimplePeer = require('simple-peer');
const Store = require('electron-store');

// Set up the store for persistent data
const store = new Store();

// Connect to the socket.io server
const socket = io('http://localhost:3000');
// Replace the above line with your Render.com URL when deploying:
// const socket = io('https://your-render-url-here.onrender.com');

// DOM elements
const elements = {
  // Screens
  loginScreen: document.getElementById('login-screen'),
  createLobbyScreen: document.getElementById('create-lobby-screen'),
  joinLobbyScreen: document.getElementById('join-lobby-screen'),
  lobbyScreen: document.getElementById('lobby-screen'),
  
  // Login
  usernameInput: document.getElementById('username'),
  createLobbyBtn: document.getElementById('create-lobby-btn'),
  joinLobbyBtn: document.getElementById('join-lobby-btn'),
  
  // Create Lobby
  lobbyNameInput: document.getElementById('lobby-name'),
  lobbyPasswordInput: document.getElementById('lobby-password'),
  createConfirmBtn: document.getElementById('create-confirm-btn'),
  createBackBtn: document.getElementById('create-back-btn'),
  
  // Join Lobby
  lobbiesList: document.getElementById('lobbies-list'),
  joinLobbyIdInput: document.getElementById('join-lobby-id'),
  joinLobbyPasswordInput: document.getElementById('join-lobby-password'),
  joinConfirmBtn: document.getElementById('join-confirm-btn'),
  joinBackBtn: document.getElementById('join-back-btn'),
  
  // Lobby
  lobbyTitle: document.getElementById('lobby-title'),
  lobbyId: document.getElementById('lobby-id'),
  minimizeBtn: document.getElementById('minimize-btn'),
  leaveLobbyBtn: document.getElementById('leave-lobby-btn'),
  lobbyCanvas: document.getElementById('lobby-canvas'),
  usersList: document.getElementById('users-list'),
  hostControls: document.getElementById('host-controls'),
  boxSizeInput: document.getElementById('box-size'),
  boxSizeValue: document.getElementById('box-size-value'),
  voiceRadiusInput: document.getElementById('voice-radius'),
  voiceRadiusValue: document.getElementById('voice-radius-value'),
  maxUsersInput: document.getElementById('max-users'),
  maxUsersValue: document.getElementById('max-users-value'),
  mouseSensitivityInput: document.getElementById('mouse-sensitivity'),
  mouseSensitivityValue: document.getElementById('mouse-sensitivity-value'),
  enableKeyboardInput: document.getElementById('enable-keyboard'),
  lobbyPublicInput: document.getElementById('lobby-public'),
  hostPasswordInput: document.getElementById('host-password'),
  minimizeToTrayInput: document.getElementById('minimize-to-tray'),
  boomVoiceBtn: document.getElementById('boom-voice-btn'),
  boomIndicator: document.getElementById('boom-indicator'),
  
  // Audio elements container
  audioElements: document.getElementById('audio-elements')
};

// App state
let currentUsername = store.get('username') || '';
let currentLobby = null;
let localStream = null;
let peerConnections = {};
let mouseSensitivity = store.get('mouseSensitivity') || 50;
let enableKeyboard = store.get('enableKeyboard') !== false; // Default to true
let minimizeToTray = store.get('minimizeToTray') || false;

// Canvas context
const ctx = elements.lobbyCanvas.getContext('2d');

// Initialize the app
function init() {
  // Set saved username if available
  elements.usernameInput.value = currentUsername;
  
  // Set initial sensitivity and control settings
  elements.mouseSensitivityInput.value = mouseSensitivity;
  elements.mouseSensitivityValue.textContent = mouseSensitivity;
  elements.enableKeyboardInput.checked = enableKeyboard;
  elements.minimizeToTrayInput.checked = minimizeToTray;
  
  // Notify main process about tray minimize setting
  ipcRenderer.send('update-tray-minimize', minimizeToTray);
  
  // Add event listeners
  setupEventListeners();
  
  // Set up socket event handlers
  setupSocketHandlers();
}

// Set up UI event listeners
function setupEventListeners() {
  // Login screen
  elements.createLobbyBtn.addEventListener('click', () => {
    const username = elements.usernameInput.value.trim();
    if (!username) {
      alert('Please enter a username');
      return;
    }
    
    currentUsername = username;
    store.set('username', username);
    
    showScreen('create-lobby-screen');
  });
  
  elements.joinLobbyBtn.addEventListener('click', () => {
    const username = elements.usernameInput.value.trim();
    if (!username) {
      alert('Please enter a username');
      return;
    }
    
    currentUsername = username;
    store.set('username', username);
    
    // Request available lobbies
    socket.emit('getLobbies');
    
    showScreen('join-lobby-screen');
  });
  
  // Create Lobby screen
  elements.createConfirmBtn.addEventListener('click', () => {
    const lobbyName = elements.lobbyNameInput.value.trim();
    if (!lobbyName) {
      alert('Please enter a lobby name');
      return;
    }
    
    console.log('Create button clicked');
    const password = elements.lobbyPasswordInput.value.trim();
    
    // Create the lobby
    socket.emit('createLobby', {
      username: currentUsername,
      lobbyName,
      password: password || null
    });
  });
  
  elements.createBackBtn.addEventListener('click', () => {
    showScreen('login-screen');
  });
  
  // Join Lobby screen
  elements.joinConfirmBtn.addEventListener('click', () => {
    const lobbyId = elements.joinLobbyIdInput.value.trim();
    if (!lobbyId) {
      alert('Please enter a lobby ID or select one from the list');
      return;
    }
    
    const password = elements.joinLobbyPasswordInput.value.trim();
    
    // Join the lobby
    socket.emit('joinLobby', {
      username: currentUsername,
      lobbyId,
      password: password || null
    });
  });
  
  elements.joinBackBtn.addEventListener('click', () => {
    showScreen('login-screen');
  });
  
  // Lobby screen
  elements.minimizeBtn.addEventListener('click', () => {
    ipcRenderer.send('minimize-to-tray');
  });
  
  elements.leaveLobbyBtn.addEventListener('click', () => {
    leaveLobby();
  });
  
  // Host control events
  elements.boxSizeInput.addEventListener('input', () => {
    const value = elements.boxSizeInput.value;
    elements.boxSizeValue.textContent = `${value}px`;
    
    if (currentLobby && currentLobby.host === socket.id) {
      updateLobbySettings({ boxSize: parseInt(value) });
    }
  });
  
  elements.voiceRadiusInput.addEventListener('input', () => {
    const value = elements.voiceRadiusInput.value;
    elements.voiceRadiusValue.textContent = `${value}px`;
    
    if (currentLobby && currentLobby.host === socket.id) {
      updateLobbySettings({ voiceRadius: parseInt(value) });
    }
  });
  
  elements.maxUsersInput.addEventListener('input', () => {
    const value = elements.maxUsersInput.value;
    elements.maxUsersValue.textContent = value;
    
    if (currentLobby && currentLobby.host === socket.id) {
      updateLobbySettings({ maxUsers: parseInt(value) });
    }
  });
  
  elements.mouseSensitivityInput.addEventListener('input', () => {
    const value = elements.mouseSensitivityInput.value;
    elements.mouseSensitivityValue.textContent = value;
    mouseSensitivity = parseInt(value);
    store.set('mouseSensitivity', mouseSensitivity);
  });
  
  elements.enableKeyboardInput.addEventListener('change', () => {
    enableKeyboard = elements.enableKeyboardInput.checked;
    store.set('enableKeyboard', enableKeyboard);
  });
  
  elements.lobbyPublicInput.addEventListener('change', () => {
    const isPublic = elements.lobbyPublicInput.checked;
    
    if (currentLobby && currentLobby.host === socket.id) {
      updateLobbySettings({ isPublic });
    }
  });
  
  elements.hostPasswordInput.addEventListener('change', () => {
    const password = elements.hostPasswordInput.value.trim();
    
    if (currentLobby && currentLobby.host === socket.id) {
      updateLobbySettings({ password: password || null });
    }
  });
  
  elements.minimizeToTrayInput.addEventListener('change', () => {
    minimizeToTray = elements.minimizeToTrayInput.checked;
    store.set('minimizeToTray', minimizeToTray);
    
    // Send to main process to update tray behavior
    ipcRenderer.send('update-tray-minimize', minimizeToTray);
  });
  
  elements.boomVoiceBtn.addEventListener('click', () => {
    if (currentLobby && currentLobby.host === socket.id) {
      activateBoomVoice();
    }
  });
  
  // Add keyboard event listener for movement
  document.addEventListener('keydown', handleKeyDown);
  
  // Listen for boom voice shortcut from main process
  ipcRenderer.on('boom-voice-shortcut', () => {
    if (currentLobby && currentLobby.host === socket.id) {
      activateBoomVoice();
    }
  });
  
  // Listen for app closing event
  ipcRenderer.on('app-closing', () => {
    console.log('Application closing, leaving lobby...');
    leaveLobby();
  });
}

// Set up socket event handlers
function setupSocketHandlers() {
  // Connection
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    leaveLobby();
  });
  
  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });
  
  socket.on('error', ({ message }) => {
    alert(`Error: ${message}`);
  });
  
  // Lobby management
  socket.on('lobbyCreated', ({ lobbyId, lobbyInfo }) => {
    enterLobby(lobbyId, lobbyInfo);
  });
  
  socket.on('joinedLobby', ({ lobbyId, lobbyInfo }) => {
    enterLobby(lobbyId, lobbyInfo);
  });
  
  socket.on('lobbiesUpdated', (lobbies) => {
    updateLobbiesList(lobbies);
  });
  
  socket.on('lobbySettingsUpdated', ({ settings }) => {
    updateLobbySettingsUI(settings);
  });
  
  // User events
  socket.on('userJoined', ({ user }) => {
    // Add user to the lobby
    currentLobby.users[user.id] = user;
    
    // Update users list
    updateUsersList();
    
    // Redraw canvas
    drawLobby();
    
    // Check if this user is in voice range
    updateVoiceConnections();
  });
  
  socket.on('userLeft', ({ userId }) => {
    // Remove user from the lobby
    if (currentLobby && currentLobby.users[userId]) {
      delete currentLobby.users[userId];
      
      // Update users list
      updateUsersList();
      
      // Redraw canvas
      drawLobby();
      
      // Disconnect voice if connected
      if (peerConnections[userId]) {
        disconnectPeer(userId);
      }
    }
  });
  
  socket.on('newHost', ({ hostId }) => {
    if (currentLobby) {
      // Update host
      currentLobby.host = hostId;
      
      // Update users list to show new host
      updateUsersList();
      
      // Update host controls visibility
      updateHostControlsVisibility();
      
      // Notify if current user is the new host
      if (hostId === socket.id) {
        alert('You are now the host of this lobby!');
      }
    }
  });
  
  // Position updates
  socket.on('userPositionUpdated', ({ userId, position }) => {
    if (currentLobby && currentLobby.users[userId]) {
      // Update user position
      currentLobby.users[userId].position = position;
      
      // Redraw canvas
      drawLobby();
      
      // Update voice connections based on proximity
      updateVoiceConnections();
    }
  });
  
  // Orientation updates
  socket.on('userOrientationUpdated', ({ userId, orientation }) => {
    if (currentLobby && currentLobby.users[userId]) {
      // Update user orientation
      currentLobby.users[userId].orientation = orientation;
      
      // Redraw canvas
      drawLobby();
    }
  });
  
  // Voice events
  socket.on('hostBoomVoice', ({ active }) => {
    handleBoomVoice(active);
  });
  
  // WebRTC signaling
  socket.on('rtc-offer', async ({ fromUserId, sdp }) => {
    handleRtcOffer(fromUserId, sdp);
  });
  
  socket.on('rtc-answer', ({ fromUserId, sdp }) => {
    handleRtcAnswer(fromUserId, sdp);
  });
  
  socket.on('rtc-ice-candidate', ({ fromUserId, candidate }) => {
    handleRtcIceCandidate(fromUserId, candidate);
  });
}

// Handle keyboard input for movement
function handleKeyDown(event) {
  if (!currentLobby || !enableKeyboard) return;
  
  // Only handle if we're in the lobby screen
  if (!elements.lobbyScreen.classList.contains('active')) return;
  
  const moveStep = 10;
  const position = { ...currentLobby.users[socket.id].position };
  const orientation = currentLobby.users[socket.id].orientation || 0;
  let moved = false;
  
  switch (event.key) {
    case 'w': // Forward
    case 'ArrowUp':
      position.x += moveStep * Math.cos(orientation);
      position.y += moveStep * Math.sin(orientation);
      moved = true;
      break;
    case 's': // Backward
    case 'ArrowDown':
      position.x -= moveStep * Math.cos(orientation);
      position.y -= moveStep * Math.sin(orientation);
      moved = true;
      break;
    case 'a': // Strafe left
    case 'ArrowLeft':
      position.x += moveStep * Math.cos(orientation - Math.PI/2);
      position.y += moveStep * Math.sin(orientation - Math.PI/2);
      moved = true;
      break;
    case 'd': // Strafe right
    case 'ArrowRight':
      position.x += moveStep * Math.cos(orientation + Math.PI/2);
      position.y += moveStep * Math.sin(orientation + Math.PI/2);
      moved = true;
      break;
  }
  
  // Only update if position changed
  if (moved) {
    // Ensure position stays within boundaries
    position.x = Math.max(0, Math.min(currentLobby.settings.boxSize, position.x));
    position.y = Math.max(0, Math.min(currentLobby.settings.boxSize, position.y));
    
    // Update locally
    currentLobby.users[socket.id].position = position;
    
    // Send to server
    socket.emit('updatePosition', {
      lobbyId: currentLobby.id,
      position
    });
    
    // Redraw canvas
    drawLobby();
    
    // Update voice connections
    updateVoiceConnections();
  }
}

// Set up mouse tracking
function setupMouseTracking() {
  // Lock pointer when clicking on canvas for accurate mouse movement
  elements.lobbyCanvas.addEventListener('click', () => {
    elements.lobbyCanvas.requestPointerLock();
  });
  
  // Handle pointer lock change
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === elements.lobbyCanvas) {
      // Pointer locked, add mousemove listener
      document.addEventListener('mousemove', handleMouseMove);
    } else {
      // Pointer unlocked, remove mousemove listener
      document.removeEventListener('mousemove', handleMouseMove);
    }
  });
}

// Function to handle mouse movement
function handleMouseMove(event) {
  if (!currentLobby || mouseSensitivity === 0) return;
  
  // Calculate orientation change based on sensitivity
  // Convert sensitivity to radians per pixel
  const rotationSpeed = (mouseSensitivity / 1000) * Math.PI;
  const orientationChange = event.movementX * rotationSpeed;
  
  // Update orientation (not position)
  let newOrientation = (currentLobby.users[socket.id].orientation || 0) + orientationChange;
  
  // Keep orientation between 0 and 2π
  newOrientation = (newOrientation + 2 * Math.PI) % (2 * Math.PI);
  
  // Update locally
  currentLobby.users[socket.id].orientation = newOrientation;
  
  // Send to server
  socket.emit('updateOrientation', {
    lobbyId: currentLobby.id,
    orientation: newOrientation
  });
  
  // Redraw canvas
  drawLobby();
}

// Switch between screens
function showScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show the requested screen
  document.getElementById(screenId).classList.add('active');
}

// Enter a lobby (after creation or joining)
async function enterLobby(lobbyId, lobbyInfo) {
  // Initialize orientation if it doesn't exist
  Object.values(lobbyInfo.users).forEach(user => {
    if (user.orientation === undefined) {
      user.orientation = 0;
    }
  });
  
  currentLobby = lobbyInfo;
  
  // Update UI
  elements.lobbyTitle.textContent = lobbyInfo.name;
  elements.lobbyId.textContent = lobbyId;
  
  // Update users list
  updateUsersList();
  
  // Update host controls
  updateHostControlsVisibility();
  updateLobbySettingsUI(lobbyInfo.settings);
  
  // Show lobby screen
  showScreen('lobby-screen');
  
  // Initialize canvas to match box size
  elements.lobbyCanvas.width = Math.min(800, lobbyInfo.settings.boxSize);
  elements.lobbyCanvas.height = Math.min(600, lobbyInfo.settings.boxSize);
  
  // Draw initial lobby
  drawLobby();
  
  // Set up mouse tracking
  setupMouseTracking();
  
  // Initialize voice chat
  await initVoiceChat();
}

// Update users list in the sidebar
function updateUsersList() {
  if (!currentLobby) return;
  
  const usersList = elements.usersList;
  usersList.innerHTML = '';
  
  Object.values(currentLobby.users).forEach(user => {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    
    // User name with host badge if host
    const nameElement = document.createElement('div');
    nameElement.className = 'user-name';
    nameElement.textContent = user.username;
    
    if (user.id === currentLobby.host) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'user-host-badge';
      hostBadge.textContent = 'HOST';
      nameElement.appendChild(hostBadge);
    }
    
    userElement.appendChild(nameElement);
    
    // Add mute button (only for other users)
    if (user.id !== socket.id) {
      const muteButton = document.createElement('button');
      muteButton.className = 'user-mute-btn';
      muteButton.textContent = user.isMuted ? 'Unmute' : 'Mute';
      muteButton.addEventListener('click', () => {
        toggleMuteUser(user.id);
      });
      
      userElement.appendChild(muteButton);
    }
    
    usersList.appendChild(userElement);
  });
}

// Show/hide host controls based on whether current user is host
function updateHostControlsVisibility() {
  if (!currentLobby) return;
  
  if (currentLobby.host === socket.id) {
    elements.hostControls.style.display = 'block';
  } else {
    elements.hostControls.style.display = 'none';
  }
}

// Update lobby settings UI
function updateLobbySettingsUI(settings) {
  if (!currentLobby) return;
  
  // Update range sliders
  elements.boxSizeInput.value = settings.boxSize;
  elements.boxSizeValue.textContent = `${settings.boxSize}px`;
  
  elements.voiceRadiusInput.value = settings.voiceRadius;
  elements.voiceRadiusValue.textContent = `${settings.voiceRadius}px`;
  
  elements.maxUsersInput.value = settings.maxUsers;
  elements.maxUsersValue.textContent = settings.maxUsers;
  
  // Update checkboxes and inputs
  elements.lobbyPublicInput.checked = settings.isPublic;
  elements.hostPasswordInput.value = settings.password || '';
  
  // Update canvas size if needed
  elements.lobbyCanvas.width = Math.min(800, settings.boxSize);
  elements.lobbyCanvas.height = Math.min(600, settings.boxSize);
  
  // Redraw canvas
  drawLobby();
}

// Update lobby settings (host only)
function updateLobbySettings(settings) {
  if (!currentLobby || currentLobby.host !== socket.id) return;
  
  socket.emit('updateLobbySettings', {
    lobbyId: currentLobby.id,
    settings
  });
}

// Draw the lobby box and users
function drawLobby() {
  if (!currentLobby) return;
  
  const canvas = elements.lobbyCanvas;
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Calculate scale factor (canvas size / box size)
  const scaleX = canvas.width / currentLobby.settings.boxSize;
  const scaleY = canvas.height / currentLobby.settings.boxSize;
  
  // Draw box border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  
  // Draw all users
  Object.values(currentLobby.users).forEach(user => {
    const x = user.position.x * scaleX;
    const y = user.position.y * scaleY;
    const orientation = user.orientation || 0;
    
    // Draw user dot
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    
    // Current user is blue, others are orange
    if (user.id === socket.id) {
      ctx.fillStyle = '#0088ff';
    } else {
      ctx.fillStyle = '#ff5500';
    }
    
    ctx.fill();
    
    // Draw direction indicator (a line pointing in user's facing direction)
    const dirLength = 20; // Length of direction indicator
    const dirEndX = x + dirLength * Math.cos(orientation);
    const dirEndY = y + dirLength * Math.sin(orientation);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(dirEndX, dirEndY);
    ctx.strokeStyle = user.id === socket.id ? '#0055aa' : '#cc4400';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw username
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.fillText(
      user.username,
      x - 20,
      y - 15
    );
    
    // Draw voice radius for current user
    if (user.id === socket.id) {
      ctx.beginPath();
      ctx.arc(
        x, 
        y, 
        currentLobby.settings.voiceRadius * scaleX,
        0, 
        Math.PI * 2
      );
      ctx.strokeStyle = 'rgba(0, 136, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

// Update available lobbies list
function updateLobbiesList(lobbies) {
  const lobbiesList = elements.lobbiesList;
  
  if (lobbies.length === 0) {
    lobbiesList.innerHTML = '<div class="no-lobbies">No public lobbies available</div>';
    return;
  }
  
  lobbiesList.innerHTML = '';
  
  lobbies.forEach(lobby => {
    const lobbyElement = document.createElement('div');
    lobbyElement.className = 'lobby-item';
    
    // Lobby info
    const infoElement = document.createElement('div');
    infoElement.innerHTML = `
      <div class="lobby-name">${lobby.name}</div>
      <div class="lobby-users">${lobby.userCount}/${lobby.maxUsers} users</div>
    `;
    
    // Join button
    const joinButton = document.createElement('button');
    joinButton.textContent = 'Join';
    joinButton.addEventListener('click', () => {
      elements.joinLobbyIdInput.value = lobby.id;
      
      // Join the lobby
      socket.emit('joinLobby', {
        username: currentUsername,
        lobbyId: lobby.id,
        password: elements.joinLobbyPasswordInput.value.trim() || null
      });
    });
    
    lobbyElement.appendChild(infoElement);
    lobbyElement.appendChild(joinButton);
    lobbiesList.appendChild(lobbyElement);
  });
}

// Leave current lobby
function leaveLobby() {
  if (!currentLobby) return;
  
  console.log('Leaving lobby:', currentLobby.id);
  
  // Explicitly notify server about leaving
  socket.emit('leaveLobby', {
    lobbyId: currentLobby.id
  });
  
  // Close all peer connections
  Object.keys(peerConnections).forEach(peerId => {
    disconnectPeer(peerId);
  });
  
  // Close microphone stream
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
    });
    localStream = null;
  }
  
  // Reset state
  currentLobby = null;
  peerConnections = {};
  
  // Clear audio elements
  elements.audioElements.innerHTML = '';
  
  // Hide boom indicator
  elements.boomIndicator.classList.add('hidden');
  
  // Return to login screen
  showScreen('login-screen');
}

// Initialize voice chat
async function initVoiceChat() {
  try {
    // Request microphone access
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    
    console.log('Microphone access granted');
    
    // Initialize connections with users in proximity
    updateVoiceConnections();
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Failed to access microphone. Voice chat will not work.');
  }
}

// Update voice connections based on proximity
function updateVoiceConnections() {
  if (!currentLobby || !localStream) return;
  
  const currentUser = currentLobby.users[socket.id];
  const voiceRadius = currentLobby.settings.voiceRadius;
  
  Object.values(currentLobby.users).forEach(user => {
    // Skip self
    if (user.id === socket.id) return;
    
    // Calculate distance between users
    const dx = currentUser.position.x - user.position.x;
    const dy = currentUser.position.y - user.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check if user is within voice radius
    const inRange = distance <= voiceRadius;
    
    // If in range and not connected, establish connection
    if (inRange && !peerConnections[user.id]) {
      console.log(`User ${user.username} in range, establishing connection`);
      connectToPeer(user.id);
    }
    
    // If out of range and connected, disconnect
    if (!inRange && peerConnections[user.id]) {
      console.log(`User ${user.username} out of range, disconnecting`);
      disconnectPeer(user.id);
    }
    
    // If connected, adjust volume based on distance
    if (peerConnections[user.id]) {
      const volume = 1 - (distance / voiceRadius);
      setRemoteStreamVolume(user.id, Math.max(0, volume));
    }
  });
}

// Connect to a peer for voice chat
function connectToPeer(peerId) {
  if (peerConnections[peerId]) return;
  
  console.log(`Initiating connection to peer: ${peerId}`);
  
  // Create a new peer connection with comprehensive ICE server configuration
  const peer = new SimplePeer({
    initiator: true,
    trickle: true,
    stream: localStream,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Add a free TURN server for NAT traversal (crucial for different networks)
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
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    },
    sdpTransform: (sdp) => {
      // Prioritize UDP for better voice quality
      return sdp.replace('a=group:BUNDLE 0 1', 'a=group:BUNDLE 0');
    }
  });
  
  // Store the connection
  peerConnections[peerId] = peer;
  
  // Add debug logging
  peer.on('signal', data => {
    console.log(`Generated signal for peer ${peerId}`);
    socket.emit('rtc-offer', {
      targetUserId: peerId,
      sdp: data
    });
  });
  
  peer.on('connect', () => {
    console.log(`Connected to peer: ${peerId}`);
  });
  
  peer.on('stream', stream => {
    console.log(`Received stream from peer: ${peerId}`);
    createAudioElement(peerId, stream);
  });
  
  peer.on('error', err => {
    console.error(`Peer connection error with ${peerId}:`, err);
    disconnectPeer(peerId);
  });
  
  peer.on('close', () => {
    console.log(`Peer connection closed with ${peerId}`);
    disconnectPeer(peerId);
  });
}

// Handle an incoming WebRTC offer
function handleRtcOffer(peerId, sdp) {
  if (!currentLobby || !localStream) return;
  
  console.log(`Received offer from peer: ${peerId}`);
  
  // Create a new peer connection with the same enhanced configuration
  const peer = new SimplePeer({
    initiator: false,
    trickle: true,
    stream: localStream,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
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
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    },
    sdpTransform: (sdp) => {
      return sdp.replace('a=group:BUNDLE 0 1', 'a=group:BUNDLE 0');
    }
  });
  
  // Store the connection
  peerConnections[peerId] = peer;
  
  peer.on('signal', data => {
    console.log(`Generated answer for peer ${peerId}`);
    socket.emit('rtc-answer', {
      targetUserId: peerId,
      sdp: data
    });
  });
  
  peer.on('connect', () => {
    console.log(`Connected to peer: ${peerId}`);
  });
  
  peer.on('stream', stream => {
    console.log(`Received stream from peer: ${peerId}`);
    createAudioElement(peerId, stream);
  });
  
  peer.on('error', err => {
    console.error(`Peer connection error with ${peerId}:`, err);
    disconnectPeer(peerId);
  });
  
  peer.on('close', () => {
    console.log(`Peer connection closed with ${peerId}`);
    disconnectPeer(peerId);
  });
  
  // Process the offer
  peer.signal(sdp);
}

// Handle an incoming WebRTC answer
function handleRtcAnswer(peerId, sdp) {
  if (!peerConnections[peerId]) return;
  
  console.log(`Received answer from peer: ${peerId}`);
  
  // Process the answer
  peerConnections[peerId].signal(sdp);
}

// Handle an incoming ICE candidate
function handleRtcIceCandidate(peerId, candidate) {
  if (!peerConnections[peerId]) return;
  
  console.log(`Received ICE candidate from peer: ${peerId}`);
  
  // Add the ICE candidate
  peerConnections[peerId].signal({ candidate });
}

// Create an audio element for a remote stream
function createAudioElement(peerId, stream) {
  // Remove existing audio element if any
  const existingAudio = document.getElementById(`audio-${peerId}`);
  if (existingAudio) {
    existingAudio.remove();
  }
  
  // Create a new audio element
  const audio = document.createElement('audio');
  audio.id = `audio-${peerId}`;
  audio.autoplay = true;
  audio.srcObject = stream;
  
  // Add to the container
  elements.audioElements.appendChild(audio);
  
  // Set initial volume based on distance
  if (currentLobby) {
    const currentUser = currentLobby.users[socket.id];
    const otherUser = currentLobby.users[peerId];
    
    if (currentUser && otherUser) {
      const dx = currentUser.position.x - otherUser.position.x;
      const dy = currentUser.position.y - otherUser.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const volume = 1 - (distance / currentLobby.settings.voiceRadius);
      audio.volume = Math.max(0, volume);
    }
  }
  
  // Check if user is muted
  if (currentLobby.users[peerId] && currentLobby.users[peerId].isMuted) {
    audio.muted = true;
  }
}

// Disconnect from a peer
function disconnectPeer(peerId) {
  if (!peerConnections[peerId]) return;
  
  console.log(`Disconnecting from peer: ${peerId}`);
  
  // Close the connection
  peerConnections[peerId].destroy();
  delete peerConnections[peerId];
  
  // Remove the audio element
  const audioElement = document.getElementById(`audio-${peerId}`);
  if (audioElement) {
    audioElement.remove();
  }
}

// Set the volume of a remote audio stream
function setRemoteStreamVolume(peerId, volume) {
  const audioElement = document.getElementById(`audio-${peerId}`);
  if (audioElement) {
    audioElement.volume = volume;
  }
}

// Toggle mute for a user
function toggleMuteUser(userId) {
  if (!currentLobby || !currentLobby.users[userId]) return;
  
  console.log("Toggling mute for user:", userId);
  
  // Toggle mute state
  const user = currentLobby.users[userId];
  user.isMuted = !user.isMuted;
  
  // Update audio element
  const audioElement = document.getElementById(`audio-${userId}`);
  if (audioElement) {
    console.log("Setting audio muted to:", user.isMuted);
    audioElement.muted = user.isMuted;
  } else {
    console.warn("Audio element not found for user:", userId);
  }
  
  // Update UI
  updateUsersList();
}

// Activate host's boom voice
function activateBoomVoice() {
  if (!currentLobby || currentLobby.host !== socket.id) {
    console.warn("Cannot activate boom voice - not the host");
    return;
  }
  
  console.log("Activating boom voice");
  
  // Show boom indicator
  elements.boomIndicator.classList.remove('hidden');
  
  // Send boom voice event to server
  socket.emit('boomVoice', { lobbyId: currentLobby.id });
  
  // Hide boom indicator after timeout
  setTimeout(() => {
    elements.boomIndicator.classList.add('hidden');
    console.log("Boom voice deactivated");
  }, 5000);
}

// Handle incoming boom voice
function handleBoomVoice(active) {
  console.log("Handling boom voice, active:", active);
  
  // When boom voice is active, connect to host regardless of distance
  if (active) {
    const hostId = currentLobby.host;
    
    // Only connect if not already connected and not self
    if (hostId !== socket.id && !peerConnections[hostId]) {
      console.log("Connecting to host for boom voice");
      connectToPeer(hostId);
      
      // Set volume to max
      setRemoteStreamVolume(hostId, 1.0);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
