# Customer guide: IdP MFA with ACTIRA (Entra / Okta / Keycloak)

ACTIRA supports **OIDC SSO**. Multi-factor authentication for enterprise should be enforced **at the identity provider**, not as a separate ACTIRA TOTP product requirement (optional local TOTP is available via `FEATURE_MFA=1`).

---

## 1. Recommended enterprise path

| Layer | Control |
|-------|---------|
| Identity | Entra ID / Okta / Keycloak (or compatible OIDC) |
| MFA | Conditional Access / MFA policy **on the IdP** |
| Optional ACTIRA check | `OIDC_REQUIRE_MFA=1` rejects tokens without `amr`/`acr` MFA evidence |
| Roles | OIDC groups → `OIDC_GROUP_ROLE_MAP` → `admin` / `senior_reviewer` / `analyst` |
| ACTIRA | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI` |

Disable password self-registration in production (automatic when OIDC is on or `ENV=production`).

---

## 2. Microsoft Entra ID (Azure AD)

1. **App registration** → New registration  
   - Redirect URI: `https://<your-api-host>/api/auth/oidc/callback` (Web)  
2. **Certificates & secrets** → client secret if confidential client (`OIDC_CLIENT_SECRET`)  
3. **Token configuration** → optional groups claim  
4. **API permissions** → Microsoft Graph `openid`, `profile`, `email`  
5. **Conditional Access** → require MFA for the enterprise app / all users  
6. Set ACTIRA env:

```env
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<app-client-id>
OIDC_CLIENT_SECRET=<if confidential>
OIDC_REDIRECT_URI=https://api.example.com/api/auth/oidc/callback
OIDC_SCOPES=openid email profile
OIDC_GROUP_ROLE_MAP={"soc-admins":"admin","soc-reviewers":"senior_reviewer","soc-analysts":"analyst"}
# Optional belt-and-suspenders (require amr/acr MFA evidence on callback):
OIDC_REQUIRE_MFA=1
# OIDC_MFA_ACR_VALUES=AAL2,2
# OIDC_MFA_CLAIM=extension_MfaCompleted
```

7. Verify: `GET /api/auth/oidc/config` → `enabled: true`, `require_mfa: true`, `public_register: false`  
8. Login UI → **Sign in with SSO** → complete IdP MFA challenge  
9. Ensure tokens expose `amr` (e.g. `mfa`, `otp`) or `acr` if `OIDC_REQUIRE_MFA=1`

---

## 3. Okta

1. Create **OIDC Web Application**  
2. Sign-in redirect: `https://<api>/api/auth/oidc/callback`  
3. Assign users/groups; enable **MFA enrollment** policy for the app  
4. Issuer: `https://<org>.okta.com` (or custom domain auth server)  
5. Map Okta groups via `OIDC_GROUP_ROLE_MAP` / `OIDC_ROLE_CLAIM`  

---

## 4. Keycloak

1. Realm → Client (confidential or public SPA+BFF)  
2. Valid redirect URIs include ACTIRA callback  
3. Authentication flow: browser flow with OTP / WebAuthn  
4. Issuer: `https://keycloak.example.com/realms/<realm>`  

---

## 5. Optional local TOTP (lab / break-glass)

When IdP is not available:

```env
FEATURE_MFA=1
# pip install pyotp
```

API:

| Route | Purpose |
|-------|---------|
| `GET /api/auth/mfa/status` | Feature + enrollment |
| `POST /api/auth/mfa/setup` | Secret + otpauth URI |
| `POST /api/auth/mfa/enable` | `{secret, code}` |
| `POST /api/auth/mfa/verify` | After login `mfa_required` |

Pending MFA challenges are **process-local** — use sticky sessions or complete MFA on the same API replica.

---

## 6. Acceptance checklist

- [ ] IdP MFA required for all human users  
- [ ] Password registration disabled in production  
- [ ] Role mapping verified for admin / senior_reviewer / analyst  
- [ ] Federated logout documented (IdP session end)  
- [ ] Break-glass admin path defined (emergency access account policy)  

See also: [CONFIGURATION.md](../CONFIGURATION.md), [SECURITY_HARDENING.md](SECURITY_HARDENING.md), [STAGING_SIGN_OFF.md](STAGING_SIGN_OFF.md).
