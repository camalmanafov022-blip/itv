# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Owner-Isolated PII**: A `users/{userId}` document contains personal contact data (`email`, `phone`) and can ONLY be read or written by the matching authenticated `userId` (`request.auth.uid == userId`) or a verified Admin.
2. **No Self-Activation**: A user creating a `subscriptions/{subscriptionId}` document MUST set `status == 'pending'`. Users CANNOT create an already `'active'` subscription or update `status` to `'active'`. Only a verified Admin can approve (`'active'`), reject (`'rejected'`), or mark `'expired'`.
3. **Atomic Payment Linking**: Every subscription creation must reference a `paymentId` created in the same batch or existing in `/payments/{paymentId}` belonging to the same `userId`.
4. **Strict Immutability**: `userId`, `id`, `createdAt`, `xtreamUsername`, and `paymentId` cannot be altered after creation.
5. **Email Verification Gate**: All authenticated writes require `request.auth.token.email_verified == true`.
6. **Zero Ghost Fields & Bounded Strings**: Every document enforces `hasAll` + `hasOnly` and explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Attack Payloads
1. Unauthenticated write to `/subscriptions/sub1` -> `PERMISSION_DENIED`
2. Cross-user profile read `/users/otherUid` -> `PERMISSION_DENIED`
3. Self-approval on create: `/subscriptions/sub1` with `status: 'active'` by non-admin -> `PERMISSION_DENIED`
4. Privilege escalation / ghost field `isAdmin: true` in `/users/myUid` -> `PERMISSION_DENIED`
5. Non-admin updating `/subscriptions/sub1` from `pending` to `active` -> `PERMISSION_DENIED`
6. Identity spoofing: `/payments/pay1` with `userId: 'victimUid'` -> `PERMISSION_DENIED`
7. Client-forged timestamp (`createdAt` != `request.time`) -> `PERMISSION_DENIED`
8. Unverified email token (`email_verified: false`) writing `/users/myUid` -> `PERMISSION_DENIED`
9. Oversized ID string (>128 chars) on `/subscriptions/{id}` -> `PERMISSION_DENIED`
10. Blanket list query on `/subscriptions` by non-admin without `userId == request.auth.uid` -> `PERMISSION_DENIED`
11. Modifying terminal/rejected subscription state by non-admin -> `PERMISSION_DENIED`
12. Deleting another user's payment or subscription -> `PERMISSION_DENIED`
