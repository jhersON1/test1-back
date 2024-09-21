import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto, LoginUserDto } from './dto/';
import { JwtPayload } from "./interfaces";
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const { password, ...userData } = createUserDto;

      const user = this.userRepository.create({
        ...userData,
        imageProfile:
          'https://res.cloudinary.com/dnkvrqfus/image/upload/v1699978001/user_ep0ons.jpg',
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);

      return {
        ...user,
        token: this.getJwtToken({ id: user.id }),
      };
    } catch (error) {
      this.handleDBErrors(error);
    }
  }

  async findAll() {
    return await this.userRepository.find();
  }

  async findOne(id: string) {
    return await this.userRepository.findOne({
      where: { id },
    });
  }

  async login(loginUserDto: LoginUserDto) {
    const { password, email } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { email },
      select: { email: true, password: true, id: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credentials are not valid');
    }

    if (!bcrypt.compareSync(password, user.password)) {
      throw new UnauthorizedException('Credentials are not valid');
    }
    return {
      ...user,
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.userRepository.findOne({ where: { id } });
    if (!existingUser) {
      throw new NotFoundException(`User with id: ${id} not found`);
    }

    const updatedUser = await this.userRepository.save({
      ...existingUser,
      ...updateUserDto,
    });

    return {
      ...updatedUser,
      token: this.getJwtToken({ id: updatedUser.id }),
    };
  }

  async updatePassword(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: { password: true },
    });

    if (!bcrypt.compareSync(updateUserDto.passUser, user.password)) {
      throw new UnauthorizedException('La contraseña actual no es válida');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(
      updateUserDto.newPassUser,
      saltRounds,
    );

    const updatedUser = await this.userRepository.preload({
      id: id,
      password: hashedPassword,
    });

    if (!updatedUser) {
      throw new NotFoundException(`User with id: ${id} not found`);
    }

    await this.userRepository.save(updatedUser);

    return {
      ...updatedUser,
      token: this.getJwtToken({ id: updatedUser.id }),
    };
  }

  public getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  private handleDBErrors(error: any): never {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    console.log(error);

    throw new InternalServerErrorException('Check server logs');
  }
}
