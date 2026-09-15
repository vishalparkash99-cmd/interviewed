# API Routes

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST   | /api/v1/auth/login | Login | No |
| POST   | /api/v1/auth/register | Register | No |
| GET    | /api/v1/auth/me | Current user | Yes |
| POST   | /api/v1/auth/logout | Logout | Yes |
| GET    | /api/v1/users | List users | Yes (super_admin) |
| GET    | /api/v1/users/:id | Get user | Yes |
| PATCH  | /api/v1/users/:id | Update user | Yes |
| DELETE | /api/v1/users/:id | Deactivate user | Yes (super_admin) |
| GET    | /api/v1/organizations | List orgs | Yes |
| POST   | /api/v1/organizations | Create org | Yes (super_admin) |
| GET    | /api/v1/organizations/:id | Get org | Yes |
| PATCH  | /api/v1/organizations/:id | Update org | Yes |
| DELETE | /api/v1/organizations/:id | Delete org | Yes (super_admin) |
| GET    | /api/v1/jobs | List jobs | Yes |
| GET    | /api/v1/jobs/:id | Get job | Yes |
| POST   | /api/v1/jobs | Create job | Yes (org_admin, recruiter) |
| PATCH  | /api/v1/jobs/:id | Update job | Yes |
| POST   | /api/v1/jobs/:id/activate | Activate job | Yes (org_admin, recruiter) |
| POST   | /api/v1/jobs/:id/close | Close job | Yes (org_admin, recruiter) |
| DELETE | /api/v1/jobs/:id | Delete job | Yes |
| GET    | /api/v1/candidates | List candidates | Yes |
| GET    | /api/v1/candidates/:id | Get candidate | Yes |
| PATCH  | /api/v1/candidates/:id | Update candidate | Yes |
| DELETE | /api/v1/candidates/:id | Archive candidate | Yes |
| GET    | /api/v1/interviews | List interviews | Yes |
| POST   | /api/v1/interviews/:id/start | Start interview | Yes (recruiter, org_admin) |
| POST   | /api/v1/interviews/:id/end | End interview | Yes (recruiter, org_admin) |
| POST   | /api/v1/interviews/:id/cancel | Cancel interview | Yes (recruiter, org_admin) |
| POST   | /api/v1/interviews/:id/invite | Get invite link | Yes |
| POST   | /api/v1/interviews/candidate/join | Join portal | No |
| GET    | /api/v1/interviews/secure/:token | Validate link | No |
| POST   | /api/v1/emails | Send email | Yes (recruiter, org_admin) |
| GET    | /api/v1/emails | List emails | Yes |
| GET    | /api/v1/emails/:id | Get email | Yes |
| GET    | /api/v1/dashboard/summary | Dashboard stats | Yes |
| GET    | /api/v1/dashboard/jobs/:jobId/stats | Job stats | Yes |
| GET    | /health | Health check | No |
