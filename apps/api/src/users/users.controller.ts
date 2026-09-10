import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetHelpTargetsDto } from './dto/set-help-targets.dto';
import { UsersService } from './users.service';

@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(':id/help-targets')
  helpTargets(@Param('id') id: string) {
    return this.users.helpTargets(id);
  }

  @Patch(':id/help-targets')
  setHelpTargets(@Param('id') id: string, @Body() dto: SetHelpTargetsDto) {
    return this.users.setHelpTargets(id, dto);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.setActive(id, true, actor.id);
  }

  @Patch(':id/password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.setActive(id, false, actor.id);
  }
}
