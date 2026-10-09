export type PermissionStatus = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT'

export function effectivePermission(status: PermissionStatus | null | undefined): PermissionStatus {
  return status ?? 'UNKNOWN'
}

export function matchesPermissionFilter(status: PermissionStatus | null | undefined, filter: PermissionStatus): boolean {
  return effectivePermission(status) === filter
}
