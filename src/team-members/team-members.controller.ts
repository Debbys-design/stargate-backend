import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/roles.enum';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { TeamMembersService } from './team-members.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { MemberLoginDto } from './dto/member-login.dto';

@ApiTags('team-members')
@Controller('team-members')
export class TeamMembersController {
  constructor(private readonly teamMembers: TeamMembersService) {}

  @Post('login')
  @ApiOperation({ summary: 'Team member login' })
  login(@Body() dto: MemberLoginDto) {
    return this.teamMembers.login(dto.email, dto.password);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an invite and set password' })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.teamMembers.acceptInvite(dto.token, dto.password);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post('invite')
  @ApiOperation({ summary: 'Invite a new team member' })
  invite(
    @CurrentMerchant() user: { merchantId: string; role: Role },
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamMembers.invite(user.merchantId, user.role, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'List all team members' })
  list(@CurrentMerchant() user: { merchantId: string }) {
    return this.teamMembers.list(user.merchantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(':id/role')
  @ApiOperation({ summary: 'Update a team member role' })
  updateRole(
    @CurrentMerchant() user: { merchantId: string; role: Role },
    @Param('id', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamMembers.updateRole(user.merchantId, memberId, user.role, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a team member' })
  suspend(
    @CurrentMerchant() user: { merchantId: string; role: Role },
    @Param('id', ParseUUIDPipe) memberId: string,
  ) {
    return this.teamMembers.suspend(user.merchantId, memberId, user.role);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Delete(':id')
  @ApiOperation({ summary: 'Remove a team member (owner only)' })
  remove(
    @CurrentMerchant() user: { merchantId: string; role: Role },
    @Param('id', ParseUUIDPipe) memberId: string,
  ) {
    return this.teamMembers.remove(user.merchantId, memberId, user.role);
  }
}
