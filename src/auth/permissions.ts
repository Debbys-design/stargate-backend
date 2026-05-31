import { Role } from './roles.enum';

export type Permission =
  | 'team:read'
  | 'team:manage'
  | 'settings:manage'
  | 'billing:manage'
  | 'api_keys:read'
  | 'api_keys:manage'
  | 'webhooks:read'
  | 'webhooks:manage'
  | 'invoices:read'
  | 'invoices:manage'
  | 'payments:read'
  | 'reports:read'
  | 'compliance:read';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [
    'team:read',
    'team:manage',
    'settings:manage',
    'billing:manage',
    'api_keys:read',
    'api_keys:manage',
    'webhooks:read',
    'webhooks:manage',
    'invoices:read',
    'invoices:manage',
    'payments:read',
    'reports:read',
    'compliance:read',
  ],
  [Role.ADMIN]: [
    'team:read',
    'team:manage',
    'settings:manage',
    'api_keys:read',
    'api_keys:manage',
    'webhooks:read',
    'webhooks:manage',
    'invoices:read',
    'invoices:manage',
    'payments:read',
    'reports:read',
    'compliance:read',
  ],
  [Role.DEVELOPER]: [
    'api_keys:read',
    'api_keys:manage',
    'webhooks:read',
    'webhooks:manage',
    'invoices:read',
    'invoices:manage',
    'payments:read',
    'reports:read',
  ],
  [Role.VIEWER]: [
    'invoices:read',
    'payments:read',
    'reports:read',
    'webhooks:read',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
