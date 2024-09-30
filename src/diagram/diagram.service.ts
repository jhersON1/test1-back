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

  async create(createDiagramDto: CreateDiagramDto, user: User): Promise<Diagram> {
    const diagram = this.diagramRepository.create({
      ...createDiagramDto,
      owner: user,
    });
    return this.diagramRepository.save(diagram);
  }

  async findAll(): Promise<Diagram[]> {
    return this.diagramRepository.find();
  }

  async findOne(id: string): Promise<Diagram> {
    const diagram = await this.diagramRepository.findOne({ where: { id } });
    if (!diagram) {
      throw new NotFoundException(`Diagram with ID "${id}" not found`);
    }
    return diagram;
  }

  async update(id: string, updateDiagramDto: UpdateDiagramDto): Promise<Diagram> {
    const diagram = await this.findOne(id);
    Object.assign(diagram, updateDiagramDto);
    return this.diagramRepository.save(diagram);
  }

  async remove(id: string): Promise<void> {
    const result = await this.diagramRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Diagram with ID "${id}" not found`);
    }
  }
}
