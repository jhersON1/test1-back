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
import { DiagramService } from "../diagram/diagram.service";


@WebSocketGateway({ cors: true })
@UseGuards(WsJwtGuard)
export class DiagramWsGateway implements OnGatewayConnection, OnGatewayDisconnect {

  @WebSocketServer() wss: Server;

  constructor(
    private readonly diagramWsService: DiagramWsService,
    private readonly jwtService: JwtService,
    private readonly diagramService: DiagramService
  ) {}

  async handleConnection(client: Socket) {
    // La autenticación se maneja en el guard WsJwtGuard
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    this.diagramWsService.removeClient(client.id);
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('join-session')
  async onJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionCode: string }
  ) {
    console.log('Join session request received:', payload);
    console.log('Client handshake:', client.handshake);

    let token: string | undefined;

    // Intentar obtener el token de diferentes lugares
    if (client.handshake.headers.authorization) {
      console.log('Token found in headers.authorization');
      token = client.handshake.headers.authorization.split(' ')[1];
    } else if (client.handshake.auth && client.handshake.auth.token) {
      console.log('Token found in handshake.auth.token');
      token = client.handshake.auth.token.split(' ')[1];
    } else {
      console.error('No token found in the request');
      throw new Error('Authentication token not found');
    }

    if (!token) {
      throw new Error('No token provided');
    }

    try {
      const decodedToken = this.jwtService.verify(token) as JwtPayload;
      console.log('Decoded token:', decodedToken);

      const session = await this.diagramWsService.joinSession(payload.sessionCode, decodedToken.id);
      console.log('Joined session:', session);

      // Obtener el estado actual del diagrama
     // const currentDiagramState = await this.diagramService.getDiagramState(session.diagram.id);

      // Unir al cliente a la sala de Socket.IO correspondiente a la sesión
      client.join(session.code);

      // Emitir un evento a todos los clientes en la sala para informar que un nuevo usuario se ha unido
      this.wss.to(session.code).emit('user-joined', {
        userId: decodedToken.id,
        sessionId: session.code
      });

      return {
        status: 'ok',
        message: 'Joined session successfully',
        sessionId: session.code,
        diagramId: session.id
      };
    } catch (error) {
      console.error('Error in onJoinSession:', error);
      throw error;
    }
  }

  @SubscribeMessage('create-session')
  async onCreateSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { diagramId: string }
  ) {

    //console.log('Create session request received:', payload);
   // console.log('Client handshake:', client.handshake);

    let token: string | undefined;

    // Intentar obtener el token de diferentes lugares
    if (client.handshake.headers.authorization) {
      //console.log('Token found in headers.authorization');
      token = client.handshake.headers.authorization.split(' ')[1];
    } else if (client.handshake.auth && client.handshake.auth.token) {
     //console.log('Token found in handshake.auth.token');
      token = client.handshake.auth.token.split(' ')[1];
    } else {
      //console.error('No token found in the request');
      throw new Error('Authentication token not found');
    }

    if (!token) {
      throw new Error('No token provided');
    }

    try {
      const decodedToken = this.jwtService.verify(token) as JwtPayload;
      //console.log('Decoded token:', decodedToken);

      const session = await this.diagramWsService.createSession(payload.diagramId, decodedToken.id);
      //console.log('Session created:', session);
      return { status: 'ok', sessionCode: session.code };
    } catch (error) {
      //console.error('Error in onCreateSession:', error);
      throw error;
    }

  }

  //dudoso
  @SubscribeMessage('update-diagram')
  async onUpdateDiagram(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string, diagramState: any }
  ) {
    try {
      // Guardar el estado actualizado del diagrama
      //await this.diagramService.update(payload.sessionId, payload.diagramState);

      // Emitir el estado actualizado a todos los clientes en la sesión, excepto al que lo envió
      client.to(payload.sessionId).emit('diagram-updated', payload.diagramState);

      return { status: 'ok', message: 'Diagram updated successfully' };
    } catch (error) {
      console.error('Error in onUpdateDiagram:', error);
      throw error;
    }
  }

  @SubscribeMessage('table-created')
  onNewTable(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('table-created', diagram);
    }
  }

  @SubscribeMessage('table-moved')
  onTableMoved(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('table-moved', diagram);
    }
  }

  @SubscribeMessage('table-edited')
  onTableEdited(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('table-edited', diagram);
    }
  }

  @SubscribeMessage('table-removed')
  onTableRemoved(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('table-removed', diagram);
    }
  }

  @SubscribeMessage('relationship-created')
  onRelationshipCreated(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('relationship-created', diagram);
    }
  }

  @SubscribeMessage('relationship-updated')
  onRelationshipUpdated(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('relationship-updated', diagram);
    }
  }

  @SubscribeMessage('relationship-removed')
  onRemoveRelationship(@ConnectedSocket() client: Socket, @MessageBody() diagram: any) {
    const sessionId = this.getClientSession(client.id);
    if (sessionId) {
      this.wss.to(sessionId).emit('relationship-removed', diagram);
    }
  }

  private getClientSession(clientId: string): string | null {
    const client = this.diagramWsService['connectedClients'][clientId];
    return client ? client.sessionId : null;
  }

}