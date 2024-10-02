import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    console.log('WsJwtGuard - Client handshake:', client.handshake);

    let token: string | undefined;

    // Buscar el token en client.handshake.auth.token
    if (client.handshake.auth && client.handshake.auth.token) {
      console.log('Token found in handshake.auth.token');
      token = client.handshake.auth.token.split(' ')[1]; // Remover 'Bearer '
    }

    if (!token) {
      console.error('No token found in the request');
      throw new WsException('Authentication token not found');
    }

    try {
      const payload = this.jwtService.verify(token);
      console.log('Token verified successfully:', payload);
      client['user'] = payload;
      return true;
    } catch (err) {
      console.error('Token verification failed:', err);
      throw new WsException('Invalid token');
    }
  }
}