/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { CourseResult, RoadmapStep } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL_NAME = "gemini-1.5-flash";

export async function searchCourses(query: string): Promise<CourseResult[]> {
  const prompt = `
    Atue como um especialista em educação tecnológica.
    Sua tarefa é encontrar os melhores cursos de programação 100% GRATUITOS e LEGAIS disponíveis na internet para a busca: "${query}".
    
    REGRAS CRÍTICAS:
    1. PROIBIDO cursos pagos ou que exijam assinatura (EX: Nada de cursos da Udemy que custam dinheiro, Alura, etc).
    2. FOQUE em: Coursera (versão gratuita/auditoria), edX (versão gratuita), freeCodeCamp, MIT OpenCourseWare, YouTube (canais educacionais renomados), Harvard CS50, Khan Academy e documentações oficiais.
    
    Certifique-se de que os links sejam diretos e funcionais.
    Categorize os níveis corretamente:
    - Iniciante: Sem pré-requisitos.
    - Intermediário: Requer lógica básica ou conhecimento prévio da linguagem.
    - Avançado: Tópicos complexos, arquitetura ou performance.

    Retorne uma lista de até 8 cursos REAIS e ATUALIZADOS em formato JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
              platform: { type: Type.STRING },
              level: { 
                type: Type.STRING, 
                enum: ['Iniciante', 'Intermediário', 'Avançado'] 
              },
              category: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["title", "url", "platform", "level", "category", "description"],
          },
        },
        tools: [
          {
            googleSearch: {},
          },
        ],
      },
    });

    const responseText = response.text || "[]";
    return JSON.parse(responseText.trim());
  } catch (error: any) {
    console.warn("Search with Google Search tool failed, falling back to direct generation...", error);
    
    // Fallback: If 403 (Permission Denied for tool) or other error, retry without Google Search tool
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING },
                platform: { type: Type.STRING },
                level: { 
                  type: Type.STRING, 
                  enum: ['Iniciante', 'Intermediário', 'Avançado'] 
                },
                category: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["title", "url", "platform", "level", "category", "description"],
            },
          },
        },
      });
      const text = fallbackResponse.text || "[]";
      return JSON.parse(text.trim());
    } catch (e) {
      console.error("Search failed completely", e);
      return [];
    }
  }
}

export async function generateRoadmap(goal: string): Promise<RoadmapStep[]> {
  const prompt = `
    Crie um roadmap de estudos passo a passo para o objetivo de carreira em tecnologia: "${goal}". 
    Retorne no máximo 5 passos essenciais.
    Para cada passo, inclua o título, uma descrição clara, tópicos recomendados, o tempo estimado para completar esse passo (ex: "2 semanas", "1 mês") e uma lista de pré-requisitos ou conceitos fundamentais necessários antes de iniciar este passo (se houver).
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              recommendedTopics: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              estimatedTime: { type: Type.STRING },
              prerequisites: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["title", "description", "recommendedTopics", "estimatedTime"],
          },
        },
      }
    });

    const text = response.text || "[]";
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("Roadmap generation failed", error);
    return [];
  }
}

export async function generateCourseImage(courseTitle: string): Promise<string> {
  const prompt = `Professional, modern high-quality course cover for: ${courseTitle}. Modern UI/UX design, minimalist aesthetic, 4k, digital art style.`;
  
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
        outputMimeType: "image/jpeg"
      }
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64 = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64}`;
    }
    throw new Error("No image generated");
  } catch (error) {
    console.warn("Imagen failed, using fallback placeholder", error);
    return `https://picsum.photos/seed/${encodeURIComponent(courseTitle)}/800/450`;
  }
}
