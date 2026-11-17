/**
 * Phase 0 Security Test Specification for XəzərStream Firestore Rules.
 * Verifies all "Dirty Dozen" attack payloads against the Eight Pillars constraints.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  reason: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated subscription write',
    collection: 'subscriptions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'isVerified() rejects null request.auth',
  },
  {
    id: 2,
    name: 'Cross-user PII profile read',
    collection: 'users',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    reason: 'isOwner(userId) || isAdmin() blocks third-party profile reads',
  },
  {
    id: 3,
    name: 'Self-activation bypass on subscription create',
    collection: 'subscriptions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: "incoming().status == 'pending' prevents creating pre-activated accounts",
  },
  {
    id: 4,
    name: 'Ghost field privilege escalation (isAdmin: true)',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'data.keys().hasOnly(...) rejects arbitrary fields',
  },
  {
    id: 5,
    name: 'Non-admin activating pending subscription',
    collection: 'subscriptions',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    reason: 'Subscription update requires isAdmin()',
  },
  {
    id: 6,
    name: 'Payment identity spoofing',
    collection: 'payments',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'incoming().userId == request.auth.uid enforces owner binding',
  },
  {
    id: 7,
    name: 'Client-forged createdAt timestamp',
    collection: 'subscriptions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'incoming().createdAt == request.time rejects backdated timestamps',
  },
  {
    id: 8,
    name: 'Unverified email token write',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'request.auth.token.email_verified == true blocks unverified accounts',
  },
  {
    id: 9,
    name: 'Oversized document ID poisoning (>128 chars)',
    collection: 'subscriptions',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    reason: 'isValidId(subscriptionId) enforces length <= 128 and regex',
  },
  {
    id: 10,
    name: 'Blanket list query by non-admin',
    collection: 'subscriptions',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    reason: 'allow list requires resource.data.userId == request.auth.uid',
  },
  {
    id: 11,
    name: 'Non-admin modifying terminal rejected state',
    collection: 'subscriptions',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    reason: 'Only isAdmin() can transition subscription status',
  },
  {
    id: 12,
    name: 'Cross-user payment deletion',
    collection: 'payments',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    reason: 'allow delete requires isAdmin()',
  },
];
