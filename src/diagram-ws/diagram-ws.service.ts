import { Injectable } from '@nestjs/common';
import { Socket } from "socket.io";
import { Repository } from "typeorm";
import { User } from "../auth/entities/user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { DiagramSession } from "../diagram-session/entities/diagram-session.entity";
import { Diagram } from "../diagram/entities/diagram.entity";

@Injectable()
export class DiagramWsService {
  private connectedClients: { [id: string]: { socket: Socket, user: User, sessionId?: string } } = {}
  private sessions: { [sessionId: string]: { hostId: string, clientIds: Set<string>, code: string } } = {}

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DiagramSession)
    private readonly sessionRepository: Repository<DiagramSession>,
    @InjectRepository(Diagram)
    private readonly diagramRepository: Repository<Diagram>,
  ) {}

  async createSession(diagramId: string, userId: string, clientId: string): Promise<DiagramSession> {
    console.log(`Creating session for diagram: ${diagramId}, user: ${userId}, client: ${clientId}`);
    const diagram = await this.diagramRepository.findOneBy({ id: diagramId });
    if (!diagram) throw new Error('Diagram not found');

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    const session = new DiagramSession();
    session.code = this.generateSessionCode();
    session.diagram = diagram;
    session.participants = [user];
    session.hostId = userId;
    session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expires in 24 hours

    const savedSession = await this.sessionRepository.save(session);

    this.sessions[savedSession.id] = {
      hostId: userId,
      clientIds: new Set([clientId]),
      code: savedSession.code
    };
    this.connectedClients[clientId].sessionId = savedSession.id;

    console.log(`Session created: ${savedSession.id} for client ${clientId}, host: ${userId}, code: ${savedSession.code}`);
    return savedSession;
  }

  async getSessionByCode(code: string): Promise<DiagramSession | null> {
    console.log(`Attempting to get session with code: ${code}`);
    if (!code) {
      console.log('Session code is undefined or empty');
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: { code },
      relations: ['participants', 'diagram']
    });

    if (!session) {
      console.log(`No session found with code: ${code}`);
      return null;
    }

    console.log(`Session found: ${session.id}, checking if host is connected`);
    if (this.isHostConnected(session.id)) {
      console.log(`Host is connected for session: ${session.id}`);
      return session;
    } else {
      console.log(`Host is not connected for session: ${session.id}`);
      return null;
    }
  }

  async getSessionById(sessionId: string): Promise<DiagramSession | null> {
    console.log(`Attempting to get session with ID: ${sessionId}`);
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['participants', 'diagram']
    });

    if (!session) {
      console.log(`No session found with ID: ${sessionId}`);
      return null;
    }

    console.log(`Session found: ${session.id}`);
    return session;
  }

  async getHostSocket(sessionId: string): Promise<Socket | null> {
    console.log(`Getting host socket for session: ${sessionId}`);
    const session = this.sessions[sessionId];

    if (!session) {
      console.log('Session not found in memory');
      return null;
    }

    const hostClientId = Object.keys(this.connectedClients).find(clientId =>
      this.connectedClients[clientId].user.id === session.hostId &&
      this.connectedClients[clientId].sessionId === sessionId
    );

    console.log(`Host client ID: ${hostClientId}`);
    return hostClientId ? this.connectedClients[hostClientId].socket : null;
  }

  registerClient(clientId: string, socket: Socket, user: User) {
    this.connectedClients[clientId] = { socket, user };
    console.log(`Client ${clientId} registered for user ${user.id}`);
    console.log(`Current connected clients: ${Object.keys(this.connectedClients)}`);
  }

  updateClientSession(clientId: string, sessionId: string) {
    if (this.connectedClients[clientId]) {
      this.connectedClients[clientId].sessionId = sessionId;

      if (!this.sessions[sessionId]) {
        console.log(`Session ${sessionId} not found, creating new session data`);
        const newCode = this.generateSessionCode();
        this.sessions[sessionId] = {
          hostId: this.connectedClients[clientId].user.id,
          clientIds: new Set([clientId]),
          code: newCode
        };
      } else {
        this.sessions[sessionId].clientIds.add(clientId);
      }

      console.log(`Client ${clientId} updated with session ${sessionId}`);
    } else {
      console.error(`Attempted to update session for non-existent client ${clientId}`);
    }
  }

  removeClient(clientId: string) {
    console.log(`Removing client: ${clientId}`);
    const client = this.connectedClients[clientId];
    if (client) {
      const { sessionId } = client;
      if (sessionId && this.sessions[sessionId]) {
        this.sessions[sessionId].clientIds.delete(clientId);
        if (this.sessions[sessionId].hostId === client.user.id) {
          console.log(`Host disconnected, removing session: ${sessionId}`);
          this.removeSession(sessionId);
        } else if (this.sessions[sessionId].clientIds.size === 0) {
          console.log(`No clients left, removing session: ${sessionId}`);
          this.removeSession(sessionId);
        }
      }
    }
    delete this.connectedClients[clientId];
    console.log(`Client ${clientId} removed`);
  }

  getUserIdByClientId(clientId: string): string | undefined {
    return this.connectedClients[clientId]?.user.id;
  }

  getUsernameByClientId(clientId: string): string | undefined {
    const user = this.connectedClients[clientId]?.user;
    return user ? `${user.name} ${user.lastname}` : undefined;
  }

  getClientSession(clientId: string): string | null {
    return this.connectedClients[clientId]?.sessionId || null;
  }

  private removeSession(sessionId: string) {
    console.log(`Removing session: ${sessionId}`);
    delete this.sessions[sessionId];
    // Aquí podrías agregar lógica adicional para limpiar la sesión de la base de datos si es necesario
  }

  private isHostConnected(sessionId: string): boolean {
    console.log(`Checking host connection for session: ${sessionId}`);
    const session = this.sessions[sessionId];
    if (!session) {
      console.log(`No session found in memory for: ${sessionId}`);
      return false;
    }

    const isConnected = Object.values(this.connectedClients).some(client =>
      client.user.id === session.hostId && client.sessionId === sessionId
    );

    console.log(`Host connection status for session ${sessionId}: ${isConnected}`);
    return isConnected;
  }

  private generateSessionCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}