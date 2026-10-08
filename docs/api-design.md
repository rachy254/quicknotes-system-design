# QuickNotes REST API Design

This document describes the production QuickNotes API, not the JSONPlaceholder practice service used by the browser client. All endpoints use the `/api/v1` base path, JSON request and response bodies, and authenticated user identity from a bearer token. A user's notes are private to that user unless explicitly shared in a future version.

## Endpoints

| Method | Path | Description | Success status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/notes` | List the authenticated user's notes, newest first; accepts optional `limit` and `cursor` query parameters. | `200 OK` |
| `GET` | `/api/v1/notes/{noteId}` | Retrieve one note owned by the authenticated user. | `200 OK` |
| `POST` | `/api/v1/notes` | Create a note owned by the authenticated user. | `201 Created` |
| `PATCH` | `/api/v1/notes/{noteId}` | Update one or more fields of a note owned by the authenticated user. | `200 OK` |
| `DELETE` | `/api/v1/notes/{noteId}` | Delete a note owned by the authenticated user. | `204 No Content` |
| `GET` | `/api/v1/notes?tag={tagName}` | List the authenticated user's notes that have the specified tag. | `200 OK` |
| `PUT` | `/api/v1/notes/{noteId}/tags/{tagId}` | Add an existing tag owned by the user to a note. | `204 No Content` |
| `DELETE` | `/api/v1/notes/{noteId}/tags/{tagId}` | Remove a tag association from a note without deleting the tag. | `204 No Content` |

List endpoints are paginated and return a `nextCursor` that is `null` when there are no more results. IDs are opaque to clients even if the implementation uses numeric keys.

## Create a note

Request:

```http
POST /api/v1/notes
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "title": "Ideas for the launch",
  "body": "Prepare a short checklist for release day."
}
```

Response: `201 Created`

```http
Location: /api/v1/notes/note_8f31
```

```json
{
  "id": "note_8f31",
  "title": "Ideas for the launch",
  "body": "Prepare a short checklist for release day.",
  "createdAt": "2026-10-08T12:00:00Z",
  "updatedAt": "2026-10-08T12:00:00Z"
}
```

The server derives the note owner from the authenticated identity; clients cannot set `userId` in the create body.

## List notes

Request:

```http
GET /api/v1/notes?limit=20
Authorization: Bearer <access-token>
```

Response: `200 OK`

```json
{
  "items": [
    {
      "id": "note_8f31",
      "title": "Ideas for the launch",
      "body": "Prepare a short checklist for release day.",
      "createdAt": "2026-10-08T12:00:00Z",
      "updatedAt": "2026-10-08T12:00:00Z"
    }
  ],
  "nextCursor": null
}
```

## Error status codes

Errors use a consistent JSON body with a machine-readable code, a safe human-readable message, and an optional field for validation details.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": [
      {
        "field": "title",
        "message": "Title is required and must be 1 to 100 characters."
      }
    ]
  }
}
```

- **`400 Bad Request`**: The note body is malformed or fails validation, such as a missing title or a title longer than 100 characters.
- **`401 Unauthorized`**: The request has no valid access token, such as an expired token.
- **`403 Forbidden`**: The caller is authenticated but attempts an action they are not permitted to perform, such as accessing a shared resource without the required role.
- **`404 Not Found`**: The note does not exist or is not available to the current user; do not reveal another user's private note.
- **`500 Internal Server Error`**: An unexpected server failure occurs; the response must not expose stack traces or secrets.
