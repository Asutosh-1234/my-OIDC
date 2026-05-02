import type { Request, Response } from "express";
import ApiResponse from "../../common/utils/api.response";
import ApiError from "../../common/utils/api.error";
import JwtUtils from "../../common/utils/jwt.utils";
import { db, clients, users, authCodes } from "../../common/DB/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

interface AuthenticatedRequest extends Request {
	user?: {
		id: number;
		email: string;
		name: string;
	};
}

const POSTproduct = async (req: AuthenticatedRequest, res: Response) => {
	const { productName, redirectUri } = req.body;
	const user = req.user;

	if (!user) {
		throw ApiError.unauthorizedError(res, "Unauthorized");
	}
	if (!productName) {
		throw ApiError.badRequestError(res, "Product name is required");
	}
	if (!redirectUri) {
		throw ApiError.badRequestError(res, "Redirect URI is required");
	}

	const clientId = JwtUtils.generateRandomId();
	const clientSecret = JwtUtils.generateAuthCode();

	const client = await db.insert(clients).values({
		productName,
		redirectUri,
		clientId,
		clientSecret,
		userId: user.id,
		createdAt: new Date(),
		updatedAt: new Date(),
	}).returning({
		productName: clients.productName,
		clientId: clients.clientId,
		clientSecret: clients.clientSecret,
		redirectUri: clients.redirectUri,
	});

	ApiResponse.ok(res, "Client created successfully", client);
};

const DeleteProduct = async (req: AuthenticatedRequest, res: Response) => {
	const { id } = req.params;
	const user = req.user;

	if (!user) {
		throw ApiError.unauthorizedError(res, "Unauthorized");
	}

	const client = (await db.select().from(clients)
		.where(eq(clients.id, Number(id))))[0];

	if (!client) {
		throw ApiError.notFoundError(res, "Client not found");
	}
	if (client.userId !== user.id) {
		throw ApiError.unauthorizedError(res, "Unauthorized");
	}

	// Clean up auth codes belonging to this client
	await db.delete(authCodes).where(eq(authCodes.clientId, client.clientId));
	await db.delete(clients).where(eq(clients.id, Number(id)));

	ApiResponse.ok(res, "Client deleted successfully");
};

const GetClient = async (req: Request, res: Response) => {
	const { client_id, redirect_uri, state } = req.query;
	const { email, name } = req.body;

	if (!client_id || !redirect_uri) {
		throw ApiError.badRequestError(res, "client_id and redirect_uri are required");
	}
	if (!email) {
		throw ApiError.badRequestError(res, "Email is required");
	}
	if (!name) {
		throw ApiError.badRequestError(res, "Name is required");
	}

	const client = (await db.select().from(clients)
		.where(eq(clients.clientId, String(client_id))))[0];

	if (!client) {
		throw ApiError.notFoundError(res, "Client not found");
	}

	if (client.redirectUri !== String(redirect_uri)) {
		throw ApiError.badRequestError(res, "Invalid redirect_uri");
	}

	let user = (await db.select().from(users)
		.where(eq(users.email, String(email))))[0];

	if (!user) {
		const hashedPassword = await bcrypt.hash(JwtUtils.generateRandomId(), 10);

		const newUser = await db.insert(users).values({
			name,
			email: String(email),
			password: hashedPassword,
			isEmailVerified: "true",
			createdAt: new Date(),
			updatedAt: new Date(),
		}).returning();


		if (!newUser[0]) {
			throw ApiError.badRequestError(res, "Failed to create user");
		}

		user = newUser[0];
	} else {
		await db.update(users).set({
			name,
			updatedAt: new Date(),
		}).where(eq(users.email, String(email)));
	}

	const authCode = JwtUtils.generateAuthCode();

	await db.insert(authCodes).values({
		code: authCode,
		clientId: String(client_id),
		userId: user.id,
		redirectUri: String(redirect_uri),
		expiresAt: new Date(Date.now() + 10 * 60 * 1000),
		createdAt: new Date(),
	});

	const redirectUrl = new URL(String(redirect_uri));
	redirectUrl.searchParams.set("code", authCode);
	if (state) redirectUrl.searchParams.set("state", String(state));

	res.redirect(redirectUrl.toString());
};

