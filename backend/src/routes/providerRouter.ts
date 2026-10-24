import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { getProviderManager } from './systemRouter.js';
import * as Upstox from 'upstox-js-sdk';

export const providerRouter = Router();

/**
 * Helper to get the active UpstoxAdapter from ProviderManager
 */
function getUpstoxAdapter() {
  const pm = getProviderManager();
  return pm?.getUpstoxAdapter ? pm.getUpstoxAdapter() : null;
}

/**
 * GET /api/provider/upstox/auth-url
 * Returns the official Upstox OAuth authorization dialog URL
 */
providerRouter.get('/provider/upstox/auth-url', (req: Request, res: Response): void => {
  try {
    const clientId = config.provider.clientId;
    const redirectUri = config.provider.redirectUri;

    if (!clientId) {
      res.status(400).json({
        success: false,
        error: 'UPSTOX_CLIENT_ID is not configured in backend environment (.env).',
        actionRequired: 'Configure UPSTOX_CLIENT_ID and UPSTOX_CLIENT_SECRET in .env',
      });
      return;
    }

    const state = req.query.state ? String(req.query.state) : `mp_${Date.now()}`;
    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    res.json({
      success: true,
      authUrl,
      clientId,
      redirectUri,
      state,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed generating authorization URL' });
  }
});

/**
 * GET /api/provider/upstox/callback
 * Handles OAuth callback from Upstox authorization server
 */
providerRouter.get('/provider/upstox/callback', async (req: Request, res: Response): Promise<void> => {
  const adapter = getUpstoxAdapter();
  const frontendUrl = config.frontendUrl;

  try {
    const { code, error, error_description } = req.query;

    // Handle provider error (e.g. user denied or account not active)
    if (error) {
      const errorMsg = String(error_description || error);
      console.warn('[Upstox OAuth Callback Error]:', errorMsg);

      if (adapter) {
        if (/under review|suspended|activation/i.test(errorMsg)) {
          adapter.setAccountStatus(
            'ACCOUNT_UNDER_REVIEW',
            'Your Upstox account reactivation is currently under review by the broker. Safe TejHQ EOD fallback is active.'
          );
        } else {
          adapter.setAccountStatus('DISCONNECTED', `Authorization denied: ${errorMsg}`);
        }
      }

      // Check if client expects JSON
      if (req.headers.accept?.includes('application/json')) {
        res.status(400).json({ success: false, error: errorMsg });
        return;
      }
      res.redirect(`${frontendUrl}/settings?upstox_error=${encodeURIComponent(errorMsg)}`);
      return;
    }

    if (!code) {
      res.status(400).json({ success: false, error: 'Missing authorization code in callback parameters.' });
      return;
    }

    const clientId = config.provider.clientId;
    const clientSecret = config.provider.clientSecret;
    const redirectUri = config.provider.redirectUri;

    if (!clientId || !clientSecret) {
      const missingConfigMsg = 'UPSTOX_CLIENT_ID or UPSTOX_CLIENT_SECRET is missing from backend configuration.';
      console.error(`[Upstox OAuth] ${missingConfigMsg}`);
      if (req.headers.accept?.includes('application/json')) {
        res.status(500).json({ success: false, error: missingConfigMsg });
        return;
      }
      res.redirect(`${frontendUrl}/settings?upstox_error=${encodeURIComponent(missingConfigMsg)}`);
      return;
    }

    console.log('[Upstox OAuth] Exchanging authorization code for access token via Upstox Token API...');

    // Exchange authorization code for access token via official Upstox Token API
    const tokenUrl = 'https://api.upstox.com/v2/login/authorization/token';
    const params = new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const tokenData: any = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      const failureReason = tokenData.errors?.[0]?.message || tokenData.message || 'Failed to exchange authorization code for access token';
      console.error('[Upstox OAuth Exchange Failed]:', failureReason);

      if (adapter) {
        if (/under review|reactivation|suspended|deactivated/i.test(failureReason)) {
          adapter.setAccountStatus(
            'ACCOUNT_UNDER_REVIEW',
            'Upstox account reactivation is currently under review by the broker. Safe TejHQ EOD fallback is active.'
          );
        } else {
          adapter.setAccountStatus('TOKEN_EXPIRED', failureReason);
        }
      }

      if (req.headers.accept?.includes('application/json')) {
        res.status(400).json({ success: false, error: failureReason, status: 'ACCOUNT_UNDER_REVIEW' });
        return;
      }
      res.redirect(`${frontendUrl}/settings?upstox_error=${encodeURIComponent(failureReason)}`);
      return;
    }

    // Success! Securely store access token on backend only
    const accessToken = String(tokenData.access_token);
    console.log(`[Upstox OAuth] Token acquired successfully for user: ${tokenData.user_name || tokenData.user_id || 'Authorized User'}. Storing on backend.`);

    if (adapter) {
      adapter.setAccessToken(accessToken, 'ACTIVE', 'Upstox account authorized and active.');
      // Auto-connect streamer if in LIVE mode
      const pm = getProviderManager();
      if (pm && pm.getCurrentMode() === 'LIVE') {
        adapter.connect().catch((err: any) => {
          console.warn('[Upstox Auto-Connect Notice]:', err.message);
        });
      }
    }

    if (req.headers.accept?.includes('application/json')) {
      res.json({
        success: true,
        message: 'Upstox authorized successfully.',
        userName: tokenData.user_name,
        userId: tokenData.user_id,
      });
      return;
    }

    res.redirect(`${frontendUrl}/settings?upstox_status=connected`);
  } catch (err: any) {
    console.error('[Upstox Callback Exception]:', err.message);
    if (req.headers.accept?.includes('application/json')) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    res.redirect(`${frontendUrl}/settings?upstox_error=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /api/provider/upstox/status
 * Returns current Upstox status and diagnostics (never returns token or secret)
 */
providerRouter.get('/provider/upstox/status', (req: Request, res: Response): void => {
  const adapter = getUpstoxAdapter();
  if (!adapter) {
    res.json({
      success: true,
      data: {
        provider: 'Upstox-V3',
        mode: 'LIVE',
        connected: false,
        reconnecting: false,
        reconnectAttempts: 0,
        hasToken: Boolean(config.provider.accessToken),
        accountStatus: 'DISCONNECTED',
        actionableMessage: 'Upstox adapter not initialized.',
        subscriptionCount: 0,
        subscriptionLimit: 100,
        activeSubscriptions: [],
      },
    });
    return;
  }

  const detailed = adapter.getDetailedStatus();
  res.json({
    success: true,
    data: detailed,
  });
});

/**
 * POST /api/provider/upstox/disconnect
 * Disconnects live Upstox session and clears token from memory
 */
providerRouter.post('/provider/upstox/disconnect', async (req: Request, res: Response): Promise<void> => {
  try {
    const adapter = getUpstoxAdapter();
    if (adapter) {
      adapter.clearAccessToken();
    }

    res.json({
      success: true,
      message: 'Upstox session disconnected and access token cleared.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/provider/upstox/token
 * Manual token configuration endpoint (e.g. pasting existing developer token)
 */
providerRouter.post('/provider/upstox/token', (req: Request, res: Response): void => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'A valid access token string is required.' });
      return;
    }

    const adapter = getUpstoxAdapter();
    if (adapter) {
      adapter.setAccessToken(token.trim(), 'ACTIVE', 'Manual Upstox token configured.');
      const pm = getProviderManager();
      if (pm && pm.getCurrentMode() === 'LIVE') {
        adapter.connect().catch((err: any) => console.warn('[Upstox Token Connect]:', err.message));
      }
    }

    res.json({
      success: true,
      message: 'Upstox access token saved successfully on backend.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
