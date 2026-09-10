import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ConfirmEfesimProspectDto } from './dto/confirm-efesim-prospect.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { CreateProspectVisitDto } from './dto/create-prospect-visit.dto';
import { EfesimExtractDto } from './dto/efesim-extract.dto';
import { ProspectConfirmationService } from './prospect-confirmation.service';
import { ProspectConversionService } from './prospect-conversion.service';
import { ProspectsService } from './prospects.service';

@Controller('prospects')
export class ProspectsController {
  constructor(
    private readonly prospects: ProspectsService,
    private readonly confirmation: ProspectConfirmationService,
    private readonly conversion: ProspectConversionService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Get()
  list() {
    return this.prospects.list();
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProspectDto) {
    return this.prospects.create({ ...dto, technicianId: user.id });
  }

  @Post('visits')
  createVisit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProspectVisitDto) {
    return this.prospects.createVisit({ ...dto, technicianId: user.id });
  }

  @Post('efesim-extract')
  extractEfesim(@CurrentUser() user: AuthenticatedUser, @Body() dto: EfesimExtractDto) {
    return this.prospects.extractEfesim({ ...dto, technicianId: user.id });
  }

  @Post('efesim-confirm')
  confirmEfesim(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmEfesimProspectDto) {
    return this.confirmation.confirm({ ...dto, technicianId: user.id });
  }

  @Roles(UserRole.ADMIN)
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.conversion.history(id);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/convert')
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ConvertProspectDto) {
    return this.conversion.convert(id, { ...dto, adminUserId: user.id });
  }
}
