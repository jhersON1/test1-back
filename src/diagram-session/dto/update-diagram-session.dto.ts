import { PartialType } from '@nestjs/mapped-types';
import { CreateDiagramSessionDto } from './create-diagram-session.dto';

export class UpdateDiagramSessionDto extends PartialType(CreateDiagramSessionDto) {}
