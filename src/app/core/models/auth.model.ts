export interface AuthUser {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
    role?: string;
}

export interface AuthTokenData {
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
    tokenType?: string;
}

export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data?: T | null;
}

export interface ApiErrorResponse {
    success: false;
    message?: string;
    error?: string;
    details?: Record<string, string>;
}

export interface LoginRequest {
    email: string;
    password: string;
    method: 'direct' | 'social';
}

export interface LoginResponse extends ApiResponse<{
    user: AuthUser;
    tokens: AuthTokenData;
}> { }

export interface RegisterRequest {
    fullName: string;
    email: string;
    phone: string;
    password: string;
}

export interface RegisterResponse extends ApiResponse<{
    user: AuthUser;
    requiresOtp?: boolean;
}> { }

export interface VerifyOtpRequest {
    phone: string;
    otp: string;
}

export interface VerifyOtpResponse extends ApiResponse<{
    user: AuthUser;
    tokens: AuthTokenData;
}> { }

export interface RefreshTokenRequest {
    refreshToken: string;
}

export interface RefreshTokenResponse extends ApiResponse<{
    user?: AuthUser;
    tokens: AuthTokenData;
}> { }

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
}
