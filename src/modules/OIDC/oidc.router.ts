import { Router, type RequestHandler } from "express";
import { POSTproduct, DeleteProduct, GetClient, getToken, getUserinfo, wellKnown } from "./oidc.controller.js";
import { verifyAccessToken } from "../auth/auth.middleware.js";

const router = Router();

router.get("/.well-known/openid-configuration", wellKnown);
router.post("/", verifyAccessToken, POSTproduct as RequestHandler);
router.delete("/:id", verifyAccessToken, DeleteProduct as RequestHandler);
router.post("/authorize", GetClient);
router.post("/token", getToken);
router.get("/userinfo", getUserinfo);

export default router;
