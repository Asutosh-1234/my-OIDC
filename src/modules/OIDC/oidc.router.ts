import {Router} from "express";
import { POSTproduct, DeleteProduct} from "./oidc.controller";
import { verifyAccessToken } from "../auth/auth.middleware";

const router = Router();

router.post("/", verifyAccessToken, POSTproduct);
router.delete("/:id", verifyAccessToken, DeleteProduct);

export default router;
