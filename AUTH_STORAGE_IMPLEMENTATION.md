# Authentication Storage Implementation

## Summary
The authentication system has been updated to properly handle the login response from the backend and persist tokens and user data for the auth guard to work correctly.

## Changes Made

### 1. Updated `AuthUser` Model
**File**: `src/app/core/models/auth.model.ts`

Updated the `AuthUser` interface to match the actual backend response structure:
```typescript
export interface AuthUser {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    email_verified: boolean;
    phone: string;
    phone_verified: boolean;
    is_active: boolean;
    is_deleted: boolean;
    created_on: string;
    role?: string;
}
```

### 2. Updated Response Interfaces
**File**: `src/app/core/models/auth.model.ts`

Created new payload interfaces and updated response types to handle the snake_case tokens from backend:

- `LoginPayload` - Contains `access_token`, `refresh_token`, and `user`
- `LoginResponse` - Updated to use `LoginPayload`
- `RegisterPayload` - Handles optional tokens during registration
- `VerifyOtpPayload` - Contains `access_token`, `refresh_token`, and `user`
- `RefreshTokenPayload` - Contains refreshed tokens and optional user

### 3. Updated `AuthService` Methods
**File**: `src/app/core/services/auth.service.ts`

#### `persistSessionFromResponse()`
Enhanced to handle both old (nested `tokens` object) and new (direct `access_token`/`refresh_token`) response formats:
```typescript
- Checks for direct tokens in payload (access_token, refresh_token)
- Checks for tokens object (legacy format)
- Normalizes tokens to camelCase format
- Stores tokens and user data via StorageService
- Updates signals (currentUser, isAuthenticated)
```

#### `register()`
Updated to parse registration response and handle both token formats

#### `refreshToken()`
Enhanced to handle new refresh token response format with direct token fields

## Storage Flow

### When User Logs In:
1. **Backend Response** arrives with:
   ```json
   {
     "success": true,
     "data": {
       "access_token": "...",
       "refresh_token": "...",
       "user": { ... }
     }
   }
   ```

2. **AuthService.login()** receives response and:
   - Calls `persistSessionFromResponse()`
   - Normalizes snake_case tokens to camelCase
   - Stores via `StorageService.setSession()`

3. **StorageService** persists to localStorage:
   - `auth-access-token` → access token string
   - `auth-refresh-token` → refresh token string
   - `auth-user` → full user object

4. **AuthService** updates signals:
   - `isAuthenticated` = true
   - `currentUser` = user object

### When Routes Are Protected:
1. **authGuard** checks `AuthService.isAuthenticated()` signal
2. If true → route access allowed
3. If false → redirects to `/login`

### When Making API Requests:
1. **authInterceptor** gets access token from storage
2. Adds `Authorization: Bearer <token>` header
3. On 401 response:
   - Calls `AuthService.refreshToken()`
   - Stores new tokens
   - Retries request with new token

### When User Logs Out:
1. **AuthService.logout()** calls backend logout API
2. **StorageService.clearSession()** removes:
   - Access token
   - Refresh token
   - User data
3. Signals are reset:
   - `isAuthenticated` = false
   - `currentUser` = null

## Key Features

✅ **Token Persistence**: Access and refresh tokens stored in localStorage  
✅ **User Data Persistence**: Complete user object stored for quick access  
✅ **Route Protection**: Auth guard checks authentication state from storage  
✅ **Token Refresh**: Automatic token refresh on 401 responses  
✅ **Session Management**: Proper cleanup on logout  
✅ **Format Compatibility**: Handles both snake_case (backend) and camelCase (frontend)  
✅ **Signal-Based State**: Reactive authentication state for UI updates  

## Testing the Implementation

### Manual Test Flow:
1. Navigate to login page
2. Submit credentials with email/password
3. Backend returns login response with tokens and user data
4. Frontend redirects to dashboard
5. Check localStorage in DevTools:
   - `auth-access-token` contains JWT
   - `auth-refresh-token` contains JWT
   - `auth-user` contains user object
6. Protected routes should be accessible
7. Logout clears all stored data

## API Endpoints Used

- `POST /auth/login` - Login with email/password
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and invalidate tokens
- Protected routes - Include `Authorization: Bearer <token>` header

