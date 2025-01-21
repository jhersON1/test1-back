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
  canManagePermissions: boolean;
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
        canManagePermissions: true
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
    @MessageBody() data: {
      sessionId: string;
      creatorEmail: string;
      usersToAdd: string[];
      initialPermissions?: UserPermissions;
    },
  ) {
    this.logger.debug('Adding Allowed Users:', data);

    if (!data?.sessionId || !data?.creatorEmail || !Array.isArray(data.usersToAdd)) {
      return { status: 'error', message: 'Invalid request data' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session || session.creatorEmail !== data.creatorEmail) {
      return { status: 'error', message: 'Not authorized' };
    }

    const defaultPermissions: UserPermissions = {
      canEdit: true,
      canInvite: false,
      canManagePermissions: false
    };

    const permissions = data.initialPermissions || defaultPermissions;

    data.usersToAdd.forEach(email => {
      session.allowedUsers.add(email);
      session.userPermissions.set(email, permissions);
    });

    return {
      status: 'success',
      message: 'Users added successfully',
      allowedUsers: Array.from(session.allowedUsers)
    };
  }

  @SubscribeMessage('joinSession')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userEmail: string },
  ) {
    this.logger.debug('Join session request:', data);

    const session = this.sessions.get(data.sessionId);
    if (!session || !session.allowedUsers.has(data.userEmail)) {
      return { status: 'error', message: 'Not authorized' };
    }

    client.join(data.sessionId);
    session.activeUsers.add(data.userEmail);

    const userPermissions = session.userPermissions.get(data.userEmail) || {
      canEdit: true,
      canInvite: false,
      canManagePermissions: false
    };

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
      permissions: userPermissions,
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
    this.logger.debug(`Processing diagram changes from: ${data.userEmail}`);
  
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
  
    // Actualizar el estado del diagrama
    if (data.diagramData) {
      session.currentDiagramData = data.diagramData;
    }
  
    const change = {
      delta: data.delta,
      diagramData: session.currentDiagramData,
      userEmail: data.userEmail,
      timestamp: Date.now(),
    };
  
    // Emitir a TODOS los clientes en la sala, incluyendo el emisor
    this.server.to(data.sessionId).emit('diagramChanges', change);
    
    // Agregar logs para debug
    this.logger.debug(`Emitting changes to session ${data.sessionId}`);
    this.logger.debug(`Change data: ${JSON.stringify(change)}`);
  
    return { status: 'success' };
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

    const session = this.sessions.get(data.sessionId);
    if (!session || session.creatorEmail !== data.requestedByEmail) {
      return { status: 'error', message: 'Not authorized' };
    }

    // Validar que los permisos tengan la estructura correcta
    const requiredPermissions = ['canEdit', 'canInvite', 'canManagePermissions'];
    if (!requiredPermissions.every(perm => data.newPermissions.hasOwnProperty(perm))) {
      return { status: 'error', message: 'Invalid permissions format' };
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