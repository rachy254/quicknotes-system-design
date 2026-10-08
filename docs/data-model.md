# QuickNotes Data Model

QuickNotes stores user accounts, their notes, reusable tags, and the associations between notes and tags. The SQL below uses SQLite-compatible types and syntax; a production database can use equivalent native types.

## Entities and columns

### `users`

| Column | Type | Keys and constraints |
| --- | --- | --- |
| `user_id` | `INTEGER` | Primary key |
| `email` | `TEXT` | Required and unique |
| `password_hash` | `TEXT` | Required; stores a password hash, never a plaintext password |
| `created_at` | `TEXT` | Required; creation timestamp |

### `notes`

| Column | Type | Keys and constraints |
| --- | --- | --- |
| `note_id` | `INTEGER` | Primary key |
| `user_id` | `INTEGER` | Required foreign key to `users.user_id` |
| `title` | `TEXT` | Required; 1-100 characters |
| `body` | `TEXT` | Required; defaults to an empty string |
| `created_at` | `TEXT` | Required; creation timestamp |
| `updated_at` | `TEXT` | Required; last-update timestamp |

### `tags`

| Column | Type | Keys and constraints |
| --- | --- | --- |
| `tag_id` | `INTEGER` | Primary key |
| `user_id` | `INTEGER` | Required foreign key to `users.user_id`; tags belong to their creator |
| `name` | `TEXT` | Required; unique per user |
| `created_at` | `TEXT` | Required; creation timestamp |

### `note_tags`

| Column | Type | Keys and constraints |
| --- | --- | --- |
| `note_id` | `INTEGER` | Required foreign key to `notes.note_id` |
| `tag_id` | `INTEGER` | Required foreign key to `tags.tag_id` |
| `created_at` | `TEXT` | Required; timestamp when the tag was applied |
| `(note_id, tag_id)` | — | Composite primary key; prevents duplicate association |

## Relationships

One user can own many notes, while each note belongs to one user: this is a one-to-many relationship through `notes.user_id`. One user can also own many tags, with each tag belonging to one user through `tags.user_id`.

Notes and tags have a many-to-many relationship: one note can have several tags, and one tag can label many notes. The `note_tags` join table represents each association and uses both foreign keys as its composite primary key. Its foreign keys also ensure that deleting a note or tag removes dependent associations.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
    note_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE tags (
    tag_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(note_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
);
```

## Example queries

List one user's notes, newest first:

```sql
SELECT note_id, title, body, created_at, updated_at
FROM notes
WHERE user_id = :user_id
ORDER BY updated_at DESC
LIMIT :limit;
```

Find notes with a given tag (JOIN across the association table):

```sql
SELECT n.note_id, n.title, n.body
FROM notes AS n
JOIN note_tags AS nt ON nt.note_id = n.note_id
JOIN tags AS t ON t.tag_id = nt.tag_id
WHERE n.user_id = :user_id
  AND t.name = :tag_name
ORDER BY n.updated_at DESC;
```

Count notes for each user, including users who do not yet have notes:

```sql
SELECT u.user_id, u.email, COUNT(n.note_id) AS note_count
FROM users AS u
LEFT JOIN notes AS n ON n.user_id = u.user_id
GROUP BY u.user_id, u.email
ORDER BY u.user_id;
```

Add a tag association only if the note and tag belong to the same user:

```sql
INSERT INTO note_tags (note_id, tag_id)
SELECT n.note_id, t.tag_id
FROM notes AS n
JOIN tags AS t ON t.user_id = n.user_id
WHERE n.note_id = :note_id
  AND t.tag_id = :tag_id;
```

## Index

```sql
CREATE INDEX idx_notes_user_updated
ON notes (user_id, updated_at DESC);
```

This composite index supports a user's common notes-list query, which filters by `user_id` and sorts by most recently updated. The primary keys, unique constraints, and composite key also create indexes used for identity and association lookups.

## SQL or NoSQL?

I would use a relational SQL database such as PostgreSQL. Notes, users, tags, and tag associations have clear relationships, and transactions, foreign keys, uniqueness constraints, and access-control queries help preserve ownership and data integrity. The expected read and write patterns are also well served by indexes and paginated SQL queries; a document store could work, but would make shared tag relationships and consistency more application-dependent.
