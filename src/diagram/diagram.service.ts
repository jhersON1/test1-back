import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Diagram } from "./entities/diagram.entity";
import { User } from "../auth/entities/user.entity";
import { CreateDiagramDto } from "./dto/create-diagram.dto";
import { UpdateDiagramDto } from "./dto/update-diagram.dto";


@Injectable()
export class DiagramService {
  constructor(
    @InjectRepository(Diagram)
    private diagramRepository: Repository<Diagram>,
  ) {}

  async create(createMermaidDiagramDto: CreateDiagramDto, user: User): Promise<Diagram> {
    const mermaidDiagram = this.diagramRepository.create({
      ...createMermaidDiagramDto,
      owner: user,
    });
    return this.diagramRepository.save(mermaidDiagram);
  }

  async findAll(): Promise<Diagram[]> {
    return this.diagramRepository.find();
  }

  async findAllByUser(user: User): Promise<Diagram[]> {
    return this.diagramRepository
      .createQueryBuilder('mermaidDiagram')
      .leftJoinAndSelect('mermaidDiagram.owner', 'owner')
      .where('owner.id = :userId', { userId: user.id })
      .orderBy('mermaidDiagram.updatedAt', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<Diagram> {
    const mermaidDiagram = await this.diagramRepository.findOne({ where: { id } });
    if (!mermaidDiagram) {
      throw new NotFoundException(`Mermaid diagram with ID "${id}" not found`);
    }
    return mermaidDiagram;
  }

  async update(id: string, updateMermaidDiagramDto: UpdateDiagramDto): Promise<Diagram> {
    const mermaidDiagram = await this.findOne(id);
    Object.assign(mermaidDiagram, updateMermaidDiagramDto);
    return this.diagramRepository.save(mermaidDiagram);
  }

  async remove(id: string): Promise<void> {
    const result = await this.diagramRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Mermaid diagram with ID "${id}" not found`);
    }
  }
}
