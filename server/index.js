const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create Express app and HTTP server
const app = express();
app.use(cors());
const server = http.createServer(app);

// Set up Socket.io with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store for active lobbies
const lobbies = {};

// Test endpoint
app.get('/', (req, res) => {
  res.send('Proximity Voice Chat Server is running!');
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // Create a new lobby
  socket.on('createLobby', ({ username, lobbyName, password }) => {
    const lobbyId = uuidv4();
    
    // Create lobby object
    lobbies[lobbyId] = {
      id: lobbyId,
      name: lobbyName,
      host: socket.id,
      users: {},
      settings: {
        boxSize: 1000, // Default box size (pixels)
        voiceRadius: 200, // Default voice radius (pixels)
        maxUsers: 10,
        isPublic: !password,
        password: password || null
      }
    };
    
    // Add host to the lobby
    lobbies[lobbyId].users[socket.id] = {
      id: socket.id,
      username,
      position: { x: 500, y: 500 }, // Start in middle
      orientation: 0, // Default orientation (0 radians = facing right)
      isMuted: false
    };
    
    // Join the socket to the lobby room
    socket.join(lobbyId);
    
    // Send lobby info back to client
    socket.emit('lobbyCreated', {
      lobbyId,
      lobbyInfo: lobbies[lobbyId]
    });
    
    // Broadcast available lobbies to all clients
    io.emit('lobbiesUpdated', getPublicLobbies());
    
    console.log(`Lobby created: ${lobbyName} (${lobbyId}) by ${username}`);
  });
  
  // Get available public lobbies
  socket.on('getLobbies', () => {
    socket.emit('lobbiesUpdated', getPublicLobbies());
  });
  
  // Join an existing lobby
  socket.on('joinLobby', ({ username, lobbyId, password }) => {
    const lobby = lobbies[lobbyId];
    
    // Check if lobby exists
    if (!lobby) {
      return socket.emit('error', { message: 'Lobby not found' });
    }
    
    // Check password if lobby is private
    if (!lobby.settings.isPublic && lobby.settings.password !== password) {
      return socket.emit('error', { message: 'Incorrect password' });
    }
    
    // Check if lobby is full
    if (Object.keys(lobby.users).length >= lobby.settings.maxUsers) {
      return socket.emit('error', { message: 'Lobby is full' });
    }
    
    // Add user to the lobby
    lobby.users[socket.id] = {
      id: socket.id,
      username,
      position: { x: 500, y: 500 }, // Start in middle
      orientation: 0, // Default orientation
      isMuted: false
    };
    
    // Join the socket to the lobby room
    socket.join(lobbyId);
    
    // Send lobby info to the new user
    socket.emit('joinedLobby', {
      lobbyId,
      lobbyInfo: lobby
    });
    
    // Notify other users in the lobby
    socket.to(lobbyId).emit('userJoined', {
      user: lobby.users[socket.id]
    });
    
    console.log(`User ${username} joined lobby: ${lobby.name} (${lobbyId})`);
  });
  
  // Explicit leave lobby
  socket.on('leaveLobby', ({ lobbyId }) => {
    handleUserLeaving(socket.id, lobbyId);
  });
  
  // Update user position (from WASD/directional inputs or mouse)
  socket.on('updatePosition', ({ lobbyId, position }) => {
    // Verify lobby and user exist
    if (!lobbies[lobbyId] || !lobbies[lobbyId].users[socket.id]) {
      return;
    }
    
    // Update user position
    lobbies[lobbyId].users[socket.id].position = position;
    
    // Broadcast the updated position to all users in the lobby
    io.to(lobbyId).emit('userPositionUpdated', {
      userId: socket.id,
      position
    });
  });
  
  // Handle orientation updates
  socket.on('updateOrientation', ({ lobbyId, orientation }) => {
    // Verify lobby and user exist
    if (!lobbies[lobbyId] || !lobbies[lobbyId].users[socket.id]) {
      return;
    }
    
    // Update user orientation
    lobbies[lobbyId].users[socket.id].orientation = orientation;
    
    // Broadcast the updated orientation to all users in the lobby
    io.to(lobbyId).emit('userOrientationUpdated', {
      userId: socket.id,
      orientation
    });
  });
  
  // Host updates lobby settings
  socket.on('updateLobbySettings', ({ lobbyId, settings }) => {
    // Verify lobby exists and user is the host
    if (!lobbies[lobbyId] || lobbies[lobbyId].host !== socket.id) {
      return socket.emit('error', { message: 'Not authorized to update settings' });
    }
    
    // Update settings
    lobbies[lobbyId].settings = {
      ...lobbies[lobbyId].settings,
      ...settings
    };
    
    // Notify all users in the lobby about updated settings
    io.to(lobbyId).emit('lobbySettingsUpdated', {
      settings: lobbies[lobbyId].settings
    });
    
    // Update public lobbies list if privacy settings changed
    if ('isPublic' in settings) {
      io.emit('lobbiesUpdated', getPublicLobbies());
    }
    
    console.log(`Lobby ${lobbies[lobbyId].name} settings updated by host`);
  });
  
  // Host uses boom voice (broadcasts to all in lobby)
  socket.on('boomVoice', ({ lobbyId }) => {
    // Verify lobby exists and user is the host
    if (!lobbies[lobbyId] || lobbies[lobbyId].host !== socket.id) {
      return socket.emit('error', { message: 'Not authorized to use boom voice' });
    }
    
    // Notify all users in the lobby that host is using boom voice
    socket.to(lobbyId).emit('hostBoomVoice', { active: true });
    
    console.log(`Host activated boom voice in lobby ${lobbies[lobbyId].name}`);
    
    // After a timeout, turn off boom voice
    setTimeout(() => {
      socket.to(lobbyId).emit('hostBoomVoice', { active: false });
      console.log(`Host boom voice deactivated in lobby ${lobbies[lobbyId].name}`);
    }, 5000); // 5 seconds of boom voice
  });
  
  // WebRTC signaling: handle offer
  socket.on('rtc-offer', ({ targetUserId, sdp }) => {
    // Forward the offer to the target user
    io.to(targetUserId).emit('rtc-offer', {
      fromUserId: socket.id,
      sdp
    });
  });
  
  // WebRTC signaling: handle answer
  socket.on('rtc-answer', ({ targetUserId, sdp }) => {
    // Forward the answer to the target user
    io.to(targetUserId).emit('rtc-answer', {
      fromUserId: socket.id,
      sdp
    });
  });
  
  // WebRTC signaling: handle ICE candidates
  socket.on('rtc-ice-candidate', ({ targetUserId, candidate }) => {
    // Forward the ICE candidate to the target user
    io.to(targetUserId).emit('rtc-ice-candidate', {
      fromUserId: socket.id,
      candidate
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Find any lobbies the user was in
    Object.keys(lobbies).forEach(lobbyId => {
      if (lobbies[lobbyId].users[socket.id]) {
        handleUserLeaving(socket.id, lobbyId);
      }
    });
  });
});

// Create a reusable function for handling user leaving (for both disconnect and explicit leave)
function handleUserLeaving(userId, lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || !lobby.users[userId]) return;
  
  // Remove the user
  delete lobby.users[userId];
  
  // Notify other users
  io.to(lobbyId).emit('userLeft', {
    userId: userId
  });
  
  console.log(`User ${userId} left lobby ${lobby.name}`);
  
  // If the host left, either assign a new host or close the lobby
  if (lobby.host === userId) {
    const remainingUsers = Object.keys(lobby.users);
    
    if (remainingUsers.length > 0) {
      // Assign a new host (first remaining user)
      lobby.host = remainingUsers[0];
      
      // Notify users about the new host
      io.to(lobbyId).emit('newHost', {
        hostId: lobby.host
      });
      
      console.log(`New host assigned in lobby ${lobby.name}: ${lobby.host}`);
    } else {
      // Close the lobby if no users left
      delete lobbies[lobbyId];
      console.log(`Lobby closed: ${lobby.name} (${lobbyId})`);
    }
  }
  
  // Update public lobbies list
  io.emit('lobbiesUpdated', getPublicLobbies());
}

// Helper function to get public lobbies for the lobby browser
function getPublicLobbies() {
  return Object.values(lobbies)
    .filter(lobby => lobby.settings.isPublic)
    .map(lobby => ({
      id: lobby.id,
      name: lobby.name,
      userCount: Object.keys(lobby.users).length,
      maxUsers: lobby.settings.maxUsers
    }));
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
