import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { DiagramWsService } from './diagram-ws.service';
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "../auth/interfaces";

@WebSocketGateway({cors: true})
export class DiagramWsGateway implements OnGatewayConnection, OnGatewayDisconnect {

  @WebSocketServer() wss: Server;

  constructor(
    private readonly diagramWsService: DiagramWsService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection (client: Socket) {
    const token = client.handshake.headers.authentication as string;
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify(token);
      await this.diagramWsService.registerClient( client, payload.id );
    } catch (err) {
      client.disconnect();
      return;
    }

    this.wss.emit('clients-updated', this.diagramWsService.getConnectedClients() as any )
  }

  handleDisconnect (client: Socket) {
    this.diagramWsService.removeClient( client.id );
    this.wss.emit('clients-updated', this.diagramWsService.getConnectedClients() as any )
  }

  @SubscribeMessage('message-from-client')
  onMessageFromClient(client: Socket, payload: any) {
    this.wss.emit('message-from-server', {
        fullName: this.diagramWsService.getUserFullName(client.id),
        message: payload.message || 'no message from server',
        enterEvent: payload.enterEvent,
      } as any)
  }

  @SubscribeMessage('table-created')
  onNewTable(client: Socket, diagram: any) {
    this.wss.emit('table-created', diagram);
  }

  @SubscribeMessage('table-moved')
  onTableMoved(client: Socket, diagram: any) {
    this.wss.emit('table-moved', diagram);
  }

  @SubscribeMessage('table-edited')
  onTableEdited(client: Socket, diagram: any) {
    console.log('table-edited',diagram);
    this.wss.emit('table-edited', diagram);
  }

  @SubscribeMessage('table-removed')
  onTableRemoved(client: Socket, diagram: any) {
    console.log('table-removed',diagram);
    this.wss.emit('table-removed', diagram);
  }

  @SubscribeMessage('relationship-created')
  onRelationshipCreated(client: Socket, diagram: any) {
    console.log('relationship-created',diagram);
    this.wss.emit('relationship-created', diagram);
  }

  @SubscribeMessage('relationship-updated')
  onRelationshipUpdated(client: Socket, diagram: any) {
    console.log('relationship-updated',diagram);
    this.wss.emit('relationship-updated', diagram);
  }

  @SubscribeMessage('relationship-removed')
  onRemoveRelationship(client: Socket, diagram: any) {
    console.log('relationship-removed',diagram);
    this.wss.emit('relationship-removed', diagram);
  }

}
