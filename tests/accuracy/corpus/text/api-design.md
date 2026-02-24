# REST API Design Best Practices

A well-designed REST API uses standard HTTP methods, meaningful resource URLs, and consistent status codes to create a predictable interface for clients.

## Resource Naming

Use nouns for resource endpoints, not verbs. Resources should be plural and hierarchical:

- `GET /users` — list all users
- `GET /users/123` — get a specific user
- `POST /users` — create a new user
- `PUT /users/123` — update a user
- `DELETE /users/123` — remove a user

Nested resources represent relationships: `GET /users/123/orders` returns orders for user 123.

## HTTP Status Codes

Use standard status codes to communicate the result of each request:

- **200 OK** — successful GET, PUT, or PATCH request
- **201 Created** — successful POST that created a new resource
- **204 No Content** — successful DELETE with no response body
- **400 Bad Request** — client sent invalid data (missing fields, wrong format)
- **401 Unauthorized** — missing or invalid authentication credentials
- **403 Forbidden** — valid credentials but insufficient permissions
- **404 Not Found** — the requested resource does not exist
- **409 Conflict** — request conflicts with current state (duplicate email)
- **422 Unprocessable Entity** — syntactically valid but semantically wrong
- **429 Too Many Requests** — rate limit exceeded
- **500 Internal Server Error** — unexpected server failure

## Error Handling

Return consistent error response bodies with a machine-readable code and human-readable message:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is required",
    "field": "email"
  }
}
```

## Pagination

For list endpoints returning many results, use cursor-based or offset pagination:

- `GET /users?limit=20&offset=40` — offset-based
- `GET /users?limit=20&after=abc123` — cursor-based (preferred for large datasets)

Include pagination metadata in the response: total count, next/previous links.

## Versioning

Version your API to allow breaking changes without disrupting existing clients. Use URL path versioning (`/v1/users`) or header-based versioning (`Accept: application/vnd.api.v1+json`).
