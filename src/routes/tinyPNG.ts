import { Hono } from 'hono'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>() 

router.post('/api/tinify/shrink', async (c) => {
    try {
        const body = await c.req.arrayBuffer();

        const tinifyRes = await fetch("https://api.tinify.com/shrink", {
            method: "POST",
            headers: {
                Authorization: c.env.VITE_SHARKMKT_TINIFY_AUTHORIZATION,
                "Content-Type": "application/octet-stream",
            },
            body,
        });

        const tinifyBody = await tinifyRes.text();

        return new Response(tinifyBody, {
            status: tinifyRes.status,
            headers: {
                "content-type":
                tinifyRes.headers.get("content-type") || "application/json",
            },
        });
    } catch (error) {
        console.error("Tinify proxy error:", error);
        return new Response(JSON.stringify({ message: "Tinify proxy error" }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    }
    }
)

export default router