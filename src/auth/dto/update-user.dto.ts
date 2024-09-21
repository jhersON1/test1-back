import { IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto){
  @IsOptional()
  @IsString()
  imageProfile?: string;

  @IsOptional()
  @IsString()
  passUser?: string;

  @IsOptional()
  @IsString()
  newPassUser?: string;
}
