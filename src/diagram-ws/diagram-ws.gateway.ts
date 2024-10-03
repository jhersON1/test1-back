import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody
} from "@nestjs/websockets";
import { DiagramWsService } from './diagram-ws.service';
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "../auth/interfaces";
import { UseGuards } from "@nestjs/common";
import { WsJwtGuard } from "./wsJwtGuard.guard";
import { AuthService } from "../auth/auth.service";
import { DiagramService } from "../diagram/diagram.service";

@WebSocketGateway({ cors: true })
@UseGuards(WsJwtGuard)
export class DiagramWsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() wss: Server;

  constructor(
    private readonly diagramWsService: DiagramWsService,
    private readonly jwtService: JwtService,
    private userService: AuthService,
    private diagramService: DiagramService,
  ) {}

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.diagramWsService.removeClient(client.id);
  }

  @SubscribeMessage('create-session')
  async onCreateSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { diagramId: string }
  ) {
    console.log(`Create session request received for diagram: ${payload.diagramId}`);
    const token = this.extractToken(client);
    const decodedToken = this.jwtService.verify(token) as JwtPayload;

    try {
      const user = await this.userService.findOne(decodedToken.id);
      if (!user) {
        throw new Error('User not found');
      }

      this.diagramWsService.registerClient(client.id, client, user);

      const session = await this.diagramWsService.createSession(payload.diagramId, user.id, client.id);

      console.log(`Session created successfully: ${session.id}, code: ${session.code}`);
      return { status: 'ok', sessionCode: session.code, sessionId: session.id };
    } catch (error) {
      console.error('Error in onCreateSession:', error);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('join-session')
  async onJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string }
  ) {
    console.log('Received join session payload:', payload);
    if (!payload.sessionId) {
      console.log('Session code is undefined or empty');
      return { status: 'error', message: 'Session code is required' };
    }

    console.log(`Join session request received for code: ${payload.sessionId}`);
    const token = this.extractToken(client);
    const decodedToken = this.jwtService.verify(token) as JwtPayload;

    try {
      const user = await this.userService.findOne(decodedToken.id);
      if (!user) {
        throw new Error('User not found');
      }

      const session = await this.diagramWsService.getSessionByCode(payload.sessionId);
      if (!session) {
        console.log(`Session not found or host not connected for code: ${payload.sessionId}`);
        return { status: 'error', message: 'Session not found or host is not connected' };
      }

      this.diagramWsService.registerClient(client.id, client, user);

      const hostSocket = await this.diagramWsService.getHostSocket(session.id);

      if (hostSocket) {
        console.log(`Emitting join-request to host ${hostSocket.id} for session ${session.id}`);
        hostSocket.emit('join-request', {
          userId: user.id,
          username: user.name + ' ' + user.lastname,
          sessionId: session.id,
          clientId: client.id
        });

        client.join(`waiting_${session.id}`);

        // Send current diagram state to the joining client
        const diagramState = await this.getDiagramState(session.code);
        client.emit('diagram-state-update', diagramState);

        return { status: 'pending', message: 'Waiting for host approval' };
      } else {
        console.log(`Host not connected for session: ${session.id}`);
        return { status: 'error', message: 'Host is not connected' };
      }
    } catch (error) {
      console.error('Error in onJoinSession:', error);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('approve-join')
  async onApproveJoin(
    @ConnectedSocket() host: Socket,
    @MessageBody() payload: { sessionId: string, clientId: string, approved: boolean }
  ) {
    console.log(`Approve join request received:`, payload);
    try {
      if (payload.approved) {
        const client = this.wss.sockets.sockets.get(payload.clientId);
        if (client) {
          client.leave(`waiting_${payload.sessionId}`);
          client.join(payload.sessionId);

          this.diagramWsService.updateClientSession(payload.clientId, payload.sessionId);

          //client.emit('join-approved', { sessionId: payload.sessionId });
          (client as Socket).emit('join-approved', { sessionId: payload.sessionId });

          this.wss.to(payload.sessionId).emit('participant-joined', {
            userId: this.diagramWsService.getUserIdByClientId(payload.clientId),
            username: this.diagramWsService.getUsernameByClientId(payload.clientId)
          });

          const session = await this.diagramWsService.getSessionById(payload.sessionId);
          if (!session) {
            console.error(`Session not found for ID: ${payload.sessionId}`);
            return { status: 'error', message: 'Session not found' };
          }
          const diagramState = await this.getDiagramState(session.code);
          client.emit('diagram-state-update', diagramState);
        } else {
          console.error(`Client not found: ${payload.clientId}`);
          return { status: 'error', message: 'Client not found' };
        }
      } else {
        const client = this.wss.sockets.sockets.get(payload.clientId);
        if (client) {
          //client.emit('join-rejected', { sessionId: payload.sessionId });
          (client as Socket).emit('join-rejected', { sessionId: payload.sessionId });
        } else {
          console.error(`Client not found for rejection: ${payload.clientId}`);
        }
      }

      return { status: 'success', message: payload.approved ? 'Client approved' : 'Client rejected' };
    } catch (error) {
      console.error('Error in onApproveJoin:', error);
      return { status: 'error', message: error.message };
    }
  }

  @SubscribeMessage('table-created')
  onNewTable(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting table-created event to session ${sessionId}`);
      this.wss.to(sessionId).emit('table-created', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('table-moved')
  onTableMoved(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting table-moved event to session ${sessionId}`);
      this.wss.to(sessionId).emit('table-moved', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('table-edited')
  onTableEdited(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting table-edited event to session ${sessionId}`);
      this.wss.to(sessionId).emit('table-edited', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('table-removed')
  onTableRemoved(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting table-removed event to session ${sessionId}`);
      this.wss.to(sessionId).emit('table-removed', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('relationship-created')
  onRelationshipCreated(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting relationship-created event to session ${sessionId}`);
      this.wss.to(sessionId).emit('relationship-created', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('relationship-updated')
  onRelationshipUpdated(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting relationship-updated event to session ${sessionId}`);
      this.wss.to(sessionId).emit('relationship-updated', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  @SubscribeMessage('relationship-removed')
  onRemoveRelationship(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.diagramWsService.getClientSession(client.id);
    if (sessionId) {
      console.log(`Broadcasting relationship-removed event to session ${sessionId}`);
      this.wss.to(sessionId).emit('relationship-removed', diagram);
    } else {
      console.error(`No session found for client ${client.id}`);
    }
  }

  private async getDiagramState(sessionCode: string): Promise<any> {
    try {
      console.log(`Getting diagram state for session code: ${sessionCode}`);
      const session = await this.diagramWsService.getSessionByCode(sessionCode);
      if (!session) {
        console.log(`Session not found for code: ${sessionCode}`);
        throw new Error('Session not found');
      }

      console.log(`Found session: ${session.id} for diagram: ${session.diagram.id}`);
      const diagram = await this.diagramService.findOne(session.diagram.id);
      if (!diagram) {
        console.log(`Diagram not found for id: ${session.diagram.id}`);
        throw new Error('Diagram not found');
      }

      console.log(`Returning diagram content for diagram: ${diagram.id}`);
      return diagram.content;
    } catch (error) {
      console.error('Error getting diagram state:', error);
      return null;
    }
  }

  private extractToken(client: Socket): string {
    let token: string | undefined;
    if (client.handshake.headers.authorization) {
      token = client.handshake.headers.authorization.split(' ')[1];
    } else if (client.handshake.auth && client.handshake.auth.token) {
      token = client.handshake.auth.token.split(' ')[1];
    }
    if (!token) {
      throw new Error('Authentication token not found');
    }
    return token;
  }
}