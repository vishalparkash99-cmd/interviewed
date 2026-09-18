import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, EmailType } from "@interviewed/types";
import { loginSchema, registerSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema, resendVerificationSchema } from "../validation";
import { rateLimitSocketKeyGenerator } from "./utils";
import { createLogger } from "@interviewed/config/logger";

const logger = createLogger("auth-routes");
const db = createPrismaClient();

const VERIFICATION_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_EMAIL_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DUMMY_PASSWORD_HASH = bcrypt.hashSync("interviewed-dummy-password", 12);

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    || "company";
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getAppUrl(): string {
  return process.env.APP_URL || `http://localhost:${process.env.WEB_PORT || "3000"}`;
}

function buildEmailBody(title: string, message: string, url: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f5f5f7;border-radius:12px">
      <h2 style="color:#1d1d1f;margin:0 0 12px">${title}</h2>
      <p style="color:#3a3a3c;font-size:15px;line-height:1.5">${message}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0071e3;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px">Continue</a>
      </p>
      <p style="color:#86868b;font-size:13px">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${url}" style="color:#0071e3;word-break:break-all">${url}</a></p>
    </div>
  `;
}

async function setAuthCookies(reply: FastifyReply, server: FastifyInstance, payload: { id: string; email: string; role: string }): Promise<string> {
  const refreshCookieName = (server as any).getRefreshCookieName();
  const token = (server as any).jwt.sign(payload, { expiresIn: "15m" });
  const refreshToken = (server as any).jwt.refresh.sign(payload, { expiresIn: "7d" });

  const tokenHash = sha256(refreshToken);
  await db.refreshToken.deleteMany({ where: { userId: payload.id } });
  await db.refreshToken.create({
    data: { userId: payload.id, token: tokenHash, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
  });

  reply.setCookie("interviewed-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60 * 1000,
    path: "/",
    sameSite: "lax",
  });
  reply.setCookie(refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
    sameSite: "lax",
  });

  return token;
}

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post("/api/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Email and password required" };
    }
    const { email, password } = parseResult.data;

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.deletedAt) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      reply.code(401);
      return { error: "Invalid credentials" };
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      reply.code(401);
      return { error: "Invalid credentials" };
    }

    if (!user.isActive) {
      reply.code(403);
      return { error: "Please verify your email before signing in.", code: "EMAIL_NOT_VERIFIED" };
    }

    await setAuthCookies(reply, server, { id: user.id, email: user.email, role: user.role });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  });

  server.post("/api/v1/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid input" };
    }
    const { email, password, firstName, lastName, companyName } = parseResult.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      reply.code(200);
      return {
        message: "Registration successful. Please verify your email to activate your account.",
        requiresEmailVerification: true,
      };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const baseSlug = makeSlug(companyName);

    let slug = baseSlug;
    let n = 1;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + VERIFICATION_EMAIL_TTL_MS);

    await db.$transaction(async (tx) => {
      await tx.organization.create({
        data: { id: orgId, name: companyName, slug, timezone: "UTC" },
      });
      await tx.user.create({
        data: {
          id: userId,
          email,
          passwordHash,
          firstName,
          lastName,
          role: UserRole.OrgAdmin,
          organizationId: orgId,
          isActive: false,
        },
      });
      await tx.emailVerificationToken.create({
        data: { userId, token: verificationToken, expiresAt: verificationExpires },
      });
    });

    const verifyUrl = `${getAppUrl()}/verify-email?token=${verificationToken}`;
    const subject = "Verify your email - Interviewed";
    const body = buildEmailBody(
      "Welcome to Interviewed",
      `Hi ${firstName}, thanks for creating your account. Please verify your email address to get started.`,
      verifyUrl
    );

    await (server as any).sendEmail?.({
      to: email,
      recipientName: `${firstName} ${lastName}`,
      subject,
      body,
      type: EmailType.Welcome,
      organizationId: orgId,
      templateData: { firstName, verifyUrl },
    });

    logger.info({ userId, orgId, isActive: false }, "HR user registered, verification email sent");

    const emailProvider = process.env.EMAIL_PROVIDER || "mock";

    return {
      message: "Registration successful. Please verify your email to activate your account.",
      user: { id: userId, email, firstName, lastName, role: UserRole.OrgAdmin },
      ...(emailProvider === "mock" ? { devVerifyUrl: verifyUrl } : {}),
    };
  });

  server.post("/api/v1/auth/verify-email", { config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = verifyEmailSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Verification token is required" };
    }
    const { token } = parseResult.data;

    const record = await db.emailVerificationToken.findUnique({ where: { token } });
    if (!record || record.usedAt) {
      reply.code(400);
      return { error: "Invalid or already used verification token", code: "INVALID_TOKEN" };
    }
    if (record.expiresAt < new Date()) {
      reply.code(400);
      return { error: "This verification link has expired. Please request a new one.", code: "TOKEN_EXPIRED" };
    }

    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { isActive: true, updatedAt: new Date() } }),
      db.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    logger.info({ userId: record.userId }, "Email verified");

    return { message: "Email verified successfully. You can now sign in." };
  });

  server.post("/api/v1/auth/resend-verification", { config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = resendVerificationSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Email is required" };
    }
    const { email } = parseResult.data;

    const user = await db.user.findUnique({ where: { email } });
    if (user && !user.isActive && !user.deletedAt) {
      await db.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });

      const verificationToken = generateToken();
      const verificationExpires = new Date(Date.now() + VERIFICATION_EMAIL_TTL_MS);
      await db.emailVerificationToken.create({
        data: { userId: user.id, token: verificationToken, expiresAt: verificationExpires },
      });

      const verifyUrl = `${getAppUrl()}/verify-email?token=${verificationToken}`;
      await (server as any).sendEmail?.({
        to: email,
        recipientName: `${user.firstName} ${user.lastName}`,
        subject: "Verify your email - Interviewed",
        body: buildEmailBody(
          "Verify your email",
          `Hi ${user.firstName}, please verify your email address to activate your account.`,
          verifyUrl
        ),
        type: EmailType.Welcome,
        organizationId: user.organizationId,
      });
      logger.info({ userId: user.id }, "Verification email resent");
    }

    return { message: "If that email exists, a verification link has been sent." };
  });

  server.post("/api/v1/auth/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = forgotPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Email is required" };
    }
    const { email } = parseResult.data;

    const user = await db.user.findUnique({ where: { email } });
    if (user && !user.deletedAt) {
      await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

      const resetToken = generateToken();
      const resetExpires = new Date(Date.now() + RESET_EMAIL_TTL_MS);
      await db.passwordResetToken.create({
        data: { userId: user.id, token: resetToken, expiresAt: resetExpires },
      });

      const resetUrl = `${getAppUrl()}/reset-password?token=${resetToken}`;
      await (server as any).sendEmail?.({
        to: email,
        recipientName: `${user.firstName} ${user.lastName}`,
        subject: "Reset your password - Interviewed",
        body: buildEmailBody(
          "Reset your password",
          `Hi ${user.firstName}, we received a request to reset your password. This link is valid for 1 hour.`,
          resetUrl
        ),
        type: EmailType.PasswordReset,
        organizationId: user.organizationId,
      });
      logger.info({ userId: user.id }, "Password reset email sent");
    }

    return { message: "If that email exists, a password reset link has been sent." };
  });

  server.post("/api/v1/auth/reset-password", { config: { rateLimit: { max: 10, timeWindow: "10 minutes", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = resetPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Token and new password are required" };
    }
    const { token, password } = parseResult.data;

    const record = await db.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.usedAt) {
      reply.code(400);
      return { error: "Invalid or already used reset token", code: "INVALID_TOKEN" };
    }
    if (record.expiresAt < new Date()) {
      reply.code(400);
      return { error: "This reset link has expired. Please request a new one.", code: "TOKEN_EXPIRED" };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash, isActive: true, updatedAt: new Date() } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    logger.info({ userId: record.userId }, "Password reset completed");

    return { message: "Password updated successfully. You can now sign in." };
  });

  server.get("/api/v1/auth/me", async (request: FastifyRequest, reply: FastifyReply) => {
    const authedUser = await (request.server as any).verifyAuth(request);
    if (!authedUser) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const fullUser = await db.user.findUnique({
      where: { id: authedUser.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
    if (!fullUser) {
      reply.code(404);
      return { error: "User not found" };
    }
    return fullUser;
  });

  server.post("/api/v1/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshCookieName = (server as any).getRefreshCookieName();
    const refreshToken = request.cookies?.[refreshCookieName as string];
    if (refreshToken) {
      await db.refreshToken.deleteMany({ where: { token: sha256(refreshToken) } }).catch(() => {});
    }
    reply.clearCookie("interviewed-token", { path: "/" });
    reply.clearCookie(refreshCookieName, { path: "/" });
    return { ok: true };
  });

  server.post("/api/v1/auth/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshCookieName = (server as any).getRefreshCookieName();
    const refreshToken = request.cookies?.[refreshCookieName as string];
    if (!refreshToken) {
      reply.code(401);
      return { error: "Invalid refresh token" };
    }

    try {
      await (request as any).refreshJwtVerify({ onlyCookie: true });
      const user = (request as any).user as { id: string; email: string; role: string };

      const stored = await db.refreshToken.findFirst({
        where: { userId: user.id, token: sha256(refreshToken), expiresAt: { gt: new Date() } },
      });

      if (!stored) {
        await db.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
        reply.clearCookie("interviewed-token", { path: "/" });
        reply.clearCookie(refreshCookieName, { path: "/" });
        reply.code(401);
        return { error: "Invalid refresh token" };
      }

      await setAuthCookies(reply, server, { id: user.id, email: user.email, role: user.role });

      return { ok: true };
    } catch {
      reply.code(401);
      return { error: "Invalid refresh token" };
    }
  });
}