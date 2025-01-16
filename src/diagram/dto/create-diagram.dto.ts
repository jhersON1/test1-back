import { IsString, IsNotEmpty } from "class-validator";

export class CreateDiagramDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  content: string;
}
