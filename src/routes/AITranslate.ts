import { Hono } from 'hono'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>() 

router.post('/api/ai/translate', async (c) => {
    const body = await c.req.json();
    const { title, content, sourceLang, lang, keyword, abstract } = body;

    try {
        
        const res = await fetch(c.env.VITE_AI_TRANSLATE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": c.env.VITE_AI_TRANSLATE_API_KEY
            },
            body: JSON.stringify({
                lang,
                title,
                content,
                keyword,
                abstract,
                sourceLang
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
