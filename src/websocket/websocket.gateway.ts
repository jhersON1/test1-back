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
}

interface SessionData {
  sessionId: string;
  creatorEmail: string;
  activeUsers: Set<string>;
  allowedUsers: Set<string>;
  userPermissions: Map<string, UserPermissions>;
  buffer: any[];
  currentContent: any;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('DiagramGateway');
  private sessions = new Map<string, SessionData>();

  handleConnection(client: Socket) {
    this.logger.debug(`[DiagramGateway] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[DiagramGateway] Client disconnected: ${client.id}`);

    this.sessions.forEach((session, sessionId) => {
      const userEmail = client.handshake.query.userEmail as string;
      if (session.activeUsers.has(userEmail)) {
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
    @MessageBody() data: { creatorEmail: string; initialContent?: any },
  ) {
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
      }]]),
      buffer: [],
      currentContent: data.initialContent || null,
    };

    this.sessions.set(sessionId, session);
    client.join(sessionId);

    return {
      status: 'success',
      sessionId,
      message: 'Session created successfully',
      currentContent: session.currentContent,
    };
  }

  @SubscribeMessage('joinSession')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userEmail: string },
  ) {
    this.logger.debug(
      `[DiagramGateway] Join request - Session: ${data.sessionId}, User: ${data.userEmail}`,
    );

    const session = this.sessions.get(data.sessionId);
    if (!session) {
      this.logger.error(`[DiagramGateway] Session not found: ${data.sessionId}`);
      return { status: 'error', message: 'Session not found' };
    }

    if (!session.allowedUsers.has(data.userEmail)) {
      this.logger.error(
        `[DiagramGateway] User not authorized: ${data.userEmail}`,
      );
      return { status: 'error', message: 'User not authorized' };
    }

    client.join(data.sessionId);
    session.activeUsers.add(data.userEmail);

    let userPermissions;
    if (data.userEmail === session.creatorEmail) {
      userPermissions = {
        canEdit: true,
        canInvite: true,
        canChangePermissions: true,
        canRemoveUsers: true,
      };
    } else {
      userPermissions = session.userPermissions.get(data.userEmail) || {
        canEdit: true,
        canInvite: false,
        canChangePermissions: false,
        canRemoveUsers: false,
      };
    }

    session.userPermissions.set(data.userEmail, userPermissions);

    this.logger.debug('[DiagramGateway] Joined user permissions:', {
      userEmail: data.userEmail,
      permissions: userPermissions,
    });

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
        content: session.currentContent,
        changes: session.buffer,
        version: session.buffer.length,
      },
      userPermissions: userPermissions,
      isCreator: data.userEmail === session.creatorEmail,
    };
  }

  @SubscribeMessage('addAllowedUsers')
  handleAddAllowedUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      sessionId: string;
      creatorEmail: string;
      usersToAdd: string[];
    },
  ) {
    if (!data || !data.usersToAdd) {
      return { status: 'error', message: 'Invalid data format' };
    }

    const session = this.sessions.get(data.sessionId);
    if (!session) {
      return { status: 'error', message: 'Session not found' };
    }

    try {
      data.usersToAdd.forEach((email) => {
        session.allowedUsers.add(email);
        if (!session.userPermissions.has(email)) {
          session.userPermissions.set(email, {
            canEdit: true,
            canInvite: false,
            canChangePermissions: false,
          });
        }
      });

      return {
        status: 'success',
        message: 'Users added successfully',
        allowedUsers: Array.from(session.allowedUsers),
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('editorChanges')
  handleEditorChanges(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      sessionId: string;
      userEmail: string;
      delta: any;
      content: any;
    },
  ) {
    this.logger.debug(
      `[DiagramGateway] Received changes from ${data.userEmail} in session ${data.sessionId}`,
    );
    this.logger.debug('[DiagramGateway] Content received:', data.content);

    const session = this.sessions.get(data.sessionId);
    if (!session || !session.allowedUsers.has(data.userEmail)) {
      this.logger.error(`[DiagramGateway] Unauthorized change attempt`);
      return { status: 'error', message: 'Not authorized' };
    }

    const userPermissions = session.userPermissions.get(data.userEmail);
    if (!userPermissions?.canEdit) {
      this.logger.error(`[DiagramGateway] User does not have edit permission`);
      return { status: 'error', message: 'No edit permission' };
    }

    if (data.content) {
      session.currentContent = data.content;
      this.logger.debug(
        '[DiagramGateway] Updated session content:',
        session.currentContent,
      );
    }

    const change = {
      delta: data.delta,
      content: session.currentContent,
      userEmail: data.userEmail,
      timestamp: Date.now(),
    };

    session.buffer.push(change);

    client.to(data.sessionId).emit('editorChanges', change);

    return { status: 'success', version: session.buffer.length };
  }
}