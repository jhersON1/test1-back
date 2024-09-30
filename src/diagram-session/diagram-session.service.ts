import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DiagramSession } from "./entities/diagram-session.entity";
import { Repository } from "typeorm";
import { DiagramService } from "../diagram/diagram.service";
import { User } from "../auth/entities/user.entity";
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DiagramSessionService {
  constructor(
    @InjectRepository(DiagramSession)
    private diagramSessionRepository: Repository<DiagramSession>,
    private diagramService: DiagramService,
  ) {}

  async create(diagramId: string, user: User): Promise<DiagramSession> {
    const diagram = await this.diagramService.findOne(diagramId);
    const session = this.diagramSessionRepository.create({
      diagram,
      code: uuidv4(),
      participants: [user],
    });
    return this.diagramSessionRepository.save(session);
  }

  async findByCode(code: string): Promise<DiagramSession> {
    const session = await this.diagramSessionRepository.findOne({
      where: { code },
      relations: ['diagram', 'participants']
    });
    if (!session) {
      throw new NotFoundException(`Diagram session with code "${code}" not found`);
    }
    return session;
  }

  async joinSession(code: string, user: User): Promise<DiagramSession> {
    const session = await this.findByCode(code);
    if (!session.participants.some(participant => participant.id === user.id)) {
      session.participants.push(user);
      await this.diagramSessionRepository.save(session);
    }
    return session;
  }

  async endSession(id: string): Promise<void> {
    const result = await this.diagramSessionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Diagram session with ID "${id}" not found`);
    }
  }
}
