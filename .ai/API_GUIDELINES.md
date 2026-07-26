# API Guidelines

JWT Authentication.

Bearer Token.

Refresh Token.

HttpInterceptor.

Environment URLs.

DTOs.

Interfaces.

Error Handling.

Loading States.

Retry Logic.

Never call HttpClient directly from Components.

Always use Services.

All APIs should return typed responses.

Centralise error handling.

Support future API versioning.
# Real-Time Communication

The application uses WebSockets for real-time updates.

Rules:

- Create a dedicated WebSocketService.
- Encapsulate all WebSocket connection logic within the service.
- Do not open WebSocket connections directly in components.
- Expose strongly typed streams or signals from the service.
- Handle reconnection and cleanup within the service.
- Components should only subscribe to or consume the service's exposed API.