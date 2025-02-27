import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private rooms: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket, ...args: any[]) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.rooms.forEach((clients, room) => {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        this.server.to(room).emit('userLeft', client.id);
        if (clients.size === 0) {
          this.rooms.delete(room);
        }
      }
    });
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(client: Socket): void {
    const roomId = uuidv4();
    client.join(roomId);
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    const roomClients = this.rooms.get(roomId);
    if (roomClients) {
      roomClients.add(client.id);
    }
    client.emit('roomCreated', roomId);
    console.log(`Client ${client.id} created room ${roomId}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(client: Socket, room: string): void {
    if (!this.rooms.has(room)) {
      client.emit('error', 'Room does not exist');
      return;
    }
    client.join(room);
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.add(client.id);
      console.log(`Client ${client.id} joined room ${room}`);
      client.to(room).emit('userJoined', client.id);
    }
  }

  @SubscribeMessage('signal')
  handleSignal(client: Socket, data: { room: string; signal: any; to: string }): void {
    if (this.rooms.has(data.room)) {
      const roomClients = this.rooms.get(data.room);
      if (roomClients && roomClients.has(data.to)) {
        client.to(data.to).emit('signal', {
          from: client.id,
          signal: data.signal,
        });
      } else {
        client.emit('error', 'Target client or room does not exist');
      }
    } else {
      client.emit('error', 'Target client or room does not exist');
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(client: Socket, room: string): void {
    if (this.rooms.has(room)) {
      client.leave(room);
      const roomClients = this.rooms.get(room);
      if (roomClients) {
        roomClients.delete(client.id);
        console.log(`Client ${client.id} left room ${room}`);
        client.to(room).emit('userLeft', client.id);
        if (roomClients.size === 0) {
          this.rooms.delete(room);
        }
      }
    }
  }
}