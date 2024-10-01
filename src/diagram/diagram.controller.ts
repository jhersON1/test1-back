import { Controller, Get, Post, Body, Patch, Param, Delete, Request, Query, UseGuards } from "@nestjs/common";
import { DiagramService } from './diagram.service';
import { CreateDiagramDto } from './dto/create-diagram.dto';
import { UpdateDiagramDto } from './dto/update-diagram.dto';
import { Auth, GetUser } from "../auth/decorators";
import { User } from "../auth/entities/user.entity";

@Controller('diagrams')
@Auth()
export class DiagramController {
  constructor(private readonly diagramService: DiagramService) {}

  @Auth()
  @Post()
  create(@Body() createDiagramDto: CreateDiagramDto, @Request() req: Request) {
    const user = req['user'] as User;
    return this.diagramService.create(createDiagramDto, user);
  }

  @Get()
  findAll() {
    return this.diagramService.findAll();
  }


  @Get('allByUser')
  findAllByUser(@Request() req: Request) {
    const user = req['user'] as User;
    return this.diagramService.findAllByUser(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.diagramService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDiagramDto: UpdateDiagramDto) {
    return this.diagramService.update(id, updateDiagramDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.diagramService.remove(id);
  }
}