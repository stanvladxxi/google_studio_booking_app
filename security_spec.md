# Hearthline Kitchen Security Specification

## 1. Data Invariants
1. A `booking` cannot exist without a valid `spaceId` in `/spaces/{spaceId}`, valid `ownerId == request.auth.uid`, and an atomic `/availabilitySlots/{bookingId}` document.
2. Once a `booking` reaches a terminal state (`completed` or `cancelled`), non-admin users cannot mutate it.
3. `UserProfile` documents contain PII (`email`) and are strictly readable only by the document owner or an admin. Self-assigned `role: 'admin'` on creation is rejected.
4. `StaffMember` documents exclude PII (`email`, `phone`) so staff rosters can be safely queried by authenticated chefs for duty assignment without leaking personal contact data.
5. `SessionLogEntry` documents in `/logs` are append-only for non-admin users (`createdAt == request.time`, no client updates/deletes).
6. All `allow list` queries evaluate `resource.data` directly without `get()` or `exists()` calls to prevent read amplification.
7. Every write operation requires `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Booking**: `create /bookings/b1` where `email_verified: false` -> `PERMISSION_DENIED`.
2. **Owner Spoofing**: `create /bookings/b1` with `ownerId: "other_uid"` -> `PERMISSION_DENIED`.
3. **Privilege Escalation**: `create /users/u1` with `role: "admin"` by non-admin -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: `create /rawMaterials/m1` with extra `isApproved: true` -> `PERMISSION_DENIED`.
5. **Orphan Booking**: `create /bookings/b1` referencing non-existent `spaceId: "fake_space"` -> `PERMISSION_DENIED`.
6. **Post-Terminal Mutation**: `update /bookings/b1` (currently `status: "completed"`) by owner -> `PERMISSION_DENIED`.
7. **Timestamp Forgery**: `create /logs/l1` with `createdAt: Timestamp(2020-01-01)` instead of `request.time` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: `create /recipes/invalid$id_with_150_chars...` -> `PERMISSION_DENIED`.
9. **Resource Exhaustion**: `create /recipes/r1` with `tastingNotes` of 5,000 chars (> 1,000 limit) -> `PERMISSION_DENIED`.
10. **PII Cross-Read**: `get /users/other_uid` by non-admin user -> `PERMISSION_DENIED`.
11. **Log Tampering**: `update /logs/l1` by non-admin owner to alter `message` -> `PERMISSION_DENIED`.
12. **Blanket Query Scraping**: `list /bookings` without `where('ownerId', '==', auth.uid)` by non-admin -> `PERMISSION_DENIED`.
