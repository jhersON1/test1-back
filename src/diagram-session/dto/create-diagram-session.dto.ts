import { IsNotEmpty, IsString } from "class-validator";

export class CreateDiagramSessionDto {
  @IsString()
  @IsNotEmpty()
  diagramId: string;
}
