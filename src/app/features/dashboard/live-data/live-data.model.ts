/**
 * Access to live data. Today only authentication is checked; a future
 * subscription check can add another state (e.g. 'subscription-required')
 * inside LiveDataAccessService without touching the screens.
 */
export type LiveDataAccess = 'login-required' | 'granted';

/** Feed availability. Only 'unavailable' exists until the live API/WebSocket is delivered. */
export type LiveFeedStatus = 'unavailable';

/** Query parameter used to reopen a screen's Live tab after signing in. */
export const LIVE_SOURCE_PARAM = 'source';
export const LIVE_SOURCE_VALUE = 'live';
