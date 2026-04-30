import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import env from "./env.js";
import crypto from "crypto";

class JwtUtils {
    generateAccessToken = (payload: any) => {
        return jwt.sign(payload, env.ACCESS_TOKEN!, {
            expiresIn: env.EXPIRETIME as any,
        });
    };

    verifyAccessToken = (token: string) => {
        return jwt.verify(token, env.ACCESS_TOKEN!);
    };

    generateRefreshToken = (payload: any) => {
        return jwt.sign(payload, env.REFRESH_TOKEN!, {
            expiresIn: env.EXPIRETIME as any,
        });
    };

    verifyRefreshToken = (token: string) => {
        return jwt.verify(token, env.REFRESH_TOKEN!);
    };
    
    generateEmailVerificationToken = (payload: any) => {
        return jwt.sign(payload, env.ACCESS_TOKEN!, {
            expiresIn: env.EXPIRETIME as any,
        });
    };

    verifyEmailVerificationToken = (token: string) => {
        return jwt.verify(token, env.ACCESS_TOKEN!)
    };

    generateRandomId = (length: number = 16) => {
        return crypto.randomBytes(length).toString("hex");
    }

    generateAuthCode = (length: number = 32) => {
        return crypto.randomBytes(length).toString("hex");
    }
}   

export default new JwtUtils();