import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

interface UserPermissions {
  canEdit: boolean;
  canInvite: boolean;
  canChangePermissions: boolean;
  canRemoveUsers: boolean;
}

interface SessionData {
  sessionId: string;
  creatorEmail: string;
  activeUsers: Set<string>;
  allowedUsers: Set<string>;
  userPermissions: Map<string, UserPermissions>;
  buffer: any[];
  currentDiagramData: any;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('WebsocketGateway');
  private sessions = new Map<string, SessionData>();

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
    this.sessions.forEach((session, sessionId) => {
      const userEmail = client.handshake.query.userEmail as string;
      if (userEmail && session.activeUsers.has(userEmail)) {
        session.activeUsers.delete(userEmail);
        this.server.to(sessionId).emit('collaborationUpdate', {
          type: 'USER_LEFT',
          sessionId,
          data: {
            userEmail,
            activeUsers: Array.from(session.activeUsers),
          },
          timestamp: Date.now(),
        });
      }
    });
  }

  @SubscribeMessage('createSession')
  handleCreateSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { creatorEmail: string; diagramData?: any },
  ) {
    this.logger.debug('=== Creating Session ===');
    this.logger.debug('Data received:', JSON.stringify(data, null, 2));
    
    if (!data?.creatorEmail) {
      this.logger.error('Creator email is required');
      return { status: 'error', message: 'Creator email is required' };
    }

    const sessionId = uuidv4();
    const session: SessionData = {
      sessionId,
      creatorEmail: data.creatorEmail,
      activeUsers: new Set([data.creatorEmail]),
      allowedUsers: new Set([data.creatorEmail]),
      userPermissions: new Map([[data.creatorEmail, {
        canEdit: true,
        canInvite: true,
        canChangePermissions: true,
        canRemoveUsers: true
      }]]),
      buffer: [],
      currentDiagramData: data.diagramData
    };

    this.sessions.set(sessionId, session);
    client.join(sessionId);

    this.logger.debug('Session created successfully');
    this.logger.debug('Session ID:', sessionId);
    this.logger.debug('Current sessions:', this.sessions.size);

    return {
      status: 'success',
      sessionId,
      message: 'Session created successfully',
      currentContent: { diagramData: session.currentDiagramData }
    };
  }

  @SubscribeMessage('addAllowedUsers')
  handleAddAllowedUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    this.logger.debug('=== Adding Allowed Users ===');
    this.logger.debug('Request data:', JSON.stringify(data, null, 2));
    this.logger.debug('Client ID:', client.id);

    // Validar el formato de los datos
    if (!data?.sessionId || !data?.creatorEmail) {
      this.logger.error('Missing required fields');
      this.logger.debug('sessionId:', data?.sessionId);
      this.logger.debug('creatorEmail:', data?.creatorEmail);
      return { status: 'error', message: 'Missing required fields' };
    }

    // Validar que usersToAdd sea un array
    if (!data.usersToAdd || !Array.isArray(data.usersToAdd)) {
      this.logger.error('Invalid usersToAdd format');
      this.logger.debug('usersToAdd:', data.usersToAdd);
      return { status: 'error', message: 'usersToAdd must be an array' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session) {
      this.logger.error('Session not found');
      this.logger.debug('Available sessions:', Array.from(this.sessions.keys()));
      return { status: 'error', message: 'Session not found' };
    }

    if (session.creatorEmail !== data.creatorEmail) {
      this.logger.error('Unauthorized creator');
      this.logger.debug('Session creator:', session.creatorEmail);
      this.logger.debug('Request creator:', data.creatorEmail);
      return { status: 'error', message: 'Not authorized to add users' };
    }

    try {
      this.logger.debug('Processing users to add...');
      data.usersToAdd.forEach((email: string) => {
        if (typeof email === 'string') {
          this.logger.debug('Adding user:', email);
          session.allowedUsers.add(email);
          if (!session.userPermissions.has(email)) {
            session.userPermissions.set(email, {
              canEdit: true,
              canInvite: false,
              canChangePermissions: false,
              canRemoveUsers: false
            });
          }
        } else {
          this.logger.warn('Invalid email format:', email);
        }
      });

      const currentAllowedUsers = Array.from(session.allowedUsers);
      this.logger.debug('Current allowed users:', currentAllowedUsers);
      
      return {
        status: 'success',
        message: 'Users added successfully',
        allowedUsers: currentAllowedUsers,
      };
    } catch (error) {
      this.logger.error('Error processing users:', error);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('joinSession')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userEmail: string },
  ) {
    this.logger.debug('Join session request:', data);

    if (!data?.sessionId || !data?.userEmail) {
      return { status: 'error', message: 'Invalid request data' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session) {
      return { status: 'error', message: 'Session not found' };
    }

    if (!session.allowedUsers.has(data.userEmail)) {
      return { status: 'error', message: 'User not authorized' };
    }

    client.join(data.sessionId);
    session.activeUsers.add(data.userEmail);

    let userPermissions = session.userPermissions.get(data.userEmail) || {
      canEdit: true,
      canInvite: false,
      canChangePermissions: false,
      canRemoveUsers: false
    };

    if (data.userEmail === session.creatorEmail) {
      userPermissions = {
        canEdit: true,
        canInvite: true,
        canChangePermissions: true,
        canRemoveUsers: true
      };
    }

    session.userPermissions.set(data.userEmail, userPermissions);

    this.server.to(data.sessionId).emit('collaborationUpdate', {
      type: 'USER_JOINED',
      sessionId: data.sessionId,
      data: {
        userEmail: data.userEmail,
        permissions: userPermissions,
        activeUsers: Array.from(session.activeUsers),
        isCreator: data.userEmail === session.creatorEmail,
      },
      timestamp: Date.now(),
    });

    return {
      status: 'success',
      activeUsers: Array.from(session.activeUsers),
      currentContent: {
        diagramData: session.currentDiagramData,
        changes: session.buffer,
      },
      isCreator: data.userEmail === session.creatorEmail
    };
  }

  @SubscribeMessage('diagramChanges')
  handleDiagramChanges(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      userEmail: string;
      delta: any;
      diagramData: any;
    },
  ) {
    this.logger.debug('Received diagram changes');

    if (!data?.sessionId || !data?.userEmail) {
      return { status: 'error', message: 'Invalid data format' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session || !session.allowedUsers.has(data.userEmail)) {
      return { status: 'error', message: 'Not authorized' };
    }

    const userPermissions = session.userPermissions.get(data.userEmail);
    if (!userPermissions?.canEdit) {
      return { status: 'error', message: 'No edit permission' };
    }

    if (data.diagramData) {
      session.currentDiagramData = data.diagramData;
    }

    const change = {
      delta: data.delta,
      diagramData: session.currentDiagramData,
      userEmail: data.userEmail,
      timestamp: Date.now(),
    };

    session.buffer.push(change);
    client.to(data.sessionId).emit('diagramChanges', change);

    return { status: 'success', version: session.buffer.length };
  }

  @SubscribeMessage('updatePermissions')
  handleUpdatePermissions(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      targetUserEmail: string;
      newPermissions: UserPermissions;
      requestedByEmail: string;
    },
  ) {
    this.logger.debug('Updating permissions:', data);

    if (!data?.sessionId || !data?.targetUserEmail || !data?.requestedByEmail) {
      return { status: 'error', message: 'Invalid data format' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session) {
      return { status: 'error', message: 'Session not found' };
    }

    if (session.creatorEmail !== data.requestedByEmail) {
      return { status: 'error', message: 'Not authorized to update permissions' };
    }

    session.userPermissions.set(data.targetUserEmail, data.newPermissions);

    this.server.to(data.sessionId).emit('collaborationUpdate', {
      type: 'PERMISSIONS_CHANGED',
      sessionId: data.sessionId,
      data: {
        userEmail: data.targetUserEmail,
        permissions: data.newPermissions
      },
      timestamp: Date.now(),
    });

    return { status: 'success', message: 'Permissions updated' };
  }
}