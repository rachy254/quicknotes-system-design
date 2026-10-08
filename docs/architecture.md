# QuickNotes Architecture

## Functional requirements

- Users can sign in and only read or change notes they own.
- Users can list notes with pagination, view a note, create a note, update a note, and delete a note.
- Users can organize notes with tags and find notes by tag.
- The service validates note titles, supports an optional body, and returns useful success and error responses.

## Non-functional requirements

- Keep note data durable and private; encrypt network traffic and stored data, and never store plaintext passwords.
- Provide responsive note-list and write operations under normal load and scale app capacity horizontally.
- Avoid a single machine or availability zone becoming a single point of failure; monitor health, latency, errors, and background jobs.
- Support backups and tested recovery, and make API behavior observable enough to diagnose failed requests.
- Use pagination and limits to bound database work and response size.

## Load estimate for 1 million registered users

The supplied user count does not specify usage, so these are explicit planning assumptions:

- **Daily active users:** assume 10% are active each day: `1,000,000 × 0.10 = 100,000 DAU`.
- **Reads:** assume each active user opens their notes list 20 times/day: `100,000 × 20 = 2,000,000 reads/day`; average `2,000,000 ÷ 86,400 ≈ 23 reads/second`.
- **Writes:** assume each active user creates or updates 2 notes/day: `100,000 × 2 = 200,000 writes/day`; average `200,000 ÷ 86,400 ≈ 2.3 writes/second`.
- **Peak planning rate:** using a 5× peak-to-average factor gives about **116 reads/second** and **12 writes/second**.
- **Storage:** assume each saved note, including its title, body, and basic row metadata, averages 2 KB and notes are retained for a year: `200,000 notes/day × 2 KB × 365 = 146,000,000 KB`, or about **146 GB/year** of raw note data using decimal units.

These are baseline estimates, not measured traffic. They exclude indexes, replicas, backups, logs, attachments, and growth beyond the assumed activity. The service is read-heavy under these assumptions (about 10 reads per write), so caching and read scaling deserve attention while writes stay durable on the primary.

## Architecture diagram

```text
                             ┌───────────────────────┐
                             │ Client: web / mobile  │
                             └─────┬──────────┬──────┘
                                   │          │
                       DNS lookup  │          │ HTTPS requests
                                   ▼          ▼
                            ┌───────────┐  ┌─────────────────────────┐
                            │    DNS    │  │ CDN (static web assets) │
                            └─────┬─────┘  └────────────┬────────────┘
                                  └─────────┬───────────┘
                                            ▼
                                  ┌───────────────────┐
                                  │ Load balancers    │
                                  │ (redundant pair)  │
                                  └──────┬──────┬─────┘
                                         │      │
                              ┌──────────▼┐    ┌▼───────────┐
                              │ App server│    │ App server │
                              │   A       │    │   B        │
                              └───┬───┬───┘    └──┬───┬────┘
                                  │   │           │   │
                             ┌────▼───▼───────────▼───▼────┐
                             │ Shared, replicated cache    │
                             └──────────────┬───────────────┘
                                            │ cache miss/write
                                            ▼
                                  ┌────────────────────┐
                                  │ Primary database   │
                                  └──────────┬─────────┘
                                             │ replication
                                             ▼
                                  ┌────────────────────┐
                                  │ Read replica       │
                                  └────────────────────┘

                 app servers ─────► replicated job queue
                                           │
                                           ▼
                                    ┌────────────┐
                                    │ Worker pool│
                                    └─────┬──────┘
                                          └──► email, audit, or maintenance jobs
```

## Component responsibilities

- **Client:** Provides the note editor and sends authenticated HTTPS requests without being trusted to enforce ownership or validation.
- **DNS:** Resolves the service hostname to the edge entry point and supports routing changes during failover.
- **CDN:** Delivers versioned static app assets from nearby edge locations, reducing origin traffic and page-load time; private note API responses are not placed in a shared public cache.
- **Load balancers:** Health-check app instances and distribute traffic across multiple zones so an unhealthy instance is removed from service.
- **App servers A and B:** Run the stateless API, authenticate and authorize requests, validate inputs, and scale horizontally behind the load balancers.
- **Shared replicated cache:** Speeds up hot, user-scoped note-list reads and reduces repeated database queries while allowing failover between cache nodes.
- **Primary database:** Stores authoritative users, notes, tags, and associations and handles transactional writes and ownership checks.
- **Read replica:** Handles eligible read queries to offload the primary, with read-your-writes requests routed to the primary to avoid replication-lag surprises.
- **Replicated job queue:** Buffers non-critical asynchronous work so brief worker slowdowns do not block note requests or lose jobs.
- **Worker pool:** Processes queued email, audit, and maintenance tasks independently from interactive API traffic and retries transient failures.

## `GET /api/v1/notes` flow

1. The client resolves the API hostname using DNS and sends an HTTPS request with its access token.
2. The CDN serves only eligible static assets; the private API request passes to the load balancer, which selects a healthy app server.
3. The app server validates the token and extracts the user ID, then checks the cache using a key scoped to that user and the requested pagination parameters.
4. On a cache hit, the app returns that user's cached page; on a miss, it queries the read replica for the authenticated user's notes, unless consistency requires a primary read.
5. The app returns a bounded, paginated JSON response and may cache the result briefly; authorization is applied on every request, not inferred from a cache key supplied by the client.

## `POST /api/v1/notes` flow

1. The client sends an authenticated HTTPS `POST` with a JSON title and optional body through DNS, the CDN edge, and the load balancer to a healthy app server.
2. The app server authenticates the user, validates the title length and body, and derives the owner ID from the token rather than from client-supplied ownership fields.
3. The app inserts the note in a transaction on the primary database and obtains its ID and timestamps.
4. After the transaction commits, the app invalidates or versions the user's affected cached note lists and enqueues any non-critical follow-up work.
5. The app returns `201 Created`, a `Location` header, and the created note; the client can then display it without waiting for the background worker.

## Trade-offs and availability

- **Cache speed vs. freshness:** Caching reduces read latency and database load, but stale notes can briefly appear after an update; use short expirations plus write-through invalidation/versioning, and route read-after-write requests to the primary.
- **Read replica scale vs. consistency:** Replicas add read capacity, but asynchronous replication introduces lag; send writes and consistency-sensitive reads to the primary and accept replica reads only for operations where brief staleness is acceptable.
- **Asynchronous work vs. immediate completion:** A queue keeps email and audit work out of the interactive request path, but jobs are not immediate and can fail; make jobs idempotent, retry transient errors, and alert on a growing dead-letter queue.
- **Horizontal scale vs. operational complexity:** Multiple zones and replicas improve availability, but require health checks, failover procedures, monitoring, and testing rather than assuming redundancy alone guarantees recovery.

No single host should be the only route into the service: use redundant DNS/edge and load-balancer capacity, at least two app servers across failure zones, replicated cache and queue services, and a managed primary/replica database with backups and tested promotion. The replica improves read capacity and may support failover, but it is not a backup; independent backups and a tested restore process are also required.
