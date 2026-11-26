import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Server-side Gemini AI Nutrition Lookup (per 100g composition + allergens + vegan flag)
  app.post('/api/ai/nutrition-lookup', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      res.status(400).json({ error: 'Ingredient query is required.' });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'NO_API_KEY',
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide standard per-100g nutritional composition data for this culinary or baking ingredient: "${query}". Include allergens (such as gluten, dairy, egg, tree nuts, peanuts, soy, sesame, fish, shellfish, mustard, sulphites) and whether it is vegan.`,
        config: {
          systemInstruction:
            'You are a commercial food science and nutrition reference assistant. Return accurate standard per-100g nutrient composition values (kcal, fat g, satFat g, sugar g, protein g, carbs g), lowercase allergen strings, and a vegan boolean. Keep display names concise and accurate.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Standardized ingredient display name.' },
              kcal: { type: Type.NUMBER, description: 'Calories (kcal) per 100g.' },
              fat: { type: Type.NUMBER, description: 'Total fat (g) per 100g.' },
              satFat: { type: Type.NUMBER, description: 'Saturated fat (g) per 100g.' },
              sugar: { type: Type.NUMBER, description: 'Total sugars (g) per 100g.' },
              protein: { type: Type.NUMBER, description: 'Protein (g) per 100g.' },
              carbs: { type: Type.NUMBER, description: 'Total carbohydrates (g) per 100g.' },
              allergens: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lowercase food allergen names, or empty array.',
              },
              vegan: { type: Type.BOOLEAN, description: 'True if ingredient is vegan.' },
            },
            required: ['name', 'kcal', 'fat', 'satFat', 'sugar', 'protein', 'carbs', 'allergens', 'vegan'],
          },
        },
      });

      const rawText = cleanJsonText(response.text ?? '');
      if (!rawText) {
        res.status(502).json({ error: 'Empty response received from Gemini nutrition lookup.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        name?: string;
        kcal?: number;
        fat?: number;
        satFat?: number;
        sugar?: number;
        protein?: number;
        carbs?: number;
        allergens?: string[];
        vegan?: boolean;
      };

      const clampNum = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
      };

      res.json({
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : query,
        kcal: clampNum(parsed.kcal),
        fat: clampNum(parsed.fat),
        satFat: clampNum(parsed.satFat),
        sugar: clampNum(parsed.sugar),
        protein: clampNum(parsed.protein),
        carbs: clampNum(parsed.carbs),
        allergens: Array.isArray(parsed.allergens)
          ? parsed.allergens.map((a) => String(a).trim().toLowerCase()).filter(Boolean)
          : [],
        vegan: Boolean(parsed.vegan),
        source: 'live_api',
        confidence: 'high',
        note: `Gemini AI nutrition lookup for "${query}". Review values before commercial labeling.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nutrition lookup failed.';
      console.error('[Gemini Nutrition Lookup Error]', error);
      res.status(502).json({ error: message });
    }
  });

  // Server-side Gemini AI Multimodal Invoice Photo Scan
  app.post('/api/ai/scan-invoice', async (req, res) => {
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : 'image/jpeg';

    if (!imageBase64) {
      res.status(400).json({ error: 'Invoice image data is required.' });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Configure GEMINI_API_KEY in Settings > Secrets.',
        code: 'NO_API_KEY',
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: 'This image is a supplier invoice or delivery note for food, baking, or packaging items. Extract every clearly legible line item with its name, numeric quantity, unit (one of kg, g, L, mL, pcs), and numeric line total cost paid (without currency symbols). Skip illegible lines rather than guessing.',
            },
          ],
        },
        config: {
          systemInstruction:
            'You extract structured supplier invoice line items accurately. Return only clearly readable line items with numeric quantity and line cost.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Item name as written on invoice.' },
                qty: { type: Type.NUMBER, description: 'Numeric quantity billed.' },
                unit: {
                  type: Type.STRING,
                  description: 'Unit normalized to kg, g, L, mL, or pcs.',
                },
                cost: { type: Type.NUMBER, description: 'Total line cost paid (numeric).' },
              },
              required: ['name', 'qty', 'unit', 'cost'],
            },
          },
        },
      });

      const rawText = cleanJsonText(response.text ?? '[]');
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        res.status(422).json({ error: 'No readable invoice line items were detected in that image.' });
        return;
      }

      const items = parsed
        .filter((row) => row && typeof row.name === 'string' && row.name.trim())
        .map((row) => {
          const rawUnit = String(row.unit || 'kg').trim().toLowerCase();
          const unit =
            rawUnit === 'g' || rawUnit === 'pcs' || rawUnit === 'l' || rawUnit === 'ml'
              ? rawUnit === 'l'
                ? 'L'
                : rawUnit === 'ml'
                ? 'mL'
                : rawUnit
              : 'kg';
          return {
            name: String(row.name).trim(),
            qty: Math.max(0, Number(row.qty) || 0),
            unit,
            cost: Math.max(0, Number(row.cost) || 0),
          };
        });

      res.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invoice scanning failed.';
      console.error('[Gemini Invoice Scan Error]', error);
      res.status(502).json({ error: message });
    }
  });

  // Never let unmatched /api/* routes fall through to Vite SPA index.html
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Return JSON for Express body-parser / middleware errors on API routes
  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api/')) {
        const status = err.status || err.statusCode || 500;
        res.status(status).json({ error: err.message || 'API request failed.' });
        return;
      }
      next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hearthline Kitchen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
