import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { DATABASE_POOL } from '../database/database.module';
import { hashPassword, verifyPassword } from '../auth/password';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/roles.enum';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member.dto';

@Injectable()
export class TeamMembersService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auth: AuthService,
  ) {}

  async invite(merchantId: string, inviterRole: Role, dto: InviteMemberDto) {
    if (inviterRole === Role.DEVELOPER || inviterRole === Role.VIEWER) {
      throw new ForbiddenException('Only owners and admins can invite team members');
    }

    const existing = await this.pool.query(
      'SELECT id FROM team_members WHERE merchant_id=$1 AND email=$2',
      [merchantId, dto.email],
    );
    if (existing.rowCount) throw new ConflictException('A member with this email already exists');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { rows } = await this.pool.query(
      `INSERT INTO team_members (merchant_id, email, name, role, status, invite_token_hash, invite_expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING id, email, name, role, status, created_at`,
      [merchantId, dto.email, dto.name, dto.role, tokenHash, expiresAt],
    );

    return { member: rows[0], inviteToken: rawToken };
  }

  async acceptInvite(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { rows } = await this.pool.query(
      `SELECT id, merchant_id, email, role, status, invite_expires_at
         FROM team_members
        WHERE invite_token_hash=$1`,
      [tokenHash],
    );

    const member = rows[0];
    if (!member) throw new NotFoundException('Invalid or expired invite token');
    if (member.status !== 'pending') throw new BadRequestException('Invite already accepted');
    if (new Date(member.invite_expires_at) < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }

    const passwordHash = await hashPassword(password);
    await this.pool.query(
      `UPDATE team_members
          SET password_hash=$2, status='active', invite_token_hash=NULL, invite_expires_at=NULL, updated_at=NOW()
        WHERE id=$1`,
      [member.id, passwordHash],
    );

    return { message: 'Invite accepted. You can now log in.' };
  }

  async login(email: string, password: string) {
    const { rows } = await this.pool.query(
      `SELECT tm.id, tm.email, tm.name, tm.role, tm.status, tm.password_hash, tm.merchant_id, m.tier
         FROM team_members tm
         JOIN merchants m ON m.id = tm.merchant_id
        WHERE tm.email=$1`,
      [email],
    );

    const member = rows[0];
    if (!member || !(await verifyPassword(password, member.password_hash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (member.status === 'suspended') throw new ForbiddenException('Account suspended');
    if (member.status === 'pending') throw new ForbiddenException('Invite not yet accepted');

    await this.pool.query(
      'UPDATE team_members SET last_login_at=NOW(), updated_at=NOW() WHERE id=$1',
      [member.id],
    );

    const accessToken = await this.auth.signTeamMemberAccess({
      id: member.id,
      email: member.email,
      role: member.role,
      merchantId: member.merchant_id,
      tier: member.tier,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        role: member.role,
        merchantId: member.merchant_id,
      },
    };
  }

  async list(merchantId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, email, name, role, status, last_login_at, created_at
         FROM team_members
        WHERE merchant_id=$1
        ORDER BY created_at DESC`,
      [merchantId],
    );
    return rows;
  }

  async updateRole(merchantId: string, memberId: string, requesterRole: Role, dto: UpdateMemberRoleDto) {
    if (requesterRole === Role.DEVELOPER || requesterRole === Role.VIEWER) {
      throw new ForbiddenException('Only owners and admins can change roles');
    }

    const { rows } = await this.pool.query(
      'SELECT id, role FROM team_members WHERE id=$1 AND merchant_id=$2',
      [memberId, merchantId],
    );
    if (!rows[0]) throw new NotFoundException('Team member not found');

    await this.pool.query(
      'UPDATE team_members SET role=$2, updated_at=NOW() WHERE id=$1',
      [memberId, dto.role],
    );

    return { id: memberId, role: dto.role };
  }

  async suspend(merchantId: string, memberId: string, requesterRole: Role) {
    if (requesterRole === Role.DEVELOPER || requesterRole === Role.VIEWER) {
      throw new ForbiddenException('Only owners and admins can suspend members');
    }

    const { rowCount } = await this.pool.query(
      `UPDATE team_members SET status='suspended', updated_at=NOW()
        WHERE id=$1 AND merchant_id=$2`,
      [memberId, merchantId],
    );
    if (!rowCount) throw new NotFoundException('Team member not found');

    return { id: memberId, status: 'suspended' };
  }

  async remove(merchantId: string, memberId: string, requesterRole: Role) {
    if (requesterRole !== Role.OWNER) {
      throw new ForbiddenException('Only owners can remove team members');
    }

    const { rowCount } = await this.pool.query(
      'DELETE FROM team_members WHERE id=$1 AND merchant_id=$2',
      [memberId, merchantId],
    );
    if (!rowCount) throw new NotFoundException('Team member not found');

    return { id: memberId, removed: true };
  }
}
