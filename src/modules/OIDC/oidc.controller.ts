import type { Request, Response } from "express";
import ApiResponse from "../../common/utils/api.response";
import ApiError from "../../common/utils/api.error";
import JwtUtils from "../../common/utils/jwt.utils";
import { db, clients } from "../../common/DB/schema";
import { eq } from "drizzle-orm";

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        email: string;
        name: string;
    };
}

const POSTproduct = async (req: AuthenticatedRequest, res: Response) => {
    const { productName } = req.body;
    const user = req.user;
    if (!user) {
        throw ApiError.unauthorizedError(res, "Unauthorized");
    }

    if (!productName) {
        throw ApiError.badRequestError(res, "Product name is required");
    }

    const clientId = JwtUtils.generateRandomId();
    const clientSecret = JwtUtils.generateAuthCode();

    const client = await db.insert(clients).values({
        productName,
        clientId,
        clientSecret,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    }).returning({
        productName: clients.productName,
        clientId: clients.clientId,
        clientSecret: clients.clientSecret,
    });

    ApiResponse.ok(res, "Client created successfully", client);
};

const DeleteProduct = async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user;
    if (!user) {
        throw ApiError.unauthorizedError(res, "Unauthorized");
    }
    const client = await db.select().from(clients).where(eq(clients.id, Number(id)));
    if (!client[0]) {
        throw ApiError.notFoundError(res, "Client not found");
    }
    if (client[0].userId !== user.id) {
        throw ApiError.unauthorizedError(res, "Unauthorized");
    }
    await db.delete(clients).where(eq(clients.id, Number(id)));
    ApiResponse.ok(res, "Client deleted successfully");
};

const wellKnown = async (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const data = {
        issuer: baseUrl,
        userinfo_endpoint: `${baseUrl}/auth/userinfo`,
        end_session_endpoint: `${baseUrl}/auth/logout`,
        token_endpoint: `${baseUrl}/auth/refresh`,
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
    };

    res.json(data);
};

export {
    POSTproduct,
    DeleteProduct,
    wellKnown
};