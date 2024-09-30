import { Controller, Post, Param, Request } from "@nestjs/common";
import { DiagramSessionService } from './diagram-session.service';
import { Auth } from "../auth/decorators";
import { User } from "../auth/entities/user.entity";

@Controller('session')
@Auth()
export class DiagramSessionController {
  constructor(private readonly diagramSessionService: DiagramSessionService) {}

  @Post(':diagramId/start')
  startCollaboration(@Param('diagramId') diagramId: string, @Request() req: Request) {
    const user = req['user'] as User;
    return this.diagramSessionService.create(diagramId, user);
  }

  @Post('join/:code')
  joinSession(@Param('code') code: string, @Request() req: Request) {
    const user = req['user'] as User;
    return this.diagramSessionService.joinSession(code, user);
  }
}
