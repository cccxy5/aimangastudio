import type { GeneratedContent, Character, Page, StorySuggestion, PanelShape, ImageShape, CanvasShape, Pose, AnalysisResult } from '../types';
import { SkeletonPose, SkeletonData } from '../types';

// API Configuration - Use proxy paths to avoid CORS issues
const GLM_BASE_URL = '/api/glm';
const QWEN_IMAGE_URL = '/api/qwen/services/aigc/multimodal-generation/generation';
const QWEN_TASK_URL = '/api/qwen-task/tasks';

/**
 * Resolve API keys at runtime.
 * Supports two separate keys: one for GLM-5 (text) and one for Qwen Image
 * Priority:
 * 1. Browser localStorage keys
 * 2. Environment variables
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

// Backward compatibility: single API key getter
function getApiKey(): string | null {
    return getGLMApiKey() || getQwenApiKey();
}

// GLM-5 Text Generation
async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const key = getGLMApiKey();
    if (!key) {
        throw new Error("GLM API key not found. Please set GLM_API_KEY or GEMINI_API_KEY in environment or localStorage.");
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
async function generateJSON<T>(prompt: string, schema?: object): Promise<T> {
    const key = getGLMApiKey();
    if (!key) {
        throw new Error("GLM API key not found. Please set GLM_API_KEY or GEMINI_API_KEY in environment or localStorage.");
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
            messages: [
                { role: 'user', content: jsonPrompt }
            ],
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GLM-5 API error: ${error}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error("Failed to parse JSON from response");
}

// Qwen Image Generation
async function generateImage(prompt: string, negativePrompt?: string, size?: string, referenceImages?: string[]): Promise<string> {
    const key = getQwenApiKey();
    if (!key) {
        throw new Error("Qwen API key not found. Please set QWEN_API_KEY or GEMINI_API_KEY in environment or localStorage.");
    }

    // Build content array with text and optional images
    const content: Array<{ text?: string; image?: string }> = [{ text: prompt }];

    // Add reference images to the content array for image-to-image generation
    // Qwen API requires image to be either a public URL or a data URL (data:{mime_type};base64,{data})
    if (referenceImages && referenceImages.length > 0) {
        referenceImages.forEach(imgBase64 => {
            // Ensure the image is in proper data URL format
            let imageData = imgBase64;
            if (!imgBase64.startsWith('data:')) {
                // If raw base64, add the data URL prefix
                imageData = `data:image/png;base64,${imgBase64}`;
            }
            content.push({ image: imageData });
        });
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
                    {
                        role: 'user',
                        content: content
                    }
                ]
            },
            parameters: {
                negative_prompt: negativePrompt || "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。",
                prompt_extend: true,
                watermark: false,
                size: size || "1024*1024"
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
        console.log("Async task detected, polling for result...");
        return await pollImageTask(data.output.task_id);
    }

    // Parse image from choices[0].message.content[0].image
    const responseContent = data.output?.choices?.[0]?.message?.content;
    if (responseContent && Array.isArray(responseContent) && responseContent[0]?.image) {
        const imageUrl = responseContent[0].image;
        console.log("Image URL found:", imageUrl);
        return await imageUrlToBase64(imageUrl);
    }

    // Fallback: Direct response with image URL
    if (data.output?.results?.[0]?.url) {
        const imageUrl = data.output.results[0].url;
        return await imageUrlToBase64(imageUrl);
    }

    console.error("Unexpected response format:", data);
    throw new Error(`No image in response. Response: ${JSON.stringify(data)}`);
}

// Poll for async image task
async function pollImageTask(taskId: string): Promise<string> {
    const statusUrl = `${QWEN_TASK_URL}/${taskId}`;
    const key = getQwenApiKey();

    for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const response = await fetch(statusUrl, {
            headers: {
                'Authorization': `Bearer ${key}`,
            },
        });

        const data = await response.json();

        if (data.output?.task_status === 'SUCCEEDED') {
            const imageUrl = data.output.results?.[0]?.url;
            if (imageUrl) {
                return await imageUrlToBase64(imageUrl);
            }
        } else if (data.output?.task_status === 'FAILED') {
            throw new Error(`Image generation failed: ${data.output?.message || 'Unknown error'}`);
        }
    }

    throw new Error("Image generation timeout");
}

// Convert image URL to base64 (with proxy support)
async function imageUrlToBase64(url: string): Promise<string> {
    // Use proxy for OSS images to avoid CORS
    let fetchUrl = url;
    if (url.includes('dashscope') && url.includes('oss-cn-shanghai.aliyuncs.com')) {
        // Extract the path after the domain
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

// Export functions with same interface as geminiService

export async function generateWorldview(characters: Character[]): Promise<string> {
    let prompt = `你是一位富有创意的世界观构建者和故事讲述者。根据以下角色列表，为漫画创作一个引人入胜且充满想象力的世界观或背景设定。

**角色：**
${characters.map(c => `- **${c.name}：** ${c.description || '未提供描述。'}`).join('\n')}

**你的任务：**
- 创造一个独特的背景设定（例如奇幻王国、科幻城市、带有转折的现代高中）。
- 简要描述这个世界的关键规则、冲突或谜团。
- 解释这些角色如何融入或与这个世界相关联。
- 语调应该为漫画艺术家提供创意和灵感。
- 以一整段文字的形式提供回应。
`;

    return await generateText(prompt);
}


export async function generateDetailedStorySuggestion(
    premise: string,
    worldview: string,
    characters: Character[],
    previousPages?: Pick<Page, 'generatedImage' | 'sceneDescription'>[]
): Promise<StorySuggestion> {

    let contextPrompt = "你是一位富有创意的漫画编剧。用户希望获得帮助来编写单页漫画的脚本。";

    if (worldview) {
        contextPrompt += `\n\n**重要世界观背景：**\n${worldview}\n\n这个世界观是故事的基础真理。确保你的建议与这些规则保持一致。`;
    }

    // 强调角色信息，让AI知道这些是已定义的角色
    if (characters && characters.length > 0) {
        contextPrompt += "\n\n**已定义的角色（重要！）：**\n";
        contextPrompt += "以下是故事中已经创建的角色。当你在脚本中提到这些名字时，它们指的是这些角色，而不是字面意思的物体或食物。\n\n";
        characters.forEach(char => {
            contextPrompt += `- **「${char.name}」**：${char.description || '未提供描述。'}\n`;
        });
        contextPrompt += "\n**特别注意**：在用户的描述中，如果出现上述角色名称（如「${characters.map(c => c.name).join('」、「')}」），请将其视为角色名，而非普通名词。例如「芥末汤圆」是一个角色，而不是真的汤圆。\n";
    }

    if (previousPages && previousPages.length > 0) {
        contextPrompt += "\n\n**前一页背景：**\n这一新页面必须是前一页的直接延续。以下是按时间顺序排列的最近页面的背景：";

        previousPages.forEach((page, index) => {
            if (page.sceneDescription) {
                contextPrompt += `\n\n**[前一页 ${index + 1}]**\n*脚本：* ${page.sceneDescription}`;
            }
        });
    }

    if (premise) {
        contextPrompt += `\n\n**用户对新页面的前提：**"${premise}"`;
        contextPrompt += "\n\n**你的任务：**\n基于提供的所有背景（世界观、角色、前一页、用户前提），为此新漫画页面生成详细脚本。";
    } else {
        contextPrompt += "\n\n**你的任务：**\n用户未提供具体前提。基于世界观、角色和前一页的背景，为故事提出一个逻辑且有趣的下一页。为此新漫画页面生成详细脚本。";
    }

    contextPrompt += " 将故事分解为2-4个分镜。为每个分镜提供动作/镜头的简洁描述和任何角色对话。分镜可以描述环境、物体或无需角色的特写，只要服务于故事即可。**请使用中文输出所有内容（描述和对话）。**";

    contextPrompt += `\n\n请以以下JSON格式回复：
{
    "summary": "页面故事的简短一句话总结（中文）",
    "panels": [
        {
            "panel": 1,
            "description": "分镜的视觉动作描述（中文）",
            "dialogue": "角色对话（中文，可选）"
        }
    ]
}`;

    try {
        const suggestion = await generateJSON<StorySuggestion>(contextPrompt);
        if (suggestion && suggestion.summary && Array.isArray(suggestion.panels)) {
            return suggestion;
        }
        throw new Error("Parsed JSON does not match the expected structure.");
    } catch (e) {
        console.error("Failed to parse story suggestion JSON:", e);
        throw new Error("The AI returned an invalid story structure. Please try again.");
    }
}


const ASPECT_RATIO_CONFIG: { [key: string]: { w: number, h: number, value: string } } = {
    'A4': { w: 595, h: 842, value: '210:297' },
    '竖版': { w: 600, h: 800, value: '3:4' },
    '正方形': { w: 800, h: 800, value: '1:1' },
    '横版': { w: 1280, h: 720, value: '16:9' }
};

export async function generateLayoutProposal(
    story: string,
    characters: Character[],
    aspectRatioKey: string,
    previousPage?: { proposalImage: string, sceneDescription: string },
    currentCanvasImage?: string
): Promise<{ proposalImage: string }> {
    const config = ASPECT_RATIO_CONFIG[aspectRatioKey] || ASPECT_RATIO_CONFIG['A4'];

    // Build character info
    const characterInfo = characters.length > 0
        ? characters.map(c => `- ${c.name}: ${c.description || '见角色参考图'}`).join('\n')
        : '无特定角色';

    const prompt = `
        你是一位专业的漫画分镜艺术家。创建单页漫画的黑白草图分镜布局。

        **故事：**
        ${story}

        **涉及角色：**
        ${characterInfo}

        **重要指导：**
        - 如果提供了参考图，请参考其中的角色外观特征
        - 根据故事内容合理安排角色位置和姿势
        - 分镜应该清晰表达故事的进展

        **要求：**
        1. 比例为${config.value}，尺寸${config.w}x${config.h}像素
        2. 使用动态分镜布局，对角线切割，变化尺寸
        3. 粗略草图风格，简单线条
        4. 不包含任何文字或标注
        ${previousPage ? '5. 必须是上一页内容的视觉延续，请参考提供的上一页布局图' : ''}
        ${currentCanvasImage ? '6. 请参考提供的当前画布内容进行布局' : ''}

        请生成漫画分镜草图。
    `;

    const size = `${config.w}*${config.h}`;

    // Collect reference images - include character sheets
    const referenceImages: string[] = [];
    if (previousPage?.proposalImage) {
        referenceImages.push(previousPage.proposalImage);
    }
    if (currentCanvasImage) {
        referenceImages.push(currentCanvasImage);
    }
    // Add character sheet images
    characters.forEach(c => {
        if (c.sheetImage) {
            referenceImages.push(c.sheetImage);
        }
    });

    console.log(`Generating layout with ${referenceImages.length} reference images`);

    const imageData = await generateImage(prompt, undefined, size, referenceImages.length > 0 ? referenceImages : undefined);

    return { proposalImage: imageData };
}


export async function generateCharacterSheet(
    referenceImagesBase64: string[],
    characterName: string,
    colorMode: 'color' | 'monochrome'
): Promise<string> {
    const prompt = `
        你是一位专业的漫画艺术家。请参考用户提供的图片，为角色"${characterName}"创建角色参考表。

        **重要：必须严格参考用户上传的图片中人物的外观特征，包括性别、发型、面部特征、服装风格等。**

        **要求：**
        1. ${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}漫画风格
        2. 包含六个姿势，两行排列：
           - 顶行：三个头像（侧视、正视中性、正视微笑）
           - 底行：三个全身（正面、侧面、背面）
        3. 保持参考图片中人物的核心特征（性别、发型、五官、服装等）
        4. 干净的线条艺术风格
        5. 不包含任何文字或标签
    `;

    return await generateImage(prompt, undefined, undefined, referenceImagesBase64);
}

export async function generateCharacterFromReference(
    referenceSheetImagesBase64: string[],
    characterName: string,
    characterConcept: string,
    colorMode: 'color' | 'monochrome'
): Promise<string> {
    const prompt = `
        你是一位专业的漫画艺术家。请参考现有的角色表图片，创建全新原创角色"${characterName}"的角色参考表。

        **角色概念：** ${characterConcept}

        **重要：请参考提供的角色表图片的风格和格式，但根据角色概念创建新角色。**

        **要求：**
        1. ${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}漫画风格
        2. 包含六个姿势，两行排列：
           - 顶行：三个头像（侧视、正视中性、正视微笑）
           - 底行：三个全身（正面、侧面、背面）
        3. 不包含任何文字或标签
    `;

    return await generateImage(prompt, undefined, undefined, referenceSheetImagesBase64);
}


export async function editCharacterSheet(
    sheetImageBase64: string,
    characterName: string,
    editPrompt: string
): Promise<string> {
    const prompt = `
        编辑角色"${characterName}"的角色参考表。

        **修改要求：** ${editPrompt}

        保持现有风格和布局，应用请求的更改。
    `;

    return await generateImage(prompt, undefined, undefined, [sheetImageBase64]);
}

export async function generateMangaPage(
  characters: Character[],
  panelLayoutImageBase64: string,
  sceneDescription: string,
  colorMode: 'color' | 'monochrome',
  previousPage: Pick<Page, 'generatedImage' | 'sceneDescription'> | undefined,
  generateEmptyBubbles: boolean
): Promise<GeneratedContent> {

  // Build character info with detailed descriptions
  const characterDescriptions = characters.map(c =>
    `- ${c.name}: ${c.description || '参考提供的角色图片'}`
  ).join('\n');

  const prompt = `
    你是一位专业的漫画艺术家。请根据以下信息创建单页漫画。

    **场景脚本：**
    ${sceneDescription}

    **角色列表：**
    ${characterDescriptions}

    **重要指导：**
    - 第一张参考图是画布布局图，请严格参考其中的分镜框位置、大小和角色姿势安排
    - 后续的参考图是角色表图片，请严格参考这些图片中角色的外观、发型、服装等特征
    - 如果场景中涉及角色，必须使用参考图中角色的外观特征，不要自行创造新角色
    - 保持角色在整个页面中的一致性

    **要求：**
    1. ${colorMode === 'monochrome' ? '黑白（单色）' : '全彩'}漫画风格
    2. 严格遵循场景脚本的动作和表情
    3. 角色外观必须与参考图一致
    4. ${generateEmptyBubbles ? '绘制空白对话气泡，不添加文字' : '在气泡中添加对话文字'}
    ${previousPage ? '5. 必须是上一页内容的直接延续' : ''}
  `;

  // Include panel layout image and character sheet images as references
  const referenceImages: string[] = [panelLayoutImageBase64];
  characters.forEach(c => {
    if (c.sheetImage) {
      referenceImages.push(c.sheetImage);
    }
  });

  console.log(`Generating manga page with ${referenceImages.length} reference images (${characters.length} characters)`);

  const imageData = await generateImage(prompt, undefined, undefined, referenceImages);

  return { image: imageData, text: null };
}

export async function colorizeMangaPage(
    monochromePageBase64: string,
    characters: Character[]
): Promise<string> {
    const characterInfo = characters.map(c => `${c.name}: ${c.description || ''}`).join('\n');

    const prompt = `
        你是一位专业的漫画数字着色师。请参考提供的单色漫画页，为它完全着色。

        **角色参考：**
        ${characterInfo}

        **要求：**
        1. 为整页着色，包括角色、物体、背景
        2. 使用正确且一致的角色颜色
        3. 保留原始黑色线条艺术
        4. 创造协调的氛围颜色
    `;

    return await generateImage(prompt, undefined, undefined, [monochromePageBase64]);
}

export async function editMangaPage(
    originalImageBase64: string,
    promptText: string,
    maskImageBase64?: string,
    referenceImagesBase64?: string[]
): Promise<string> {
    const fullPrompt = `
        编辑漫画页面图像。

        **修改要求：** ${promptText}

        ${maskImageBase64 ? '只修改遮罩白色区域，保持黑色区域不变。' : ''}
        确保编辑与原图无缝融合。
    `;

    // Combine original image with reference images
    const allImages = [originalImageBase64];
    if (referenceImagesBase64 && referenceImagesBase64.length > 0) {
        allImages.push(...referenceImagesBase64);
    }

    return await generateImage(fullPrompt, undefined, undefined, allImages);
}


export async function analyzeAndSuggestCorrections(
    panelLayoutImage: string,
    generatedImage: string,
    sceneDescription: string,
    characters: Character[]
): Promise<AnalysisResult> {
    const characterInfo = characters.map(c => `- ${c.name}`).join('\n');

    const prompt = `
你是一位细致的漫画创作工具质量保证助手。分析生成的漫画页面并建议修正。

**场景脚本：**
---
${sceneDescription}
---

**场景中的角色：**
${characterInfo}

请分析图像与脚本的一致性，检查：
- 缺失或错误的角色
- 错误的姿势
- 布局偏差
- 脚本矛盾
- 角色重复
- 背景不当

请以以下JSON格式回复：
{
  "analysis": "对发现的简短总结",
  "has_discrepancies": true或false,
  "correction_prompt": "如果发现问题，写一个详细的修正提示"
}
`;

    try {
        const result = await generateJSON<AnalysisResult>(prompt);
        return result;
    } catch (e) {
        console.error("Failed to parse analysis JSON:", e);
        throw new Error("The AI returned an invalid analysis structure.");
    }
}