import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Patch,
  Request
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginUserDto } from './dto/';
import { Auth, GetUser } from './decorators';
import { ValidRoles } from './interfaces';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.update(id, updateUserDto);
  }

  @Patch('update-password/:id')
  updatePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.updatePassword(id, updateUserDto);
  }

  @Get('private')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  privateRoute(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }

  @Get()
  findAll() {
    return this.authService.findAll();
  }

  @Auth()
  @Get('check-token')
  checkToken(@Request() req: Request) {
    const user = req['user'] as User;
    return {
      user,
      token: this.authService.getJwtToken({ id: user.id }),
    };
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.findOne(id);
  }
}