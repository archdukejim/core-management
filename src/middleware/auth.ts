import { auth, requiresAuth } from 'express-openid-connect';
import { config } from '../config';

export function oidcMiddleware() {
  return auth({
    authRequired: false,
    auth0Logout: false,
    issuerBaseURL: config.oidc.issuerBaseUrl,
    baseURL: config.oidc.baseUrl,
    clientID: config.oidc.clientId,
    clientSecret: config.oidc.clientSecret,
    secret: config.oidc.sessionSecret,
    authorizationParams: {
      response_type: 'code',
      scope: 'openid profile email',
    },
    idpLogout: true,
  });
}

export { requiresAuth };
