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

export interface AuthTokenData {
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
    tokenType?: string;
}

export const DEFAULT_OTP = '0000';

export interface RegistrationContext {
    email: string;
    phone: string;
    registrationId?: string;
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

export interface LoginPayload {
    access_token: string;
    refresh_token: string;
    user: AuthUser;
}

export interface LoginResponse extends ApiResponse<LoginPayload> { }

export interface RegisterRequest {
    first_name: string;
    last_name: string;
    email: string;
    method: 'direct';
    phone: string;
    password: string;
}

export interface RegisterPayload {
    access_token?: string;
    refresh_token?: string;
    user?: AuthUser;
    requiresOtp?: boolean;
    registration_id?: string;
}

export interface RegisterResponse extends ApiResponse<RegisterPayload> { }

export interface VerifyOtpRequest {
    phone: string;
    otp: string;
}

export interface VerifyOtpPayload {
    access_token: string;
    refresh_token: string;
    user: AuthUser;
}

export interface VerifyOtpResponse extends ApiResponse<VerifyOtpPayload> { }

export interface RefreshTokenRequest {
    refresh_token: string;
}

export interface RefreshTokenPayload {
    access_token: string;
    refresh_token: string;
    user?: AuthUser;
}

export interface RefreshTokenResponse extends ApiResponse<RefreshTokenPayload> { }

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    new_password: string;
}