const getToken = async (req: Request, res: Response) => {
	const { client_id, client_secret, code, grant_type } = req.body;

	if (!client_id || !client_secret) {
		throw ApiError.badRequestError(res, "client_id and client_secret are required");
	}
	if (!grant_type) {
		throw ApiError.badRequestError(res, "grant_type is required");
	}

	// 1. Verify client
	const client = (await db.select().from(clients)
		.where(eq(clients.clientId, String(client_id))))[0];

	if (!client || client.clientSecret !== client_secret) {
		throw ApiError.unauthorizedError(res, "Invalid client credentials");
	}

	let userId = client.userId;

	if (grant_type === "authorization_code") {
		if (!code) {
			throw ApiError.badRequestError(res, "code is required");
		}

		// 2. Verify auth code
		const storedCode = (await db.select().from(authCodes)
			.where(eq(authCodes.code, String(code))))[0];

		if (!storedCode) {
			throw ApiError.unauthorizedError(res, "Invalid auth code");
		}
		if (new Date() > storedCode.expiresAt) {
			await db.delete(authCodes).where(eq(authCodes.code, String(code)));
			throw ApiError.unauthorizedError(res, "Auth code expired");
		}

		userId = storedCode.userId;

		// 3. Delete used auth code (one time use)
		await db.delete(authCodes).where(eq(authCodes.code, String(code)));

	} else if (grant_type === "client_credentials") {
		// use client.userId directly, already set above
	} else {
		throw ApiError.badRequestError(res, "Unsupported grant_type. Use authorization_code or client_credentials");
	}

	// 4. Get user
	const user = (await db.select().from(users)
		.where(eq(users.id, userId)))[0];

	if (!user) {
		throw ApiError.notFoundError(res, "User not found");
	}

	// 5. Generate access token
	const accessToken = JwtUtils.generateAccessToken({
		id: user.id,
		email: user.email,
		name: user.name,
		client_id: client.clientId,
	});

	ApiResponse.ok(res, "Token generated successfully", {
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: 3600,
	});
};

const getUserinfo = async (req: Request, res: Response) => {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		throw ApiError.unauthorizedError(res, "Bearer token is required");
	}

	const token = authHeader.split(" ")[1];
	if (!token) {                                               // ✅ fix: token could be undefined
		throw ApiError.unauthorizedError(res, "Bearer token is required");
	}

	const decoded = JwtUtils.verifyAccessToken(token) as {
		id: number;
		email: string;
		name: string;
		client_id: string;
	};

	if (!decoded) {
		throw ApiError.unauthorizedError(res, "Invalid token");
	}

	const user = (await db.select().from(users)
		.where(eq(users.id, decoded.id)))[0];

	if (!user) {
		throw ApiError.notFoundError(res, "User not found");
	}

	ApiResponse.ok(res, "User info", {
		sub: String(user.id),
		name: user.name,
		email: user.email,
		email_verified: user.isEmailVerified === "true",
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	});
};

const wellKnown = async (req: Request, res: Response) => {
	const baseUrl = `${req.protocol}://${req.get("host")}`;

	res.json({
		issuer: baseUrl,
		registration_endpoint: `${baseUrl}/oidc`,
		authorization_endpoint: `${baseUrl}/oidc/authorize`,
		token_endpoint: `${baseUrl}/oidc/token`,
		userinfo_endpoint: `${baseUrl}/oidc/userinfo`,
		end_session_endpoint: `${baseUrl}/auth/logout`,
		id_token_signing_alg_values_supported: ["RS256"],
		subject_types_supported: ["public", "pairwise"],
		response_types_supported: ["code", "id_token", "token"],
		response_modes_supported: ["query", "fragment"],
		scopes_supported: ["openid", "profile", "email"],
		claims_supported: [
			"sub", "name", "email", "email_verified",
			"iss", "iat", "exp"
		],
		token_endpoint_auth_methods_supported: [
			"client_secret_post",
			"client_secret_basic"
		],
		grant_types_supported: [
			"authorization_code",
			"client_credentials"
		],
	});
};

export {
	POSTproduct,
	DeleteProduct,
	GetClient,
	getToken,
	getUserinfo,
	wellKnown,
};