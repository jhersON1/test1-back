import { Injectable } from '@nestjs/common';
import { Socket } from "socket.io";
import { Repository } from "typeorm";
import { User } from "../auth/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { DiagramSession } from "../diagram-session/entities/diagram-session.entity";
import { Diagram } from "../diagram/entities/diagram.entity";


interface ConnectedClients {
  [id: string]: {
    socket: Socket,
    user: User,
    sessionId: string
  }
}

@Injectable()
export class DiagramWsService {
  private connectedClients: ConnectedClients = {}
  private sessions: { [sessionId: string]: Set<string> } = {}

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DiagramSession)
    private readonly sessionRepository: Repository<DiagramSession>,
    @InjectRepository(Diagram)
    private readonly diagramRepository: Repository<Diagram>,
  ) {}

  async registerClient(client: Socket, userId: string, sessionId: string) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');
    if (!user.isActive) throw new Error('User not active');

    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['participants']
    });
    if (!session) throw new Error('Session not found');

    if (!session.participants.some(participant => participant.id === user.id)) {
      session.participants.push(user);
      await this.sessionRepository.save(session);
    }

    this.removeClientFromPreviousSessions(user.id);

    this.connectedClients[client.id] = { socket: client, user: user, sessionId };

    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = new Set();
    }
    this.sessions[sessionId].add(client.id);
  }

  removeClient(clientId: string) {
    const client = this.connectedClients[clientId];
    if (client) {
      const { sessionId } = client;
      if (this.sessions[sessionId]) {
        this.sessions[sessionId].delete(clientId);
        if (this.sessions[sessionId].size === 0) {
          delete this.sessions[sessionId];
        }
      }
    }
    delete this.connectedClients[clientId];
  }

  getConnectedClientsInSession(sessionId: string): string[] {
    return Array.from(this.sessions[sessionId] || []);
  }

  getUserFullName(socketId: string) {
    const client = this.connectedClients[socketId];
    if (client) {
      return `${client.user.name} ${client.user.lastname}`;
    }
    return '';
  }

  private removeClientFromPreviousSessions(userId: string) {
    for (const [clientId, client] of Object.entries(this.connectedClients)) {
      if (client.user.id === userId) {
        this.removeClient(clientId);
        client.socket.disconnect();
      }
    }
  }

  async createSession(diagramId: string, userId: string): Promise<DiagramSession> {
    const diagram = await this.diagramRepository.findOneBy({ id: diagramId });
    if (!diagram) throw new Error('Diagram not found');

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    const session = new DiagramSession();
    session.code = this.generateSessionCode();
    session.diagram = diagram;
    session.participants = [user];
    session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    return this.sessionRepository.save(session);
  }

  async joinSession(code: string, userId: string): Promise<DiagramSession> {
    const session = await this.sessionRepository.findOne({
      where: { code },
      relations: ['participants']
    });
    if (!session) throw new Error('Session not found');

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    if (!session.participants.some(participant => participant.id === user.id)) {
      session.participants.push(user);
      await this.sessionRepository.save(session);
    }

    return session;
  }

  private generateSessionCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

}