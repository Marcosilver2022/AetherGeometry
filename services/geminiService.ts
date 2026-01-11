import { GoogleGenAI, Type } from "@google/genai";
import { VisualParams } from "../types";

const initGenAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Generates a "Vibe" configuration based on a text description or random inspiration
export const generateVisualPreset = async (prompt: string): Promise<Partial<VisualParams> | null> => {
  const ai = initGenAI();
  if (!ai) return null;

  try {
    const model = ai.models;
    const response = await model.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a JSON configuration for a sacred geometry visualizer based on this vibe: "${prompt}".
      
      Parameters to generate (return numbers only):
      - symmetry: integer between 3 and 16
      - zoom: float between 0.5 and 2.0
      - rotationSpeed: float between -0.5 and 0.5
      - colorShift: float between 0.0 and 1.0
      - detail: integer between 1 and 8
      - reactivity: float between 0.5 and 1.5
      - bloom: float between 0.2 and 0.8
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            symmetry: { type: Type.INTEGER },
            zoom: { type: Type.NUMBER },
            rotationSpeed: { type: Type.NUMBER },
            colorShift: { type: Type.NUMBER },
            detail: { type: Type.INTEGER },
            reactivity: { type: Type.NUMBER },
            bloom: { type: Type.NUMBER },
          },
          required: ["symmetry", "zoom", "rotationSpeed", "colorShift", "detail", "reactivity", "bloom"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as Partial<VisualParams>;
    }
    return null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};
