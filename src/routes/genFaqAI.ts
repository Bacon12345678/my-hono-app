import { Hono } from 'hono'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>() 

router.post('/api/ai/generate-faq', async (c) => {
    const body = await c.req.json();
    const { title, content } = body;

    try {
        
        const res = await fetch(c.env.VITE_FAQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": c.env.VITE_FAQ_API_KEY
            },
            body: JSON.stringify({
                title,
                content
            })
        });
        return new Response(res.body, {
            status: res.status,
            headers: {
              "content-type":
                res.headers.get("content-type") || "application/json",
            },
          });
    } catch (error) {
        console.error("Error generating FAQ:", error);
        return new Response("Error generating FAQ", { status: 500 });
    }
})

export default router