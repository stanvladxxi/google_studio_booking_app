# Hearthline Kitchen (Chef at Work) Security Specification

## 1. Data Invariants
1. A `booking` cannot exist without a valid `spaceId` in `/spaces/{spaceId}`, valid `ownerId == request.auth.uid`, and an atomic `/availabilitySlots/{bookingId}` document. Booking creation (`bookings`, `availabilitySlots`, `bookingQueue`) is restricted to `member`, `recipe_dev`, and `admin` roles.
2. Once a `booking` reaches a terminal state (`completed` or `cancelled`), non-admin users cannot mutate it.
3. `UserProfile` documents contain PII (`email`) and are strictly readable only by the document owner or an admin. Self-assigned roles other than `'member'` on creation are rejected; only verified admins can assign roles (`member`, `recipe_dev`, `kitchen_manager`, `kitchen_worker`, `aggregator`, `admin`) via `users/{uid}.role`.
4. `StaffMember` documents exclude PII (`email`, `phone`) so staff rosters can be safely queried by authenticated staff and managers without leaking personal contact data.
5. `SessionLogEntry` documents in `/logs` are append-only for non-admin users (`createdAt == request.time`, no client updates/deletes).
6. `recipes`, `products`, `recipeVersions`, and `experiments` (R&D formulation history) strictly deny all read (`get` and `list`) and write access to `aggregator` and `kitchen_worker` roles; `kitchen_manager` has read-only access to them.
7. `recipeVersions` are strictly immutable after creation for formulation fields (`ingredients`, `batchSize`, `expectedYield`, `method`, `equipment`, `expectedCost`, `markupPct`, `suggestedPriceKwd`, `nutritionPer100g`, `allergens`, `additives`): only `actualOutcome`, `validationStatus`, `bakeTest`, `score`, `scoreNotes`, and `updatedAt` may be updated, and deletes are always denied (`allow delete: if false`). Creating a `recipeVersion` enforces atomic existence of its parent `products/{productId}` via `existsAfter(...)`.
8. `kitchen_manager` can manage operational kitchen settings (`spaces`, `equipment`, `staff`), `materialOrders`, `ingredientLibrary` stock/pricing, and facility logs/batches/materials/duties without gaining user role administration (`users/{uid}.role`) or booking privileges.
9. Every write operation requires `request.auth.token.email_verified == true`.
10. `UserProfile` optional En Cuisine preference fields (`businessType`, `discoverInterests`, `newsletterSubscribed`, `newsletterTopics`, `followedInfluencerIds`, `preferredDir`) may be updated by the profile owner without mutating `role`, `loyaltyPoints`, or `totalHoursBooked`.
11. `enCuisineItems` allows signed-in reads of active catalog items (`isActive == true` or owner/admin); verified users can submit new brand spotlights (`sectionType == 'brand'`, `badgeType == 'none'`), while admin-only controls apply to featured/sponsored placement flags and general catalog edits/deletes.
12. `enCuisineIngredientLinks` and `enCuisineAnalytics` enforce `ownerId == request.auth.uid` on creation with server timestamp integrity; `enCuisineAnalytics` is append-only (`update`/`delete` denied) and readable only by owners or admins.
13. `ingredientLibrary` persists custom ingredients, per-owner pricing/nutrition/wastage overrides, and stock ledger history (`<= 30` entries); `aggregator` is denied access, while `kitchen_worker` cannot mutate ingredient definitions/pricing (`write` restricted to verified owners excluding `aggregator` and `kitchen_worker`, or `kitchen_manager` / `admin`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Booking**: `create /bookings/b1` where `email_verified: false` -> `PERMISSION_DENIED`.
2. **Owner Spoofing**: `create /bookings/b1` with `ownerId: "other_uid"` -> `PERMISSION_DENIED`.
3. **Privilege Escalation**: `create /users/u1` with `role: "admin"` or `update /users/u1` changing `role` by non-admin -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: `create /rawMaterials/m1` with extra `isApproved: true` -> `PERMISSION_DENIED`.
5. **Orphan Booking**: `create /bookings/b1` referencing non-existent `spaceId: "fake_space"` -> `PERMISSION_DENIED`.
6. **Post-Terminal Mutation**: `update /bookings/b1` (currently `status: "completed"`) by owner -> `PERMISSION_DENIED`.
7. **Timestamp Forgery**: `create /logs/l1` with `createdAt: Timestamp(2020-01-01)` instead of `request.time` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: `create /recipes/invalid$id_with_150_chars...` -> `PERMISSION_DENIED`.
9. **Resource Exhaustion**: `create /recipes/r1` with `tastingNotes` of 5,000 chars (> 1,000 limit) -> `PERMISSION_DENIED`.
10. **PII Cross-Read**: `get /users/other_uid` by non-admin user -> `PERMISSION_DENIED`.
11. **Disallowed Role Booking**: `create /bookings/b1` (or `availabilitySlots` / `bookingQueue`) by `kitchen_worker`, `kitchen_manager`, or `aggregator` -> `PERMISSION_DENIED`.
12. **R&D Recipe & Version Tampering**: `get /recipes/r1` or `list /recipeVersions` by `aggregator`/`kitchen_worker`, OR `update /recipeVersions/v1` modifying `ingredients` or `method`, OR `delete /recipeVersions/v1` -> `PERMISSION_DENIED`.
13. **En Cuisine Sponsored Placement Spoofing**: `create /enCuisineItems/item1` by non-admin with `sectionType: "equipment", badgeType: "sponsored"` -> `PERMISSION_DENIED`.
14. **Ingredient Library Cross-Tenant / Role Violation**: `write /ingredientLibrary/doc1` by `aggregator` or `kitchen_worker`, or `update` spoofing `ownerId` -> `PERMISSION_DENIED`.

