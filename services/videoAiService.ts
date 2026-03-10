import type { AISuggestions, SceneAnalysis, Character, VideoModelId, InitialSceneData } from '../types';

// API Configuration - Use proxy paths to avoid CORS issues
const GLM_BASE_URL = '/api/glm';
const QWEN_IMAGE_URL = '/api/qwen/services/aigc/multimodal-generation/generation';
const QWEN_TASK_URL = '/api/qwen-task/tasks';

/**
 * Resolve API keys at runtime.
 */
function getGLMApiKey(): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('glm_api_key') || localStorage.getItem('gemini_api_key');
            if (stored && stored.trim()) return stored;
        }
    } catch (e) {}

    if (typeof process !== 'undefined' && process.env) {
        const envKey = process.env.GLM_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (envKey && envKey !== '""' && envKey !== 'undefined') return envKey as string;
    }

    return null;
}

function getQwenApiKey(): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('qwen_api_key') || localStorage.getItem('gemini_api_key');
            if (stored && stored.trim()) return stored;
        }
    } catch (e) {}

    if (typeof process !== 'undefined' && process.env) {
        const envKey = process.env.QWEN_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (envKey && envKey !== '""' && envKey !== 'undefined') return envKey as string;
    }

    return null;
}

// GLM-5 Text Generation
async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const key = getGLMApiKey();
    if (!key) {
        throw new Error("GLM API key not found.");
    }
    const response = await fetch(`${GLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: 'glm-5',
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: prompt }
            ],
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GLM-5 API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// GLM-5 JSON Generation
async function generateJSON<T>(prompt: string): Promise<T> {
    const key = getGLMApiKey();
    if (!key) {
        throw new Error("GLM API key not found.");
    }
    const jsonPrompt = `${prompt}\n\n请以有效的JSON格式回复，不要包含任何其他文字。`;

    const response = await fetch(`${GLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: 'glm-5',
            messages: [{ role: 'user', content: jsonPrompt }],
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GLM-5 API error: ${error}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error("Failed to parse JSON from response");
}

// Qwen Image Generation
async function generateImage(prompt: string, size?: string): Promise<string> {
    const key = getQwenApiKey();
    if (!key) {
        throw new Error("Qwen API key not found.");
    }
    const response = await fetch(QWEN_IMAGE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: 'qwen-image-2.0-pro',
            input: {
                messages: [
                    { role: 'user', content: [{ text: prompt }] }
                ]
            },
            parameters: {
                negative_prompt: "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑。",
                prompt_extend: true,
                watermark: false,
                size: size || "1280*720"
            }
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qwen Image API error: ${error}`);
    }

    const data = await response.json();
    console.log("Qwen Image API response:", JSON.stringify(data, null, 2));

    // Handle async task
    if (data.output?.task_id) {
        return await pollImageTask(data.output.task_id);
    }

    // Parse image from choices[0].message.content[0].image
    const content = data.output?.choices?.[0]?.message?.content;
    if (content && Array.isArray(content) && content[0]?.image) {
        const imageUrl = content[0].image;
        return await imageUrlToBase64(imageUrl);
    }

    // Fallback: Direct response with image URL
    if (data.output?.results?.[0]?.url) {
        return await imageUrlToBase64(data.output.results[0].url);
    }

    throw new Error(`No image in response. Response: ${JSON.stringify(data)}`);
}

async function pollImageTask(taskId: string): Promise<string> {
    const statusUrl = `${QWEN_TASK_URL}/${taskId}`;
    const key = getQwenApiKey();

    for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const response = await fetch(statusUrl, {
            headers: { 'Authorization': `Bearer ${key}` },
        });

        const data = await response.json();

        if (data.output?.task_status === 'SUCCEEDED') {
            const imageUrl = data.output.results?.[0]?.url;
            if (imageUrl) return await imageUrlToBase64(imageUrl);
        } else if (data.output?.task_status === 'FAILED') {
            throw new Error(`Image generation failed`);
        }
    }

    throw new Error("Image generation timeout");
}

// Convert image URL to base64 (with proxy support)
async function imageUrlToBase64(url: string): Promise<string> {
    // Use proxy for OSS images to avoid CORS
    let fetchUrl = url;
    if (url.includes('dashscope') && url.includes('oss-cn-shanghai.aliyuncs.com')) {
        const urlObj = new URL(url);
        fetchUrl = `/api/oss-image${urlObj.pathname}${urlObj.search}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ============ Video Service Functions ============

export const recommendVideoModel = async (
    sceneDescription: string,
    narrative: string,
): Promise<{ model: VideoModelId, reasoning: string }> => {
    const prompt = `
你是一个AI视频生成顾问。根据场景选择最合适的视频模型。

可用模型：
- **Seedance Pro 1.0**: 多镜头叙事序列最佳
- **Hailuo 02**: 复杂物理、动态动作最佳
- **Veo 3**: 可同时生成视频和音频
- **Kling**: 多参考图一致性保持最佳

**场景视觉：** "${sceneDescription}"
**关键动作：** "${narrative}"

请以JSON格式回复：
{
    "model": "seedance或hailuo或veo或kling",
    "reasoning": "选择原因"
}
`;

    try {
        const result = await generateJSON<{ model: VideoModelId, reasoning: string }>(prompt);
        return result;
    } catch (e) {
        return { model: 'seedance', reasoning: '默认选择' };
    }
};

export const generateStoryboardFromPages = async (
    pageImages: { data: string, mimeType: string }[],
    characters: Pick<Character, 'name' | 'description'>[]
): Promise<InitialSceneData[]> => {
    const characterList = characters.map(c => `- ${c.name}: ${c.description || '无描述'}`).join('\n');

    const prompt = `你是分镜艺术家和动画导演。分析漫画页面并为动画创建计划。

**可用角色：**
${characterList}

**任务：**
为每个分镜生成以下信息：
1. sceneDescription: 详细的动画首帧描述（现代动漫风格）
2. narrative: 关键动作描述（一句话）
3. duration: 预计时长（3-10秒）
4. charactersInScene: 出场角色名称列表
5. sourcePageIndex: 来源页面索引

请以JSON数组格式回复：
[
    {
        "sceneDescription": "...",
        "narrative": "...",
        "duration": 5,
        "charactersInScene": ["角色1", "角色2"],
        "sourcePageIndex": 0
    }
]

注意：忽略对话框文字，只描述视觉场景。
`;

    try {
        const panels = await generateJSON<Omit<InitialSceneData, 'recommendedModel' | 'reasoning'>[]>(prompt);

        const enrichedPanels = await Promise.all(panels.map(async (panel) => {
            const { model, reasoning } = await recommendVideoModel(panel.sceneDescription, panel.narrative);
            return {
                ...panel,
                duration: Math.min(Math.round(panel.duration), 10),
                recommendedModel: model,
                reasoning: reasoning,
            };
        }));

        return enrichedPanels;
    } catch (e) {
        console.error("Failed to generate storyboard:", e);
        throw new Error("Failed to get a valid storyboard from AI.");
    }
};

export const generateVideoFrame = async (
    prompt: string,
    referenceImage: { data: string, mimeType: string }
): Promise<string> => {
    const fullPrompt = `创建动画帧。现代动漫风格，16:9比例。${prompt}`;
    return await generateImage(fullPrompt, "1280*720");
};

export const generateWebtoonEndFrame = async (
    startFrameBase64: string,
    narrative: string,
    duration: number
): Promise<string> => {
    const prompt = `你是动画专家。基于起始帧创建动态结束帧。

关键动作：${narrative}
时长：${duration}秒

要求：
- 结束帧必须与起始帧有明显变化
- 保持角色设计一致性
- 现代动漫风格
- 16:9比例
`;

    return await generateImage(prompt, "1280*720");
};

export const regenerateVideoFrame = async (
    originalFrameBase64: string,
    editPrompt: string,
    originalSceneDescription: string
): Promise<string> => {
    const prompt = editPrompt
        ? `修改动画帧：${editPrompt}。原始场景：${originalSceneDescription}。保持原有风格。`
        : `创建动画帧的新版本。原始场景：${originalSceneDescription}。现代动漫风格，16:9。`;

    return await generateImage(prompt, "1280*720");
};

export const generateSuggestionsForScene = async (
    sceneDescription: string,
    duration: number
): Promise<AISuggestions> => {
    const prompt = `基于视频场景"${sceneDescription}"，为${duration}秒的动漫片段生成创意建议。

请以JSON格式回复：
{
    "transition": "转场效果名称",
    "vfx": "视觉特效",
    "camera": "镜头运动",
    "narrative": "动作描述"
}
`;

    try {
        return await generateJSON<AISuggestions>(prompt);
    } catch (e) {
        throw new Error("Failed to get valid suggestions from AI.");
    }
};

export const generateFinalVideoPrompt = async (
    sceneDescription: string,
    suggestions: AISuggestions,
    duration: number
): Promise<string> => {
    const prompt = `将以下信息组合成详细的视频提示词：

场景：${sceneDescription}
时长：${duration}秒
转场：${suggestions.transition}
特效：${suggestions.vfx}
镜头：${suggestions.camera}
动作：${suggestions.narrative}

输出一段完整的视频生成提示词。`;

    return await generateText(prompt);
};

// Model-specific prompt generators
const getCharacterAnchors = (scene: InitialSceneData, allCharacters: Pick<Character, 'name' | 'description'>[]): string => {
    return scene.charactersInScene.map(charName => {
        const charData = allCharacters.find(c => c.name === charName);
        return `- character: ${charName}, ${charData?.description || 'No description'}`;
    }).join('\n');
};

export const generateSeedancePrompt = (scene: InitialSceneData, allCharacters: Pick<Character, 'name' | 'description'>[]): string => {
    const charAnchors = getCharacterAnchors(scene, allCharacters);
    return `Title: Scene ${scene.sourcePageIndex + 1}
Duration: ${scene.duration}s  Aspect: 16:9  Style: cinematic, modern anime
Consistency anchors:
${charAnchors}

Shot 1 (0-${scene.duration}s):
- action: ${scene.sceneDescription}. ${scene.narrative}.

Negative: avoid: text artifacts, logos, watermarks, bad anatomy
`;
};

export const generateHailuoPrompt = (scene: InitialSceneData, allCharacters: Pick<Character, 'name' | 'description'>[]): string => {
    return `Task: Animate a short clip: ${scene.sceneDescription}
Length: ${scene.duration}s  Aspect: 16:9
Action physics: ${scene.narrative}
Style: vibrant, modern anime
`;
};

export const generateVeoPrompt = (scene: InitialSceneData, allCharacters: Pick<Character, 'name' | 'description'>[]): string => {
    return `Title: Scene ${scene.sourcePageIndex + 1}
Duration: ${scene.duration}s  Aspect: 16:9
Visual: ${scene.sceneDescription}. ${scene.narrative}
Style: High-quality anime
`;
};

export const generateKlingPrompt = (scene: InitialSceneData, allCharacters: Pick<Character, 'name' | 'description'>[]): string => {
    const charLocks = scene.charactersInScene.join(', ');
    return `Mode: High  Length: ${scene.duration}s  Aspect: 16:9  Style: anime
Lock: keep: [${charLocks} design]
Shot: ${scene.sceneDescription}. ${scene.narrative}
`;
};

export const generateAllModelPrompts = async (
    scene: InitialSceneData,
    characters: Pick<Character, 'name' | 'description'>[]
): Promise<Record<string, string>> => {
    return {
        seedance: generateSeedancePrompt(scene, characters),
        hailuo: generateHailuoPrompt(scene, characters),
        veo: generateVeoPrompt(scene, characters),
        kling: generateKlingPrompt(scene, characters),
    };
};

// Video generation - requires additional API configuration
export const generateVeoVideo = async (
    prompt: string,
    onProgressUpdate: (progress: string) => void,
    startFrame?: { data: string; mimeType: string }
): Promise<string> => {
    onProgressUpdate("视频生成功能需要额外配置视频API...");
    throw new Error("视频生成功能暂不可用。如需使用，请配置视频生成API（如Veo、Runway等）。");
};