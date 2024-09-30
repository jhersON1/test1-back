import { Injectable } from '@nestjs/common';
import { Socket } from "socket.io";
import { Repository } from "typeorm";
import { User } from "../auth/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";

interface ConnectedClients {
  [id: string] : {
    socket: Socket,
    user: User
  }
}

@Injectable()
export class DiagramWsService {
  private connectedClients: ConnectedClients = {}

  constructor (
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async registerClient( client: Socket, userId: string ) {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) throw new Error('User not found');
    if (!user.isActive) throw new Error('User not active');

    this.checkUserConnection(user);

    this.connectedClients[client.id] = {
      socket: client,
      user: user
    };
  }

  removeClient( clientId: string ) {
    delete this.connectedClients[clientId];
  }

  getConnectedClients(): string[] {
    return this.connectedClients ? Object.keys(this.connectedClients) : [];
  }

  getUserFullName( socketId: string ) {
    let name = this.connectedClients[socketId].user.name;
    let lastName = this.connectedClients[socketId].user.lastname;

    return name + ' ' + lastName;
  }

  private checkUserConnection( user: User) {
    for (const clientId of Object.keys(this.connectedClients)) {
      const connectedClient = this.connectedClients[clientId];

      if (connectedClient.user.id === user.id) {
        connectedClient.socket.disconnect();
        break;
      }
    }
  }
}
