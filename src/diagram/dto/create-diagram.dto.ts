import { IsString, IsOptional, IsObject, IsNotEmpty } from "class-validator";

export class CreateDiagramDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsObject()
  @IsNotEmpty()
  content: any;
}
