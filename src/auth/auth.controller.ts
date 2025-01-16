import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
  HttpException,
  HttpStatus,
  Query
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginUserDto } from './dto/';
import { Auth, GetUser } from './decorators';
import { ValidRoles } from './interfaces';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '@nestjs/passport';

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

  @Get('check-email')
  @Auth()
  async checkUserEmail(@Query('email') email: string) {
    try {
      console.log('[UsuarioController] Checking email:', email);
      const user = await this.authService.getUsuariobyEmail(email);

      if (!user) {
        console.log('[UsuarioController] User not found for email:', email);
        throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
      }

      console.log('[UsuarioController] User found:', user.email);
      return {
        exists: true,
        email: user.email,
        nombre: user.name,
        apellido: user.lastname,
      };
    } catch (e) {
      console.error('[UsuarioController] Error checking email:', e);
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(
        'Error al verificar usuario',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Get()
  findAll() {
    return this.authService.findAll();
  }

  @Get('my-diagrams')
  getUserDiagrams(@Request() req) {
    console.log('User from request:', req.user);
    return this.authService.getUserDiagrams(req.user.id);
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