# Address on User Preferences — UI Integration Guide

## Model shape

`UserPreferences` (from `GET/POST/PUT /users/{userId}/preferences`) carries a single field for
address:

```json
{
  "userId": "...",
  "addressId": "3f1b2c3d-...-...",
  "chatSimilarityThreshold": 0.5,
  ...
}
```

`addressId` is **just a UUID**, not a nested object. `UserPreferences` never embeds the address's
own fields (`address`, `city`, `state`, `zip`) — you always fetch/edit those through the separate
`/addresses` endpoints below, using the id from `addressId`.

`addressId` is `null` until an address has been created and linked (see flow below).

The `Address` object itself:

```json
{
  "id": "3f1b2c3d-...-...",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "zip": "62701"
}
```

All four fields (`address`, `city`, `state`, `zip`) are optional strings — there's no required-field
validation, so any subset can be blank/omitted.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/addresses` | Create a new address |
| `GET` | `/addresses/{addressId}` | Read an address |
| `PUT` | `/addresses/{addressId}` | Update an address's fields |
| `DELETE` | `/addresses/{addressId}` | Delete an address |
| `PUT` | `/users/{userId}/preferences/{addressId}` | Link an existing address to a user's preferences |

Note there's no `POST`/body-based way to set `addressId` on preferences — linking is always through
the dedicated `PUT /users/{userId}/preferences/{addressId}` call, not the general
`PUT /users/{userId}/preferences` body.

## Important: an address is invisible until linked

`GET`/`PUT`/`DELETE /addresses/{addressId}` are all scoped to "addresses linked to *my own*
preferences." A freshly created address is **not yet linked to anyone**, so calling `GET
/addresses/{addressId}` on it before linking returns `404`, even though you just created it and
have its id.

This means: after `POST /addresses`, don't try to re-fetch the address by id — use the object the
`POST` response already gave you. Only link it (see flow below) before attempting any later
`GET`/`PUT`/`DELETE` on that id.

Once an address is linked to a user's preferences, `GET`/`PUT`/`DELETE /addresses/{addressId}` work
normally for that user. If a caller who is *not* linked to that address tries any of those three,
they also get `404` (never `403` — a linked-elsewhere address looks identical to a nonexistent one).

## Typical flows

### Setting an address for the first time

1. `POST /addresses` with the address fields the user typed in. Response is `201 Created` with the
   new `Address`, including its generated `id`.
2. `PUT /users/{userId}/preferences/{addressId}` (path param, using the id from step 1). Response is
   the updated `UserPreferences`, now with `addressId` set.

### Editing an existing address

The user's `addressId` is already known from `GET /users/{userId}/preferences`.

1. `PUT /addresses/{addressId}` with the full set of updated fields. Response is the updated
   `Address`.

There's no separate "unlink" step needed for an edit — you're editing the same linked address in
place.

### Removing an address entirely

1. `DELETE /addresses/{addressId}`. Response is `204 No Content`.
2. `UserPreferences.addressId` is automatically cleared (set to `null`) on the backend — you don't
   need to call `PUT /users/{userId}/preferences` to clear it. The next `GET
   /users/{userId}/preferences` will show `addressId: null`.

### Replacing an address with a different one

Either:
- `PUT /addresses/{addressId}` on the existing linked address with the new field values (simplest,
  same address record, same id), **or**
- `POST /addresses` to create a new one, then `PUT /users/{userId}/preferences/{newAddressId}` to
  re-link. The old address row is left behind, still in the database but no longer linked to
  anything — if that matters for your flow, `DELETE` the old one first.

## Errors to handle in the UI

| Status | When | 
|---|---|
| `404` | `GET`/`PUT`/`DELETE /addresses/{addressId}` for an address not linked to the current user (includes addresses that don't exist at all) |
| `404` | `PUT /users/{userId}/preferences/{addressId}` when `addressId` doesn't name an existing address |
| `403` | Any of the `/users/{userId}/...` endpoints when `{userId}` isn't the authenticated caller |

There is no `400` validation on the address fields themselves — the backend accepts any combination
of blank/missing `address`/`city`/`state`/`zip`, so client-side validation (if any) is purely a UX
choice, not something the API enforces.
