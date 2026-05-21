# Firestore Security Specification

## Data Invariants
1. A user can only write to their own profile (`/users/{uid}`).
2. Sensitive fields like `isBanned`, `isMuted`, `membership`, `role`, and `isVip` can only be modified by an Admin.
3. Users can only read their own private info (`/users/{uid}/private/info`).
4. Messages in a room can be read by anyone signed in and verified.
5. Messages can only be created by signed-in and verified users, and they must represent themselves.

## The Dirty Dozen Payloads

1. **Self-Promotion Attack**: User attempts to set `isVip: true` on their own profile.
2. **Identity Theft**: User A attempts to write to `/users/userB`.
3. **Ghost Message**: User A attempts to send a message to `/rooms/lobby/messages/msg1` with `uid: userB`.
4. **Banned User Write**: A user with `isBanned: true` attempts to send a message.
5. **PII Leak**: User A attempts to read `/users/userB/private/info`.
6. **Shadow Field Injection**: User attempts to add a hidden `isAdmin: true` field to their profile.
7. **Timestamp Spoofing**: User attempts to set `createdAt` to a date in the future.
8. **Admin Impersonation**: User attempts to write to `/admins/{uid}` (if it existed, or create it).
9. **Role Escalation**: User attempts to set `membership: 'famous'` via a profile update.
10. **ID Poisoning**: User attempts to create a document with a 2KB long string as an ID.
11. **Muted User Bypass**: A user with `isMuted: true` attempts to send a message to Firestore archive.
12. **Malicious Enum**: User attempts to set `membership: 'super_admin'` which is not in the enum.

## Test Runner (Conceptual)
The `firestore.rules` will be verified against these scenarios.
